const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const AppError = require('./AppError');

const emailKey = (email) => crypto.createHash('sha256').update(email).digest('hex');

async function claimEmail(email) {
  try {
    await db.createWithId('emails', emailKey(email), {});
  } catch (err) {
    if (err.code === 'ALREADY_EXISTS') throw new AppError('Email already registered', 409);
    throw err;
  }
}

const releaseEmail = (email) => db.remove('emails', emailKey(email)).catch(() => {});

async function createUser({ full_name, email, password, role }, { rounds = 10 } = {}) {
  const normalized = email.trim().toLowerCase();
  await claimEmail(normalized);
  try {
    const hashed = await bcrypt.hash(password, rounds);
    return await db.create('users', {
      full_name: full_name.trim(),
      email: normalized,
      password: hashed,
      role,
    });
  } catch (err) {
    await releaseEmail(normalized);
    throw err;
  }
}

async function changeEmail(user, newEmail) {
  const normalized = newEmail.trim().toLowerCase();
  if (normalized === user.email) return;
  await claimEmail(normalized);
  try {
    await db.update('users', user.id, { email: normalized });
  } catch (err) {
    await releaseEmail(normalized);
    throw err;
  }
  await releaseEmail(user.email);
}

async function findByEmail(email) {
  const rows = await db.find('users', { email: email.trim().toLowerCase() });
  return rows[0] || null;
}

async function deleteUser(user) {
  const [appts, recs, docs] = await Promise.all([
    db.find('appointments', { patient_id: user.id }),
    db.find('records', { patient_id: user.id }),
    db.find('doctors', { user_id: user.id }),
  ]);
  if (appts.length || recs.length || docs.length) {
    throw new AppError(
      'This user has linked appointments, records, or a doctor profile and cannot be deleted. Consider changing their role instead.',
      409
    );
  }
  const resets = await db.find('password_resets', { user_id: user.id });
  await Promise.all(resets.map((r) => db.remove('password_resets', r.id)));
  await db.remove('users', user.id);
  await releaseEmail(user.email);
}

function publicUser(u) {
  return { id: u.id, full_name: u.full_name, email: u.email, role: u.role, created_at: u.created_at };
}

module.exports = { createUser, changeEmail, findByEmail, deleteUser, publicUser, emailKey };
