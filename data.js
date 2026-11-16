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

  const p = (id) => places[id].at;

  const routes = {
    'cairo-alexandria': {
      corridor: 'Transit Corridor 4',
      hubAt: 0.85,
      points: [p('cairo'), [30.95, 30.2], [30.52, 30.38], [30.25, 30.62], [30.05, 30.95], p('alexandria')]
    },
    'cairo-mansoura': {
      corridor: 'Transit Corridor 7',
      hubAt: 0.7,
      points: [p('cairo'), [31.18, 30.46], [31.26, 30.72], p('mansoura')]
    },
    'portsaid-suez': {
      corridor: 'Transit Corridor 12',
      hubAt: 0.5,
      points: [p('portsaid'), [32.31, 30.85], p('ismailia'), [32.42, 30.3], p('suez')]
    },
    'cairo-asyut': {
      corridor: 'Transit Corridor 2',
      hubAt: 0.6,
      points: [p('cairo'), p('benisuef'), p('minya'), p('asyut')]
    },
    'cairo-portsaid': {
      corridor: 'Transit Corridor 5',
      hubAt: 0.6,
      points: [p('cairo'), [31.75, 30.3], p('ismailia'), [32.31, 30.85], p('portsaid')]
    },
    'alexandria-matruh': {
      corridor: 'Transit Corridor 9',
      hubAt: 0.5,
      points: [p('alexandria'), [28.95, 30.83], [28.1, 31.05], p('matruh')]
    },
    'suez-hurghada': {
      corridor: 'Transit Corridor 14',
      hubAt: 0.55,
      points: [p('suez'), [32.35, 29.6], [32.65, 29.0], [33.08, 28.36], p('hurghada')]
    },
    'tanta-cairo': {
      corridor: 'Transit Corridor 3',
      hubAt: 0.6,
      points: [p('tanta'), [31.18, 30.46], p('cairo')]
    },
    'mansoura-damietta': {
      corridor: 'Transit Corridor 8',
      hubAt: 0.5,
      points: [p('mansoura'), [31.6, 31.25], p('damietta')]
    },
    'asyut-luxor': {
      corridor: 'Transit Corridor 11',
      hubAt: 0.55,
      points: [p('asyut'), p('sohag'), p('qena'), p('luxor')]
    }
  };

  const orgs = {
    biopharma: {
      name: 'National Logistics & Biopharma Consignor S.A.E.',
      dept: 'Certified Pharmaceutical Logistics Dept.'
    },
    provisions: {
      name: 'National Cold-Chain Provisions Consignor S.A.E.',
      dept: 'Certified Food-Grade Logistics Dept.'
    },
    dairy: {
      name: 'Delta Dairy Cooperative S.A.E.',
      dept: 'Certified Dairy Logistics Dept.'
    },
    'depot-north': { name: 'Northern Regional Medical Depot #04', terminal: 'Regional Receiving Terminal #04' },
    'depot-delta': { name: 'Delta Regional Clinical Depot #02', terminal: 'Regional Receiving Terminal #02' },
    'pharmacy-upper': { name: 'Upper Egypt Pharmacy Network Depot #11', terminal: 'Regional Receiving Terminal #11' },
    'bloodbank-canal': { name: 'Canal Zone Blood Bank #03', terminal: 'Regional Receiving Terminal #03' },
    'coldstore-coastal': { name: 'Coastal Cold Storage Terminal #07', terminal: 'Regional Receiving Terminal #07' },
    'coldstore-west': { name: 'Western Coast Cold Store #05', terminal: 'Regional Receiving Terminal #05' },
    'hospitality-redsea': { name: 'Red Sea Hospitality Depot #08', terminal: 'Regional Receiving Terminal #08' },
    'retail-capital': { name: 'Capital Retail Distribution Hub #01', terminal: 'Regional Receiving Terminal #01' },
    'market-damietta': { name: 'Damietta Wholesale Market Depot #06', terminal: 'Regional Receiving Terminal #06' },
    'market-luxor': { name: 'Luxor Fresh Produce Terminal #09', terminal: 'Regional Receiving Terminal #09' }
  };

  /* Control room permissions: drill (run and close incident drills), acknowledge
     (acknowledge alerts), sign (issue certificates), accounts (see the account list).
     Client access: owner (shipments the organisation sent) or receiver (shipments
     addressed to it). */
  const users = [
    {
      id: 'admin-qa',
      portal: 'admin',
      identifier: 'QA-0104',
      password: 'Auditor-Demo-2026',
      name: 'Lead Quality Assurance Auditor',
      title: 'Quality Assurance',
      permissions: ['drill', 'acknowledge', 'sign']
    },
    {
      id: 'admin-dispatch',
      portal: 'admin',
      identifier: 'DSP-0211',
      password: 'Dispatch-Demo-2026',
      name: 'Fleet Dispatch Controller',
      title: 'Dispatch',
      permissions: ['drill', 'acknowledge']
    },
    {
      id: 'admin-regulator',
      portal: 'admin',
      identifier: 'REG-0007',
      password: 'Regulator-Demo-2026',
      name: 'Cold-Chain Regulatory Officer',
      title: 'Regulatory Affairs (Read Only)',
      permissions: []
    },
    {
      id: 'admin-platform',
      portal: 'admin',
      identifier: 'ADM-0001',
      password: 'Platform-Demo-2026',
      name: 'Platform Administrator',
      title: 'Administration',
      permissions: ['drill', 'acknowledge', 'sign', 'accounts']
    },
    {
      id: 'client-biopharma',
      portal: 'client',
      identifier: 'consignor@maatora.test',
      password: 'ColdChain-Demo-2026',
      name: 'National Logistics & Biopharma Consignor S.A.E.',
      title: 'Consignor',
      org: 'biopharma',
      access: 'owner'
    },
    {
      id: 'client-provisions',
      portal: 'client',
      identifier: 'provisions@maatora.test',
      password: 'FrozenDock-Demo-2026',
      name: 'National Cold-Chain Provisions Consignor S.A.E.',
      title: 'Consignor',
      org: 'provisions',
      access: 'owner'
    },
    {
      id: 'client-dairy',
      portal: 'client',
      identifier: 'dairy@maatora.test',
      password: 'Dairy-Demo-2026',
      name: 'Delta Dairy Cooperative S.A.E.',
      title: 'Consignor',
      org: 'dairy',
      access: 'owner'
    },
    {
      id: 'client-depot-north',
      portal: 'client',
      identifier: 'depot.north@maatora.test',
      password: 'DepotNorth-Demo-2026',
      name: 'Northern Regional Medical Depot #04',
      title: 'Receiving Depot',
      org: 'depot-north',
      access: 'receiver'
    },
    {
      id: 'client-depot-delta',
      portal: 'client',
      identifier: 'depot.delta@maatora.test',
      password: 'DepotDelta-Demo-2026',
      name: 'Delta Regional Clinical Depot #02',
      title: 'Receiving Depot',
      org: 'depot-delta',
      access: 'receiver'
    },
    {
      id: 'client-pharmacy',
      portal: 'client',
      identifier: 'pharmacy@maatora.test',
      password: 'Pharmacy-Demo-2026',
      name: 'Upper Egypt Pharmacy Network Depot #11',
      title: 'Receiving Depot',
      org: 'pharmacy-upper',
      access: 'receiver'
    }
  ];

  const trucks = [
    {
      id: 'TRK-104',
      vehicleClass: 'Heavy Refrigerated Rigid 26T',
      operator: 'Certified Transport Operator #104',
      consignmentId: 'BATCH-REF-8841-X',
      cargo: 'Pharmaceutical Vaccines (Ultra-Cold)',
      cargoShort: 'Vaccines',
      pallets: 12,
      consignorOrg: 'biopharma',
      consigneeOrg: 'depot-north',
      originName: 'Central Biopharma Distribution Hub',
      originPlace: 'cairo',
      destinationPlace: 'alexandria',
      route: 'cairo-alexandria',
      baseStatus: 'en-route',
      etaMinutes: 42,
      speedKmh: 72,
      departedMinutesAgo: 258,
      tempTarget: -20.0,
      tempMin: -24.0,
      tempMax: -18.0,
      tempBaseline: -21.5,
      humidity: 41,
      ambientTemp: 29,
      sealId: 'EGY-9921-X',
      sensorBattery: 96,
      uplinkPing: 42,
      uplinkSignal: -74,
      compressorNominalRpm: 1850,
      fuelPercent: 88,
      firmware: 'TLM-FW 4.2.1',
      calibrationDays: 14,
      log: { min: -22.1, max: -20.8 },
      certificate: { serial: 'REF-CERT-2026-8812-CC', status: 'valid' }
    },
    {
      id: 'TRK-208',
      vehicleClass: 'Medium Refrigerated Rigid 18T',
      operator: 'Certified Transport Operator #208',
      consignmentId: 'BATCH-REF-8856-K',
      cargo: 'Perishable Biologics (Chilled 2–8°C)',
      cargoShort: 'Perishable Biologics',
      pallets: 8,
      consignorOrg: 'biopharma',
      consigneeOrg: 'depot-delta',
      originName: 'Central Biopharma Distribution Hub',
      originPlace: 'cairo',
      destinationPlace: 'mansoura',
      route: 'cairo-mansoura',
      baseStatus: 'en-route',
      etaMinutes: 27,
      speedKmh: 58,
      departedMinutesAgo: 203,
      tempTarget: 4.0,
      tempMin: 2.0,
      tempMax: 8.0,
      tempBaseline: 3.2,
      humidity: 52,
      ambientTemp: 31,
      sealId: 'EGY-9934-K',
      sensorBattery: 91,
      uplinkPing: 58,
      uplinkSignal: -81,
      compressorNominalRpm: 1420,
      fuelPercent: 74,
      firmware: 'TLM-FW 4.2.1',
      calibrationDays: 9,
      log: { min: 2.8, max: 3.9 },
      certificate: { serial: 'REF-CERT-2026-8813-CC', status: 'valid' }
    },
    {
      id: 'TRK-315',
      vehicleClass: 'Heavy Refrigerated Articulated 40T',
      operator: 'Certified Transport Operator #315',
      consignmentId: 'BATCH-REF-8872-M',
      cargo: 'Frozen Seafood (Deep-Frozen)',
      cargoShort: 'Frozen Seafood',
      pallets: 22,
      consignorOrg: 'provisions',
      consigneeOrg: 'coldstore-coastal',
      originName: 'Origin Cold Dock B',
      originPlace: 'portsaid',
      destinationPlace: 'suez',
      route: 'portsaid-suez',
      baseStatus: 'standby',
      speedKmh: 64,
      tempTarget: -18.0,
      tempMin: -22.0,
      tempMax: -15.0,
      tempBaseline: -18.0,
      humidity: 63,
      ambientTemp: 27,
      sealId: 'EGY-9951-M',
      sensorBattery: 99,
      uplinkPing: 36,
      uplinkSignal: -69,
      compressorNominalRpm: 2100,
      fuelPercent: 97,
      firmware: 'TLM-FW 4.2.1',
      calibrationDays: 3,
      log: { min: -18.4, max: -17.6 },
      certificate: { serial: 'REF-CERT-2026-8814-CC', status: 'not-issued' }
    },
    {
      id: 'TRK-412',
      vehicleClass: 'Medium Refrigerated Rigid 18T',
      operator: 'Certified Transport Operator #412',
      consignmentId: 'BATCH-REF-8890-R',
      cargo: 'Insulin Supplies (Chilled 2–8°C)',
      cargoShort: 'Insulin',
      pallets: 6,
      consignorOrg: 'biopharma',
      consigneeOrg: 'pharmacy-upper',
      originName: 'Central Biopharma Distribution Hub',
      originPlace: 'cairo',
      destinationPlace: 'asyut',
      route: 'cairo-asyut',
      baseStatus: 'en-route',
      etaMinutes: 164,
      speedKmh: 82,
      departedMinutesAgo: 131,
      tempTarget: 5.0,
      tempMin: 2.0,
      tempMax: 8.0,
      tempBaseline: 4.6,
      humidity: 38,
      ambientTemp: 34,
      sealId: 'EGY-9968-R',
      sensorBattery: 84,
      uplinkPing: 64,
      /* Desert stretch: weak signal, rated Attention. */
      uplinkSignal: -98,
      compressorNominalRpm: 1380,
      fuelPercent: 61,
      firmware: 'TLM-FW 4.2.1',
      calibrationDays: 21,
      log: { min: 4.1, max: 5.3 },
      certificate: { serial: 'REF-CERT-2026-8815-CC', status: 'valid' }
    },
    {
      id: 'TRK-509',
      vehicleClass: 'Heavy Refrigerated Rigid 26T',
      operator: 'Certified Transport Operator #509',
      consignmentId: 'BATCH-REF-8903-P',
      cargo: 'Blood Plasma (Deep-Frozen)',
      cargoShort: 'Blood Plasma',
      pallets: 10,
      consignorOrg: 'biopharma',
      consigneeOrg: 'bloodbank-canal',
      originName: 'Central Biopharma Distribution Hub',
      originPlace: 'cairo',
      destinationPlace: 'portsaid',
      route: 'cairo-portsaid',
      baseStatus: 'en-route',
      etaMinutes: 96,
      speedKmh: 76,
      departedMinutesAgo: 74,
      tempTarget: -30.0,
      tempMin: -35.0,
      tempMax: -25.0,
      tempBaseline: -31.2,
      humidity: 35,
      ambientTemp: 30,
      sealId: 'EGY-9979-P',
      sensorBattery: 88,
      uplinkPing: 47,
      uplinkSignal: -77,
      compressorNominalRpm: 2240,
      /* Reserve tank running low, rated Attention. */
      fuelPercent: 26,
      firmware: 'TLM-FW 4.2.1',
      calibrationDays: 11,
      log: { min: -31.9, max: -30.4 },
      certificate: { serial: 'REF-CERT-2026-8816-CC', status: 'valid' }
    },
    {
      id: 'TRK-620',
      vehicleClass: 'Heavy Refrigerated Articulated 40T',
      operator: 'Certified Transport Operator #620',
      consignmentId: 'BATCH-REF-8917-F',
      cargo: 'Frozen Poultry (Deep-Frozen)',
      cargoShort: 'Frozen Poultry',
      pallets: 24,
      consignorOrg: 'provisions',
      consigneeOrg: 'coldstore-west',
      originName: 'Alexandria Frozen Goods Dock',
      originPlace: 'alexandria',
      destinationPlace: 'matruh',
      route: 'alexandria-matruh',
      baseStatus: 'en-route',
      etaMinutes: 118,
      speedKmh: 79,
      departedMinutesAgo: 92,
      tempTarget: -18.0,
      tempMin: -22.0,
      tempMax: -15.0,
      tempBaseline: -18.9,
      humidity: 58,
      ambientTemp: 26,
      sealId: 'EGY-9983-F',
      sensorBattery: 93,
      uplinkPing: 51,
      uplinkSignal: -83,
      compressorNominalRpm: 1960,
      fuelPercent: 69,
      firmware: 'TLM-FW 4.1.8',
      calibrationDays: 27,
      log: { min: -19.6, max: -18.2 },
      certificate: { serial: 'REF-CERT-2026-8817-CC', status: 'valid' }
    },
    {
      id: 'TRK-733',
      vehicleClass: 'Medium Refrigerated Rigid 18T',
      operator: 'Certified Transport Operator #733',
      consignmentId: 'BATCH-REF-8925-C',
      cargo: 'Ice Cream (Deep-Frozen)',
      cargoShort: 'Ice Cream',
      pallets: 9,
      consignorOrg: 'provisions',
      consigneeOrg: 'hospitality-redsea',
      originName: 'Suez Cold Port Terminal',
      originPlace: 'suez',
      destinationPlace: 'hurghada',
      route: 'suez-hurghada',
      baseStatus: 'en-route',
      etaMinutes: 203,
      speedKmh: 74,
      departedMinutesAgo: 66,
      tempTarget: -22.0,
      tempMin: -26.0,
      tempMax: -18.0,
      tempBaseline: -23.1,
      humidity: 44,
      ambientTemp: 33,
      sealId: 'EGY-9990-C',
      /* Probe battery due for replacement, rated Attention. */
      sensorBattery: 31,
      uplinkPing: 55,
      uplinkSignal: -86,
      compressorNominalRpm: 2020,
      fuelPercent: 57,
      firmware: 'TLM-FW 4.2.1',
      calibrationDays: 6,
      log: { min: -23.8, max: -22.5 },
      certificate: { serial: 'REF-CERT-2026-8818-CC', status: 'valid' }
    },
    {
      id: 'TRK-840',
      vehicleClass: 'Light Refrigerated Van 7.5T',
      operator: 'Certified Transport Operator #840',
      consignmentId: 'BATCH-REF-8931-D',
      cargo: 'Fresh Dairy (Chilled 1–5°C)',
      cargoShort: 'Fresh Dairy',
      pallets: 5,
      consignorOrg: 'dairy',
      consigneeOrg: 'retail-capital',
      originName: 'Tanta Dairy Collection Plant',
      originPlace: 'tanta',
      destinationPlace: 'cairo',
      route: 'tanta-cairo',
      baseStatus: 'delivered',
      speedKmh: 66,
      departedMinutesAgo: 171,
      arrivedMinutesAgo: 38,
      tempTarget: 3.0,
      tempMin: 1.0,
      tempMax: 5.0,
      tempBaseline: 2.8,
      humidity: 71,
      ambientTemp: 28,
      sealId: 'EGY-9996-D',
      sensorBattery: 79,
      uplinkPing: 39,
      uplinkSignal: -66,
      compressorNominalRpm: 1210,
      fuelPercent: 48,
      firmware: 'TLM-FW 4.2.1',
      calibrationDays: 17,
      log: { min: 2.3, max: 3.6 },
      certificate: { serial: 'REF-CERT-2026-8819-CC', status: 'valid' }
    },
    {
      id: 'TRK-951',
      vehicleClass: 'Light Refrigerated Van 7.5T',
      operator: 'Certified Transport Operator #951',
      consignmentId: 'BATCH-REF-8944-Y',
      cargo: 'Yoghurt & Cheese (Chilled 2–6°C)',
      cargoShort: 'Yoghurt & Cheese',
      pallets: 4,
      consignorOrg: 'dairy',
      consigneeOrg: 'market-damietta',
      originName: 'Mansoura Dairy Plant',
      originPlace: 'mansoura',
      destinationPlace: 'damietta',
      route: 'mansoura-damietta',
      baseStatus: 'en-route',
      etaMinutes: 31,
      speedKmh: 61,
      departedMinutesAgo: 47,
      tempTarget: 4.0,
      tempMin: 2.0,
      tempMax: 6.0,
      tempBaseline: 3.9,
      humidity: 68,
      ambientTemp: 27,
      sealId: 'EGY-9997-Y',
      sensorBattery: 95,
      uplinkPing: 44,
      uplinkSignal: -72,
      compressorNominalRpm: 1180,
      fuelPercent: 82,
      firmware: 'TLM-FW 4.2.1',
      calibrationDays: 4,
      log: { min: 3.4, max: 4.5 },
      certificate: { serial: 'REF-CERT-2026-8820-CC', status: 'valid' }
    },
    {
      id: 'TRK-067',
      vehicleClass: 'Medium Refrigerated Rigid 18T',
      operator: 'Certified Transport Operator #067',
      consignmentId: 'BATCH-REF-8958-G',
      cargo: 'Fresh Grade-A Perishables',
      cargoShort: 'Fresh Produce',
      pallets: 14,
      consignorOrg: 'provisions',
      consigneeOrg: 'market-luxor',
      originName: 'Asyut Produce Packing House',
      originPlace: 'asyut',
      destinationPlace: 'luxor',
      route: 'asyut-luxor',
      baseStatus: 'en-route',
      etaMinutes: 142,
      speedKmh: 77,
      departedMinutesAgo: 109,
      tempTarget: 7.0,
      tempMin: 4.0,
      tempMax: 10.0,
      tempBaseline: 6.4,
      humidity: 86,
      ambientTemp: 36,
      sealId: 'EGY-9999-G',
      sensorBattery: 90,
      uplinkPing: 61,
      uplinkSignal: -89,
      compressorNominalRpm: 1090,
      fuelPercent: 73,
      firmware: 'TLM-FW 4.2.1',
      calibrationDays: 19,
      log: { min: 5.8, max: 7.1 },
      certificate: { serial: 'REF-CERT-2026-8821-CC', status: 'valid' }
    }
  ];

  /* Events that happened before the session started, already acknowledged. */
  const pastAlerts = [
    { truckId: 'TRK-208', kind: 'uplink', startedMinutesAgo: 95, lastedSeconds: 38, acknowledgedBy: 'Lead Quality Assurance Auditor' },
    { truckId: 'TRK-733', kind: 'uplink', startedMinutesAgo: 41, lastedSeconds: 112, acknowledgedBy: 'Fleet Dispatch Controller' }
  ];

  return { places, geography, routes, orgs, users, trucks, pastAlerts };
});
