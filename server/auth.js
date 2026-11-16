'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { transaction } = require('./db.js');

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_BYTES = 64;
const IP_WINDOW_MS = 5 * 60000;
const IP_MAX_ATTEMPTS = 40;
const GUESS_MEMORY = 5000;

/* Stored as scrypt$N$r$p$salt$hash, so the cost can be raised later without
   breaking existing passwords. */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password), salt, KEY_BYTES, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const [scheme, n, r, p, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) {
    return false;
  }
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(String(password), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p)
  });
  return crypto.timingSafeEqual(key, expected);
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function toUser(row) {
  return {
    id: row.id,
    portal: row.portal,
    identifier: row.identifier,
    name: row.name,
    title: row.title,
    org: row.org,
    access: row.access,
    permissions: JSON.parse(row.permissions)
  };
}

/* Creates the test accounts on a fresh database. Only hashes are stored. */
async function seedUsers(db, users) {
  if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0) {
    return 0;
  }
  const rows = [];
  for (const user of users) {
    rows.push([
      user.id, user.portal, user.identifier, user.name, user.title || '',
      user.org || null, user.access || null, JSON.stringify(user.permissions || []),
      await hashPassword(user.password)
    ]);
  }
  const insert = db.prepare(`INSERT INTO users (id, portal, identifier, name, title, org, access, permissions, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  transaction(db, () => rows.forEach((row) => insert.run(...row)));
  return rows.length;
}

function createAuth(db, config) {
  const now = config.now;
  /* Failed guesses for identifiers that are not accounts, so that probing an
     unknown name looks exactly like probing a real one. */
  const guesses = new Map();
  const addresses = new Map();
  let decoyHash = null;

  const statements = {
    user: db.prepare('SELECT * FROM users WHERE portal = ? AND identifier = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    failure: db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?'),
    success: db.prepare('UPDATE users SET failed_attempts = 0, locked_until = 0, last_sign_in = ? WHERE id = ?'),
    createSession: db.prepare('INSERT INTO sessions (token_hash, user_id, portal, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'),
    session: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
    touch: db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?'),
    endSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    accounts: db.prepare(`SELECT u.id, u.portal, u.identifier, u.name, u.title, u.permissions, u.access, u.last_sign_in,
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS sessions
      FROM users u ORDER BY u.portal, u.name`)
  };

  function addressBlocked(address) {
    const time = now();
    const recent = (addresses.get(address) || []).filter((at) => time - at < IP_WINDOW_MS);
    recent.push(time);
    addresses.set(address, recent);
    return recent.length > IP_MAX_ATTEMPTS;
  }

  function recordFailure(key, row) {
    const time = now();
    const record = row
      ? { count: row.failed_attempts, lockedUntil: row.locked_until }
      : (guesses.get(key) || { count: 0, lockedUntil: 0 });
    record.count += 1;
    const locked = record.count >= config.maxAttempts;
    if (locked) {
      record.count = 0;
      record.lockedUntil = time + config.lockMs;
    }
    if (row) {
      statements.failure.run(record.count, record.lockedUntil, row.id);
    } else {
      if (guesses.size >= GUESS_MEMORY) {
        guesses.clear();
      }
      guesses.set(key, record);
    }
    return locked
      ? { ok: false, reason: 'locked', retryAfter: Math.ceil(config.lockMs / 1000), justLocked: true }
      : { ok: false, reason: 'invalid', attemptsLeft: config.maxAttempts - record.count };
  }

  async function login({ portal, identifier, password, address }) {
    const time = now();
    const name = String(identifier).trim().toLowerCase();
    const key = `${portal}:${name}`;
    const row = statements.user.get(portal, name);
    const lockedUntil = row ? row.locked_until : (guesses.get(key) || {}).lockedUntil || 0;

    if (addressBlocked(address)) {
      return { ok: false, reason: 'locked', retryAfter: Math.ceil(IP_WINDOW_MS / 1000) };
    }
    if (lockedUntil > time) {
      return { ok: false, reason: 'locked', retryAfter: Math.ceil((lockedUntil - time) / 1000) };
    }

    /* An unknown account still costs one full password check. */
    if (!decoyHash) {
      decoyHash = await hashPassword(crypto.randomBytes(24).toString('hex'));
    }
    const matches = await verifyPassword(password, row ? row.password_hash : decoyHash);
    if (!row || !matches) {
      return recordFailure(key, row);
    }

    const token = crypto.randomBytes(32).toString('base64url');
    statements.success.run(time, row.id);
    statements.createSession.run(hashToken(token), row.id, portal, time, time);
    return { ok: true, token, user: toUser(row) };
  }

  /* The account behind a session token, or null once it is unknown or expired.
     onExpire is told when a session ends by itself. */
  function sessionUser(token, portal, options = {}) {
    if (!token) {
      return null;
    }
    const tokenHash = hashToken(token);
    const session = statements.session.get(tokenHash);
    if (!session || session.portal !== portal) {
      return null;
    }
    const time = now();
    const row = statements.userById.get(session.user_id);
    const idle = time - session.last_seen_at > config.idleMs[portal];
    const old = time - session.created_at > config.sessionMs;
    if (!row || idle || old) {
      statements.endSession.run(tokenHash);
      if (row && options.onExpire) {
        options.onExpire(toUser(row));
      }
      return null;
    }
    if (options.touch) {
      statements.touch.run(time, tokenHash);
    }
    return toUser(row);
  }

  function logout(token) {
    if (token) {
      statements.endSession.run(hashToken(token));
    }
  }

  const accounts = () => statements.accounts.all().map((row) => ({
    id: row.id,
    portal: row.portal,
    identifier: row.identifier,
    name: row.name,
    title: row.title,
    permissions: JSON.parse(row.permissions),
    access: row.access,
    lastSignIn: row.last_sign_in,
    sessions: row.sessions
  }));

  return { login, sessionUser, logout, accounts };
}

module.exports = { hashPassword, verifyPassword, seedUsers, createAuth };
