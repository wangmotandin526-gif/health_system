const fs = require('fs');
const path = require('path');

const isTest = process.env.NODE_ENV === 'test';
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

if (!isTest) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function write(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  if (!isTest) {
    console[level === 'ERROR' ? 'error' : 'log'](line);
    fs.appendFile(LOG_FILE, line + '\n', () => {});
  }
}

module.exports = {
  info: (message) => write('INFO', message),
  warn: (message) => write('WARN', message),
  error: (message) => write('ERROR', message),
};
