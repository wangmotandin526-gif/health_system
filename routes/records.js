const express = require('express');
const db = require('../config/db');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { validateRecord, isValidId } = require('../middleware/validators');

const router = express.Router();

// Look up a patient's records and attach each doctor's name (newest visit first).
async function recordsForPatient(patientId) {
  const records = await db.find('records', { patient_id: String(patientId) });
  const doctors = await db.getMany('doctors', records.map((r) => r.doctor_id));

  return records
    .map((r) => ({
      id: r.id,
      patient_id: r.patient_id,
      doctor_id: r.doctor_id ?? null,
      diagnosis: r.diagnosis ?? null,
      prescription: r.prescription ?? null,
      visit_date: r.visit_date ?? null,
      doctor_name: r.doctor_id && doctors[r.doctor_id] ? doctors[r.doctor_id].name : null,
      _sort: r.visit_date || r.created_at || '',
    }))
    .sort((a, b) => (a._sort < b._sort ? 1 : a._sort > b._sort ? -1 : 0))
    .map(({ _sort, ...rest }) => rest);
}

router.get(
  '/my',
  verifyToken,
  requireRole('patient'),
  asyncHandler(async (req, res) => {
    const data = await recordsForPatient(req.user.id);
    res.json({ success: true, data });
  })
);

router.get(
  '/patient/:patientId',
  verifyToken,
  requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const patient = isValidId(req.params.patientId) ? await db.get('users', req.params.patientId) : null;
    if (!patient || patient.role !== 'patient') throw new AppError('Patient not found', 404);

    const data = await recordsForPatient(patient.id);
    res.json({ success: true, data });
  })
);

router.post(
  '/',
  verifyToken,
  requireRole('doctor', 'admin'),
  validateRecord,
  asyncHandler(async (req, res) => {
    const { patient_id, doctor_id, diagnosis, prescription, visit_date } = req.body;

    const patient = await db.get('users', patient_id);
    if (!patient || patient.role !== 'patient') {
      throw new AppError('patient_id does not reference an existing patient', 400);
    }

    if (doctor_id) {
      const doctor = isValidId(doctor_id) ? await db.get('doctors', doctor_id) : null;
      if (!doctor) throw new AppError('doctor_id does not reference an existing doctor', 400);
    }

    const id = await db.create('records', {
      patient_id: String(patient_id),
      doctor_id: doctor_id ? String(doctor_id) : null,
      diagnosis: diagnosis || null,
      prescription: prescription || null,
      visit_date: visit_date || null,
    });

    logger.info(`User ${req.user.id} (${req.user.role}) added record ${id} for patient ${patient_id}`);
    res.status(201).json({ success: true, message: 'Record added', data: { id } });
  })
);

module.exports = router;
