const admin = require('./firebase');

const firestore = admin.firestore();
firestore.settings({ ignoreUndefinedProperties: true });

const nowIso = () => new Date().toISOString();
const ALREADY_EXISTS = 6; // gRPC status code

function withId(snap) {
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function create(col, data) {
  const ref = firestore.collection(col).doc();
  await ref.set({ created_at: nowIso(), ...data });
  return ref.id;
}

async function createWithId(col, id, data = {}) {
  try {
    await firestore.collection(col).doc(String(id)).create({ created_at: nowIso(), ...data });
  } catch (err) {
    if (err.code === ALREADY_EXISTS || /ALREADY_EXISTS/.test(err.message || '')) {
      const e = new Error(`${col}/${id} already exists`);
      e.code = 'ALREADY_EXISTS';
      throw e;
    }
    throw err;
  }
  return String(id);
}

async function get(col, id) {
  if (id === undefined || id === null || id === '') return null;
  return withId(await firestore.collection(col).doc(String(id)).get());
}

async function getMany(col, ids) {
  const unique = [...new Set(ids.filter((v) => v !== undefined && v !== null && v !== '').map(String))];
  if (unique.length === 0) return {};
  const snaps = await firestore.getAll(...unique.map((id) => firestore.collection(col).doc(id)));
  const out = {};
  snaps.forEach((s) => {
    if (s.exists) out[s.id] = withId(s);
  });
  return out;
}

async function find(col, where = {}) {
  let q = firestore.collection(col);
  Object.entries(where).forEach(([field, value]) => {
    q = q.where(field, '==', value);
  });
  const snap = await q.get();
  return snap.docs.map(withId);
}

async function update(col, id, patch) {
  await firestore.collection(col).doc(String(id)).update(patch);
}

async function remove(col, id) {
  await firestore.collection(col).doc(String(id)).delete();
}

async function close() {
  await Promise.all(admin.apps.map((app) => app && app.delete()));
}

module.exports = { create, createWithId, get, getMany, find, update, remove, close };
