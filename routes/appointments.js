const express = require('express');
const db = require('../config/db');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { validateAppointment, validateAppointmentStatus } = require('../middleware/validators');

const router = express.Router();

async function findDoctorRecordForUser(userId) {
  const [rows] = await db.query('SELECT id FROM doctors WHERE user_id = ?', [userId]);
  return rows.length ? rows[0].id : null;
}

router.post(
  '/',
  verifyToken,
  requireRole('patient'),
  validateAppointment,
  asyncHandler(async (req, res) => {
    const { doctor_id, appointment_date, appointment_time, notes } = req.body;
    const patient_id = req.user.id;

    const [doctorRows] = await db.query('SELECT id FROM doctors WHERE id = ?', [doctor_id]);
    if (doctorRows.length === 0) {
      throw new AppError('doctor_id does not reference an existing doctor', 400);
    }

    const [doctorConflict] = await db.query(
      `SELECT id FROM appointments
       WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status != 'cancelled'`,
      [doctor_id, appointment_date, appointment_time]
    );
    if (doctorConflict.length > 0) {
      throw new AppError('This doctor already has an appointment at that date and time', 409);
    }

    const [patientConflict] = await db.query(
      `SELECT id FROM appointments
       WHERE patient_id = ? AND appointment_date = ? AND appointment_time = ? AND status != 'cancelled'`,
      [patient_id, appointment_date, appointment_time]
    );
    if (patientConflict.length > 0) {
      throw new AppError('You already have an appointment at that date and time', 409);
    }

    const [result] = await db.query(
      'INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, notes) VALUES (?, ?, ?, ?, ?)',
      [patient_id, doctor_id, appointment_date, appointment_time, notes || null]
    );
    logger.info(`Patient ${patient_id} booked appointment ${result.insertId} with doctor ${doctor_id}`);
    res.status(201).json({ success: true, message: 'Appointment booked', data: { id: result.insertId } });
  })
);

router.get(
  '/my',
  verifyToken,
  requireRole('patient', 'doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const baseSelect = `SELECT a.*, d.name AS doctor_name, d.specialty, u.full_name AS patient_name
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       JOIN users u ON a.patient_id = u.id`;

    if (req.user.role === 'patient') {
      const [rows] = await db.query(`${baseSelect} WHERE a.patient_id = ?`, [req.user.id]);
      return res.json({ success: true, data: rows });
    }

    if (req.user.role === 'doctor') {
      const doctorId = await findDoctorRecordForUser(req.user.id);
      if (!doctorId) {
        return res.json({ success: true, data: [], message: 'No doctor profile is linked to this account yet' });
      }
      const [rows] = await db.query(`${baseSelect} WHERE a.doctor_id = ?`, [doctorId]);
      return res.json({ success: true, data: rows });
    }

    const [rows] = await db.query(baseSelect);
    res.json({ success: true, data: rows });
  })
);

router.put(
  '/:id',
  verifyToken,
  requireRole('patient', 'doctor', 'admin'),
  validateAppointmentStatus,
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const appointmentId = req.params.id;

    const [rows] = await db.query('SELECT * FROM appointments WHERE id = ?', [appointmentId]);
    if (rows.length === 0) throw new AppError('Appointment not found', 404);
    const appointment = rows[0];

    if (req.user.role === 'patient') {
      if (appointment.patient_id !== req.user.id) {
        throw new AppError('You do not have permission to modify this appointment', 403);
      }
      if (status !== 'cancelled') {
        throw new AppError('Patients may only cancel an appointment', 403);
      }
    } else if (req.user.role === 'doctor') {
      const doctorId = await findDoctorRecordForUser(req.user.id);
      if (!doctorId || appointment.doctor_id !== doctorId) {
        throw new AppError('You do not have permission to modify this appointment', 403);
      }
    }

    await db.query('UPDATE appointments SET status = ? WHERE id = ?', [status, appointmentId]);
    logger.info(`User ${req.user.id} (${req.user.role}) set appointment ${appointmentId} to ${status}`);
    res.json({ success: true, message: 'Appointment updated' });
  })
);

module.exports = router;
