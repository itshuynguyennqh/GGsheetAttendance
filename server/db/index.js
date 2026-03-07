/**
 * SQLite DB connection and init (better-sqlite3).
 */
const Database = require('better-sqlite3');
const path = require('path');
const { runSchema } = require('./schema');

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'diemdanh.db');

function getDb() {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
}

function initDb() {
  const db = getDb();
  runSchema(db);
  db.close();
}

module.exports = { getDb, initDb, dbPath };
