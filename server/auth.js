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
