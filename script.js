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
