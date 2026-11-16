/* ==========================================================================
   Maatora | Engine
   The rules of the system with no screen attached: telemetry, route progress,
   incident drills, alerts, certificate signing, the audit chain, and what each
   kind of account is allowed to see. The server runs it as the source of truth;
   the browser runs the same code for the offline demo mode.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MaatoraEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EXCURSION_DELTA_C = 9;
  const HISTORY_POINTS = 32;
  const AUDIT_KEEP = 500;
  const AUDIT_VISIBLE = 40;
  const DIGEST_LENGTH = 32;
  const EARTH_RADIUS_KM = 6371;
  const GENESIS = 'MAATORA-AUDIT-GENESIS';
  const ROLE_ERROR = 'Your role does not allow this action.';

  const round1 = (value) => Math.round(value * 10) / 10;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  return {};
});
