'use strict';

const crypto = require('node:crypto');

/* Each tracker has its own key, shown once when it is registered. The server
   keeps only a hash of the secret half, so a copy of the database cannot be
   used to impersonate a tracker.

   Key format: <device id>.<secret>     for example  DEV-3F9A1C.kq0...

   From a terminal:
     node devices.js add TRK-104 "Cab unit 1"    register a tracker, print its key
     node devices.js list                        show registered trackers
     node devices.js revoke DEV-3F9A1C           stop accepting a tracker's key */

const hashSecret = (secret) => crypto.createHash('sha256').update(secret).digest();

function createDevices(db, now) {
  const statements = {
    add: db.prepare('INSERT INTO devices (id, truck_id, label, secret_hash, created_at) VALUES (?, ?, ?, ?, ?)'),
    byId: db.prepare('SELECT * FROM devices WHERE id = ?'),
    seen: db.prepare('UPDATE devices SET last_seen_at = ?, last_seq = ? WHERE id = ?'),
    revoke: db.prepare('UPDATE devices SET revoked = 1 WHERE id = ?'),
    list: db.prepare('SELECT id, truck_id, label, created_at, last_seen_at, last_seq, revoked FROM devices ORDER BY created_at')
  };

  function add(truckId, label) {
    const id = `DEV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const secret = crypto.randomBytes(32).toString('base64url');
    statements.add.run(id, truckId, label || '', hashSecret(secret).toString('hex'), now());
    return { id, truckId, key: `${id}.${secret}` };
  }

  /* The registered tracker behind an Authorization header, or null. */
  function authenticate(header) {
    const match = /^Bearer (DEV-[0-9A-F]{6})\.([A-Za-z0-9_-]{20,100})$/.exec(String(header || ''));
    if (!match) {
      return null;
    }
    const device = statements.byId.get(match[1]);
    const offered = hashSecret(match[2]);
    /* An unknown id is still compared against something, so timing does not reveal it. */
    const expected = device ? Buffer.from(device.secret_hash, 'hex') : hashSecret('unknown tracker');
    const matches = crypto.timingSafeEqual(offered, expected);
    return device && matches && !device.revoked ? device : null;
  }

  return {
    add,
    authenticate,
    seen: (id, seq) => statements.seen.run(now(), seq, id),
    revoke: (id) => statements.revoke.run(id).changes > 0,
    list: () => statements.list.all()
  };
}

module.exports = { createDevices };

if (require.main === module) {
  const { readConfig } = require('./config.js');
  const { openDatabase } = require('./db.js');
  const seed = require('../data.js');

  const [action, target, label] = process.argv.slice(2);
  const db = openDatabase(readConfig([]).database);
  const devices = createDevices(db, Date.now);

  if (action === 'add' && seed.trucks.some((truck) => truck.id === target)) {
    const device = devices.add(target, label);
    console.log(`Registered ${device.id} for unit ${device.truckId}.`);
    console.log('Key (shown once, store it in the tracker):');
    console.log(device.key);
  } else if (action === 'list') {
    const rows = devices.list();
    console.log(rows.length === 0 ? 'No trackers registered.' : '');
    rows.forEach((row) => {
      const seen = row.last_seen_at ? new Date(row.last_seen_at).toISOString() : 'never';
      console.log(`${row.id}  ${row.truck_id}  ${row.revoked ? 'revoked' : 'active '}  last seen ${seen}  ${row.label}`);
    });
  } else if (action === 'revoke' && target) {
    console.log(devices.revoke(target) ? `Revoked ${target}.` : `No tracker called ${target}.`);
  } else {
    console.log('Usage: node devices.js add <unit id> [label] | list | revoke <device id>');
    console.log(`Unit ids: ${seed.trucks.map((truck) => truck.id).join(', ')}`);
    process.exitCode = 1;
  }
  db.close();
}
