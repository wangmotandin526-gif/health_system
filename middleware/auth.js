const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  const token = header && /^Bearer\s+\S+$/i.test(header)
    ? header.split(/\s+/)[1]
    : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET,
    {
      algorithms: ['HS256']
    },
    (err, decoded) => {
    if (err) {
      logger.warn(`Auth failed: invalid/expired token from ${req.ip}`);
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    req.user = decoded;
    next();
  }
);

module.exports = verifyToken;
