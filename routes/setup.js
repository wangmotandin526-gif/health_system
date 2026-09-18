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
      const adminEmail = process.env.SETUP_ADMIN_EMAIL || 'admin@admin.com';
      const adminPassword = process.env.SETUP_ADMIN_PASSWORD || 'Admin123!';
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

module.exports = router;
