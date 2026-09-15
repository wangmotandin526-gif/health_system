const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const isTest = process.env.NODE_ENV === 'test';
const DB_FILE = isTest
  ? ':memory:'
  : path.join(__dirname, '..', 'data', 'health_system.sqlite');
const SCHEMA_FILE = path.join(__dirname, '..', 'schema.sql');

if (!isTest) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON;');

const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
db.exec(schema);

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const statement = db.prepare(sql);
      const trimmed = sql.trim().toUpperCase();

      if (trimmed.startsWith('SELECT')) {
        const rows = statement.all(...params);
        resolve([rows]);
      } else {
        const info = statement.run(...params);
        resolve([
          {
            insertId: info.lastInsertRowid,
            affectedRows: info.changes,
          },
        ]);
      }
    } catch (err) {
      reject(err);
    }
  });
}

function close() {
  db.close();
}

module.exports = { query, close };
