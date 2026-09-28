const express = require('express');
const db = require('../config/db');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { bookingProblem } = require('../utils/availability');
const {
  validateAppointment,
  validateAppointmentStatus,
  isValidId,
} = require('../middleware/validators');

const router = express.Router();

const slotKey = (ownerId, date, time) => `${ownerId}_${date}_${time.replace(':', '')}`;

async function tryLock(collection, key) {
  try {
    await db.createWithId(collection, key, {});
    return true;
  } catch (err) {
    if (err.code === 'ALREADY_EXISTS') return false;
    throw err;
  }
}

async function reserveSlots({ doctor_id, patient_id, appointment_date, appointment_time }) {
  const doctorKey = slotKey(doctor_id, appointment_date, appointment_time);
  const patientKey = slotKey(patient_id, appointment_date, appointment_time);

  if (!(await tryLock('doctor_slots', doctorKey))) {
    throw new AppError('This doctor already has an appointment at that date and time', 409);
  }
  let patientLocked;
  try {
    patientLocked = await tryLock('patient_slots', patientKey);
  } catch (err) {
    await db.remove('doctor_slots', doctorKey).catch(() => {});
    throw err;
  }
  if (!patientLocked) {
    await db.remove('doctor_slots', doctorKey).catch(() => {});
    throw new AppError('You already have an appointment at that date and time', 409);
  }
  return { doctorKey, patientKey };
}

async function releaseSlots({ doctor_id, patient_id, appointment_date, appointment_time }) {
  await Promise.all([
    db.remove('doctor_slots', slotKey(doctor_id, appointment_date, appointment_time)),
    db.remove('patient_slots', slotKey(patient_id, appointment_date, appointment_time)),
  ]);
}

async function findDoctorRecordForUser(userId) {
  const rows = await db.find('doctors', { user_id: userId });
  return rows.length ? rows[0].id : null;
}

router.post(
  '/',
  verifyToken,
  requireRole('patient'),
  validateAppointment,
  asyncHandler(async (req, res) => {
    const { appointment_date, appointment_time, notes } = req.body;
    const doctor_id = String(req.body.doctor_id);
    const patient_id = req.user.id;

    const doctor = await db.get('doctors', doctor_id);
    if (!doctor) {
      throw new AppError('doctor_id does not reference an existing doctor', 400);
    }

    // The doctor must work on the chosen weekday (and inside their working hours, if set).
    const problem = bookingProblem(doctor, appointment_date, appointment_time);
    if (problem) throw new AppError(problem, 400);

    const slot = { doctor_id, patient_id, appointment_date, appointment_time };
    await reserveSlots(slot);

    let id;
    try {
      id = await db.create('appointments', {
        ...slot,
        status: 'pending',
        notes: notes || null,
      });
    } catch (err) {
      await releaseSlots(slot).catch(() => {});
      throw err;
    }

    logger.info(`Patient ${patient_id} booked appointment ${id} with doctor ${doctor_id}`);
    res.status(201).json({ success: true, message: 'Appointment booked', data: { id } });
  })
);

router.get(
  '/my',
  verifyToken,
  requireRole('patient', 'doctor', 'admin'),
  asyncHandler(async (req, res) => {
    let appointments;

    if (req.user.role === 'patient') {
      appointments = await db.find('appointments', { patient_id: req.user.id });
    } else if (req.user.role === 'doctor') {
      const doctorId = await findDoctorRecordForUser(req.user.id);
      if (!doctorId) {
        return res.json({ success: true, data: [], message: 'No doctor profile is linked to this account yet' });
      }
      appointments = await db.find('appointments', { doctor_id: doctorId });
    } else {
      appointments = await db.find('appointments');
    }

    const [doctors, patients] = await Promise.all([
      db.getMany('doctors', appointments.map((a) => a.doctor_id)),
      db.getMany('users', appointments.map((a) => a.patient_id)),
    ]);

    appointments.sort((a, b) =>
      `${a.appointment_date} ${a.appointment_time}`.localeCompare(`${b.appointment_date} ${b.appointment_time}`)
    );

    const data = appointments.map((a) => ({
      id: a.id,
      patient_id: a.patient_id,
      doctor_id: a.doctor_id,
      appointment_date: a.appointment_date,
      appointment_time: a.appointment_time,
      status: a.status,
      notes: a.notes ?? null,
      created_at: a.created_at,
      doctor_name: doctors[a.doctor_id]?.name ?? null,
      specialty: doctors[a.doctor_id]?.specialty ?? null,
      patient_name: patients[a.patient_id]?.full_name ?? null,
    }));

    res.json({ success: true, data });
  })
);

router.put(
  '/:id',
  verifyToken,
  requireRole('patient', 'doctor', 'admin'),
  validateAppointmentStatus,
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const appointment = isValidId(req.params.id) ? await db.get('appointments', req.params.id) : null;
    if (!appointment) throw new AppError('Appointment not found', 404);

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

    if (status !== appointment.status) {
      if (status === 'cancelled') {
        await releaseSlots(appointment); // frees the slot for someone else
      } else if (appointment.status === 'cancelled') {
        await reserveSlots(appointment); // re-activating: the slot must still be free
      }
    }

    await db.update('appointments', appointment.id, { status });
    logger.info(`User ${req.user.id} (${req.user.role}) set appointment ${appointment.id} to ${status}`);
    res.json({ success: true, message: 'Appointment updated' });
  })
);

module.exports = router;
