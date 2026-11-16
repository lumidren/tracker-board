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

  /* ------------------------------------------------------------------------
     SHA-256 (synchronous, so the same code runs in a browser and in Node)
     ------------------------------------------------------------------------ */
  const SHA_PRIMES = [];
  for (let candidate = 2; SHA_PRIMES.length < 64; candidate += 1) {
    if (SHA_PRIMES.every((prime) => candidate % prime !== 0)) {
      SHA_PRIMES.push(candidate);
    }
  }
  const shaFraction = (value) => Math.floor((value - Math.floor(value)) * 4294967296) >>> 0;
  const SHA_K = SHA_PRIMES.map((prime) => shaFraction(Math.cbrt(prime)));
  const SHA_H = SHA_PRIMES.slice(0, 8).map((prime) => shaFraction(Math.sqrt(prime)));

  function sha256(text) {
    const bytes = new TextEncoder().encode(String(text));
    const rotr = (value, shift) => (value >>> shift) | (value << (32 - shift));
    const hash = SHA_H.slice();

    const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(bytes.length / 536870912));
    view.setUint32(padded.length - 4, (bytes.length << 3) >>> 0);

    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
      for (let i = 0; i < 16; i += 1) {
        w[i] = view.getUint32(offset + i * 4);
      }
      for (let i = 16; i < 64; i += 1) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = w[i - 16] + s0 + w[i - 7] + s1;
      }
      let [a, b, c, d, e, f, g, h] = hash;
      for (let i = 0; i < 64; i += 1) {
        const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const choice = (e & f) ^ (~e & g);
        const temp1 = (h + s1 + choice + SHA_K[i] + w[i]) >>> 0;
        const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (s0 + majority) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      [a, b, c, d, e, f, g, h].forEach((value, index) => {
        hash[index] = (hash[index] + value) >>> 0;
      });
    }
    return hash.map((value) => value.toString(16).padStart(8, '0')).join('');
  }
  return {};
});
