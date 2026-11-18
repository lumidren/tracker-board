'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const seed = require('../data.js');
const Engine = require('../engine.js');
const { openDatabase, createStore } = require('./db.js');
const { seedUsers, createAuth } = require('./auth.js');
const { createDevices } = require('./devices.js');

const VERSION = '1.0.0';
const BODY_LIMIT = 16 * 1024;
const DEVICE_BODY_LIMIT = 64 * 1024;
const MAX_BATCH = 200;
/* A tracker's clock may be a little ahead, or its readings days old after a long outage. */
const CLOCK_AHEAD_SECONDS = 300;
const OLDEST_READING_SECONDS = 7 * 86400;

/* Accepted range for each numeric field a tracker may send. */
const READING_RANGES = {
  temp: [-90, 90],
  hum: [0, 100],
  lat: [-90, 90],
  lon: [-180, 180],
  speed: [0, 250],
  main: [0, 60],
  batt: [0, 5],
  rssi: [-140, 0]
};
const PORTALS = ['client', 'admin'];
const SCOPES = { client: 'client portal', admin: 'control room console' };

/* The only files the server will ever send. Nothing else on disk is reachable. */
const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/script.js': ['script.js', 'text/javascript; charset=utf-8'],
  '/engine.js': ['engine.js', 'text/javascript; charset=utf-8']
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

class HttpError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.body = { error: code, ...extra };
  }
}

function sendJson(res, status, body, headers) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(text);
}

function readCookies(req) {
  const cookies = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index > 0) {
      cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    }
  });
  return cookies;
}

/* Keeps only the fields a tracker is allowed to send, each within its range.
   Returns null when the reading has no usable sequence number. */
function cleanReading(raw, nowSeconds) {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.seq) || raw.seq < 1) {
    return null;
  }
  const inWindow = Number.isFinite(raw.at) && raw.at <= nowSeconds + CLOCK_AHEAD_SECONDS
    && raw.at >= nowSeconds - OLDEST_READING_SECONDS;
  const reading = { seq: raw.seq, at: inWindow ? raw.at : nowSeconds };
  Object.entries(READING_RANGES).forEach(([field, [low, high]]) => {
    const value = raw[field];
    if (typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high) {
      reading[field] = value;
    }
  });
  if (typeof raw.ign === 'boolean') {
    reading.ign = raw.ign;
  }
  if (Array.isArray(raw.doors) && raw.doors.length <= 4 && raw.doors.every((door) => typeof door === 'boolean')) {
    reading.doors = raw.doors;
  }
  return reading;
}

function readBody(req, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'too-large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        resolve(parsed);
      } catch (error) {
        reject(new HttpError(400, 'bad-json'));
      }
    });
    req.on('error', reject);
  });
}

/* Requests that change something must be JSON sent by the page itself. A form
   on another site cannot set this header or content type, and the session
   cookie is SameSite=Strict as a second barrier. */
function guardWrite(req) {
  const type = String(req.headers['content-type'] || '');
  if (!type.startsWith('application/json') || req.headers['x-requested-with'] !== 'maatora') {
    throw new HttpError(403, 'forbidden');
  }
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch (error) {
      host = '';
    }
    if (host !== req.headers.host) {
      throw new HttpError(403, 'forbidden');
    }
  }
}

async function createApp(config) {
  const now = config.now;
  const db = openDatabase(config.database);
  const seeded = await seedUsers(db, seed.users);
  const store = createStore(db, now);
  const saved = store.load();
  const engine = Engine.createEngine(seed, {
    authoritative: true,
    timeScale: config.timeScale,
    now,
    restore: saved || undefined
  });
  const auth = createAuth(db, config);
  const devices = createDevices(db, now);
  const streams = new Set();

  /* The page loads this instead of the repository's data.js: map outlines only,
     no accounts and no units. Its presence tells the page to use the API. */
  const publicData = [
    '/* Served by the Maatora server. Accounts and units come from the API. */',
    `window.MAATORA_REMOTE = ${JSON.stringify({ demo: config.demo, version: VERSION })};`,
    `window.MAATORA_SEED = ${JSON.stringify({ places: seed.places, geography: seed.geography })};`,
    ''
  ].join('\n');

  const cookieName = (portal) => `maatora_${portal}`;
  const cookie = (portal, value, maxAge) => [
    `${cookieName(portal)}=${value}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`,
    ...(config.secureCookies ? ['Secure'] : [])
  ].join('; ');

  const onExpire = (user) => {
    engine.log('info', 'Sign-out on the {scope}: {name} (idle timeout).', { scope: SCOPES[user.portal], name: user.name });
  };

  function portalOf(value) {
    if (!PORTALS.includes(value)) {
      throw new HttpError(400, 'bad-portal');
    }
    return value;
  }

  function requireUser(req, portal, touch) {
    const user = auth.sessionUser(readCookies(req)[cookieName(portal)], portal, { touch, onExpire });
    if (!user) {
      throw new HttpError(401, 'signed-out');
    }
    return user;
  }

  const viewFor = (user) => engine.snapshot(user, { accounts: auth.accounts() });

  function persist() {
    store.save(engine);
  }

  /* Sends every open page its own, role-scoped copy of the current state. */
  function broadcast() {
    streams.forEach((stream) => {
      const user = auth.sessionUser(stream.token, stream.portal, { onExpire });
      if (!user) {
        stream.res.write('event: expired\ndata: {}\n\n');
        stream.res.end();
        streams.delete(stream);
        return;
      }
      stream.res.write(`event: snapshot\ndata: ${JSON.stringify(viewFor(user))}\n\n`);
    });
  }

  function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new HttpError(405, 'method');
    }
    let body = null;
    let type = 'text/javascript; charset=utf-8';
    if (pathname === '/data.js') {
      body = Buffer.from(publicData, 'utf8');
    } else if (STATIC_FILES[pathname]) {
      body = fs.readFileSync(path.join(config.webRoot, STATIC_FILES[pathname][0]));
      type = STATIC_FILES[pathname][1];
    } else {
      throw new HttpError(404, 'not-found');
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function login(req, res) {
    guardWrite(req);
    const body = await readBody(req);
    const portal = portalOf(body.portal);
    const identifier = typeof body.identifier === 'string' ? body.identifier : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!identifier.trim() || !password || identifier.length > 120 || password.length > 200) {
      throw new HttpError(400, 'missing');
    }
    const result = await auth.login({ portal, identifier, password, address: req.socket.remoteAddress || '' });
    if (!result.ok) {
      if (result.reason === 'invalid') {
        engine.log('alert', 'Failed sign-in attempt on the {scope} ({attempt} of {max}).', {
          scope: SCOPES[portal],
          attempt: config.maxAttempts - result.attemptsLeft,
          max: config.maxAttempts
        });
      } else if (result.justLocked) {
        engine.log('alert', 'Sign-in locked on the {scope} for {seconds} seconds after {attempts} failed attempts.', {
          scope: SCOPES[portal],
          seconds: result.retryAfter,
          attempts: config.maxAttempts
        });
      }
      persist();
      broadcast();
      if (result.reason === 'locked') {
        throw new HttpError(429, 'locked', { retryAfter: result.retryAfter });
      }
      throw new HttpError(401, 'invalid', { attemptsLeft: result.attemptsLeft });
    }
    engine.log('ok', 'Sign-in on the {scope}: {name}.', { scope: SCOPES[portal], name: result.user.name });
    persist();
    broadcast();
    sendJson(res, 200, { user: engine.snapshot(result.user).user }, {
      'Set-Cookie': cookie(portal, result.token, Math.floor(config.sessionMs / 1000))
    });
  }

  async function logout(req, res) {
    guardWrite(req);
    const portal = portalOf((await readBody(req)).portal);
    const token = readCookies(req)[cookieName(portal)];
    const user = auth.sessionUser(token, portal);
    auth.logout(token);
    if (user) {
      engine.log('info', 'Sign-out on the {scope}: {name}.', { scope: SCOPES[portal], name: user.name });
      persist();
      broadcast();
    }
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie(portal, '', 0) });
  }

  function stream(req, res, url) {
    const portal = portalOf(url.searchParams.get('portal'));
    const user = requireUser(req, portal, false);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`retry: 3000\nevent: snapshot\ndata: ${JSON.stringify(viewFor(user))}\n\n`);
    const entry = { res, portal, token: readCookies(req)[cookieName(portal)] };
    streams.add(entry);
    req.on('close', () => streams.delete(entry));
  }

  async function command(req, res, name) {
    guardWrite(req);
    const body = await readBody(req);
    const user = requireUser(req, 'admin', true);
    const result = engine.command(user, name, body);
    if (!result.ok) {
      throw new HttpError(result.error === Engine.ROLE_ERROR ? 403 : 409, 'refused', { message: result.error });
    }
    persist();
    broadcast();
    sendJson(res, 200, { ok: true });
  }

  /* A tracker's key is its only credential here. Browser cookies are ignored. */
  function requireDevice(req) {
    const device = devices.authenticate(req.headers.authorization);
    if (!device) {
      throw new HttpError(401, 'unknown-device');
    }
    return device;
  }

  /* Trackers send readings in batches and resend until acknowledged, so a
     reading is applied once however many times it arrives. */
  async function deviceReadings(req, res) {
    const device = requireDevice(req);
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
      throw new HttpError(415, 'json-only');
    }
    const batch = (await readBody(req, DEVICE_BODY_LIMIT)).readings;
    if (!Array.isArray(batch) || batch.length === 0 || batch.length > MAX_BATCH) {
      throw new HttpError(400, 'bad-batch');
    }
    const nowSeconds = Math.floor(now() / 1000);
    const readings = batch.map((raw) => cleanReading(raw, nowSeconds));
    const usable = readings.filter(Boolean).sort((a, b) => a.seq - b.seq);
    let lastSeq = device.last_seq;
    let accepted = 0;
    usable.forEach((reading) => {
      if (reading.seq > lastSeq) {
        engine.ingest(device.truck_id, reading);
        lastSeq = reading.seq;
        accepted += 1;
      }
    });
    devices.seen(device.id, lastSeq);
    if (accepted > 0) {
      persist();
      broadcast();
    }
    sendJson(res, 200, {
      ack: lastSeq,
      accepted,
      duplicates: usable.length - accepted,
      rejected: readings.length - usable.length,
      time: nowSeconds
    });
  }

  async function api(req, res, url) {
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /api/health') {
      return sendJson(res, 200, { service: 'maatora', version: VERSION, demo: config.demo, time: now() });
    }
    if (route === 'GET /api/session') {
      const cookies = readCookies(req);
      const sessions = {};
      PORTALS.forEach((portal) => {
        const user = auth.sessionUser(cookies[cookieName(portal)], portal, { onExpire });
        sessions[portal] = user ? engine.snapshot(user).user : null;
      });
      return sendJson(res, 200, sessions);
    }
    if (route === 'GET /api/demo-accounts') {
      if (!config.demo) {
        throw new HttpError(404, 'not-found');
      }
      const portal = portalOf(url.searchParams.get('portal'));
      return sendJson(res, 200, seed.users.filter((user) => user.portal === portal).map((user) => ({
        identifier: user.identifier,
        password: user.password,
        name: user.name,
        title: user.title || ''
      })));
    }
    if (route === 'POST /api/login') {
      return login(req, res);
    }
    if (route === 'POST /api/logout') {
      return logout(req, res);
    }
    if (route === 'POST /api/touch') {
      guardWrite(req);
      requireUser(req, portalOf((await readBody(req)).portal), true);
      return sendJson(res, 200, { ok: true });
    }
    if (route === 'GET /api/snapshot') {
      return sendJson(res, 200, viewFor(requireUser(req, portalOf(url.searchParams.get('portal')), true)));
    }
    if (route === 'GET /api/stream') {
      return stream(req, res, url);
    }
    if (route === 'POST /api/device/readings') {
      return deviceReadings(req, res);
    }
    if (route === 'GET /api/device/state') {
      const device = requireDevice(req);
      return sendJson(res, 200, { unit: device.truck_id, lastSeq: device.last_seq, time: Math.floor(now() / 1000) });
    }
    if (route === 'GET /api/public/verify') {
      return sendJson(res, 200, engine.verify(String(url.searchParams.get('record') || '').slice(0, 300)));
    }
    const commandMatch = /^POST \/api\/commands\/([a-z-]{1,40})$/.exec(route);
    if (commandMatch) {
      return command(req, res, commandMatch[1]);
    }
    throw new HttpError(404, 'not-found');
  }

  async function handle(req, res) {
    Object.entries(SECURITY_HEADERS).forEach(([name, value]) => res.setHeader(name, value));
    try {
      const url = new URL(req.url, 'http://maatora.invalid');
      if (url.pathname.startsWith('/api/')) {
        await api(req, res, url);
      } else {
        serveStatic(req, res, url.pathname);
      }
    } catch (error) {
      if (res.headersSent) {
        res.end();
      } else if (error instanceof HttpError) {
        sendJson(res, error.status, error.body);
      } else {
        console.error(error);
        sendJson(res, 500, { error: 'server' });
      }
    }
  }

  if (!saved) {
    persist();
  }
  const server = http.createServer(handle);
  const timer = setInterval(() => {
    engine.tick();
    persist();
    broadcast();
  }, config.tickMs);
  timer.unref();

  function close() {
    clearInterval(timer);
    streams.forEach((entry) => entry.res.end());
    streams.clear();
    return new Promise((resolve) => {
      server.close(() => {
        db.close();
        resolve();
      });
      server.closeAllConnections();
    });
  }

  return { server, engine, db, auth, devices, store, close, seeded, restored: Boolean(saved), tick: () => { engine.tick(); persist(); broadcast(); } };
}

module.exports = { createApp, VERSION };
