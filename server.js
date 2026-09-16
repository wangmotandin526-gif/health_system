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
const { notFound, errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const db = require('./config/db');

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

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/records', recordRoutes);

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', uptimeSeconds: process.uptime() });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

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
