
const bcrypt = require('bcryptjs');
const db = require('./config/db');

const CURRENT_EMAIL = 'admin@healthsys.test';
const NEW_EMAIL = 'admin@admin.com';
const NEW_PASSWORD = 'Admin123!';

async function main() {
  if (NEW_PASSWORD.length < 8) {
    throw new Error('NEW_PASSWORD must be at least 8 characters (same rule the app enforces).');
  }

  const [rows] = await db.query(
    'SELECT id, email, role FROM users WHERE email = ?',
    [CURRENT_EMAIL.trim().toLowerCase()]
  );
  if (rows.length === 0) {
    throw new Error(`No user found with email ${CURRENT_EMAIL}`);
  }

  const user = rows[0];
  const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 10);

  await db.query(
    'UPDATE users SET email = ?, password = ? WHERE id = ?',
    [NEW_EMAIL.trim().toLowerCase(), hashedPassword, user.id]
  );

  console.log(`Updated user #${user.id} (role: ${user.role}).`);
  console.log(`New login email: ${NEW_EMAIL.trim().toLowerCase()}`);
  db.close();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
