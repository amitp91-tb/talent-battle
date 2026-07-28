// db.js — the single SQLite database for Talent Battle (Node's built-in engine).
// A real SQL database stored in one file: server/data/talent-battle.db.
// No installs, no accounts. When you later move to the cloud, this same schema
// maps directly onto PostgreSQL/Supabase.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA = process.env.TB_DATA || path.join(__dirname, 'data');
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

const db = new DatabaseSync(path.join(DATA, 'talent-battle.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, role TEXT,
  college TEXT, batch TEXT, batch_id TEXT, assigned_batches TEXT,
  mobile TEXT, branch TEXT, year_of_passing TEXT,
  pass TEXT, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, problem_id TEXT, title TEXT,
  tags TEXT, language TEXT, score INTEGER, overall TEXT, at INTEGER
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY, title TEXT, difficulty TEXT, tags TEXT, topic TEXT, statement TEXT,
  time_limit_ms INTEGER, memory_mb INTEGER, checker TEXT, float_tolerance REAL, points INTEGER,
  samples TEXT, hidden TEXT, reference TEXT, created_by TEXT, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, name TEXT, college TEXT, branch TEXT, year_of_passing TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS challenge (
  id TEXT PRIMARY KEY, day INTEGER, title TEXT, difficulty TEXT, statement TEXT,
  time_limit_ms INTEGER, memory_mb INTEGER, checker TEXT, float_tolerance REAL,
  samples TEXT, hidden TEXT, reference TEXT
);
CREATE TABLE IF NOT EXISTS tests (
  id TEXT PRIMARY KEY, title TEXT, description TEXT, question_ids TEXT, batch_ids TEXT, created_at INTEGER
);
`);

// small JSON helpers for columns that hold arrays/objects
function addColumn(table, col, type){ try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch (e) {} }
addColumn('users','mobile','TEXT'); addColumn('users','branch','TEXT'); addColumn('users','year_of_passing','TEXT');
addColumn('batches','college','TEXT'); addColumn('batches','branch','TEXT'); addColumn('batches','year_of_passing','TEXT');

const J = (v) => JSON.stringify(v == null ? [] : v);
const P = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

module.exports = { db, J, P };
