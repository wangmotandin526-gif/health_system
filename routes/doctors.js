const express = require('express');
const db = require('../config/db');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { validateDoctor } = require('../middleware/validators');

const router = express.Router();

router.get(
  '/',
  verifyToken,
  asyncHandler(async (req, res) => {
    const [doctors] = await db.query('SELECT * FROM doctors');
    res.json({ success: true, data: doctors });
  })
);

router.post(
  '/',
  verifyToken,
  requireRole('admin'),
  validateDoctor,
  asyncHandler(async (req, res) => {
    const { name, specialty, email, phone, available_days, photo_url, user_id } = req.body;

    if (user_id) {
      const [linked] = await db.query('SELECT id, role FROM users WHERE id = ?', [user_id]);
      if (linked.length === 0) throw new AppError('user_id does not reference an existing user', 400);
      if (linked[0].role !== 'doctor') throw new AppError('user_id must belong to a user with role "doctor"', 400);
    }

    const [result] = await db.query(
      'INSERT INTO doctors (name, specialty, email, phone, available_days, photo_url, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, specialty || null, email || null, phone || null, available_days || null, photo_url || null, user_id || null]
    );
    logger.info(`Admin ${req.user.id} added doctor ${result.insertId}`);
    res.status(201).json({ success: true, message: 'Doctor added', data: { id: result.insertId } });
  })
);

router.put(
  '/:id',
  verifyToken,
  requireRole('admin'),
  validateDoctor,
  asyncHandler(async (req, res) => {
    const { name, specialty, email, phone, available_days } = req.body;

    const [existing] = await db.query('SELECT id FROM doctors WHERE id = ?', [req.params.id]);
    if (existing.length === 0) throw new AppError('Doctor not found', 404);

    await db.query(
      'UPDATE doctors SET name=?, specialty=?, email=?, phone=?, available_days=? WHERE id=?',
      [name, specialty || null, email || null, phone || null, available_days || null, req.params.id]
    );
    logger.info(`Admin ${req.user.id} updated doctor ${req.params.id}`);
    res.json({ success: true, message: 'Doctor updated' });
  })
);

router.delete(
  '/:id',
  verifyToken,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const [existing] = await db.query('SELECT id FROM doctors WHERE id = ?', [req.params.id]);
    if (existing.length === 0) throw new AppError('Doctor not found', 404);

    await db.query('DELETE FROM doctors WHERE id = ?', [req.params.id]);
    logger.info(`Admin ${req.user.id} removed doctor ${req.params.id}`);
    res.json({ success: true, message: 'Doctor removed' });
  })
);

module.exports = router;
