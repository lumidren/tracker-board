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

  /* ------------------------------------------------------------------------
     Geography: points are [longitude, latitude]
     ------------------------------------------------------------------------ */
  function distanceKm(from, to) {
    const rad = (degrees) => (degrees * Math.PI) / 180;
    const dLat = rad(to[1] - from[1]);
    const dLon = rad(to[0] - from[0]);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from[1])) * Math.cos(rad(to[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
  }

  function routeLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      total += distanceKm(points[i - 1], points[i]);
    }
    return total;
  }

  /* The point a given fraction of the way along a route. */
  function pointAt(points, fraction) {
    const target = routeLength(points) * clamp(fraction, 0, 1);
    let walked = 0;
    for (let i = 1; i < points.length; i += 1) {
      const leg = distanceKm(points[i - 1], points[i]);
      if (walked + leg >= target || i === points.length - 1) {
        const share = leg === 0 ? 0 : clamp((target - walked) / leg, 0, 1);
        return [
          points[i - 1][0] + (points[i][0] - points[i - 1][0]) * share,
          points[i - 1][1] + (points[i][1] - points[i - 1][1]) * share
        ];
      }
      walked += leg;
    }
    return points[points.length - 1].slice();
  }

  /* ------------------------------------------------------------------------
     Shared formatting and rules
     ------------------------------------------------------------------------ */
  function fill(source, params) {
    if (!params) {
      return source;
    }
    return source.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
  }

  function plainTemp(value) {
    const rounded = round1(value);
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}°C`;
  }

  const isInSpec = (truck) => truck.tempCurrent >= truck.tempMin && truck.tempCurrent <= truck.tempMax;

  /* Seven hardware checks, each rated ok, warn or fault. */
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
      calibration: level(false, truck.calibrationDays > 30),
      firmware: 'ok'
    };
  }

  function healthOf(truck) {
    const checks = hardwareChecks(truck);
    const levels = Object.values(checks);
    return {
      checks,
      total: levels.length,
      faults: levels.filter((item) => item === 'fault').length,
      warnings: levels.filter((item) => item === 'warn').length
    };
  }

  /* The canonical record hashed when a certificate is signed, and hashed again
     by anyone verifying it. */
  function certificatePayload(truck, record) {
    return [
      truck.certificate.serial,
      truck.id,
      truck.consignmentId,
      truck.tempTarget,
      truck.tempMin,
      truck.tempMax,
      record.transitMinutes,
      record.min,
      record.max,
      record.excursions,
      record.doorOpenings,
      truck.sealId,
      new Date(record.signedAt).toISOString()
    ].join('|');
  }

  /* The text a QR code carries: unit, signing time, the audited figures, digest. */
  function verificationRecord(truck) {
    const cert = truck.certificate;
    if (cert.status !== 'valid' || !cert.hash || !cert.signedAt || !cert.record) {
      return '';
    }
    return [
      truck.id,
      cert.signedAt,
      cert.record.transitMinutes,
      cert.record.min,
      cert.record.max,
      cert.record.excursions,
      cert.record.doorOpenings,
      cert.hash.slice(0, DIGEST_LENGTH)
    ].join('~');
  }

  function parseVerificationRecord(text) {
    const parts = String(text || '').split('~');
    if (parts.length !== 8) {
      return null;
    }
    const numbers = parts.slice(1, 7).map(Number);
    const digest = parts[7].toLowerCase();
    if (numbers.some((value) => !Number.isFinite(value)) || !/^[0-9a-f]+$/.test(digest)
      || digest.length !== DIGEST_LENGTH || numbers[0] <= 0 || numbers[0] > 8640000000000000) {
      return null;
    }
    return {
      truckId: parts[0],
      digest,
      signedAt: numbers[0],
      transitMinutes: numbers[1],
      min: numbers[2],
      max: numbers[3],
      excursions: numbers[4],
      doorOpenings: numbers[5]
    };
  }

  /* What a client account may receive about a unit. Anything not listed here,
     including every hardware and sensor reading, never leaves the engine. */
  const CLIENT_FIELDS = [
    'id', 'vehicleClass', 'operator', 'consignmentId', 'cargo', 'cargoShort', 'pallets',
    'consignor', 'consignorDept', 'consignee', 'consigneeTerminal',
    'origin', 'originCity', 'destination', 'destinationCity', 'corridor',
    'routePoints', 'routeKm', 'remainingKm', 'progress', 'position', 'eta', 'routeStep', 'speedKmh',
    'departedAt', 'hubPassedAt', 'arrivedAt',
    'tempTarget', 'tempMin', 'tempMax', 'tempCurrent', 'history',
    'status', 'baseStatus', 'sealId'
  ];

  /* ------------------------------------------------------------------------
     Engine
     ------------------------------------------------------------------------ */
  function createEngine(seed, options) {
    const settings = options || {};
    const now = settings.now || Date.now;
    const random = settings.random || Math.random;
    const timeScale = settings.timeScale || 1;
    /* True on the server, whose registry decides whether a certificate is current. */
    const authoritative = Boolean(settings.authoritative);
    const jitter = (span) => (random() - 0.5) * span;

    const state = {
      trucks: [],
      alerts: [],
      audit: [],
      registry: [],
      drillTruckId: null,
      chain: GENESIS,
      auditSeq: 0,
      alertSeq: 0,
      lastTickAt: now(),
      minuteCarry: 0
    };

    const findTruck = (id) => state.trucks.find((truck) => truck.id === id);
    const fail = (error) => ({ ok: false, error });
    const done = () => ({ ok: true });

    function log(kind, source, params) {
      state.auditSeq += 1;
      const entry = { seq: state.auditSeq, time: now(), kind, source, params: params || null, digest: '' };
      entry.digest = sha256(`${state.chain}|${entry.seq}|${new Date(entry.time).toISOString()}|${fill(source, params)}`);
      state.chain = entry.digest;
      state.audit.push(entry);
      if (state.audit.length > AUDIT_KEEP) {
        state.audit.shift();
      }
      return entry;
    }

    /* Position, distance left, arrival estimate and route stage from progress. */
    function derive(truck) {
      const remaining = truck.routeKm * (1 - truck.progress);
      truck.position = pointAt(truck.routePoints, truck.progress).map((value) => Math.round(value * 1000) / 1000);
      truck.remainingKm = Math.round(remaining);
      if (truck.baseStatus === 'en-route') {
        truck.eta = Math.max(1, Math.ceil((remaining / truck.cruiseKmh) * 60 - 1e-6));
        truck.routeStep = truck.progress >= truck.hubAt ? 2 : 1;
      } else {
        truck.eta = null;
        truck.routeStep = truck.baseStatus === 'delivered' ? 4 : 0;
      }
    }

    function sampleTemperature(truck) {
      return round1(truck.tempBaseline + (truck.status === 'excursion' ? EXCURSION_DELTA_C : 0) + jitter(0.5));
    }

    function issue(truck, signedAt, signedBy) {
      const cert = truck.certificate;
      cert.status = 'valid';
      cert.signedAt = signedAt;
      cert.signedBy = signedBy;
      cert.record = {
        transitMinutes: truck.log.transitMinutes,
        min: truck.log.min,
        max: truck.log.max,
        excursions: truck.log.excursions,
        doorOpenings: truck.log.doorOpenings
      };
      cert.hash = sha256(certificatePayload(truck, { ...cert.record, signedAt }));
      state.registry.forEach((entry) => {
        if (entry.truckId === truck.id && entry.status !== 'superseded') {
          entry.status = 'superseded';
        }
      });
      state.registry.push({
        serial: cert.serial,
        truckId: truck.id,
        signedAt,
        signedBy,
        digest: cert.hash,
        status: 'current'
      });
    }

    function buildTruck(spec, index, startedAt) {
      const route = seed.routes[spec.route];
      const consignor = seed.orgs[spec.consignorOrg];
      const consignee = seed.orgs[spec.consigneeOrg];
      const lengthKm = routeLength(route.points);
      const moving = spec.baseStatus === 'en-route';
      const delivered = spec.baseStatus === 'delivered';

      let progress = 0;
      if (delivered) {
        progress = 1;
      } else if (moving) {
        progress = clamp(1 - ((spec.etaMinutes * spec.speedKmh) / 60) / lengthKm, 0.02, 0.98);
      }
      const departedAt = spec.baseStatus === 'standby' ? null : startedAt - spec.departedMinutesAgo * 60000;
      const arrivedAt = delivered ? startedAt - spec.arrivedMinutesAgo * 60000 : null;
      let transitMinutes = 0;
      if (delivered) {
        transitMinutes = spec.departedMinutesAgo - spec.arrivedMinutesAgo;
      } else if (moving) {
        transitMinutes = spec.departedMinutesAgo;
      }
      let hubPassedAt = null;
      if (delivered) {
        hubPassedAt = arrivedAt - Math.round(((1 - route.hubAt) * lengthKm / spec.speedKmh) * 3600000);
      } else if (moving && progress >= route.hubAt) {
        hubPassedAt = startedAt - Math.round((((progress - route.hubAt) * lengthKm) / spec.speedKmh) * 3600000);
      }

      const truck = {
        id: spec.id,
        vehicleClass: spec.vehicleClass,
        operator: spec.operator,
        consignmentId: spec.consignmentId,
        cargo: spec.cargo,
        cargoShort: spec.cargoShort,
        pallets: spec.pallets,
        consignorOrg: spec.consignorOrg,
        consigneeOrg: spec.consigneeOrg,
        consignor: consignor.name,
        consignorDept: consignor.dept,
        consignee: consignee.name,
        consigneeTerminal: consignee.terminal,
        origin: spec.originName,
        originCity: seed.places[spec.originPlace].name,
        destination: consignee.name,
        destinationCity: seed.places[spec.destinationPlace].name,
        corridor: route.corridor,
        routePoints: route.points,
        routeKm: lengthKm,
        hubAt: route.hubAt,
        progress,
        cruiseKmh: spec.speedKmh,
        speedKmh: moving ? spec.speedKmh : 0,
        departedAt,
        hubPassedAt,
        arrivedAt,
        tempTarget: spec.tempTarget,
        tempMin: spec.tempMin,
        tempMax: spec.tempMax,
        tempBaseline: spec.tempBaseline,
        tempCurrent: spec.tempBaseline,
        humidity: spec.humidity,
        ambientTemp: spec.ambientTemp,
        sealId: spec.sealId,
        sensorBattery: spec.sensorBattery,
        uplinkPing: spec.uplinkPing,
        uplinkPingBase: spec.uplinkPing,
        uplinkSignal: spec.uplinkSignal,
        compressorRpm: spec.compressorNominalRpm,
        compressorNominalRpm: spec.compressorNominalRpm,
        fuelPercent: spec.fuelPercent,
        firmware: spec.firmware,
        calibrationDays: spec.calibrationDays,
        status: spec.baseStatus,
        baseStatus: spec.baseStatus,
        history: [],
        log: {
          transitMinutes,
          min: spec.log.min,
          max: spec.log.max,
          excursions: 0,
          doorOpenings: 0
        },
        certificate: {
          serial: spec.certificate.serial,
          status: spec.certificate.status,
          signedAt: null,
          signedBy: null,
          hash: '',
          record: null
        }
      };
      truck.history = Array.from({ length: HISTORY_POINTS }, () => sampleTemperature(truck));
      truck.history[HISTORY_POINTS - 1] = truck.tempCurrent;
      derive(truck);
      if (spec.certificate.status === 'valid') {
        issue(truck, startedAt - (6 + index * 5) * 60000, 'Lead Quality Assurance Auditor');
      }
      return truck;
    }

    function seedState() {
      const startedAt = now();
      state.trucks = seed.trucks.map((spec, index) => buildTruck(spec, index, startedAt));
      (seed.pastAlerts || []).forEach((past) => {
        const started = startedAt - past.startedMinutesAgo * 60000;
        state.alertSeq += 1;
        state.alerts.push({
          id: `ALT-${String(state.alertSeq).padStart(4, '0')}`,
          truckId: past.truckId,
          kind: past.kind,
          startedAt: started,
          endedAt: started + past.lastedSeconds * 1000,
          peak: null,
          limit: null,
          acknowledgedAt: started + past.lastedSeconds * 1000 + 150000,
          acknowledgedBy: past.acknowledgedBy
        });
      });
      log('info', 'Telemetry session opened. {count} units reporting on 60 second sampling.', {
        count: state.trucks.length
      });
      state.trucks.forEach((truck) => {
        log('info', 'Electronic seal {seal} engaged on Unit {id}.', { seal: `#${truck.sealId}`, id: `#${truck.id}` });
      });
      state.trucks.filter((truck) => truck.certificate.status === 'valid').forEach((truck) => {
        log('sign', 'Certificate {serial} validated by {name}.', {
          serial: truck.certificate.serial,
          name: truck.certificate.signedBy
        });
      });
    }
    return {};
  }

  return {};
});
