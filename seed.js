const db = require('./config/db');

async function ensureSeedData() {
  const [existing] = await db.query('SELECT id FROM doctors');
  if (existing.length > 0) {
    console.log(`Skipping seed: ${existing.length} doctor(s) already in the database.`);
    return;
  }

  const doctors = [
    ['Dr. Sarah Smith', 'Cardiology', 'sarah.smith@healthsys.test', '0400111222', 'Mon,Wed,Fri', null, null],
    ['Dr. James Lee', 'General Practice', 'james.lee@healthsys.test', '0400333444', 'Tue,Thu', null, null],
    ['Dr. Amina Yusuf', 'Paediatrics', 'amina.yusuf@healthsys.test', '0400555666', 'Mon,Tue,Wed', null, null],
  ];

  for (const d of doctors) {
    await db.query(
      'INSERT INTO doctors (name, specialty, email, phone, available_days, photo_url, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      d
    );
  }
  console.log(`Seeded ${doctors.length} doctors.`);
}

module.exports = ensureSeedData;

if (require.main === module) {
  ensureSeedData().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
