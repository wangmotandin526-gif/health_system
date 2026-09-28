const db = require('../config/db');
const auth = require('../config/authProvider');
const AppError = require('./AppError');

function mapAuthError(err) {
  switch (err && err.code) {
    case 'EMAIL_EXISTS':
      return new AppError('Email already registered', 409);
    case 'WEAK_PASSWORD':
      return new AppError('Password is too weak (use at least 8 characters)', 400);
    case 'INVALID_EMAIL':
      return new AppError('A valid email is required', 400);
    case 'USER_NOT_FOUND':
      return new AppError('User not found', 404);
    case 'INVALID_CREDENTIALS':
      return new AppError('Invalid email or password', 401);
    case 'TOO_MANY_ATTEMPTS':
      return new AppError('Too many failed attempts. Please try again later.', 429);
    case 'USER_DISABLED':
      return new AppError('This account has been disabled', 403);
    default:
      return err;
  }
}

async function createUser({ full_name, email, password, role }) {
  const normalized = email.trim().toLowerCase();
  const name = full_name.trim();

  let uid;
  try {
    uid = await auth.createUser({ email: normalized, password, displayName: name });
  } catch (err) {
    throw mapAuthError(err);
  }

  try {
    await db.createWithId('users', uid, { full_name: name, email: normalized, role });
  } catch (err) {
    await auth.deleteUser(uid).catch(() => {}); // don't leave an orphan login behind
    throw err;
  }
  return uid;
}

async function verifyCredentials(email, password) {
  try {
    return await auth.signIn(email.trim().toLowerCase(), password);
  } catch (err) {
    throw mapAuthError(err);
  }
}

async function setPassword(uid, newPassword) {
  try {
    await auth.updateUser(uid, { password: newPassword });
  } catch (err) {
    throw mapAuthError(err);
  }
}

async function changeEmail(user, newEmail) {
  const normalized = newEmail.trim().toLowerCase();
  if (normalized === user.email) return;

  try {
    await auth.updateUser(user.id, { email: normalized }); // Firebase enforces uniqueness
  } catch (err) {
    throw mapAuthError(err);
  }
  try {
    await db.update('users', user.id, { email: normalized });
  } catch (err) {
    await auth.updateUser(user.id, { email: user.email }).catch(() => {});
    throw err;
  }
}

// Keeps the Firebase Auth display name in step with the Firestore profile.
async function syncDisplayName(uid, name) {
  await auth.updateUser(uid, { displayName: name.trim() }).catch(() => {});
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
  await auth.deleteUser(user.id);
  await db.remove('users', user.id);
}

function publicUser(u) {
  return { id: u.id, full_name: u.full_name, email: u.email, role: u.role, created_at: u.created_at };
}

module.exports = {
  createUser,
  verifyCredentials,
  setPassword,
  changeEmail,
  syncDisplayName,
  findByEmail,
  deleteUser,
  publicUser,
};
