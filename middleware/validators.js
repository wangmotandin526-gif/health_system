const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM, 24h
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const { parseAvailableDays } = require('../utils/availability');

function isValidId(value) {
  return (typeof value === 'string' || typeof value === 'number') && ID_RE.test(String(value));
}

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
  } else if (name.trim().length > MAX_NAME_LENGTH) {
    errors.push(`name must not exceed ${MAX_NAME_LENGTH} characters`);
  }
  
  if (email) {
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      errors.push('email must be a valid email address');
    } else if (email.trim().length > MAX_EMAIL_LENGTH) {
      errors.push(`email must not exceed ${MAX_EMAIL_LENGTH} characters`);
    }
  }
  
  if (phone && (
    typeof phone !== 'string' ||
    !/^[0-9+\-()\s]{6,20}$/.test(phone.trim())
  )) {
    errors.push('phone must be a valid phone number');
  }

  const { available_days, available_from, available_to } = req.body || {};

  if (typeof available_days !== 'string' || !available_days.trim()) {
    errors.push('available_days is required, e.g. "Mon,Wed,Fri" or "Mon-Fri"');
  } else if (available_days.length > 100) {
    errors.push('available_days must not exceed 100 characters');
  } else {
    const { days, invalid } = parseAvailableDays(available_days);
    if (invalid.length) {
      errors.push(`available_days has unrecognised day(s): ${invalid.join(', ')}. Use e.g. "Mon,Wed,Fri" or "Mon-Fri"`);
    } else if (days.size === 0) {
      errors.push('available_days must list at least one weekday, e.g. "Mon,Wed,Fri"');
    }
  }

  const hasFrom = available_from !== undefined && available_from !== null && available_from !== '';
  const hasTo = available_to !== undefined && available_to !== null && available_to !== '';
  if (hasFrom !== hasTo) {
    errors.push('available_from and available_to must be provided together');
  } else if (hasFrom) {
    if (!TIME_RE.test(String(available_from)) || !TIME_RE.test(String(available_to))) {
      errors.push('available_from and available_to must be in HH:MM (24-hour) format');
    } else if (String(available_from) >= String(available_to)) {
      errors.push('available_from must be earlier than available_to');
    }
  }
  if (errors.length) return fail(res, errors);
  next();
}


function validateAppointment(req, res, next) {
  const {
    doctor_id,
    appointment_date,
    appointment_time,
    notes
  } = req.body || {};
  const errors = [];

  if (!isValidId(doctor_id)) {
    errors.push('doctor_id must be a valid doctor id');
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
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== 'string') {
      errors.push('notes must be text');
    } else if (notes.trim().length > 500) {
      errors.push('notes must not exceed 500 characters');
    }
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

  if (!isValidId(patient_id)) {
    errors.push('patient_id must be a valid patient id');
  }
  if (visit_date && !isValidDate(visit_date)) {
    errors.push('visit_date must be a valid date in YYYY-MM-DD format');
  }
  if (
    (!diagnosis || typeof diagnosis !== 'string' || !diagnosis.trim()) &&
    (!prescription || typeof prescription !== 'string' || !prescription.trim())
  ) {
    errors.push('at least one of diagnosis or prescription is required');
  }
  
  if (diagnosis && typeof diagnosis !== 'string') {
    errors.push('diagnosis must be text');
  }
  
  if (prescription && typeof prescription !== 'string') {
    errors.push('prescription must be text');
  }
  
  if (typeof diagnosis === 'string' && diagnosis.trim().length > 1000) {
    errors.push('diagnosis must not exceed 1000 characters');
  }
  
  if (typeof prescription === 'string' && prescription.trim().length > 1000) {
    errors.push('prescription must not exceed 1000 characters');
  }

  if (errors.length) return fail(res, errors);
  next();
}

function validateProfileUpdate(req, res, next) {
  const { full_name } = req.body || {};
  const errors = [];

  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    errors.push('full_name is required');
  } else if (full_name.trim().length > MAX_NAME_LENGTH) {
    errors.push(`full_name must not exceed ${MAX_NAME_LENGTH} characters`);
  }

  if (errors.length) return fail(res, errors);
  next();
}

function validateForgotPassword(req, res, next) {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return fail(res, ['a valid email is required']);
  }
  next();
}

function validateResetPassword(req, res, next) {
  const { token, new_password } = req.body || {};
  const errors = [];
  if (!token || typeof token !== 'string' || token.trim().length < 20) {
    errors.push('a valid reset token is required');
  }
  if (!new_password || typeof new_password !== 'string' || new_password.length < 8) {
    errors.push('new_password must be at least 8 characters');
  } else if (new_password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`new_password must not exceed ${MAX_PASSWORD_LENGTH} characters`);
  }
  if (errors.length) return fail(res, errors);
  next();
}

function validatePasswordChange(req, res, next) {
  const { current_password, new_password } = req.body || {};
  const errors = [];

  if (!current_password || typeof current_password !== 'string') {
    errors.push('current_password is required');
  }
  if (!new_password || typeof new_password !== 'string' || new_password.length < 8) {
    errors.push('new_password must be at least 8 characters');
  } else if (new_password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`new_password must not exceed ${MAX_PASSWORD_LENGTH} characters`);
  }

  if (errors.length) return fail(res, errors);
  next();
}

function validateAdminUserUpdate(req, res, next) {
  const { full_name, email, role } = req.body || {};
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
  if (role !== undefined && !['patient', 'doctor', 'admin'].includes(role)) {
    errors.push('role must be one of: patient, doctor, admin');
  }

  if (errors.length) return fail(res, errors);
  next();
}

function validateAdminSetPassword(req, res, next) {
  const { new_password } = req.body || {};
  if (!new_password || typeof new_password !== 'string' || new_password.length < 8) {
    return fail(res, ['new_password must be at least 8 characters']);
  }
  if (new_password.length > MAX_PASSWORD_LENGTH) {
    return fail(res, [`new_password must not exceed ${MAX_PASSWORD_LENGTH} characters`]);
  }
  next();
}

const ARTICLE_CATEGORIES = [
  'General Health',
  'Nutrition',
  'Mental Wellbeing',
  'Chronic Conditions',
  'Child Health',
  'Preventive Care',
];

function validateArticle(req, res, next) {
  const { title, category, summary, content } = req.body || {};
  const errors = [];

  if (!title || typeof title !== 'string' || !title.trim()) errors.push('title is required');
  else if (title.trim().length > 150) errors.push('title must not exceed 150 characters');

  if (!ARTICLE_CATEGORIES.includes(category)) {
    errors.push(`category must be one of: ${ARTICLE_CATEGORIES.join(', ')}`);
  }

  if (summary !== undefined && summary !== null && summary !== '') {
    if (typeof summary !== 'string') errors.push('summary must be text');
    else if (summary.trim().length > 300) errors.push('summary must not exceed 300 characters');
  }

  if (!content || typeof content !== 'string' || !content.trim()) errors.push('content is required');
  else if (content.trim().length > 8000) errors.push('content must not exceed 8000 characters');

  if (errors.length) return fail(res, errors);
  next();
}

module.exports = {
  ARTICLE_CATEGORIES,
  isValidId,
  validateAdminUserUpdate,
  validateAdminSetPassword,
  validateArticle,
  validateRegister,
  validateLogin,
  validateDoctor,
  validateAppointment,
  validateAppointmentStatus,
  validateRecord,
  validateProfileUpdate,
  validatePasswordChange,
  validateForgotPassword,
  validateResetPassword,
};
