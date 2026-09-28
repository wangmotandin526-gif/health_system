const crypto = require('crypto');

const collections = new Map();
const nowIso = () => new Date().toISOString();

function col(name) {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name);
}

const clone = (doc) => (doc ? { ...doc } : null);

async function create(name, data) {
  const id = crypto.randomBytes(10).toString('hex');
  col(name).set(id, { id, created_at: nowIso(), ...data });
  return id;
}

async function createWithId(name, id, data = {}) {
  const key = String(id);
  if (col(name).has(key)) {
    const e = new Error(`${name}/${key} already exists`);
    e.code = 'ALREADY_EXISTS';
    throw e;
  }
  col(name).set(key, { id: key, created_at: nowIso(), ...data });
  return key;
}

async function get(name, id) {
  if (id === undefined || id === null || id === '') return null;
  return clone(col(name).get(String(id)));
}

async function getMany(name, ids) {
  const out = {};
  [...new Set(ids.filter((v) => v !== undefined && v !== null && v !== '').map(String))].forEach((id) => {
    const doc = col(name).get(id);
    if (doc) out[id] = clone(doc);
  });
  return out;
}

async function find(name, where = {}) {
  const entries = Object.entries(where);
  return [...col(name).values()]
    .filter((doc) => entries.every(([field, value]) => doc[field] === value))
    .map(clone);
}

async function update(name, id, patch) {
  const key = String(id);
  const existing = col(name).get(key);
  if (!existing) throw new Error(`${name}/${key} not found`);
  col(name).set(key, { ...existing, ...patch, id: key });
}

async function remove(name, id) {
  col(name).delete(String(id));
}

async function close() {}

module.exports = { create, createWithId, get, getMany, find, update, remove, close };
