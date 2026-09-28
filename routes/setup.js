const express = require('express');
const db = require('../config/db');
const users = require('../utils/users');
const { DEMO_DOCTORS } = require('../seed');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const router = express.Router();

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

    const existingDoctors = await db.find('doctors');
    if (existingDoctors.length === 0) {
      for (const d of DEMO_DOCTORS) {
        await db.create('doctors', { ...d, photo_url: null, user_id: null });
      }
      result.doctorsSeeded = DEMO_DOCTORS.length;
    }

    const existingAdmins = await db.find('users', { role: 'admin' });
    if (existingAdmins.length === 0) {
      const adminEmail = process.env.SETUP_ADMIN_EMAIL || 'admin@healthsys.test';
      const adminPassword = process.env.SETUP_ADMIN_PASSWORD || 'ChangeThisPassword123!';
      await users.createUser({ full_name: 'Admin', email: adminEmail, password: adminPassword, role: 'admin' });
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

    const admins = await db.find('users', { role: 'admin' });
    admins.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (admins.length === 0) {
      throw new AppError('No admin account exists yet -- use /api/setup/init instead', 404);
    }
    const admin = admins[0];

    try {
      await users.changeEmail(admin, newEmail);
    } catch (err) {
      if (err.statusCode === 409) throw new AppError('That email is already used by another account', 409);
      throw err;
    }
    await users.setPassword(admin.id, newPassword);

    logger.info(`Admin account ${admin.id} email/password updated via /api/setup/update-admin`);
    res.json({
      success: true,
      message: 'Admin email and password updated. Remove this route (or SETUP_SECRET) now that you are done.',
      data: { adminId: admin.id, previousEmail: admin.email, newEmail },
    });
  })
);

module.exports = router;
