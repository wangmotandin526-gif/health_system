const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const router = express.Router();

const DEMO_DOCTORS = [
  ['Dr. Sarah Smith', 'Cardiology', 'sarah.smith@healthsys.test', '0400111222', 'Mon,Wed,Fri', null, null],
  ['Dr. James Lee', 'General Practice', 'james.lee@healthsys.test', '0400333444', 'Tue,Thu', null, null],
  ['Dr. Amina Yusuf', 'Paediatrics', 'amina.yusuf@healthsys.test', '0400555666', 'Mon,Tue,Wed', null, null],
];

router.get(
  '/init',
  asyncHandler(async (req, res) => {
    if (!process.env.SETUP_SECRET) {
      throw new AppError('Setup is not enabled on this deployment (SETUP_SECRET is not set)', 403);
    }
    if (req.query.key !== process.env.SETUP_SECRET) {
      throw new AppError('Invalid setup key', 403);
    }

    const result = { doctorsSeeded: 0, adminCreated: false, adminEmail: null };

    const [existingDoctors] = await db.query('SELECT id FROM doctors');
    if (existingDoctors.length === 0) {
      for (const d of DEMO_DOCTORS) {
        await db.query(
          'INSERT INTO doctors (name, specialty, email, phone, available_days, photo_url, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          d
        );
      }
      result.doctorsSeeded = DEMO_DOCTORS.length;
    }

    const [existingAdmins] = await db.query("SELECT id FROM users WHERE role = 'admin'");
    if (existingAdmins.length === 0) {
      const adminEmail = process.env.SETUP_ADMIN_EMAIL || 'admin@healthsys.test';
      const adminPassword = process.env.SETUP_ADMIN_PASSWORD || 'ChangeThisPassword123!';
      const hashed = await bcrypt.hash(adminPassword, 10);
      await db.query(
        'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
        ['Admin', adminEmail.toLowerCase(), hashed, 'admin']
      );
      result.adminCreated = true;
      result.adminEmail = adminEmail;
    }

    logger.info(`Setup route run: doctorsSeeded=${result.doctorsSeeded} adminCreated=${result.adminCreated}`);
    res.json({
      success: true,
      message: 'Setup complete. Remove SETUP_SECRET (or this route) now that you have used it.',
      data: result,
    });
  })
);

// One-off helper for deployments where the admin account already exists
// (so /init won't touch it) and there's no shell/DB access to fix it by
// hand -- e.g. a live Render deployment. Protected by the same
// SETUP_SECRET as /init. Remove this route (or unset SETUP_SECRET) again
// once you've used it.
router.get(
  '/update-admin',
  asyncHandler(async (req, res) => {
    if (!process.env.SETUP_SECRET) {
      throw new AppError('Setup is not enabled on this deployment (SETUP_SECRET is not set)', 403);
    }
    if (req.query.key !== process.env.SETUP_SECRET) {
      throw new AppError('Invalid setup key', 403);
    }

    const newEmail = (req.query.email || '').trim().toLowerCase();
    const newPassword = req.query.password || '';

    if (!newEmail || !newEmail.includes('@')) {
      throw new AppError('Provide a valid email, e.g. ...&email=you@example.com', 400);
    }
    if (newPassword.length < 8) {
      throw new AppError('Password must be at least 8 characters', 400);
    }

    const [admins] = await db.query(
      "SELECT id, email FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1"
    );
    if (admins.length === 0) {
      throw new AppError('No admin account exists yet -- use /api/setup/init instead', 404);
    }

    const [emailTaken] = await db.query(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [newEmail, admins[0].id]
    );
    if (emailTaken.length > 0) {
      throw new AppError('That email is already used by another account', 409);
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET email = ?, password = ? WHERE id = ?', [
      newEmail,
      hashed,
      admins[0].id,
    ]);

    logger.info(`Admin account ${admins[0].id} email/password updated via /api/setup/update-admin`);
    res.json({
      success: true,
      message: 'Admin email and password updated. Remove this route (or SETUP_SECRET) now that you are done.',
      data: { adminId: admins[0].id, previousEmail: admins[0].email, newEmail },
    });
  })
);

module.exports = router;
