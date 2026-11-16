/* ==========================================================================
   Maatora | Test dataset
   One source for the browser demo mode and for the server's first-run seed.
   Everything here is fictional test data. The passwords are demo values: the
   server stores only their hashes and never sends this file's accounts to a
   browser.
   ========================================================================== */
(function (root, factory) {
  const seed = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = seed;
  } else {
    root.MAATORA_SEED = seed;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Longitude, latitude. */
  const places = {
    cairo: { name: 'Cairo', at: [31.24, 30.04] },
    alexandria: { name: 'Alexandria', at: [29.92, 31.2] },
    mansoura: { name: 'Mansoura', at: [31.38, 31.04] },
    portsaid: { name: 'Port Said', at: [32.3, 31.26] },
    suez: { name: 'Suez', at: [32.55, 29.97] },
    ismailia: { name: 'Ismailia', at: [32.27, 30.6] },
    tanta: { name: 'Tanta', at: [31.0, 30.79] },
    damietta: { name: 'Damietta', at: [31.82, 31.42] },
    matruh: { name: 'Marsa Matruh', at: [27.24, 31.35] },
    benisuef: { name: 'Beni Suef', at: [31.1, 29.07] },
    minya: { name: 'Minya', at: [30.75, 28.1] },
    asyut: { name: 'Asyut', at: [31.18, 27.18] },
    sohag: { name: 'Sohag', at: [31.69, 26.56] },
    qena: { name: 'Qena', at: [32.72, 26.16] },
    luxor: { name: 'Luxor', at: [32.64, 25.69] },
    aswan: { name: 'Aswan', at: [32.9, 24.09] },
    hurghada: { name: 'Hurghada', at: [33.81, 27.26] }
  };
  return {};
});
