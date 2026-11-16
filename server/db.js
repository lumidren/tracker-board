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

/* Keeps the engine's live state in the database, so a restart continues where
   the system stopped instead of starting a new story. */
function createStore(db, now) {
  const statements = {
    unit: db.prepare(`INSERT INTO units (id, position, state, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET position = excluded.position, state = excluded.state, updated_at = excluded.updated_at`),
    alert: db.prepare(`INSERT INTO alerts (id, truck_id, kind, started_at, ended_at, peak, limit_value, acknowledged_at, acknowledged_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET ended_at = excluded.ended_at, peak = excluded.peak,
        acknowledged_at = excluded.acknowledged_at, acknowledged_by = excluded.acknowledged_by`),
    audit: db.prepare('INSERT OR IGNORE INTO audit_log (seq, time, kind, source, params, digest) VALUES (?, ?, ?, ?, ?, ?)'),
    certificate: db.prepare(`INSERT INTO certificates (serial, truck_id, signed_at, signed_by, digest, status) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (truck_id, signed_at) DO UPDATE SET status = excluded.status`),
    meta: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
    telemetry: db.prepare('INSERT INTO telemetry (truck_id, time, temperature) VALUES (?, ?, ?)'),
    pruneTelemetry: db.prepare('DELETE FROM telemetry WHERE time < ?')
  };
  let savedAuditSeq = 0;
  let telemetryAt = 0;

  function save(engine) {
    const state = engine.state;
    const time = now();
    transaction(db, () => {
      state.trucks.forEach((truck, index) => {
        statements.unit.run(truck.id, index, JSON.stringify(truck), time);
      });
      state.alerts.forEach((alert) => {
        statements.alert.run(
          alert.id, alert.truckId, alert.kind, alert.startedAt, alert.endedAt,
          alert.peak, alert.limit, alert.acknowledgedAt, alert.acknowledgedBy
        );
      });
      state.audit.filter((entry) => entry.seq > savedAuditSeq).forEach((entry) => {
        statements.audit.run(
          entry.seq, entry.time, entry.kind, entry.source,
          entry.params ? JSON.stringify(entry.params) : null, entry.digest
        );
      });
      state.registry.forEach((entry) => {
        statements.certificate.run(entry.serial, entry.truckId, entry.signedAt, entry.signedBy, entry.digest, entry.status);
      });
      statements.meta.run('engine', JSON.stringify({
        drillTruckId: state.drillTruckId,
        chain: state.chain,
        auditSeq: state.auditSeq,
        alertSeq: state.alertSeq,
        minuteCarry: state.minuteCarry
      }));
      if (time - telemetryAt >= TELEMETRY_EVERY_MS) {
        telemetryAt = time;
        state.trucks.forEach((truck) => statements.telemetry.run(truck.id, time, truck.tempCurrent));
        statements.pruneTelemetry.run(time - TELEMETRY_KEEP_MS);
      }
    });
    savedAuditSeq = state.auditSeq;
  }

  /* Returns the saved engine state, or null for a fresh database. */
  function load() {
    const units = db.prepare('SELECT state FROM units ORDER BY position').all();
    const meta = db.prepare('SELECT value FROM meta WHERE key = ?').get('engine');
    if (units.length === 0 || !meta) {
      return null;
    }
    const saved = JSON.parse(meta.value);
    const audit = db.prepare('SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?').all(AUDIT_LOAD).reverse();
    savedAuditSeq = saved.auditSeq;
    return {
      ...saved,
      trucks: units.map((row) => JSON.parse(row.state)),
      alerts: db.prepare('SELECT * FROM alerts ORDER BY started_at').all().map((row) => ({
        id: row.id,
        truckId: row.truck_id,
        kind: row.kind,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        peak: row.peak,
        limit: row.limit_value,
        acknowledgedAt: row.acknowledged_at,
        acknowledgedBy: row.acknowledged_by
      })),
      audit: audit.map((row) => ({
        seq: row.seq,
        time: row.time,
        kind: row.kind,
        source: row.source,
        params: row.params ? JSON.parse(row.params) : null,
        digest: row.digest
      })),
      registry: db.prepare('SELECT * FROM certificates ORDER BY id').all().map((row) => ({
        serial: row.serial,
        truckId: row.truck_id,
        signedAt: row.signed_at,
        signedBy: row.signed_by,
        digest: row.digest,
        status: row.status
      }))
    };
  }

  return { save, load };
}

module.exports = { openDatabase, createStore, transaction };
