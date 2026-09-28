const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../config/db');
const users = require('../utils/users');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const {
  validateRegister,
  validateLogin,
  validateProfileUpdate,
  validatePasswordChange,
  validateForgotPassword,
  validateResetPassword,
  validateAdminUserUpdate,
  validateAdminSetPassword,
  isValidId,
} = require('../middleware/validators');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

// Same idea as loginLimiter: without this, someone could hammer
// /forgot-password to enumerate which emails are registered, or to spam
// the "reset link" generation endpoint.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many password reset requests. Please try again later.' },
});

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function getUserOr404(id) {
  const user = isValidId(id) ? await db.get('users', id) : null;
  if (!user) throw new AppError('User not found', 404);
  return user;
}

router.post(
  '/register',
  validateRegister,
  asyncHandler(async (req, res) => {
    const { full_name, email, password } = req.body;
    const id = await users.createUser({ full_name, email, password, role: 'patient' });

    logger.info(`New patient registered (user id ${id})`);
    res.status(201).json({ success: true, message: 'Registration successful' });
  })
);


router.post(
  '/register-staff',
  verifyToken,
  requireRole('admin'),
  validateRegister,
  asyncHandler(async (req, res) => {
    const { full_name, email, password, role } = req.body;

    const allowedRoles = ['doctor', 'admin'];
    if (!role || !allowedRoles.includes(role)) {
      throw new AppError(`role must be one of: ${allowedRoles.join(', ')}`, 400);
    }

    const id = await users.createUser({ full_name, email, password, role });

    logger.info(`Admin ${req.user.id} created a new ${role} account (user id ${id})`);
    res.status(201).json({ success: true, message: `${role} account created`, data: { id } });
  })
);

router.post(
  '/login',
  loginLimiter,
  validateLogin,
  asyncHandler(async (req, res) => {
    const { password } = req.body;
    const user = await users.findByEmail(req.body.email);

    if (!user) {
      logger.warn(`Login failed: unknown email attempted from ${req.ip}`);
      throw new AppError('Invalid email or password', 401);
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      logger.warn(`Login failed: wrong password for user ${user.id}`);
      throw new AppError('Invalid email or password', 401);
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    logger.info(`User ${user.id} logged in`);
    res.json({
      success: true,
      message: 'Login successful',
      data: { token, user: { id: user.id, full_name: user.full_name, role: user.role } },
    });
  })
);

router.get(
  '/me',
  verifyToken,
  asyncHandler(async (req, res) => {
    const user = await getUserOr404(req.user.id);
    res.json({ success: true, data: users.publicUser(user) });
  })
);

router.patch(
  '/me',
  verifyToken,
  validateProfileUpdate,
  asyncHandler(async (req, res) => {
    const fullName = req.body.full_name.trim();
    const user = await getUserOr404(req.user.id);
    await db.update('users', user.id, { full_name: fullName });
    logger.info(`User ${req.user.id} updated their profile`);

    const token = jwt.sign(
      { id: user.id, role: user.role, full_name: fullName },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({
      success: true,
      message: 'Profile updated',
      data: { token, user: { id: user.id, full_name: fullName, role: user.role } },
    });
  })
);

router.post(
  '/change-password',
  verifyToken,
  validatePasswordChange,
  asyncHandler(async (req, res) => {
    const { current_password, new_password } = req.body;
    const user = await getUserOr404(req.user.id);

    const match = await bcrypt.compare(current_password, user.password);
    if (!match) {
      throw new AppError('Current password is incorrect', 401);
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await db.update('users', user.id, { password: hashed });
    logger.info(`User ${req.user.id} changed their password`);
    res.json({ success: true, message: 'Password changed successfully' });
  })
);

// --- Forgot / reset password -------------------------------------------
//
// There is no email service wired up in this project, so instead of
// emailing a reset link we hand the (one-time, 30-minute) token straight
// back in the API response and the frontend displays it on screen. In a
// real deployment, replace the "return the token" step with actually
// emailing resetUrl to the user and stop returning the token in the
// response body.
//
// The token itself is never stored -- only its SHA-256 hash, which is also
// used as the Firestore document id so the lookup on reset is a direct read.
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validateForgotPassword,
  asyncHandler(async (req, res) => {
    const user = await users.findByEmail(req.body.email);

    // Always return the same response whether or not the email exists,
    // so this endpoint can't be used to find out who has an account.
    const genericResponse = {
      success: true,
      message: 'If that email is registered, a password reset token has been generated.',
    };

    if (!user) {
      logger.warn(`Password reset requested for unknown email from ${req.ip}`);
      return res.json(genericResponse);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

    await db.createWithId('password_resets', hashToken(token), {
      user_id: user.id,
      expires_at: expiresAt,
      used: false,
    });

    logger.info(`Password reset token issued for user ${user.id}`);
    res.json({
      ...genericResponse,
      // Demo-only: a real app emails this token/link instead of returning it.
      data: { resetToken: token, expiresAt },
    });
  })
);

router.post(
  '/reset-password',
  forgotPasswordLimiter,
  validateResetPassword,
  asyncHandler(async (req, res) => {
    const { token, new_password } = req.body;
    const tokenHash = hashToken(token);

    const resetRecord = await db.get('password_resets', tokenHash);
    if (!resetRecord || resetRecord.used) {
      throw new AppError('This reset token is invalid or has already been used', 400);
    }
    if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
      throw new AppError('This reset token has expired. Please request a new one.', 400);
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await db.update('users', resetRecord.user_id, { password: hashed });
    await db.update('password_resets', tokenHash, { used: true });

    logger.info(`User ${resetRecord.user_id} reset their password via token`);
    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  })
);

// --- Admin: account / user management -----------------------------------

router.get(
  '/users',
  verifyToken,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const rows = await db.find('users');
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    res.json({ success: true, data: rows.map(users.publicUser) });
  })
);

// Edit another user's name / email (and optionally role).
router.patch(
  '/users/:id',
  verifyToken,
  requireRole('admin'),
  validateAdminUserUpdate,
  asyncHandler(async (req, res) => {
    const target = await getUserOr404(req.params.id);
    const { full_name, email, role } = req.body;

    if (role !== undefined && role !== target.role && target.id === req.user.id) {
      throw new AppError('You cannot change your own role', 400);
    }

    await users.changeEmail(target, email);
    const patch = { full_name: full_name.trim() };
    if (role !== undefined) patch.role = role;
    await db.update('users', target.id, patch);

    logger.info(`Admin ${req.user.id} edited user ${target.id}`);
    res.json({ success: true, message: 'User updated' });
  })
);

router.patch(
  '/users/:id/role',
  verifyToken,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const allowedRoles = ['patient', 'doctor', 'admin'];
    const { role } = req.body || {};
    if (!role || !allowedRoles.includes(role)) {
      throw new AppError(`role must be one of: ${allowedRoles.join(', ')}`, 400);
    }

    const target = await getUserOr404(req.params.id);
    if (target.id === req.user.id) {
      throw new AppError('You cannot change your own role', 400);
    }

    await db.update('users', target.id, { role });
    logger.info(`Admin ${req.user.id} set user ${target.id}'s role to ${role}`);
    res.json({ success: true, message: 'Role updated' });
  })
);

// Admin sets a new password for any account (e.g. a locked-out patient).
// The user's existing login sessions stay valid until their token expires (2h).
router.patch(
  '/users/:id/password',
  verifyToken,
  requireRole('admin'),
  validateAdminSetPassword,
  asyncHandler(async (req, res) => {
    const target = await getUserOr404(req.params.id);
    const hashed = await bcrypt.hash(req.body.new_password, 10);
    await db.update('users', target.id, { password: hashed });

    logger.info(`Admin ${req.user.id} set a new password for user ${target.id}`);
    res.json({ success: true, message: `Password updated for ${target.full_name}` });
  })
);

router.delete(
  '/users/:id',
  verifyToken,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const target = await getUserOr404(req.params.id);
    if (target.id === req.user.id) {
      throw new AppError('You cannot delete your own account', 400);
    }

    await users.deleteUser(target);

    logger.info(`Admin ${req.user.id} deleted user ${target.id}`);
    res.json({ success: true, message: 'User deleted' });
  })
);

module.exports = router;
