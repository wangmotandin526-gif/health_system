// Firebase Authentication provider. Firebase owns every account's email and
// password; Firestore only keeps the profile (name, role) under users/{uid}.
//
// - Account management (create / update / delete / set password) uses the
//   Admin SDK.
// - Checking an email + password uses Firebase's "signInWithPassword" REST
//   endpoint, because the Admin SDK cannot verify passwords. That call needs
//   the project's Web API key (Firebase console -> Project settings ->
//   General -> "Web API Key"), set as FIREBASE_WEB_API_KEY.
//
// Errors are normalised to err.code in:
//   EMAIL_EXISTS, USER_NOT_FOUND, WEAK_PASSWORD, INVALID_EMAIL,
//   INVALID_CREDENTIALS, TOO_MANY_ATTEMPTS, USER_DISABLED
const admin = require('./firebase');

const authError = (code, message) => Object.assign(new Error(message || code), { code });

function mapAdminError(err) {
  switch (err && err.code) {
    case 'auth/email-already-exists':
      return authError('EMAIL_EXISTS');
    case 'auth/user-not-found':
      return authError('USER_NOT_FOUND');
    case 'auth/invalid-password':
      return authError('WEAK_PASSWORD', err.message);
    case 'auth/invalid-email':
      return authError('INVALID_EMAIL');
    default:
      return err;
  }
}

async function createUser({ email, password, displayName }) {
  try {
    const record = await admin.auth().createUser({ email, password, displayName });
    return record.uid;
  } catch (err) {
    throw mapAdminError(err);
  }
}

// patch may contain: email, password, displayName
async function updateUser(uid, patch) {
  try {
    await admin.auth().updateUser(uid, patch);
  } catch (err) {
    throw mapAdminError(err);
  }
}

async function deleteUser(uid) {
  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    const mapped = mapAdminError(err);
    if (mapped.code !== 'USER_NOT_FOUND') throw mapped; // already gone is fine
  }
}

function signInUrl() {
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const key = process.env.FIREBASE_WEB_API_KEY || (emulator ? 'fake-api-key' : '');
  if (!key) {
    throw new Error('FIREBASE_WEB_API_KEY is not set (Firebase console -> Project settings -> General -> Web API Key)');
  }
  const base = emulator
    ? `http://${emulator}/identitytoolkit.googleapis.com/v1`
    : 'https://identitytoolkit.googleapis.com/v1';
  return `${base}/accounts:signInWithPassword?key=${encodeURIComponent(key)}`;
}

// Returns the account's uid when the email/password pair is valid.
async function signIn(email, password) {
  const res = await fetch(signInUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));

  if (res.ok) return body.localId;

  const message = (body && body.error && body.error.message) || '';
  if (message.startsWith('TOO_MANY_ATTEMPTS')) throw authError('TOO_MANY_ATTEMPTS');
  if (message.startsWith('USER_DISABLED')) throw authError('USER_DISABLED');
  if (/API key|API_KEY|OPERATION_NOT_ALLOWED|CONFIGURATION_NOT_FOUND|PROJECT/i.test(message)) {
    throw new Error(`Firebase Authentication is not set up correctly: ${message}`);
  }
  throw authError('INVALID_CREDENTIALS');
}

module.exports = { createUser, updateUser, deleteUser, signIn };
