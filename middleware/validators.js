const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM, 24h

function fail(res, errors) {
  return res.status(400).json({ success: false, message: 'Validation failed', errors });
}

function isValidDate(str) {
  if (!DATE_RE.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

function validateRegister(req, res, next) {
  const { full_name, email, password } = req.body || {};
  const errors = [];

  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
  errors.push('full_name is required');
  } else if (full_name.trim().length > MAX_NAME_LENGTH) {
    errors.push(`full_name must not exceed ${MAX_NAME_LENGTH} characters`);
  }
  
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    errors.push('a valid email is required');
  } else if (email.trim().length > MAX_EMAIL_LENGTH) {
    errors.push(`email must not exceed ${MAX_EMAIL_LENGTH} characters`);
  }
  
  if (!password || typeof password !== 'string' || password.length < 8) {
    errors.push('password must be at least 8 characters');
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`password must not exceed ${MAX_PASSWORD_LENGTH} characters`);
  }

  if (errors.length) return fail(res, errors);
  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body || {};
  const errors = [];
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
    errors.push('a valid email is required');
  }
  if (!password || typeof password !== 'string') {
    errors.push('password is required');
  }
  if (errors.length) return fail(res, errors);
  next();
}


function validateDoctor(req, res, next) {
  const { name, email, phone } = req.body || {};
  const errors = [];
  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push('name is required');
  }
  if (email && !EMAIL_RE.test(email)) {
    errors.push('email must be a valid email address');
  }
  if (phone && !/^[0-9+\-()\s]{6,20}$/.test(phone)) {
    errors.push('phone must be a valid phone number');
  }
  if (errors.length) return fail(res, errors);
  next();
}


function validateAppointment(req, res, next) {
  const { doctor_id, appointment_date, appointment_time } = req.body || {};
  const errors = [];

  if (!doctor_id || !Number.isInteger(Number(doctor_id)) || Number(doctor_id) <= 0) {
    errors.push('doctor_id must be a valid positive integer');
  }
  if (!appointment_date || !isValidDate(appointment_date)) {
    errors.push('appointment_date must be a valid date in YYYY-MM-DD format');
  } else {
    const today = new Date().toISOString().slice(0, 10);
    if (appointment_date < today) {
      errors.push('appointment_date cannot be in the past');
    }
  }
  if (!appointment_time || !TIME_RE.test(appointment_time)) {
    errors.push('appointment_time must be in HH:MM 24-hour format');
  }

  if (errors.length) return fail(res, errors);
  next();
}

function validateAppointmentStatus(req, res, next) {
  const { status } = req.body || {};
  const allowed = ['pending', 'confirmed', 'cancelled', 'completed'];
  if (!status || !allowed.includes(status)) {
    return fail(res, [`status must be one of: ${allowed.join(', ')}`]);
  }
  next();
}


function validateRecord(req, res, next) {
  const { patient_id, visit_date, diagnosis, prescription } = req.body || {};
  const errors = [];

  if (!patient_id || !Number.isInteger(Number(patient_id)) || Number(patient_id) <= 0) {
    errors.push('patient_id must be a valid positive integer');
  }
  if (visit_date && !isValidDate(visit_date)) {
    errors.push('visit_date must be a valid date in YYYY-MM-DD format');
  }
  if (!diagnosis && !prescription) {
    errors.push('at least one of diagnosis or prescription is required');
  }

  if (errors.length) return fail(res, errors);
  next();
}

module.exports = {
  validateRegister,
  validateLogin,
  validateDoctor,
  validateAppointment,
  validateAppointmentStatus,
  validateRecord,
};
