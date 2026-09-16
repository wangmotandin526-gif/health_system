const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../config/db');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { validateRegister, validateLogin, validateProfileUpdate, validatePasswordChange } = require('../middleware/validators');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

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

module.exports = router;
