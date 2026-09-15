const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function createUser({ full_name, email, password, role }) {
  const hashed = await bcrypt.hash(password, 4); 
  const [result] = await db.query(
    'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
    [full_name, email, hashed, role]
  );
  return result.insertId;
}

async function createDoctor({ name, specialty = 'General', user_id = null }) {
  const [result] = await db.query(
    'INSERT INTO doctors (name, specialty, email, phone, available_days, photo_url, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, specialty, null, null, null, null, user_id]
  );
  return result.insertId;
}

module.exports = { createUser, createDoctor };
