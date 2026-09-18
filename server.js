const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'replace_this_with_a_long_random_string') {
  if (process.env.NODE_ENV !== 'test') {
    console.error('JWT_SECRET is missing or using the placeholder value. Set a strong, random secret in .env before starting the server.');
    process.exit(1);
  }
}

const authRoutes = require('./routes/auth');
const doctorRoutes = require('./routes/doctors');
const appointmentRoutes = require('./routes/appointments');
const recordRoutes = require('./routes/records');
const setupRoutes = require('./routes/setup');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const db = require('./config/db');
const ensureSeedData = require('./seed');

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());

let corsOrigin = '*';
if (process.env.CORS_ORIGIN) {
  corsOrigin = process.env.CORS_ORIGIN.split(',');
} else if (process.env.NODE_ENV === 'production') {
  console.error('CORS_ORIGIN is not set. Refusing to allow all origins in production -- set CORS_ORIGIN in .env.');
  process.exit(1);
} else if (process.env.NODE_ENV !== 'test') {
  console.warn('CORS_ORIGIN is not set -- allowing all origins. This is fine for local dev only, never production.');
}
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '100kb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/img', express.static(path.join(__dirname, 'img')));

const pages = [
  'home.html',
  'index.html',
  'login.html',
  'register.html',
  'forgot-password.html',
  'reset-password.html',
  'appointments.html',
  'doctors.html',
  'records.html',
  'settings.html',
  'users.html',
  'setup.html',
];
pages.forEach((page) => {
  app.get(`/${page}`, (req, res) => res.sendFile(path.join(__dirname, page)));
});
// The public landing page describing the system lives at "/". The
// dashboard (index.html) requires login and is reached from there or
// straight after signing in.
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));

app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/setup', setupRoutes);

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', uptimeSeconds: process.uptime() });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  ensureSeedData().catch((err) => console.error('Seeding failed:', err));
}

let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(() => {
      db.close();
      logger.info('Server and database connection closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
