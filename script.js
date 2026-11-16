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

function triggerIncident() {
  if (state.isExcursionActive) {
    return;
  }
  const truck = activeTruck();
  const cert = truck.certificate;

  state.isExcursionActive = true;
  state.excursionTruckId = truck.id;

  truck.status = 'excursion';
  truck.tempCurrent = round1(truck.tempBaseline + EXCURSION_DELTA_C);
  truck.compressorRpm = 0;
  truck.history.push(truck.tempCurrent);
  truck.history = truck.history.slice(-HISTORY_POINTS);

  truck.log.maxBeforeDrill = truck.log.max;
  truck.log.max = Math.max(truck.log.max, truck.tempCurrent);
  truck.log.excursions += 1;

  cert.statusBeforeDrill = cert.status;
  cert.status = 'hold';
  cert.hash = '';

  appendLog(
    'alert',
    `Incident drill: compressor failure on Unit #${truck.id}. Internal temperature ${formatTemp(truck.tempCurrent)} (+${EXCURSION_DELTA_C.toFixed(1)}°C excursion). Compliance violation flagged.`
  );
  showToast(`Excursion triggered on Unit #${truck.id}`, 'alert');
  render();
}

function normalizeSensor() {
  if (!state.isExcursionActive) {
    return;
  }
  const truck = getTruck(state.excursionTruckId);
  const cert = truck.certificate;

  truck.status = truck.baseStatus;
  truck.tempCurrent = truck.tempBaseline;
  truck.compressorRpm = truck.compressorNominalRpm;
  truck.history.push(truck.tempCurrent);
  truck.history = truck.history.slice(-HISTORY_POINTS);

  truck.log.max = truck.log.maxBeforeDrill;
  truck.log.excursions = Math.max(0, truck.log.excursions - 1);
  delete truck.log.maxBeforeDrill;

  cert.status = cert.statusBeforeDrill === 'not-issued' ? 'not-issued' : 'revalidate';
  delete cert.statusBeforeDrill;

  state.isExcursionActive = false;
  state.excursionTruckId = null;

  appendLog(
    'ok',
    `Sensor normalized on Unit #${truck.id}. Telemetry back at baseline ${formatTemp(truck.tempCurrent)}. Drill closed and excluded from the compliance record.`
  );
  showToast(`Unit #${truck.id} returned to nominal range`, 'safe');
  render();
}

function signBlockReason(truck) {
  if (truck.status === 'excursion') {
    return 'Signing is blocked while an excursion is active. Normalize the sensor first.';
  }
  if (truck.baseStatus === 'standby') {
    return 'Unit is on standby. There is no in-transit log to validate yet.';
  }
  if (!isInSpec(truck)) {
    return 'Signing is blocked while the reading is outside the permitted range.';
  }
  return '';
}

function signCertificate() {
  const truck = activeTruck();
  const reason = signBlockReason(truck);
  if (reason) {
    showToast(reason, 'alert');
    return;
  }
  const cert = truck.certificate;
  cert.status = 'valid';
  cert.signedAt = new Date();
  cert.hash = '';

  appendLog(
    'sign',
    `Certificate ${cert.serial} signed by ${PERSONNEL.qaOfficer}. Continuous log validated: ${truck.log.excursions} excursions, ${truck.log.doorOpenings} unauthorized openings.`
  );
  showToast(`Certificate signed for Unit #${truck.id}`, 'safe');
  render();
  refreshCertificateHash(truck);
}

function openCertificate() {
  if (state.certificateModalOpen || !isAuthed()) {
    return;
  }
  lastFocused = document.activeElement;
  state.certificateModalOpen = true;
  renderCertificate();
  renderModal();
  const closeButton = el.modal.querySelector('.modal__toolbar [data-action="close-certificate"]');
  if (closeButton) {
    closeButton.focus();
  }
}

function closeCertificate() {
  if (!state.certificateModalOpen) {
    return;
  }
  state.certificateModalOpen = false;
  renderModal();
  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus();
  }
  lastFocused = null;
}

function printCertificate() {
  renderCertificate();
  window.print();
}

const ACTIONS = {
  'open-certificate': openCertificate,
  'close-certificate': closeCertificate,
  'print-certificate': printCertificate,
  'trigger-incident': triggerIncident,
  'normalize-sensor': normalizeSensor,
  'sign-certificate': signCertificate,
  'goto-diagnostics': () => setPanel('diagnostics'),
  'sign-out': () => signOut(),
  'fill-demo': fillDemoCredentials,
  'toggle-password': togglePasswordVisibility
};

/* --------------------------------------------------------------------------
   One-time DOM construction
   -------------------------------------------------------------------------- */
function cacheElements() {
  [
    'app', 'viewport', 'role-switch', 'live-chip', 'live-chip-text', 'dock', 'dock-items', 'toast',
    'account-bar', 'account-name', 'auth-panel', 'auth-title', 'auth-sub', 'auth-form',
    'auth-identifier', 'auth-identifier-label', 'auth-password', 'auth-toggle', 'auth-error',
    'auth-submit', 'auth-demo-note', 'health-chip',
    'admin-alert', 'admin-alert-title', 'admin-alert-note',
    'client-banner', 'client-banner-title', 'client-banner-note',
    'cargo-card', 'cargo-consignment', 'cargo-state', 'cargo-type', 'cargo-temp', 'cargo-target',
    'cargo-meter', 'meter-min', 'meter-max', 'cargo-corridor', 'route-chip', 'route-stepper',
    'journey-title', 'journey-sub', 'journey-timeline',
    'custody-consignor', 'custody-consignee', 'custody-operator',
    'doc-heading', 'doc-status', 'doc-validated', 'doc-excursions', 'doc-door',
    'fleet-summary', 'fleet-grid', 'fleet-goto-label',
    'diag-title', 'diag-sub', 'trace-card', 'diag-temp', 'diag-status', 'diag-range',
    'spark-band', 'spark-setpoint', 'spark-line', 'spark-dot',
    'diag-battery', 'bar-battery', 'diag-uplink', 'row-uplink', 'diag-compressor', 'row-compressor',
    'diag-fuel', 'bar-fuel', 'diag-seal', 'diag-calibration', 'diag-firmware',
    'controls-title', 'seal-card', 'seal-serial', 'seal-status', 'seal-note', 'seal-signed',
    'seal-hash', 'seal-excursions', 'btn-incident', 'btn-normalize', 'btn-sign', 'tools-hint',
    'audit-log', 'log-count',
    'certificate', 'cert-serial', 'cert-consignor', 'cert-consignee', 'cert-vehicle', 'cert-operator',
    'cert-cargo', 'cert-setpoint', 'cert-duration', 'cert-minmax', 'cert-excursions', 'cert-door',
    'cert-seal', 'cert-stamp-title', 'cert-stamp-meta', 'cert-stamp-tick', 'cert-hash', 'cert-qr',
    'cert-signer'
  ].forEach((id) => {
    el[id] = byId(id);
  });
  el.modal = byId('certificate-modal');
  el.viewport = byId('viewport');
}

function buildStepper() {
  el['route-stepper'].innerHTML = ROUTE_STEPS.map((label, index) => `
    <li class="stepper__step" data-state="upcoming">
      <span class="stepper__node"><span class="stepper__num">${index + 1}</span>${iconMarkup('i-check')}</span>
      <span class="stepper__label">${label.replace('-', '‑')}</span>
    </li>`).join('');
}

function buildTimeline() {
  el['journey-timeline'].innerHTML = ROUTE_STEPS.map((label) => `
    <li class="timeline__step" data-state="upcoming">
      <p class="timeline__label">${label}</p>
      <p class="timeline__place"></p>
      <p class="timeline__time"></p>
    </li>`).join('');
}

function buildFleet() {
  el['fleet-grid'].innerHTML = state.trucks.map((truck) => `
    <button type="button" class="unit-card" data-truck="${truck.id}" aria-pressed="false">
      <span class="unit-card__head">
        <span class="unit-card__id">Unit #${truck.id}</span>
        <span class="chip" data-field="status"></span>
      </span>
      <span class="unit-card__cargo" data-field="cargo"></span>
      <span class="unit-card__metrics">
        <span class="metric">
          <span class="metric__label">Internal Temp</span>
          <span class="metric__value metric__value--temp" data-field="temp"></span>
        </span>
        <span class="metric">
          <span class="metric__label">Chiller Power</span>
          <span class="metric__value" data-field="chiller"></span>
        </span>
        <span class="metric">
          <span class="metric__label">Uplink</span>
          <span class="metric__value" data-field="uplink"></span>
        </span>
        <span class="metric">
          <span class="metric__label">Hardware Health</span>
          <span class="metric__value" data-field="health"></span>
        </span>
      </span>
    </button>`).join('');
}

function buildUnitPickers() {
  const markup = state.trucks.map((truck) => `
    <button type="button" class="unit-picker__option" data-truck="${truck.id}" aria-pressed="false">#${truck.id}</button>`).join('');
  all('[data-unit-picker]').forEach((picker) => {
    picker.innerHTML = markup;
  });
}

function buildDock() {
  el['dock-items'].innerHTML = DOCK_ITEMS[state.currentRole].map((item) => `
    <button type="button" class="dock-item" data-panel-target="${item.id}">
      ${iconMarkup(item.icon)}
      <span>${item.label}</span>
    </button>`).join('');
}

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */
function render() {
  renderShell();
  renderClient();
  renderFleet();
  renderDiagnostics();
  renderControls();
  renderCertificate();
  renderModal();
}

function renderShell() {
  const role = state.currentRole;
  const authed = isAuthed(role);
  const truck = viewTruck();
  const panelId = state.activePanel[role];
  const alertInView = authed && (role === 'admin' ? state.isExcursionActive : truck.status === 'excursion');

  el.app.dataset.role = role;
  el.app.dataset.alert = String(alertInView);
  el.app.dataset.authed = String(authed);
  document.body.dataset.authed = String(authed);
  el['role-switch'].dataset.role = role;

  el['auth-panel'].hidden = authed;
  el.dock.hidden = !authed;
  el['live-chip'].hidden = !authed;
  el['account-bar'].hidden = !authed;
  if (authed) {
    setText(el['account-name'], state.session[role].name);
  }
  renderAuth();

  all('[data-role-target]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.roleTarget === role));
  });

  all('.panel[data-panel]').forEach((panel) => {
    const visible = authed && panel.dataset.role === role && panel.dataset.panel === panelId;
    if (panel.hidden === visible) {
      panel.hidden = !visible;
    }
  });

  const items = DOCK_ITEMS[role];
  const index = Math.max(0, items.findIndex((item) => item.id === panelId));
  el.dock.style.setProperty('--dock-index', String(index));
  all('.dock-item', el.dock).forEach((button) => {
    if (button.dataset.panelTarget === panelId) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });

  const showAdminAlert = authed && role === 'admin' && state.isExcursionActive;
  el['admin-alert'].hidden = !showAdminAlert;
  if (showAdminAlert) {
    const affected = getTruck(state.excursionTruckId);
    setText(el['admin-alert-title'], `Active Excursion • Unit #${affected.id}`);
    setText(
      el['admin-alert-note'],
      `Internal temperature ${formatTemp(affected.tempCurrent)}, above the ${formatTemp(affected.tempMax)} limit. Compliance violation flagged.`
    );
  }

  renderLiveChip();
}

function renderAuth() {
  const role = state.currentRole;
  const copy = AUTH_COPY[role];
  const locked = lockSecondsLeft(role);

  setText(el['auth-title'], copy.title);
  setText(el['auth-sub'], copy.sub);
  setText(el['auth-identifier-label'], copy.identifierLabel);
  el['auth-identifier'].setAttribute('inputmode', copy.inputMode);
  setText(el['auth-demo-note'], copy.demoNote);

  const message = locked > 0 ? `Too many failed attempts. Try again in ${locked} seconds.` : state.auth.error;
  el['auth-error'].hidden = !message;
  setText(el['auth-error'], message);
  el['auth-submit'].disabled = locked > 0;
}

function renderConsignmentPickers() {
  const account = state.session.client;
  const trucks = account ? account.trucks : [];
  const signature = trucks.join(',');
  all('[data-consignment-picker]').forEach((picker) => {
    picker.hidden = trucks.length < 2;
    if (picker.dataset.signature !== signature) {
      picker.dataset.signature = signature;
      picker.innerHTML = trucks.map((id) => `
        <button type="button" class="unit-picker__option" data-consignment="${id}" aria-pressed="false">${getTruck(id).consignmentId}</button>`).join('');
    }
    all('[data-consignment]', picker).forEach((button) => {
      const truck = getTruck(button.dataset.consignment);
      button.setAttribute('aria-pressed', String(truck.id === state.clientTruckId));
      button.dataset.status = truck.status;
    });
  });
}

function renderLiveChip() {
  const alertInView = el.app.dataset.alert === 'true';
  setText(el['live-chip-text'], `${alertInView ? 'Alert' : 'Live'} • ${formatClock(new Date(), true)}`);
}

function renderClient() {
  const truck = clientTruck();
  renderConsignmentPickers();
  const cert = truck.certificate;
  const certMeta = CERT_STATUS[cert.status];
  const inExcursion = truck.status === 'excursion';
  const onStandby = truck.baseStatus === 'standby';
  const inSpec = isInSpec(truck);

  /* Reassurance banner */
  let bannerClass = 'banner banner--safe';
  let bannerTitle = 'REFRIGERATION GUARANTEED • SAFE SPEC';
  let bannerNote = 'Your cargo is held inside its certified temperature range and monitored continuously.';
  if (inExcursion) {
    bannerClass = 'banner banner--alert';
    bannerTitle = 'TEMPERATURE EXCURSION • QA NOTIFIED';
    bannerNote = 'The reading is outside the permitted range. Quality assurance has been alerted and corrective action is under way.';
  } else if (onStandby) {
    bannerClass = 'banner banner--pending';
    bannerTitle = 'PRE-COOLING IN PROGRESS • DEPARTURE PENDING';
    bannerNote = 'Your cargo bay is being conditioned to its certified temperature before departure.';
  }
  if (el['client-banner'].className !== bannerClass) {
    el['client-banner'].className = bannerClass;
  }
  setText(el['client-banner-title'], bannerTitle);
  setText(el['client-banner-note'], bannerNote);

  /* Cargo snapshot */
  el['cargo-card'].dataset.tone = inSpec ? 'safe' : 'alert';
  setText(el['cargo-consignment'], truck.consignmentId);
  setText(el['cargo-type'], truck.cargo);
  setText(el['cargo-temp'], formatTemp(truck.tempCurrent));
  setText(
    el['cargo-target'],
    `Target ${formatTemp(truck.tempTarget)} • Permitted ${formatTemp(truck.tempMin)} to ${formatTemp(truck.tempMax)}`
  );
  setChip(el['cargo-state'], inSpec ? 'Within Spec' : 'Out of Spec', inSpec ? 'chip--safe' : 'chip--alert chip--flash');

  const domainMin = truck.tempMin - 2;
  const domainMax = truck.tempMax + EXCURSION_DELTA_C;
  const toPercent = (value) => clamp(((value - domainMin) / (domainMax - domainMin)) * 100, 3, 97);
  const meter = el['cargo-meter'];
  meter.style.setProperty('--band-start', `${toPercent(truck.tempMin)}%`);
  meter.style.setProperty('--band-end', `${toPercent(truck.tempMax)}%`);
  meter.style.setProperty('--setpoint', `${toPercent(truck.tempTarget)}%`);
  meter.style.setProperty('--marker', `${toPercent(truck.tempCurrent)}%`);
  meter.setAttribute(
    'aria-label',
    `Current ${formatTemp(truck.tempCurrent)}, permitted range ${formatTemp(truck.tempMin)} to ${formatTemp(truck.tempMax)}`
  );
  setText(el['meter-min'], formatTemp(truck.tempMin));
  setText(el['meter-max'], formatTemp(truck.tempMax));

  const etaText = truck.eta === null ? 'Departure Pending' : `ETA: ${truck.eta} Mins`;
  setText(el['cargo-corridor'], `${truck.corridor} • ${etaText}`);

  /* Route status */
  const routeLabel = onStandby ? 'Pre-Departure' : truck.routeStep === 2 ? 'At Inspection Hub' : 'In Transit';
  setChip(el['route-chip'], routeLabel, 'chip--ice');
  const stepState = (index) => {
    if (index < truck.routeStep) {
      return 'done';
    }
    return index === truck.routeStep ? 'current' : 'upcoming';
  };
  all('.stepper__step', el['route-stepper']).forEach((step, index) => {
    step.dataset.state = stepState(index);
    if (index === truck.routeStep) {
      step.setAttribute('aria-current', 'step');
    } else {
      step.removeAttribute('aria-current');
    }
  });

  /* Journey */
  setText(el['journey-title'], truck.consignmentId);
  setText(el['journey-sub'], `${truck.origin} to ${truck.destination}`);
  const now = Date.now();
  all('.timeline__step', el['journey-timeline']).forEach((step, index) => {
    const stateName = stepState(index);
    step.dataset.state = stateName;
    let place = truck.corridor;
    if (index === 0) {
      place = truck.origin;
    } else if (index === 2) {
      place = 'Regional Inspection Hub Checkpoint';
    } else if (index === 3) {
      place = truck.destination;
    }
    let timeText = 'Awaiting departure';
    if (stateName === 'done') {
      const minutesAgo = truck.milestonesAgo[index] || 0;
      timeText = `Completed ${formatClock(new Date(loadedAt - minutesAgo * 60000))}`;
    } else if (stateName === 'current') {
      timeText = onStandby ? 'Pre-cooling at origin dock' : 'In progress';
    } else if (truck.eta !== null) {
      const share = index === 3 ? 1 : 0.5;
      timeText = `Expected ${formatClock(new Date(now + truck.eta * share * 60000))}`;
    }
    setText(step.querySelector('.timeline__place'), place);
    setText(step.querySelector('.timeline__time'), timeText);
  });
  setText(el['custody-consignor'], truck.consignor);
  setText(el['custody-consignee'], truck.consignee);
  setText(el['custody-operator'], truck.operator);

  /* Documents */
  setText(el['doc-heading'], cert.serial);
  setChip(el['doc-status'], certMeta.label, certMeta.chip);
  setText(el['doc-validated'], cert.signedAt && cert.status === 'valid' ? formatDateTime(cert.signedAt) : certMeta.label);
  setText(el['doc-excursions'], excursionText(truck));
  setText(el['doc-door'], `${truck.log.doorOpenings} Unauthorized Openings`);
}

function excursionText(truck) {
  const count = truck.log.excursions;
  return count === 0 ? '0 (Zero Breaches Recorded)' : `${count} (Breach Recorded, Under Review)`;
}

function chillerState(truck) {
  if (truck.status === 'excursion') {
    return { label: 'FAULT', tone: 'alert' };
  }
  if (truck.baseStatus === 'standby') {
    return { label: 'Pre-Cooling', tone: 'ice' };
  }
  return { label: 'ON', tone: 'safe' };
}

function renderFleet() {
  const enRoute = state.trucks.filter((truck) => truck.baseStatus === 'en-route').length;
  const standby = state.trucks.length - enRoute;
  setText(el['fleet-summary'], `${state.trucks.length} units monitored • ${enRoute} en route • ${standby} on standby`);

  state.trucks.forEach((truck) => {
    const card = el['fleet-grid'].querySelector(`[data-truck="${truck.id}"]`);
    const meta = UNIT_STATUS[truck.status];
    const chiller = chillerState(truck);
    const tempNode = card.querySelector('[data-field="temp"]');
    const chillerNode = card.querySelector('[data-field="chiller"]');

    card.setAttribute('aria-pressed', String(truck.id === state.activeTruckId));
    card.dataset.status = truck.status;
    setChip(card.querySelector('[data-field="status"]'), meta.label, meta.chip);
    setText(card.querySelector('[data-field="cargo"]'), `${truck.cargoShort} • ${truck.consignmentId}`);
    setText(tempNode, formatTemp(truck.tempCurrent));
    tempNode.dataset.tone = isInSpec(truck) ? 'default' : 'alert';
    setText(chillerNode, chiller.label);
    chillerNode.dataset.tone = chiller.tone;
    setText(card.querySelector('[data-field="uplink"]'), `Online • ${truck.uplinkPing}ms`);

    const health = healthSummary(truck);
    const healthNode = card.querySelector('[data-field="health"]');
    setText(healthNode, health.label);
    healthNode.dataset.tone = health.tone;
  });

  all('.unit-picker__option[data-truck]').forEach((button) => {
    const truck = getTruck(button.dataset.truck);
    button.setAttribute('aria-pressed', String(truck.id === state.activeTruckId));
    button.dataset.status = truck.status;
  });

  setText(el['fleet-goto-label'], `Open Diagnostics for Unit #${state.activeTruckId}`);
}

function renderSparkline(truck) {
  const width = 320;
  const height = 84;
  const padY = 8;
  const values = truck.history;
  const low = Math.min(truck.tempMin - 1.5, ...values);
  const high = Math.max(truck.tempMax + 1.5, ...values) + 0.5;
  const toY = (value) => padY + ((high - value) / (high - low)) * (height - padY * 2);
  const stepX = (width - 8) / Math.max(1, HISTORY_POINTS - 1);
  const offset = HISTORY_POINTS - values.length;

  const points = values.map((value, index) => `${round1((offset + index) * stepX + 2)},${round1(toY(value))}`);
  el['spark-line'].setAttribute('points', points.join(' '));

  const bandTop = toY(truck.tempMax);
  const bandBottom = toY(truck.tempMin);
  el['spark-band'].setAttribute('y', String(round1(bandTop)));
  el['spark-band'].setAttribute('height', String(round1(bandBottom - bandTop)));

  const setpointY = String(round1(toY(truck.tempTarget)));
  el['spark-setpoint'].setAttribute('y1', setpointY);
  el['spark-setpoint'].setAttribute('y2', setpointY);

  const last = points[points.length - 1].split(',');
  el['spark-dot'].setAttribute('cx', last[0]);
  el['spark-dot'].setAttribute('cy', last[1]);
}

function renderDiagnostics() {
  const truck = activeTruck();
  const meta = UNIT_STATUS[truck.status];
  const inExcursion = truck.status === 'excursion';

  setText(el['diag-title'], `Unit #${truck.id}`);
  setText(el['diag-sub'], `${truck.vehicleClass} • ${truck.cargoShort}`);
  el['trace-card'].dataset.tone = isInSpec(truck) ? 'safe' : 'alert';
  setText(el['diag-temp'], formatTemp(truck.tempCurrent));
  setChip(el['diag-status'], meta.label, meta.chip);
  setText(
    el['diag-range'],
    `Setpoint ${formatTemp(truck.tempTarget)} • Permitted ${formatTemp(truck.tempMin)} to ${formatTemp(truck.tempMax)} • 60 s sampling`
  );
  renderSparkline(truck);

  setText(el['diag-battery'], `${truck.sensorBattery}% (Li-SOCl2 Cell, 3.6V)`);
  el['bar-battery'].parentElement.style.setProperty('--fill', `${truck.sensorBattery}%`);

  setText(
    el['diag-uplink'],
    `4G LTE / Satellite Failover (Ping: ${truck.uplinkPing}ms • ${truck.uplinkSignal} dBm)`
  );

  const health = healthSummary(truck);
  setChip(el['health-chip'], health.label, health.chip);
  Object.entries(hardwareChecks(truck)).forEach(([key, level]) => {
    const meta = HEALTH_LEVELS[level];
    const stateNode = byId(`state-${key}`);
    setText(stateNode, meta.label);
    stateNode.dataset.tone = meta.tone;
    byId(`row-${key}`).dataset.tone = level === 'fault' ? 'alert' : 'default';
  });

  setText(
    el['diag-compressor'],
    inExcursion
      ? '0 RPM (Compressor Fault, Inverter Trip)'
      : `${truck.compressorRpm.toLocaleString('en-US')} RPM (Inverter Variable Frequency)`
  );

  setText(el['diag-fuel'], `${truck.fuelPercent}% Diesel Dedicated Auxiliary`);
  el['bar-fuel'].parentElement.style.setProperty('--fill', `${truck.fuelPercent}%`);

  const sealState = truck.log.doorOpenings === 0 ? 'ENGAGED / ZERO BREACHES' : `ENGAGED / ${truck.log.doorOpenings} BREACHES`;
  setText(el['diag-seal'], `Electronic Seal #${truck.sealId} [${sealState}]`);
  setText(el['diag-calibration'], truck.calibration);
  setText(el['diag-firmware'], truck.firmware);
}

function renderControls() {
  const truck = activeTruck();
  const cert = truck.certificate;
  const certMeta = CERT_STATUS[cert.status];
  const drillTruck = state.isExcursionActive ? getTruck(state.excursionTruckId) : null;
  const blockReason = signBlockReason(truck);

  setText(el['controls-title'], `Unit #${truck.id}`);
  el['seal-card'].dataset.tone = certMeta.tone;
  setText(el['seal-serial'], cert.serial);
  setChip(el['seal-status'], certMeta.label, certMeta.chip);
  setText(el['seal-note'], certMeta.note);
  setText(el['seal-signed'], cert.status === 'valid' && cert.signedAt ? formatDateTime(cert.signedAt) : 'Not signed');
  setText(el['seal-hash'], hashLabel(cert));
  setText(el['seal-excursions'], excursionText(truck));

  el['btn-incident'].disabled = state.isExcursionActive;
  el['btn-normalize'].disabled = !state.isExcursionActive;
  el['btn-sign'].disabled = Boolean(blockReason);

  let hint = `Trigger Incident simulates a compressor failure and a +${EXCURSION_DELTA_C.toFixed(1)}°C spike on Unit #${truck.id}.`;
  if (drillTruck && drillTruck.id !== truck.id) {
    hint = `A drill is active on Unit #${drillTruck.id}. Normalize Sensor will close it. ${blockReason}`.trim();
  } else if (drillTruck) {
    hint = `Drill active on this unit. ${blockReason}`;
  } else if (blockReason) {
    hint = `${hint} ${blockReason}`;
  } else if (cert.status === 'revalidate') {
    hint = 'Telemetry is nominal. Issue / Sign Certificate to validate the log and restore the seal.';
  }
  setText(el['tools-hint'], hint);
}

function hashLabel(cert) {
  if (cert.status !== 'valid') {
    return cert.status === 'hold' ? 'Withheld (Compliance Hold)' : 'Not issued';
  }
  return cert.hash ? `SHA256: ${shortHash(cert.hash)}` : 'Digest unavailable in this browser';
}

function renderAuditLog() {
  const list = el['audit-log'];
  if (!list) {
    return;
  }
  const entries = state.auditLog.slice(-AUDIT_LOG_VISIBLE).reverse();
  list.innerHTML = '';
  entries.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'audit__entry';
    item.dataset.kind = entry.kind;
    item.value = entry.seq;

    const marker = document.createElement('span');
    marker.className = 'audit__marker';
    marker.setAttribute('aria-hidden', 'true');

    const message = document.createElement('p');
    message.className = 'audit__message';
    message.textContent = entry.message;

    const meta = document.createElement('p');
    meta.className = 'audit__meta';
    const digest = entry.digest ? `chain ${entry.digest.slice(0, 12)}` : 'chain pending';
    meta.textContent = `#${pad2(entry.seq)} • ${formatClock(entry.time, true)} • ${digest}`;

    item.append(marker, message, meta);
    list.append(item);
  });
  setText(el['log-count'], `${state.auditLog.length} Entries`);
}

/* Deterministic verification block: QR-styled placeholder seeded from the
   certificate serial and digest. It is not a decodable QR symbol. */
function renderVerificationBlock(seed) {
  const size = 25;
  let hashState = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hashState ^= seed.charCodeAt(index);
    hashState = Math.imul(hashState, 16777619);
  }
  const next = () => {
    hashState |= 0;
    hashState = (hashState + 0x6D2B79F5) | 0;
    let mixed = Math.imul(hashState ^ (hashState >>> 15), 1 | hashState);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };

  const finders = [[0, 0], [size - 7, 0], [0, size - 7]];
  const finderCell = (x, y) => {
    for (const [fx, fy] of finders) {
      const dx = x - fx;
      const dy = y - fy;
      if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) {
        if (dx < 0 || dx > 6 || dy < 0 || dy > 6) {
          return 0;
        }
        const ring = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        return ring || core ? 1 : 0;
      }
    }
    return -1;
  };

  let path = '';
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fixed = finderCell(x, y);
      const filled = fixed === -1 ? next() > 0.52 : fixed === 1;
      if (filled) {
        path += `M${x} ${y}h1v1h-1z`;
      }
    }
  }
  el['cert-qr'].setAttribute('d', path);
}

function renderCertificate() {
  const truck = viewTruck();
  const cert = truck.certificate;
  const certMeta = CERT_STATUS[cert.status];
  const log = truck.log;

  el.certificate.dataset.tone = certMeta.tone;
  setText(el['cert-serial'], cert.serial);
  setText(el['cert-consignor'], `${truck.consignor} (${truck.consignorDept})`);
  setText(el['cert-consignee'], `${truck.consignee} (${truck.consigneeTerminal})`);
  setText(el['cert-vehicle'], `Unit #${truck.id} (${truck.vehicleClass})`);
  setText(el['cert-operator'], truck.operator);
  setText(el['cert-cargo'], `${truck.consignmentId} • ${truck.cargo}`);
  setText(
    el['cert-setpoint'],
    `${formatTemp(truck.tempTarget)} (Permissible Range: ${formatTemp(truck.tempMin)} to ${formatTemp(truck.tempMax)})`
  );

  setText(
    el['cert-duration'],
    truck.baseStatus === 'standby' ? 'Not Commenced (Pre-Departure Conditioning)' : formatDuration(log.transitMinutes)
  );
  setText(el['cert-minmax'], `${formatTemp(log.min)} / ${formatTemp(log.max)}`);
  setText(el['cert-excursions'], excursionText(truck));
  el['cert-excursions'].dataset.tone = log.excursions === 0 ? 'default' : 'alert';
  setText(el['cert-door'], `${log.doorOpenings} Unauthorized Openings`);
  setText(el['cert-seal'], `#${truck.sealId} (Engaged)`);

  setText(el['cert-stamp-title'], certMeta.stamp);
  let stampMeta = 'Certificate not in force';
  if (cert.status === 'valid' && cert.signedAt) {
    stampMeta = `Signed ${formatDateTime(cert.signedAt)} by ${PERSONNEL.qaOfficer}`;
  } else if (cert.status === 'hold') {
    stampMeta = 'Seal suspended pending corrective action and QA review';
  } else if (cert.status === 'revalidate') {
    stampMeta = 'Telemetry nominal, awaiting signature';
  }
  setText(el['cert-stamp-meta'], stampMeta);
  el['cert-stamp-tick'].setAttribute(
    'd',
    cert.status === 'valid' ? 'M16.5 24.5l5 5 10-10.5' : cert.status === 'hold' ? 'M24 15v11M24 31.500v.500' : 'M17 24h14'
  );

  setText(el['cert-hash'], hashLabel(cert));
  setText(el['cert-signer'], cert.status === 'valid' ? PERSONNEL.qaOfficer : 'Signature pending');
  renderVerificationBlock(`${cert.serial}|${cert.status}|${cert.hash}`);
}

function renderModal() {
  const open = state.certificateModalOpen;
  if (el.modal.hidden === open) {
    el.modal.hidden = !open;
  }
  document.body.classList.toggle('is-modal-open', open);
}

function showToast(message, tone = 'info') {
  const toast = el.toast;
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
  window.clearTimeout(toastTimer);
  el.toast.classList.remove('is-visible');
}

/* --------------------------------------------------------------------------
   Live telemetry
   -------------------------------------------------------------------------- */
function jitter(span) {
  return (Math.random() - 0.5) * span;
}

function sampleTemperature(truck) {
  const base = truck.tempBaseline + (truck.status === 'excursion' ? EXCURSION_DELTA_C : 0);
  return round1(base + jitter(0.5));
}

function liveTick() {
  state.trucks.forEach((truck) => {
    truck.tempCurrent = sampleTemperature(truck);
    truck.history.push(truck.tempCurrent);
    truck.history = truck.history.slice(-HISTORY_POINTS);
    truck.uplinkPing = clamp(Math.round(truck.uplinkPing + jitter(6)), 28, 72);
    if (truck.status === 'excursion') {
      truck.log.max = Math.max(truck.log.max, truck.tempCurrent);
    } else {
      truck.compressorRpm = truck.compressorNominalRpm + Math.round(jitter(40));
    }
  });
  renderShell();
  renderClient();
  renderFleet();
  renderDiagnostics();
  if (state.isExcursionActive) {
    renderCertificate();
  }
}

function etaTick() {
  state.trucks.forEach((truck) => {
    if (truck.eta !== null && truck.eta > 1) {
      truck.eta -= 1;
    }
  });
  renderClient();
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */
function handleClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  const roleButton = target.closest('[data-role-target]');
  if (roleButton) {
    setRole(roleButton.dataset.roleTarget);
    return;
  }

  const panelButton = target.closest('[data-panel-target]');
  if (panelButton) {
    setPanel(panelButton.dataset.panelTarget);
    return;
  }

  const consignmentButton = target.closest('[data-consignment]');
  if (consignmentButton) {
    selectConsignment(consignmentButton.dataset.consignment);
    return;
  }

  const truckButton = target.closest('[data-truck]');
  if (truckButton) {
    selectTruck(truckButton.dataset.truck);
    return;
  }

  const actionButton = target.closest('[data-action]');
  if (actionButton && !actionButton.disabled) {
    const action = ACTIONS[actionButton.dataset.action];
    if (action) {
      action();
    }
  }
}

function handleKeydown(event) {
  if (!state.certificateModalOpen) {
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCertificate();
    return;
  }
  if (event.key !== 'Tab') {
    return;
  }
  const focusable = all('button:not([disabled])', el.modal);
  if (focusable.length === 0) {
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  } else if (!el.modal.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  }
}
