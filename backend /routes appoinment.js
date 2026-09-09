const express = require('express');
const db = require('../config/db');
const verifyToken = require('../middleware/auth');
const router = express.Router();

// Book appointment
router.post('/', verifyToken, async (req, res) => {
  const { doctor_id, appointment_date, appointment_time, notes } = req.body;
  const patient_id = req.user.id;

  await db.query(
    'INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, notes) VALUES (?, ?, ?, ?, ?)',
    [patient_id, doctor_id, appointment_date, appointment_time, notes]
  );
  res.status(201).json({ message: 'Appointment booked' });
});

// Get logged-in user's appointments
router.get('/my', verifyToken, async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.*, d.name AS doctor_name, d.specialty
     FROM appointments a JOIN doctors d ON a.doctor_id = d.id
     WHERE a.patient_id = ?`,
    [req.user.id]
  );
  res.json(rows);
});

// Update appointment status (confirm/cancel)
router.put('/:id', verifyToken, async (req, res) => {
  const { status } = req.body;
  await db.query('UPDATE appointments SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ message: 'Appointment updated' });
});

module.exports = router;
