const logger = require('../utils/logger');

function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
}

function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${err.stack || err.message}`);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${err.message}`);
  }

  res.status(status).json({
    success: false,
    message: status >= 500 ? 'Internal server error' : err.message,
  });
}

module.exports = { notFound, errorHandler };
