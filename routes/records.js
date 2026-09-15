const express = require('express');
const db = require('../config/db');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { validateRecord } = require('../middleware/validators');

const SELECT_WITH_DOCTOR = `SELECT r.*, d.name AS doctor_name
       FROM records r LEFT JOIN doctors d ON r.doctor_id = d.id`;

const router = express.Router();


router.get(
  '/my',
  verifyToken,
  requireRole('patient'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.query(`${SELECT_WITH_DOCTOR} WHERE r.patient_id = ?`, [req.user.id]);
    res.json({ success: true, data: rows });
  })
);


router.get(
  '/patient/:patientId',
  verifyToken,
  requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const [patientRows] = await db.query('SELECT id FROM users WHERE id = ? AND role = ?', [req.params.patientId, 'patient']);
    if (patientRows.length === 0) throw new AppError('Patient not found', 404);

    const [rows] = await db.query(`${SELECT_WITH_DOCTOR} WHERE r.patient_id = ?`, [req.params.patientId]);
    res.json({ success: true, data: rows });
  })
);

router.post(
  '/',
  verifyToken,
  requireRole('doctor', 'admin'),
  validateRecord,
  asyncHandler(async (req, res) => {
    const { patient_id, doctor_id, diagnosis, prescription, visit_date } = req.body;

    const [patientRows] = await db.query('SELECT id FROM users WHERE id = ? AND role = ?', [patient_id, 'patient']);
    if (patientRows.length === 0) throw new AppError('patient_id does not reference an existing patient', 400);

    if (doctor_id) {
      const [doctorRows] = await db.query('SELECT id FROM doctors WHERE id = ?', [doctor_id]);
      if (doctorRows.length === 0) throw new AppError('doctor_id does not reference an existing doctor', 400);
    }

    const [result] = await db.query(
      'INSERT INTO records (patient_id, doctor_id, diagnosis, prescription, visit_date) VALUES (?, ?, ?, ?, ?)',
      [patient_id, doctor_id || null, diagnosis || null, prescription || null, visit_date || null]
    );
    logger.info(`User ${req.user.id} (${req.user.role}) added record ${result.insertId} for patient ${patient_id}`);
    res.status(201).json({ success: true, message: 'Record added', data: { id: result.insertId } });
  })
);

module.exports = router;
