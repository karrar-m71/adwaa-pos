const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let _db = null;
let _dbPath = null;

function initDb(userDataPath) {
  const dataDir = path.join(userDataPath, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'adwaa.db');
  _dbPath = dbPath;

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  _db.exec(schemaSql);
  return _db;
}

function getDb() {
  if (!_db) throw new Error('SQLite DB is not initialized');
  return _db;
}

function getDbPath() {
  if (!_dbPath) throw new Error('SQLite DB path is not initialized');
  return _dbPath;
}

module.exports = {
  initDb,
  getDb,
  getDbPath,
};
