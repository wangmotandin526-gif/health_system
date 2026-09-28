const db = require('../config/db');
const { createUser: createUserRecord } = require('../utils/users');

async function createUser({ full_name, email, password, role }) {
  return createUserRecord({ full_name, email, password, role });
}

// Doctors default to working every day so tests that are not about availability
// can book any date. Pass available_days: null to simulate a doctor with no days set.
async function createDoctor({
  name,
  specialty = 'General',
  user_id = null,
  available_days = 'Mon-Sun',
  available_from = null,
  available_to = null,
}) {
  return db.create('doctors', {
    name,
    specialty,
    email: null,
    phone: null,
    available_days,
    available_from,
    available_to,
    photo_url: null,
    user_id,
  });
}

module.exports = { createUser, createDoctor };
