'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const seed = require('../../data.js');
const { readConfig } = require('../config.js');
const { createApp } = require('../app.js');

const account = (id) => seed.users.find((user) => user.id === id);

/* Starts a server on a free port with its own database and a clock the test controls. */
async function start(overrides = {}) {
  let clock = 1_800_000_000_000;
  const config = {
    ...readConfig([], {}),
    port: 0,
    database: ':memory:',
    demo: false,
    now: () => clock,
    ...overrides
  };
  const app = await createApp(config);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const jar = {};

  async function call(method, route, body, options = {}) {
    const headers = { ...options.headers };
    const cookies = Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ');
    if (cookies && !options.noCookies) {
      headers.Cookie = cookies;
    }
    if (body !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      if (!options.noMarker) {
        headers['X-Requested-With'] = 'maatora';
      }
    }
    const response = await fetch(base + route, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    (response.headers.getSetCookie() || []).forEach((line) => {
      const [pair] = line.split(';');
      const [name, value] = pair.split('=');
      if (value) {
        jar[name] = value;
      } else {
        delete jar[name];
      }
    });
    const text = await response.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch (error) {
      /* Static files are not JSON. */
    }
    return { status: response.status, headers: response.headers, data, text };
  }

  const signIn = (id, password) => {
    const user = account(id);
    return call('POST', '/api/login', {
      portal: user.portal,
      identifier: user.identifier,
      password: password === undefined ? user.password : password
    });
  };

  return { app, call, signIn, jar, advance: (ms) => { clock += ms; }, stop: () => app.close() };
}

test('static files are an allow-list and carry security headers', async () => {
  const server = await start();
  try {
    const page = await server.call('GET', '/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');

    for (const route of ['/server/db.js', '/server/data/maatora.sqlite', '/README.md', '/android/gradlew', '/..%2Fserver%2Fauth.js']) {
      assert.equal((await server.call('GET', route)).status, 404, route);
    }
  } finally {
    await server.stop();
  }
});

test('the dataset served to browsers contains no accounts or units', async () => {
  const server = await start();
  try {
    const data = await server.call('GET', '/data.js');
    assert.equal(data.status, 200);
    assert.match(data.text, /MAATORA_REMOTE/);
    assert.equal(/password|Demo-2026|maatora\.test|TRK-/i.test(data.text), false);
    assert.equal((await server.call('GET', '/api/demo-accounts?portal=admin')).status, 404);
  } finally {
    await server.stop();
  }
});

test('passwords are stored only as scrypt hashes', async () => {
  const server = await start();
  try {
    const rows = server.app.db.prepare('SELECT password_hash FROM users').all();
    assert.equal(rows.length, seed.users.length);
    rows.forEach((row) => assert.match(row.password_hash, /^scrypt\$16384\$8\$1\$/));
    const dump = JSON.stringify(server.app.db.prepare('SELECT * FROM users').all());
    seed.users.forEach((user) => assert.equal(dump.includes(user.password), false));
  } finally {
    await server.stop();
  }
});

test('sign-in sets a hardened cookie and a wrong portal is refused', async () => {
  const server = await start();
  try {
    const ok = await server.signIn('client-biopharma');
    assert.equal(ok.status, 200);
    assert.equal(ok.data.user.name, account('client-biopharma').name);
    const cookie = ok.headers.getSetCookie()[0];
    assert.match(cookie, /^maatora_client=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.equal('password' in ok.data.user, false);

    const user = account('client-biopharma');
    const wrongPortal = await server.call('POST', '/api/login', {
      portal: 'admin',
      identifier: user.identifier,
      password: user.password
    });
    assert.equal(wrongPortal.status, 401);
  } finally {
    await server.stop();
  }
});

test('unknown and wrong sign-ins look the same and lock after five attempts', async () => {
  const server = await start();
  try {
    const wrong = await server.signIn('admin-qa', 'not-the-password');
    const unknown = await server.call('POST', '/api/login', { portal: 'admin', identifier: 'NOBODY-9', password: 'x' });
    assert.deepEqual([wrong.status, wrong.data], [401, { error: 'invalid', attemptsLeft: 4 }]);
    assert.deepEqual([unknown.status, unknown.data], [401, { error: 'invalid', attemptsLeft: 4 }]);

    for (let i = 0; i < 3; i += 1) {
      await server.signIn('admin-qa', 'not-the-password');
    }
    const locked = await server.signIn('admin-qa', 'not-the-password');
    assert.equal(locked.status, 429);
    assert.equal(locked.data.retryAfter, 30);
    assert.equal((await server.signIn('admin-qa')).status, 429);

    server.advance(31000);
    assert.equal((await server.signIn('admin-qa')).status, 200);
  } finally {
    await server.stop();
  }
});

test('a client session gets its own units, no hardware data, and no control room access', async () => {
  const server = await start();
  try {
    assert.equal((await server.call('GET', '/api/snapshot?portal=client')).status, 401);
    await server.signIn('client-depot-north');
    const view = await server.call('GET', '/api/snapshot?portal=client');
    assert.equal(view.status, 200);
    assert.deepEqual(view.data.trucks.map((truck) => truck.id), ['TRK-104']);
    const hardwareKeys = /"(sensorBattery|uplink\w*|compressor\w*|fuelPercent|firmware|calibrationDays|humidity|ambientTemp|health|audit|accounts|alerts)":/;
    assert.equal(hardwareKeys.test(view.text), false);

    assert.equal((await server.call('GET', '/api/snapshot?portal=admin')).status, 401);
    const refused = await server.call('POST', '/api/commands/trigger-incident', { truckId: 'TRK-104' });
    assert.equal(refused.status, 401);
  } finally {
    await server.stop();
  }
});

test('writes need the page marker and a matching origin', async () => {
  const server = await start();
  try {
    await server.signIn('admin-qa');
    const body = { truckId: 'TRK-104' };
    const noMarker = await server.call('POST', '/api/commands/trigger-incident', body, { noMarker: true });
    const form = await server.call('POST', '/api/commands/trigger-incident', body, {
      headers: { 'Content-Type': 'text/plain' }
    });
    const foreign = await server.call('POST', '/api/commands/trigger-incident', body, {
      headers: { Origin: 'https://attacker.example' }
    });
    assert.deepEqual([noMarker.status, form.status, foreign.status], [403, 403, 403]);
    assert.equal(server.app.engine.state.drillTruckId, null);
  } finally {
    await server.stop();
  }
});

test('roles are enforced by the server', async () => {
  const server = await start();
  try {
    await server.signIn('admin-regulator');
    const drill = await server.call('POST', '/api/commands/trigger-incident', { truckId: 'TRK-104' });
    assert.equal(drill.status, 403);
    assert.equal((await server.call('GET', '/api/snapshot?portal=admin')).data.accounts, null);

    await server.call('POST', '/api/logout', { portal: 'admin' });
    await server.signIn('admin-dispatch');
    assert.equal((await server.call('POST', '/api/commands/trigger-incident', { truckId: 'TRK-104' })).status, 200);
    assert.equal((await server.call('POST', '/api/commands/sign-certificate', { truckId: 'TRK-208' })).status, 403);

    await server.call('POST', '/api/logout', { portal: 'admin' });
    await server.signIn('admin-platform');
    const accounts = (await server.call('GET', '/api/snapshot?portal=admin')).data.accounts;
    assert.equal(accounts.length, seed.users.length);
    assert.equal(/password|scrypt/i.test(JSON.stringify(accounts)), false);
  } finally {
    await server.stop();
  }
});

test('drill to re-signed certificate through the API, with registry verification', async () => {
  const server = await start();
  try {
    await server.signIn('admin-qa');
    const record = async () => (await server.call('GET', '/api/snapshot?portal=admin')).data.trucks
      .find((truck) => truck.id === 'TRK-104').certificate.verification;
    const verify = async (value) => (await server.call('GET', `/api/public/verify?record=${encodeURIComponent(value)}`)).data.status;
    const original = await record();

    assert.equal(await verify(original), 'verified');
    assert.equal((await server.call('POST', '/api/commands/trigger-incident', { truckId: 'TRK-104' })).status, 200);
    assert.equal(await verify(original), 'revoked');
    assert.equal((await server.call('POST', '/api/commands/sign-certificate', { truckId: 'TRK-104' })).status, 409);
    assert.equal((await server.call('POST', '/api/commands/normalize-sensor', {})).status, 200);

    const alert = server.app.engine.state.alerts.at(-1);
    assert.equal((await server.call('POST', '/api/commands/acknowledge-alert', { alertId: alert.id })).status, 200);
    server.advance(1000);
    assert.equal((await server.call('POST', '/api/commands/sign-certificate', { truckId: 'TRK-104' })).status, 200);
    assert.equal(await verify(original), 'revoked');
    assert.equal(await verify(await record()), 'verified');
    assert.equal(await verify(original.replace('~-20.8~', '~-19.9~')), 'failed');
  } finally {
    await server.stop();
  }
});

test('idle sessions expire on the server', async () => {
  const server = await start();
  try {
    await server.signIn('admin-qa');
    server.advance(9 * 60000);
    assert.equal((await server.call('GET', '/api/snapshot?portal=admin')).status, 200);
    server.advance(11 * 60000);
    assert.equal((await server.call('GET', '/api/snapshot?portal=admin')).status, 401);
    const log = server.app.engine.state.audit.at(-1);
    assert.match(log.source, /idle timeout/);
  } finally {
    await server.stop();
  }
});

test('state and accounts survive a restart', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'maatora-test-'));
  const database = path.join(folder, 'maatora.sqlite');
  try {
    const first = await start({ database });
    assert.equal(first.app.restored, false);
    await first.signIn('admin-qa');
    await first.call('POST', '/api/commands/trigger-incident', { truckId: 'TRK-509' });
    const auditCount = first.app.engine.state.auditSeq;
    await first.stop();

    const second = await start({ database });
    assert.equal(second.app.restored, true);
    assert.equal(second.app.seeded, 0);
    assert.equal(second.app.engine.state.drillTruckId, 'TRK-509');
    assert.equal(second.app.engine.state.auditSeq, auditCount);
    assert.equal(second.app.engine.state.trucks.find((truck) => truck.id === 'TRK-509').status, 'excursion');
    assert.equal((await second.signIn('admin-qa')).status, 200);
    await second.stop();
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('demo mode offers the test accounts for one portal at a time', async () => {
  const server = await start({ demo: true });
  try {
    const admins = await server.call('GET', '/api/demo-accounts?portal=admin');
    assert.equal(admins.status, 200);
    assert.equal(admins.data.length, 4);
    assert.equal(admins.data.every((item) => item.identifier && item.password && item.name), true);
    assert.match((await server.call('GET', '/data.js')).text, /"demo":true/);
  } finally {
    await server.stop();
  }
});
