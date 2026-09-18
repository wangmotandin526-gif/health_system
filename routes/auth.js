const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../config/db');
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

router.post(
  '/register',
  validateRegister,
  asyncHandler(async (req, res) => {
    const { full_name, email, password } = req.body;

    const fullName = full_name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ?',
      [normalizedEmail]
    );
    if (existing.length > 0) {
      throw new AppError('Email already registered', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
      [fullName, normalizedEmail, hashedPassword, 'patient']
    );

    logger.info(`New patient registered (user id ${result.insertId})`);
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

    const fullName = full_name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const allowedRoles = ['doctor', 'admin'];
    if (!role || !allowedRoles.includes(role)) {
      throw new AppError(`role must be one of: ${allowedRoles.join(', ')}`, 400);
    }

    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ?',
      [normalizedEmail]
    );
    if (existing.length > 0) {
      throw new AppError('Email already registered', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
      [fullName, normalizedEmail, hashedPassword, role]
    );

    logger.info(`Admin ${req.user.id} created a new ${role} account (user id ${result.insertId})`);
    res.status(201).json({ success: true, message: `${role} account created`, data: { id: result.insertId } });
  })
);

router.post(
  '/login',
  loginLimiter,
  validateLogin,
  asyncHandler(async (req, res) => {
    const { password } = req.body;
    const normalizedEmail = req.body.email.trim().toLowerCase();
    
    const [users] = await db.query(
      'SELECT * FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (users.length === 0) {
      logger.warn(`Login failed: unknown email attempted from ${req.ip}`);
      throw new AppError('Invalid email or password', 401);
    }

    const user = users[0];
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
    const [rows] = await db.query(
      'SELECT id, full_name, email, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) throw new AppError('User not found', 404);
    res.json({ success: true, data: rows[0] });
  })
);

router.patch(
  '/me',
  verifyToken,
  validateProfileUpdate,
  asyncHandler(async (req, res) => {
    const fullName = req.body.full_name.trim();
    await db.query('UPDATE users SET full_name = ? WHERE id = ?', [fullName, req.user.id]);
    logger.info(`User ${req.user.id} updated their profile`);

    const token = jwt.sign(
      { id: req.user.id, role: req.user.role, full_name: fullName },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({
      success: true,
      message: 'Profile updated',
      data: { token, user: { id: req.user.id, full_name: fullName, role: req.user.role } },
    });
  })
);

router.post(
  '/change-password',
  verifyToken,
  validatePasswordChange,
  asyncHandler(async (req, res) => {
    const { current_password, new_password } = req.body;

    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) throw new AppError('User not found', 404);
    const user = rows[0];

    const match = await bcrypt.compare(current_password, user.password);
    if (!match) {
      throw new AppError('Current password is incorrect', 401);
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
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
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validateForgotPassword,
  asyncHandler(async (req, res) => {
    const normalizedEmail = req.body.email.trim().toLowerCase();
    const [users] = await db.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);

    // Always return the same response whether or not the email exists,
    // so this endpoint can't be used to find out who has an account.
    const genericResponse = {
      success: true,
      message: 'If that email is registered, a password reset token has been generated.',
    };

    if (users.length === 0) {
      logger.warn(`Password reset requested for unknown email from ${req.ip}`);
      return res.json(genericResponse);
    }

    const userId = users[0].id;
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

    await db.query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt]
    );

    logger.info(`Password reset token issued for user ${userId}`);
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

    const [rows] = await db.query(
      'SELECT * FROM password_resets WHERE token_hash = ? AND used = 0',
      [tokenHash]
    );
    if (rows.length === 0) {
      throw new AppError('This reset token is invalid or has already been used', 400);
    }

    const resetRecord = rows[0];
    if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
      throw new AppError('This reset token has expired. Please request a new one.', 400);
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, resetRecord.user_id]);
    await db.query('UPDATE password_resets SET used = 1 WHERE id = ?', [resetRecord.id]);

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
    const [rows] = await db.query(
      'SELECT id, full_name, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ success: true, data: rows });
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

    const targetId = Number(req.params.id);
    if (targetId === req.user.id) {
      throw new AppError('You cannot change your own role', 400);
    }

    const [existing] = await db.query('SELECT id FROM users WHERE id = ?', [targetId]);
    if (existing.length === 0) throw new AppError('User not found', 404);

    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, targetId]);
    logger.info(`Admin ${req.user.id} set user ${targetId}'s role to ${role}`);
    res.json({ success: true, message: 'Role updated' });
  })
);

router.delete(
  '/users/:id',
  verifyToken,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const targetId = Number(req.params.id);
    if (targetId === req.user.id) {
      throw new AppError('You cannot delete your own account', 400);
    }

    const [existing] = await db.query('SELECT id FROM users WHERE id = ?', [targetId]);
    if (existing.length === 0) throw new AppError('User not found', 404);

    try {
      await db.query('DELETE FROM users WHERE id = ?', [targetId]);
    } catch (err) {
      // Foreign key constraint (they have appointments/records/a doctor
      // profile linked to them) -- deleting would orphan that data.
      throw new AppError(
        'This user has linked appointments, records, or a doctor profile and cannot be deleted. Consider changing their role instead.',
        409
      );
    }

    logger.info(`Admin ${req.user.id} deleted user ${targetId}`);
    res.json({ success: true, message: 'User deleted' });
  })
);

module.exports = router;
