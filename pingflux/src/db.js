const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pingflux.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS traceroute_run (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    target TEXT NOT NULL,
    hops_json TEXT NOT NULL,
    success INTEGER NOT NULL CHECK(success IN (0, 1))
  )
`);

const insertTracerouteRun = ({ ts, target, hops, success }) => {
  const statement = db.prepare(
    'INSERT INTO traceroute_run (ts, target, hops_json, success) VALUES (?, ?, ?, ?)' 
  );
  const info = statement.run(ts, target, JSON.stringify(hops ?? []), success ? 1 : 0);
  return Number(info.lastInsertRowid);
};

const findTracerouteRunById = (id) => {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }
  const statement = db.prepare(
    'SELECT id, ts, target, hops_json, success FROM traceroute_run WHERE id = ?'
  );
  const row = statement.get(numericId);
  if (!row) {
    return null;
  }
  let hops = [];
  try {
    hops = JSON.parse(row.hops_json ?? '[]');
    if (!Array.isArray(hops)) {
      hops = [];
    }
  } catch (error) {
    hops = [];
  }
  return {
    id: row.id,
    ts: row.ts,
    target: row.target,
    success: row.success ? 1 : 0,
    hops,
  };
};

module.exports = {
  db,
  insertTracerouteRun,
  findTracerouteRunById,
};
