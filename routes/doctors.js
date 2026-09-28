const express = require('express');
const db = require('../config/db');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { validateDoctor, isValidId } = require('../middleware/validators');
const { weekdaysOf } = require('../utils/availability');

const router = express.Router();

const toPublic = (d) => ({
  id: d.id,
  name: d.name,
  specialty: d.specialty ?? null,
  email: d.email ?? null,
  phone: d.phone ?? null,
  available_days: d.available_days ?? null,
  available_weekdays: weekdaysOf(d.available_days), // 0 = Sunday ... 6 = Saturday
  available_from: d.available_from ?? null,
  available_to: d.available_to ?? null,
  photo_url: d.photo_url ?? null,
  user_id: d.user_id ?? null,
});

async function getDoctorOr404(id) {
  const doctor = isValidId(id) ? await db.get('doctors', id) : null;
  if (!doctor) throw new AppError('Doctor not found', 404);
  return doctor;
}

router.get(
  '/',
  verifyToken,
  asyncHandler(async (req, res) => {
    const doctors = await db.find('doctors');
    doctors.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    res.json({ success: true, data: doctors.map(toPublic) });
  })
);

router.post(
  '/',
  verifyToken,
  requireRole('admin'),
  validateDoctor,
  asyncHandler(async (req, res) => {
    const { name, specialty, email, phone, available_days, available_from, available_to, photo_url, user_id } = req.body;

    if (user_id) {
      const linked = isValidId(user_id) ? await db.get('users', user_id) : null;
      if (!linked) throw new AppError('user_id does not reference an existing user', 400);
      if (linked.role !== 'doctor') throw new AppError('user_id must belong to a user with role "doctor"', 400);
    }

    const id = await db.create('doctors', {
      name: name.trim(),
      specialty: specialty || null,
      email: email || null,
      phone: phone || null,
      available_days: available_days.trim(),
      available_from: available_from || null,
      available_to: available_to || null,
      photo_url: photo_url || null,
      user_id: user_id ? String(user_id) : null,
    });
    logger.info(`Admin ${req.user.id} added doctor ${id}`);
    res.status(201).json({ success: true, message: 'Doctor added', data: { id } });
  })
);

router.put(
  '/:id',
  verifyToken,
  requireRole('admin'),
  validateDoctor,
  asyncHandler(async (req, res) => {
    const { name, specialty, email, phone, available_days, available_from, available_to } = req.body;
    const doctor = await getDoctorOr404(req.params.id);

    await db.update('doctors', doctor.id, {
      name: name.trim(),
      specialty: specialty || null,
      email: email || null,
      phone: phone || null,
      available_days: available_days.trim(),
      available_from: available_from || null,
      available_to: available_to || null,
    });
    logger.info(`Admin ${req.user.id} updated doctor ${doctor.id}`);
    res.json({ success: true, message: 'Doctor updated' });
  })
);

router.delete(
  '/:id',
  verifyToken,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const doctor = await getDoctorOr404(req.params.id);

    const [appts, recs] = await Promise.all([
      db.find('appointments', { doctor_id: doctor.id }),
      db.find('records', { doctor_id: doctor.id }),
    ]);
    if (appts.length || recs.length) {
      throw new AppError('This doctor has appointments or records linked to them and cannot be removed.', 409);
    }

    await db.remove('doctors', doctor.id);
    logger.info(`Admin ${req.user.id} removed doctor ${doctor.id}`);
    res.json({ success: true, message: 'Doctor removed' });
  })
);

module.exports = router;
