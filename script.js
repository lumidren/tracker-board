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
