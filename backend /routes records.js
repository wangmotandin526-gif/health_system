const express = require('express');
const db = require('../config/db');
const verifyToken = require('../middleware/auth');
const router = express.Router();

// Get patient's records
router.get('/my', verifyToken, async (req, res) => {
  const [rows] = await db.query(
    `SELECT r.*, d.name AS doctor_name
     FROM records r LEFT JOIN doctors d ON r.doctor_id = d.id
     WHERE r.patient_id = ?`,
    [req.user.id]
  );
  res.json(rows);
});

// Add a record (doctor/admin use)
router.post('/', verifyToken, async (req, res) => {
  const { patient_id, doctor_id, diagnosis, prescription, visit_date } = req.body;
  await db.query(
    'INSERT INTO records (patient_id, doctor_id, diagnosis, prescription, visit_date) VALUES (?, ?, ?, ?, ?)',
    [patient_id, doctor_id, diagnosis, prescription, visit_date]
  );
  res.status(201).json({ message: 'Record added' });
});

module.exports = router;
