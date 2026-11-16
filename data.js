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

  /* Simplified outlines for the schematic map. */
  const geography = {
    land: [
      [25.0, 22.0], [25.0, 29.2], [24.7, 30.1], [25.15, 31.55], [27.24, 31.38], [28.95, 30.87],
      [29.92, 31.22], [30.42, 31.46], [31.1, 31.6], [31.82, 31.52], [32.3, 31.3], [33.1, 31.1],
      [34.22, 31.32], [34.9, 29.5], [34.45, 28.5], [34.25, 27.73], [33.6, 28.3], [33.2, 28.9],
      [32.9, 29.5], [32.57, 29.95], [32.4, 29.55], [32.75, 28.9], [33.15, 28.2], [33.55, 27.75],
      [33.85, 27.2], [34.3, 26.1], [34.95, 24.95], [35.5, 23.95], [35.9, 22.9], [36.9, 22.0]
    ],
    nile: [
      [32.9, 24.09], [32.9, 24.9], [32.64, 25.69], [32.72, 26.16], [32.1, 26.2], [31.69, 26.56],
      [31.18, 27.18], [30.82, 27.7], [30.75, 28.1], [30.95, 28.6], [31.1, 29.07], [31.25, 29.6],
      [31.24, 30.04], [31.12, 30.2]
    ],
    rosetta: [[31.12, 30.2], [30.85, 30.6], [30.75, 31.0], [30.42, 31.42]],
    damiettaBranch: [[31.12, 30.2], [31.2, 30.5], [31.3, 30.85], [31.55, 31.2], [31.82, 31.48]],
    labels: ['cairo', 'alexandria', 'portsaid', 'suez', 'asyut', 'luxor', 'aswan', 'hurghada', 'matruh']
  };
  return {};
});
