const crypto = require('crypto');

const accounts = new Map(); // uid -> { email, password, displayName }
const authError = (code, message) => Object.assign(new Error(message || code), { code });

const emailTaken = (email, exceptUid) =>
  [...accounts.entries()].some(([uid, a]) => a.email === email && uid !== exceptUid);

function checkFields({ email, password }, uid) {
  if (email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw authError('INVALID_EMAIL');
    if (emailTaken(email, uid)) throw authError('EMAIL_EXISTS');
  }
  if (password !== undefined && (typeof password !== 'string' || password.length < 6)) {
    throw authError('WEAK_PASSWORD', 'The password must be at least 6 characters');
  }
}

async function createUser({ email, password, displayName }) {
  checkFields({ email, password });
  const uid = crypto.randomBytes(14).toString('hex');
  accounts.set(uid, { email, password, displayName });
  return uid;
}

async function updateUser(uid, patch) {
  const account = accounts.get(uid);
  if (!account) throw authError('USER_NOT_FOUND');
  checkFields(patch, uid);
  accounts.set(uid, { ...account, ...patch });
}

async function deleteUser(uid) {
  accounts.delete(uid);
}

async function signIn(email, password) {
  const found = [...accounts.entries()].find(([, a]) => a.email === email);
  if (!found || found[1].password !== password) throw authError('INVALID_CREDENTIALS');
  return found[0];
}

module.exports = { createUser, updateUser, deleteUser, signIn };
