'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    portal TEXT NOT NULL,
    identifier TEXT NOT NULL COLLATE NOCASE,
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    org TEXT,
    access TEXT,
    permissions TEXT NOT NULL DEFAULT '[]',
    password_hash TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    last_sign_in INTEGER,
    UNIQUE (portal, identifier)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id),
    portal TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
    state TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    truck_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    peak REAL,
    limit_value REAL,
    acknowledged_at INTEGER,
    acknowledged_by TEXT
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    seq INTEGER PRIMARY KEY,
    time INTEGER NOT NULL,
    kind TEXT NOT NULL,
    source TEXT NOT NULL,
    params TEXT,
    digest TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial TEXT NOT NULL,
    truck_id TEXT NOT NULL,
    signed_at INTEGER NOT NULL,
    signed_by TEXT,
    digest TEXT NOT NULL,
    status TEXT NOT NULL,
    UNIQUE (truck_id, signed_at)
  );
  CREATE TABLE IF NOT EXISTS telemetry (
    truck_id TEXT NOT NULL,
    time INTEGER NOT NULL,
    temperature REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS telemetry_by_unit ON telemetry (truck_id, time);
`;

const TELEMETRY_EVERY_MS = 60000;
const TELEMETRY_KEEP_MS = 24 * 3600000;
const AUDIT_LOAD = 500;

function openDatabase(filename) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

function transaction(db, work) {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
