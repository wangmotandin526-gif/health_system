const logger = require('../utils/logger');

function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Forbidden: user ${req.user.id} (role=${req.user.role}) tried ${req.method} ${req.originalUrl}`);
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
    }
    next();
  };
}

module.exports = requireRole;
