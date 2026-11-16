/* ==========================================================================
   Maatora | Cold-Chain Monitoring
   Single state object, role-based views, incident simulation and the
   printable compliance certificate. No dependencies.
   ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */
const EXCURSION_DELTA_C = 9;
const LIVE_TICK_MS = 4000;
const ETA_TICK_MS = 60000;
const HISTORY_POINTS = 32;
const AUDIT_LOG_VISIBLE = 12;
const TOAST_MS = 3200;
const MAX_SIGN_IN_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;
const IDLE_LIMIT_MS = { client: 30 * 60000, admin: 10 * 60000 };
const SESSION_KEY = 'maatora.session';

const ROUTE_STEPS = [
  'Origin Departure',
  'Highway In-Transit',
  'Regional Inspection Hub',
  'Final Receiving Depot'
];

const PERSONNEL = {
  qaOfficer: 'Lead Quality Assurance Auditor',
  inspector: 'Cold-Chain Regulatory Officer'
};

const DOCK_ITEMS = {
  client: [
    { id: 'overview', label: 'Overview', icon: 'i-shield-check' },
    { id: 'journey', label: 'Journey', icon: 'i-route' },
    { id: 'documents', label: 'Documents', icon: 'i-document' }
  ],
  admin: [
    { id: 'fleet', label: 'Fleet', icon: 'i-fleet' },
    { id: 'diagnostics', label: 'Diagnostics', icon: 'i-activity' },
    { id: 'controls', label: 'Controls', icon: 'i-sliders' }
  ]
};

/* Demonstration accounts. Sign-in is simulated in the browser: these values
   ship with the page and are not a security boundary. A production build must
   authenticate against a server and never deliver credentials to the client. */
const DEMO_ACCOUNTS = [
  {
    id: 'client-biopharma',
    role: 'client',
    identifier: 'consignor@maatora.test',
    password: 'ColdChain-Demo-2026',
    name: 'National Logistics & Biopharma Consignor S.A.E.',
    trucks: ['TRK-104', 'TRK-208']
  },
  {
    id: 'client-provisions',
    role: 'client',
    identifier: 'provisions@maatora.test',
    password: 'FrozenDock-Demo-2026',
    name: 'National Cold-Chain Provisions Consignor S.A.E.',
    trucks: ['TRK-315']
  },
  {
    id: 'admin-qa',
    role: 'admin',
    identifier: 'QA-0104',
    password: 'Dispatch-Demo-2026',
    name: 'Lead Quality Assurance Auditor',
    trucks: []
  }
];

const AUTH_COPY = {
  client: {
    title: 'Client Portal Sign-In',
    sub: 'Follow your consignment temperature, route progress and compliance certificate.',
    identifierLabel: 'Account Email',
    inputMode: 'email',
    scope: 'client portal',
    demoNote: 'Sign-in is simulated in this browser. Load the demo consignor account to explore the client portal.'
  },
  admin: {
    title: 'Control Room Sign-In',
    sub: 'Dispatch and compliance controllers only: fleet telemetry, hardware health and certificate signing.',
    identifierLabel: 'Operator ID',
    inputMode: 'text',
    scope: 'control room console',
    demoNote: 'Sign-in is simulated in this browser. Load the demo controller account to open the control room.'
  }
};

const HEALTH_LEVELS = {
  ok: { label: 'Nominal', tone: 'safe' },
  warn: { label: 'Attention', tone: 'ice' },
  fault: { label: 'Fault', tone: 'alert' }
};

const UNIT_STATUS = {
  'en-route': { label: 'En Route', chip: 'chip--safe' },
  standby: { label: 'Standby / Pre-Cooling', chip: 'chip--ice' },
  excursion: { label: 'Excursion', chip: 'chip--alert chip--flash' }
};

const CERT_STATUS = {
  valid: {
    label: 'Valid',
    chip: 'chip--safe',
    tone: 'safe',
    stamp: 'VERIFIED & VALIDATED • ZERO EXCURSIONS',
    note: 'Continuous temperature log validated. Compliance seal is in force.'
  },
  hold: {
    label: 'Compliance Hold',
    chip: 'chip--alert chip--flash',
    tone: 'alert',
    stamp: 'COMPLIANCE HOLD • EXCURSION UNDER REVIEW',
    note: 'Compliance violation flagged. Seal suspended while the excursion is active.'
  },
  revalidate: {
    label: 'Re-Validation Pending',
    chip: 'chip--ice',
    tone: 'pending',
    stamp: 'RE-VALIDATION PENDING • AWAITING QA SIGN-OFF',
    note: 'Telemetry is back at baseline. Sign the certificate to restore the seal.'
  },
  'not-issued': {
    label: 'Not Yet Issued',
    chip: 'chip--neutral',
    tone: 'pending',
    stamp: 'NOT YET ISSUED • TRANSIT NOT COMMENCED',
    note: 'Unit is on standby. A certificate is issued once the transit log opens.'
  }
};

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
const state = {
  currentRole: 'client',
  activeTruckId: 'TRK-104',
  isExcursionActive: false,
  certificateModalOpen: false,

  activePanel: { client: 'overview', admin: 'fleet' },
  excursionTruckId: null,
  auditLog: [],

  session: { client: null, admin: null },
  clientTruckId: 'TRK-104',
  auth: {
    attempts: { client: 0, admin: 0 },
    lockedUntil: { client: 0, admin: 0 },
    error: ''
  },
  lastActivityAt: Date.now(),

  trucks: [
    {
      id: 'TRK-104',
      vehicleClass: 'Heavy Refrigerated Rigid 26T',
      operator: 'Certified Transport Operator #104',
      consignmentId: 'BATCH-REF-8841-X',
      cargo: 'Pharmaceutical Vaccines (Ultra-Cold)',
      cargoShort: 'Vaccines',
      consignor: 'National Logistics & Biopharma Consignor S.A.E.',
      consignorDept: 'Certified Pharmaceutical Logistics Dept.',
      consignee: 'Northern Regional Medical Depot #04',
      consigneeTerminal: 'Regional Receiving Terminal #04',
      origin: 'Central Biopharma Distribution Hub',
      destination: 'Northern Regional Medical Depot #04',
      corridor: 'Transit Corridor 4',
      routeStep: 1,
      milestonesAgo: [258],
      tempTarget: -20.0,
      tempMin: -24.0,
      tempMax: -18.0,
      tempBaseline: -21.5,
      tempCurrent: -21.5,
      eta: 42,
      sealId: 'EGY-9921-X',
      sensorBattery: 96,
      uplinkPing: 42,
      uplinkSignal: -74,
      compressorRpm: 1850,
      compressorNominalRpm: 1850,
      fuelPercent: 88,
      firmware: 'TLM-FW 4.2.1 (Signed Build)',
      calibration: '±0.1°C Reference Probe, Verified 14 Days Ago',
      status: 'en-route',
      baseStatus: 'en-route',
      history: [],
      log: { transitMinutes: 258, min: -22.1, max: -20.8, excursions: 0, doorOpenings: 0 },
      certificate: { serial: 'REF-CERT-2026-8812-CC', status: 'valid', signedAt: null, hash: '' }
    },
    {
      id: 'TRK-208',
      vehicleClass: 'Medium Refrigerated Rigid 18T',
      operator: 'Certified Transport Operator #208',
      consignmentId: 'BATCH-REF-8856-K',
      cargo: 'Perishable Biologics (Chilled 2–8°C)',
      cargoShort: 'Perishable Biologics',
      consignor: 'National Logistics & Biopharma Consignor S.A.E.',
      consignorDept: 'Certified Pharmaceutical Logistics Dept.',
      consignee: 'Delta Regional Clinical Depot #02',
      consigneeTerminal: 'Regional Receiving Terminal #02',
      origin: 'Central Biopharma Distribution Hub',
      destination: 'Delta Regional Clinical Depot #02',
      corridor: 'Transit Corridor 7',
      routeStep: 2,
      milestonesAgo: [203, 21],
      tempTarget: 4.0,
      tempMin: 2.0,
      tempMax: 8.0,
      tempBaseline: 3.2,
      tempCurrent: 3.2,
      eta: 27,
      sealId: 'EGY-9934-K',
      sensorBattery: 91,
      uplinkPing: 58,
      uplinkSignal: -81,
      compressorRpm: 1420,
      compressorNominalRpm: 1420,
      fuelPercent: 74,
      firmware: 'TLM-FW 4.2.1 (Signed Build)',
      calibration: '±0.1°C Reference Probe, Verified 9 Days Ago',
      status: 'en-route',
      baseStatus: 'en-route',
      history: [],
      log: { transitMinutes: 203, min: 2.8, max: 3.9, excursions: 0, doorOpenings: 0 },
      certificate: { serial: 'REF-CERT-2026-8813-CC', status: 'valid', signedAt: null, hash: '' }
    },
    {
      id: 'TRK-315',
      vehicleClass: 'Heavy Refrigerated Articulated 40T',
      operator: 'Certified Transport Operator #315',
      consignmentId: 'BATCH-REF-8872-M',
      cargo: 'Frozen Seafood (Deep-Frozen)',
      cargoShort: 'Frozen Seafood',
      consignor: 'National Cold-Chain Provisions Consignor S.A.E.',
      consignorDept: 'Certified Food-Grade Logistics Dept.',
      consignee: 'Coastal Cold Storage Terminal #07',
      consigneeTerminal: 'Regional Receiving Terminal #07',
      origin: 'Origin Cold Dock B',
      destination: 'Coastal Cold Storage Terminal #07',
      corridor: 'Origin Cold Dock B',
      routeStep: 0,
      milestonesAgo: [],
      tempTarget: -18.0,
      tempMin: -22.0,
      tempMax: -15.0,
      tempBaseline: -18.0,
      tempCurrent: -18.0,
      eta: null,
      sealId: 'EGY-9951-M',
      sensorBattery: 99,
      uplinkPing: 36,
      uplinkSignal: -69,
      compressorRpm: 2100,
      compressorNominalRpm: 2100,
      fuelPercent: 97,
      firmware: 'TLM-FW 4.2.1 (Signed Build)',
      calibration: '±0.1°C Reference Probe, Verified 3 Days Ago',
      status: 'standby',
      baseStatus: 'standby',
      history: [],
      log: { transitMinutes: 0, min: -18.4, max: -17.6, excursions: 0, doorOpenings: 0 },
      certificate: { serial: 'REF-CERT-2026-8814-CC', status: 'not-issued', signedAt: null, hash: '' }
    }
  ]
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
const el = {};
const loadedAt = Date.now();
let toastTimer = null;
let lastFocused = null;
let logChain = Promise.resolve('MAATORA-AUDIT-GENESIS');

const byId = (id) => document.getElementById(id);
const all = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const round1 = (value) => Math.round(value * 10) / 10;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pad2 = (value) => String(value).padStart(2, '0');

const getTruck = (id) => state.trucks.find((truck) => truck.id === id);
const activeTruck = () => getTruck(state.activeTruckId);
const isInSpec = (truck) => truck.tempCurrent >= truck.tempMin && truck.tempCurrent <= truck.tempMax;

const isAuthed = (role = state.currentRole) => Boolean(state.session[role]);
const clientTruck = () => getTruck(state.clientTruckId);
/* The client sees only their own consignment; the admin sees the selected unit. */
const viewTruck = () => (state.currentRole === 'client' ? clientTruck() : activeTruck());

function formatTemp(value) {
  const rounded = round1(value);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}°C`;
}

function formatClock(date, withSeconds = false) {
  const base = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  return withSeconds ? `${base}:${pad2(date.getSeconds())}` : base;
}

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

const formatDateTime = (date) => dateTimeFormat.format(date);

function formatDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${pad2(hours)} Hours ${pad2(minutes)} Minutes`;
}

function shortHash(hash) {
  return hash ? `${hash.slice(0, 6)}...${hash.slice(-5)}` : '';
}

function setText(node, text) {
  if (node && node.textContent !== text) {
    node.textContent = text;
  }
}

function setChip(node, label, modifiers) {
  if (!node) {
    return;
  }
  setText(node, label);
  const className = `chip ${modifiers}`.trim();
  if (node.className !== className) {
    node.className = className;
  }
}

function iconMarkup(name) {
  return `<svg class="icon" aria-hidden="true" focusable="false"><use href="#${name}"></use></svg>`;
}

async function sha256Hex(text) {
  if (!window.crypto || !window.crypto.subtle || typeof TextEncoder === 'undefined') {
    return null;
  }
  try {
    const buffer = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    return null;
  }
}

/* --------------------------------------------------------------------------
   Audit log (hash-chained entries)
   -------------------------------------------------------------------------- */
function appendLog(kind, message) {
  const entry = {
    seq: state.auditLog.length + 1,
    time: new Date(),
    kind,
    message,
    digest: ''
  };
  state.auditLog.push(entry);
  renderAuditLog();

  logChain = logChain.then(async (previous) => {
    const digest = await sha256Hex(`${previous}|${entry.seq}|${entry.time.toISOString()}|${entry.message}`);
    entry.digest = digest || '';
    renderAuditLog();
    return digest || previous;
  });
}

/* --------------------------------------------------------------------------
   Certificate digest
   -------------------------------------------------------------------------- */
async function refreshCertificateHash(truck) {
  const cert = truck.certificate;
  if (cert.status !== 'valid' || !cert.signedAt) {
    cert.hash = '';
    return;
  }
  const payload = [
    cert.serial,
    truck.id,
    truck.consignmentId,
    truck.tempTarget,
    truck.tempMin,
    truck.tempMax,
    truck.log.transitMinutes,
    truck.log.min,
    truck.log.max,
    truck.log.excursions,
    truck.log.doorOpenings,
    truck.sealId,
    cert.signedAt.toISOString()
  ].join('|');
  const signedAt = cert.signedAt;
  const hash = await sha256Hex(payload);
  if (cert.status === 'valid' && cert.signedAt === signedAt) {
    cert.hash = hash || '';
    renderCertificate();
    renderControls();
  }
}

/* --------------------------------------------------------------------------
   Actions
   -------------------------------------------------------------------------- */
/* --- Authentication (simulated, browser only) --- */
function persistSession() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      role: state.currentRole,
      client: state.session.client ? state.session.client.id : null,
      admin: state.session.admin ? state.session.admin.id : null,
      clientTruckId: state.clientTruckId
    }));
  } catch (error) {
    /* Storage unavailable: the session lasts until the page is closed. */
  }
}

function restoreSession() {
  let saved = null;
  try {
    saved = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch (error) {
    saved = null;
  }
  if (!saved || typeof saved !== 'object') {
    return;
  }
  ['client', 'admin'].forEach((role) => {
    state.session[role] = DEMO_ACCOUNTS.find((item) => item.id === saved[role] && item.role === role) || null;
  });
  if (saved.role === 'client' || saved.role === 'admin') {
    state.currentRole = saved.role;
  }
  const account = state.session.client;
  if (account) {
    state.clientTruckId = account.trucks.includes(saved.clientTruckId) ? saved.clientTruckId : account.trucks[0];
  }
}

function lockSecondsLeft(role = state.currentRole) {
  return Math.max(0, Math.ceil((state.auth.lockedUntil[role] - Date.now()) / 1000));
}

function resetAuthForm() {
  el['auth-form'].reset();
  el['auth-password'].type = 'password';
  el['auth-toggle'].setAttribute('aria-pressed', 'false');
  setText(el['auth-toggle'], 'Show');
}

function submitSignIn() {
  const role = state.currentRole;
  const copy = AUTH_COPY[role];
  if (lockSecondsLeft(role) > 0) {
    renderAuth();
    return;
  }

  const identifier = el['auth-identifier'].value.trim().toLowerCase();
  const password = el['auth-password'].value;
  if (!identifier || !password) {
    state.auth.error = `Enter your ${copy.identifierLabel.toLowerCase()} and password.`;
    renderAuth();
    return;
  }

  const account = DEMO_ACCOUNTS.find(
    (item) => item.role === role && item.identifier.toLowerCase() === identifier && item.password === password
  );

  if (!account) {
    state.auth.attempts[role] += 1;
    const attempt = state.auth.attempts[role];
    if (attempt >= MAX_SIGN_IN_ATTEMPTS) {
      state.auth.attempts[role] = 0;
      state.auth.lockedUntil[role] = Date.now() + LOCKOUT_MS;
      state.auth.error = '';
      appendLog(
        'alert',
        `Sign-in locked on the ${copy.scope} for ${LOCKOUT_MS / 1000} seconds after ${MAX_SIGN_IN_ATTEMPTS} failed attempts.`
      );
    } else {
      const left = MAX_SIGN_IN_ATTEMPTS - attempt;
      state.auth.error = `Those details do not match an account. ${left} ${left === 1 ? 'attempt' : 'attempts'} left before a temporary lock.`;
      appendLog('alert', `Failed sign-in attempt on the ${copy.scope} (${attempt} of ${MAX_SIGN_IN_ATTEMPTS}).`);
    }
    el['auth-password'].value = '';
    renderAuth();
    el['auth-password'].focus();
    return;
  }

  state.auth.attempts[role] = 0;
  state.auth.error = '';
  state.session[role] = account;
  if (role === 'client' && !account.trucks.includes(state.clientTruckId)) {
    state.clientTruckId = account.trucks[0];
  }
  state.lastActivityAt = Date.now();
  resetAuthForm();
  persistSession();
  appendLog('ok', `Sign-in on the ${copy.scope}: ${account.name}.`);
  showToast(`Signed in as ${account.name}`, 'safe');
  render();
  el.viewport.scrollTop = 0;
  el.viewport.focus();
}

function signOut(role = state.currentRole, reason = '') {
  const account = state.session[role];
  if (!account) {
    return;
  }
  state.session[role] = null;
  persistSession();
  appendLog('info', `Sign-out on the ${AUTH_COPY[role].scope}: ${account.name}${reason ? ` (${reason})` : ''}.`);

  if (role === state.currentRole) {
    state.certificateModalOpen = false;
    lastFocused = null;
    state.auth.error = reason ? 'You were signed out after a period of inactivity.' : '';
    hideToast();
    resetAuthForm();
    render();
    el.viewport.scrollTop = 0;
  }
}

function fillDemoCredentials() {
  const account = DEMO_ACCOUNTS.find((item) => item.role === state.currentRole);
  el['auth-identifier'].value = account.identifier;
  el['auth-password'].value = account.password;
  state.auth.error = '';
  renderAuth();
  el['auth-submit'].focus();
}

function togglePasswordVisibility() {
  const input = el['auth-password'];
  const reveal = input.type === 'password';
  input.type = reveal ? 'text' : 'password';
  el['auth-toggle'].setAttribute('aria-pressed', String(reveal));
  setText(el['auth-toggle'], reveal ? 'Hide' : 'Show');
}

function selectConsignment(truckId) {
  const account = state.session.client;
  if (!account || !account.trucks.includes(truckId) || state.clientTruckId === truckId) {
    return;
  }
  state.clientTruckId = truckId;
  persistSession();
  render();
}

/* --- Hardware health --- */
function hardwareChecks(truck) {
  const level = (fault, warn) => {
    if (fault) {
      return 'fault';
    }
    return warn ? 'warn' : 'ok';
  };
  return {
    battery: level(truck.sensorBattery < 15, truck.sensorBattery < 35),
    uplink: level(truck.uplinkSignal < -105, truck.uplinkSignal < -95 || truck.uplinkPing > 150),
    compressor: level(truck.status === 'excursion' || truck.compressorRpm === 0, false),
    fuel: level(truck.fuelPercent < 15, truck.fuelPercent < 30),
    seal: level(truck.log.doorOpenings > 0, false),
    calibration: 'ok',
    firmware: 'ok'
  };
}

function healthSummary(truck) {
  const levels = Object.values(hardwareChecks(truck));
  const faults = levels.filter((item) => item === 'fault').length;
  const warnings = levels.filter((item) => item === 'warn').length;
  if (faults > 0) {
    return { label: `${faults} ${faults === 1 ? 'Fault' : 'Faults'}`, tone: 'alert', chip: 'chip--alert chip--flash' };
  }
  if (warnings > 0) {
    return { label: `${warnings} Attention`, tone: 'ice', chip: 'chip--ice' };
  }
  return { label: `${levels.length} / ${levels.length} Nominal`, tone: 'safe', chip: 'chip--safe' };
}

function setRole(role) {
  if (role !== 'client' && role !== 'admin') {
    return;
  }
  if (state.currentRole === role) {
    return;
  }
  state.currentRole = role;
  state.auth.error = '';
  resetAuthForm();
  persistSession();
  hideToast();
  buildDock();
  render();
  el.viewport.scrollTop = 0;
}

function setPanel(panelId) {
  const valid = DOCK_ITEMS[state.currentRole].some((item) => item.id === panelId);
  if (!valid) {
    return;
  }
  state.activePanel[state.currentRole] = panelId;
  render();
  el.viewport.scrollTop = 0;
}

function selectTruck(id) {
  if (!getTruck(id) || state.activeTruckId === id) {
    return;
  }
  state.activeTruckId = id;
  render();
}
