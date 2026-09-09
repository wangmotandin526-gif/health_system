const express = require('express');
const db = require('../config/db');
const router = express.Router();

// Get all doctors
router.get('/', async (req, res) => {
  const [doctors] = await db.query('SELECT * FROM doctors');
  res.json(doctors);
});

// Add a doctor
router.post('/', async (req, res) => {
  const { name, specialty, email, phone, available_days, photo_url } = req.body;
  await db.query(
    'INSERT INTO doctors (name, specialty, email, phone, available_days, photo_url) VALUES (?, ?, ?, ?, ?, ?)',
    [name, specialty, email, phone, available_days, photo_url]
  );
  res.status(201).json({ message: 'Doctor added' });
});

// Update a doctor
router.put('/:id', async (req, res) => {
  const { name, specialty, email, phone, available_days } = req.body;
  await db.query(
    'UPDATE doctors SET name=?, specialty=?, email=?, phone=?, available_days=? WHERE id=?',
    [name, specialty, email, phone, available_days, req.params.id]
  );
  res.json({ message: 'Doctor updated' });
});

// Delete a doctor
router.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM doctors WHERE id = ?', [req.params.id]);
  res.json({ message: 'Doctor removed' });
});

module.exports = router;
