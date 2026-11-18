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
  /* A real excursion starts, and ends, only after this many readings in a row agree. */
  const CONFIRM_READINGS = 2;
  /* A tracker that has been quiet this long is reported as silent. */
  const SILENT_AFTER_MS = 5 * 60000;
  /* Below this the tracker has lost the vehicle supply and is on its backup battery. */
  const MAIN_SUPPLY_MIN_VOLTS = 6;
  const ARRIVAL_PROGRESS = 0.985;

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

  /* How far along a route (0 to 1) a reported position is, by its nearest point. */
  function fractionNear(points, point) {
    const squash = Math.cos((point[1] * Math.PI) / 180);
    const flat = (item) => [item[0] * squash, item[1]];
    const target = flat(point);
    const total = routeLength(points);
    let best = { distance: Infinity, travelled: 0 };
    let walked = 0;
    for (let i = 1; i < points.length; i += 1) {
      const start = flat(points[i - 1]);
      const end = flat(points[i]);
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const span = dx * dx + dy * dy;
      const share = span === 0 ? 0 : clamp(((target[0] - start[0]) * dx + (target[1] - start[1]) * dy) / span, 0, 1);
      const gapX = start[0] + dx * share - target[0];
      const gapY = start[1] + dy * share - target[1];
      const leg = distanceKm(points[i - 1], points[i]);
      const distance = gapX * gapX + gapY * gapY;
      if (distance < best.distance) {
        best = { distance, travelled: walked + leg * share };
      }
      walked += leg;
    }
    return total === 0 ? 0 : clamp(best.travelled / total, 0, 1);
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
      battery: truck.live && typeof truck.backupVolts === 'number'
        ? level(truck.backupVolts < 3.4, truck.backupVolts < 3.6)
        : level(truck.sensorBattery < 15, truck.sensorBattery < 35),
      uplink: level(Boolean(truck.silent) || truck.uplinkSignal < -105, truck.uplinkSignal < -95 || truck.uplinkPing > 150),
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
      if (!truck.fix) {
        truck.position = pointAt(truck.routePoints, truck.progress).map((value) => Math.round(value * 1000) / 1000);
      }
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
        /* Filled in once a real tracker reports for this unit. */
        live: false,
        fix: false,
        silent: false,
        reportedAt: null,
        receivedAt: null,
        doors: [],
        ignition: null,
        mainVolts: null,
        backupVolts: null,
        outsideRun: 0,
        insideRun: 0,
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
          drill: false,
          detail: null,
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

    /* One telemetry step. Called every few seconds by whoever hosts the engine. */
    function tick() {
      const time = now();
      const elapsed = clamp(time - state.lastTickAt, 0, 60000) * timeScale;
      state.lastTickAt = time;
      state.minuteCarry += elapsed;
      const minutes = Math.floor(state.minuteCarry / 60000);
      state.minuteCarry -= minutes * 60000;

      state.trucks.forEach((truck) => {
        truck.tempCurrent = sampleTemperature(truck);
        truck.history.push(truck.tempCurrent);
        truck.history = truck.history.slice(-HISTORY_POINTS);
        truck.uplinkPing = clamp(Math.round(truck.uplinkPing + jitter(6)), truck.uplinkPingBase - 12, truck.uplinkPingBase + 14);
        truck.humidity = clamp(Math.round(truck.humidity + jitter(1.6)), 20, 95);

        if (truck.status === 'excursion') {
          truck.log.max = Math.max(truck.log.max, truck.tempCurrent);
          const alert = state.alerts.find((item) => item.truckId === truck.id && item.kind === 'excursion' && !item.endedAt);
          if (alert) {
            alert.peak = Math.max(alert.peak, truck.tempCurrent);
          }
        } else {
          truck.compressorRpm = truck.compressorNominalRpm + Math.round(jitter(40));
        }

        if (truck.baseStatus === 'en-route') {
          const wasBeforeHub = truck.progress < truck.hubAt;
          truck.progress = Math.min(1, truck.progress + ((truck.cruiseKmh * elapsed) / 3600000) / truck.routeKm);
          truck.speedKmh = Math.max(0, Math.round(truck.cruiseKmh + jitter(8)));
          truck.log.transitMinutes += minutes;
          if (wasBeforeHub && truck.progress >= truck.hubAt) {
            truck.hubPassedAt = time;
            log('info', 'Unit {id} cleared the regional inspection hub.', { id: `#${truck.id}` });
          }
          if (truck.progress >= 1) {
            truck.baseStatus = 'delivered';
            truck.status = truck.status === 'excursion' ? 'excursion' : 'delivered';
            truck.arrivedAt = time;
            truck.speedKmh = 0;
            log('ok', 'Unit {id} arrived at {place}.', { id: `#${truck.id}`, place: truck.destination });
          }
        }
        derive(truck);
      });
    }

    /* Returns the reason a control room action is refused, or ''. */
    function denied(actor, permission) {
      const allowed = actor && actor.portal === 'admin' && Array.isArray(actor.permissions)
        && actor.permissions.includes(permission);
      return allowed ? '' : ROLE_ERROR;
    }

    const openAlerts = (truckId) => state.alerts.filter((alert) => alert.truckId === truckId && !alert.acknowledgedAt);

    /* The English reason signing is blocked for a unit, or ''. */
    function signBlock(truck) {
      if (truck.status === 'excursion') {
        return 'Signing is blocked while an excursion is active. Normalize the sensor first.';
      }
      if (truck.baseStatus === 'standby') {
        return 'Unit is on standby. There is no in-transit log to validate yet.';
      }
      if (!isInSpec(truck)) {
        return 'Signing is blocked while the reading is outside the permitted range.';
      }
      if (openAlerts(truck.id).length > 0) {
        return 'Acknowledge the open alert for this unit before signing.';
      }
      return '';
    }

    function triggerIncident(actor, truckId) {
      const refusal = denied(actor, 'drill');
      const truck = findTruck(truckId);
      if (refusal) {
        return fail(refusal);
      }
      if (!truck) {
        return fail('Unknown unit.');
      }
      if (state.drillTruckId) {
        return fail('A drill is already active. Normalize the sensor first.');
      }
      if (truck.baseStatus === 'delivered') {
        return fail('This unit has already delivered its cargo.');
      }
      if (truck.live) {
        return fail('Drills are not available on a unit that is reporting from a real tracker.');
      }
      const cert = truck.certificate;
      state.drillTruckId = truck.id;
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
      state.registry.forEach((entry) => {
        if (entry.truckId === truck.id && entry.status === 'current') {
          entry.status = 'suspended';
        }
      });

      state.alertSeq += 1;
      state.alerts.push({
        id: `ALT-${String(state.alertSeq).padStart(4, '0')}`,
        truckId: truck.id,
        kind: 'excursion',
        startedAt: now(),
        endedAt: null,
        peak: truck.tempCurrent,
        limit: truck.tempMax,
        drill: true,
        detail: null,
        acknowledgedAt: null,
        acknowledgedBy: null
      });
      log(
        'alert',
        'Incident drill started by {name}: compressor failure on Unit {id}. Internal temperature {temp} ({delta} excursion). Compliance violation flagged.',
        { name: actor.name, id: `#${truck.id}`, temp: plainTemp(truck.tempCurrent), delta: `+${EXCURSION_DELTA_C.toFixed(1)}°C` }
      );
      return done();
    }

    function normalizeSensor(actor) {
      const refusal = denied(actor, 'drill');
      if (refusal) {
        return fail(refusal);
      }
      const truck = findTruck(state.drillTruckId);
      if (!truck) {
        return fail('No drill is active.');
      }
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

      const alert = state.alerts.find((item) => item.truckId === truck.id && item.kind === 'excursion' && !item.endedAt);
      if (alert) {
        alert.endedAt = now();
      }
      state.drillTruckId = null;
      log(
        'ok',
        'Sensor normalized on Unit {id} by {name}. Telemetry back at baseline {temp}. Drill closed and excluded from the compliance record.',
        { id: `#${truck.id}`, name: actor.name, temp: plainTemp(truck.tempCurrent) }
      );
      return done();
    }

    function acknowledgeAlert(actor, alertId) {
      const refusal = denied(actor, 'acknowledge');
      if (refusal) {
        return fail(refusal);
      }
      const alert = state.alerts.find((item) => item.id === alertId);
      if (!alert) {
        return fail('Unknown alert.');
      }
      if (alert.acknowledgedAt) {
        return fail('This alert is already acknowledged.');
      }
      alert.acknowledgedAt = now();
      alert.acknowledgedBy = actor.name;
      log('ok', 'Alert {alert} on Unit {id} acknowledged by {name}.', {
        alert: alert.id,
        id: `#${alert.truckId}`,
        name: actor.name
      });
      return done();
    }

    function signCertificate(actor, truckId) {
      const refusal = denied(actor, 'sign');
      const truck = findTruck(truckId);
      if (refusal) {
        return fail(refusal);
      }
      if (!truck) {
        return fail('Unknown unit.');
      }
      const reason = signBlock(truck);
      if (reason) {
        return fail(reason);
      }
      issue(truck, now(), actor.name);
      log(
        'sign',
        'Certificate {serial} signed by {name}. Continuous log validated: {excursions} excursions, {openings} unauthorized openings.',
        {
          serial: truck.certificate.serial,
          name: actor.name,
          excursions: truck.log.excursions,
          openings: truck.log.doorOpenings
        }
      );
      return done();
    }

    /* --- Readings from a real tracker --- */
    function raiseAlert(truck, kind, time, extra) {
      state.alertSeq += 1;
      const alert = {
        id: `ALT-${String(state.alertSeq).padStart(4, '0')}`,
        truckId: truck.id,
        kind,
        startedAt: time,
        endedAt: null,
        peak: null,
        limit: null,
        drill: false,
        detail: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
        ...extra
      };
      state.alerts.push(alert);
      return alert;
    }

    function activeAlert(truckId, kind, detail) {
      return state.alerts.find(
        (alert) => alert.truckId === truckId && alert.kind === kind && !alert.endedAt
          && (detail === undefined || alert.detail === detail)
      );
    }

    function settleAlert(truckId, kind, time, detail) {
      const alert = activeAlert(truckId, kind, detail);
      if (alert) {
        alert.endedAt = time;
      }
    }

    function arrive(truck, time) {
      truck.baseStatus = 'delivered';
      truck.status = truck.status === 'excursion' ? 'excursion' : 'delivered';
      truck.progress = 1;
      truck.arrivedAt = time;
      truck.speedKmh = 0;
      log('ok', 'Unit {id} arrived at {place}.', { id: `#${truck.id}`, place: truck.destination });
    }

    /* A real excursion, unlike a drill, stays on the compliance record for good. */
    function readTemperature(truck, value, time) {
      truck.tempCurrent = round1(value);
      truck.history.push(truck.tempCurrent);
      truck.history = truck.history.slice(-HISTORY_POINTS);
      if (truck.baseStatus === 'en-route') {
        truck.log.min = Math.min(truck.log.min, truck.tempCurrent);
        truck.log.max = Math.max(truck.log.max, truck.tempCurrent);
      }
      const inside = isInSpec(truck);
      truck.outsideRun = inside ? 0 : truck.outsideRun + 1;
      truck.insideRun = inside ? truck.insideRun + 1 : 0;
      const tooWarm = truck.tempCurrent > truck.tempMax;
      const id = `#${truck.id}`;

      if (!inside && truck.status !== 'excursion' && truck.outsideRun >= CONFIRM_READINGS) {
        const limit = tooWarm ? truck.tempMax : truck.tempMin;
        truck.status = 'excursion';
        truck.log.excursions += 1;
        if (truck.certificate.status !== 'not-issued') {
          truck.certificate.status = 'hold';
          truck.certificate.hash = '';
        }
        state.registry.forEach((entry) => {
          if (entry.truckId === truck.id && entry.status === 'current') {
            entry.status = 'suspended';
          }
        });
        raiseAlert(truck, 'excursion', time, { peak: truck.tempCurrent, limit });
        log('alert', 'Temperature excursion on Unit {id}: {temp} against a {limit} limit. Compliance violation flagged.', {
          id,
          temp: plainTemp(truck.tempCurrent),
          limit: plainTemp(limit)
        });
      } else if (!inside && truck.status === 'excursion') {
        const alert = activeAlert(truck.id, 'excursion');
        if (alert && !alert.drill) {
          const worse = alert.limit === truck.tempMax ? truck.tempCurrent > alert.peak : truck.tempCurrent < alert.peak;
          alert.peak = worse ? truck.tempCurrent : alert.peak;
        }
      } else if (inside && truck.status === 'excursion' && truck.insideRun >= CONFIRM_READINGS
        && state.drillTruckId !== truck.id) {
        truck.status = truck.baseStatus;
        settleAlert(truck.id, 'excursion', time);
        if (truck.certificate.status === 'hold') {
          truck.certificate.status = 'revalidate';
        }
        log('ok', 'Temperature back in range on Unit {id} at {temp}. The excursion stays on the compliance record.', {
          id,
          temp: plainTemp(truck.tempCurrent)
        });
      }
    }

    function readPosition(truck, lon, lat, speed, time) {
      truck.fix = true;
      truck.position = [Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000];
      const along = fractionNear(truck.routePoints, [lon, lat]);
      if (truck.baseStatus === 'standby' && speed > 5 && along > 0.01) {
        truck.baseStatus = 'en-route';
        truck.status = truck.status === 'excursion' ? 'excursion' : 'en-route';
        truck.departedAt = time;
        log('info', 'Unit {id} departed from {place}.', { id: `#${truck.id}`, place: truck.origin });
      }
      if (truck.baseStatus !== 'en-route') {
        return;
      }
      const wasBeforeHub = truck.progress < truck.hubAt;
      truck.progress = Math.max(truck.progress, along);
      if (wasBeforeHub && truck.progress >= truck.hubAt) {
        truck.hubPassedAt = time;
        log('info', 'Unit {id} cleared the regional inspection hub.', { id: `#${truck.id}` });
      }
      if (truck.progress >= ARRIVAL_PROGRESS) {
        arrive(truck, time);
      }
    }

    function readDoors(truck, doors, time) {
      const id = `#${truck.id}`;
      doors.forEach((open, index) => {
        const door = index + 1;
        const wasOpen = Boolean(truck.doors[index]);
        if (open && !wasOpen) {
          if (truck.baseStatus === 'en-route') {
            truck.log.doorOpenings += 1;
            raiseAlert(truck, 'door', time, { detail: door });
            log('alert', 'Cargo door {door} opened in transit on Unit {id}.', { door, id });
          } else {
            log('info', 'Cargo door {door} opened on Unit {id}.', { door, id });
          }
        } else if (!open && wasOpen) {
          settleAlert(truck.id, 'door', time, door);
          log('info', 'Cargo door {door} closed on Unit {id}.', { door, id });
        }
      });
      truck.doors = doors.map(Boolean);
    }

    function readSupply(truck, volts, time) {
      const had = truck.mainVolts === null || truck.mainVolts >= MAIN_SUPPLY_MIN_VOLTS;
      const has = volts >= MAIN_SUPPLY_MIN_VOLTS;
      truck.mainVolts = round1(volts);
      if (had && !has) {
        raiseAlert(truck, 'power', time);
        log('alert', 'Main power cut on Unit {id}. The tracker is running on its backup battery.', { id: `#${truck.id}` });
      } else if (!had && has) {
        settleAlert(truck.id, 'power', time);
        log('ok', 'Main power restored on Unit {id}.', { id: `#${truck.id}` });
      }
    }

    /* Applies one reading sent by the tracker fitted to a unit. From the first
       reading on, the unit shows what the tracker measures, not simulated values. */
    function ingest(truckId, reading) {
      const truck = findTruck(truckId);
      if (!truck || !reading || typeof reading !== 'object') {
        return fail('Unknown unit.');
      }
      const time = now();
      const number = (value) => typeof value === 'number' && Number.isFinite(value);
      if (!truck.live) {
        truck.live = true;
        truck.speedKmh = 0;
        log('info', 'Unit {id} is now reporting from its tracker.', { id: `#${truck.id}` });
      }
      truck.receivedAt = time;
      truck.reportedAt = number(reading.at) ? reading.at * 1000 : time;
      if (truck.silent) {
        truck.silent = false;
        settleAlert(truck.id, 'silent', time);
        log('ok', 'Unit {id} is reporting again.', { id: `#${truck.id}` });
      }

      if (number(reading.hum)) {
        truck.humidity = Math.round(reading.hum);
      }
      if (number(reading.speed)) {
        truck.speedKmh = Math.round(reading.speed);
      }
      if (typeof reading.ign === 'boolean') {
        truck.ignition = reading.ign;
      }
      if (number(reading.rssi)) {
        truck.uplinkSignal = Math.round(reading.rssi);
      }
      if (number(reading.batt)) {
        truck.backupVolts = Math.round(reading.batt * 100) / 100;
      }
      if (number(reading.lat) && number(reading.lon)) {
        readPosition(truck, reading.lon, reading.lat, truck.speedKmh, time);
      }
      if (number(reading.temp)) {
        readTemperature(truck, reading.temp, time);
      }
      if (Array.isArray(reading.doors)) {
        readDoors(truck, reading.doors.slice(0, 4), time);
      }
      if (number(reading.main)) {
        readSupply(truck, reading.main, time);
      }
      derive(truck);
      return done();
    }

    function command(actor, name, payload) {
      const input = payload || {};
      switch (name) {
        case 'trigger-incident':
          return triggerIncident(actor, input.truckId);
        case 'normalize-sensor':
          return normalizeSensor(actor);
        case 'acknowledge-alert':
          return acknowledgeAlert(actor, input.alertId);
        case 'sign-certificate':
          return signCertificate(actor, input.truckId);
        default:
          return fail('Unknown action.');
      }
    }

    /* --- Views: what each kind of account receives --- */
    const publicUser = (actor) => ({
      id: actor.id,
      portal: actor.portal,
      name: actor.name,
      title: actor.title || '',
      permissions: actor.portal === 'admin' ? (actor.permissions || []).slice() : []
    });

    function certificateView(truck) {
      const cert = truck.certificate;
      return {
        serial: cert.serial,
        status: cert.status,
        signedAt: cert.signedAt,
        signedBy: cert.signedBy,
        hash: cert.hash,
        record: cert.record ? { ...cert.record } : null,
        verification: verificationRecord(truck)
      };
    }

    const logView = (truck) => ({
      transitMinutes: truck.log.transitMinutes,
      min: truck.log.min,
      max: truck.log.max,
      excursions: truck.log.excursions,
      doorOpenings: truck.log.doorOpenings
    });

    function clientTruck(truck) {
      const view = {};
      CLIENT_FIELDS.forEach((field) => {
        const value = truck[field];
        view[field] = Array.isArray(value) ? value.slice() : value;
      });
      view.log = logView(truck);
      view.certificate = certificateView(truck);
      return view;
    }

    function adminTruck(truck) {
      const view = { ...truck, history: truck.history.slice() };
      view.log = logView(truck);
      view.certificate = certificateView(truck);
      view.health = healthOf(truck);
      view.signBlock = signBlock(truck);
      view.openAlerts = openAlerts(truck.id).length;
      return view;
    }

    function visibleTo(actor, truck) {
      if (actor.portal === 'admin') {
        return true;
      }
      return actor.access === 'receiver' ? truck.consigneeOrg === actor.org : truck.consignorOrg === actor.org;
    }

    function snapshot(actor, extras) {
      const base = { time: now(), portal: actor.portal, user: publicUser(actor), excursionDelta: EXCURSION_DELTA_C };
      if (actor.portal !== 'admin') {
        return { ...base, trucks: state.trucks.filter((truck) => visibleTo(actor, truck)).map(clientTruck) };
      }
      const seesAccounts = (actor.permissions || []).includes('accounts');
      return {
        ...base,
        drillTruckId: state.drillTruckId,
        trucks: state.trucks.map(adminTruck),
        alerts: state.alerts.map((alert) => ({ ...alert })),
        audit: state.audit.slice(-AUDIT_VISIBLE).map((entry) => ({ ...entry })),
        auditCount: state.auditSeq,
        accounts: seesAccounts ? ((extras && extras.accounts) || []) : null
      };
    }

    /* Checks a scanned record. On the server the registry also has to agree. */
    function verify(text) {
      const record = parseVerificationRecord(text);
      const truck = record ? findTruck(record.truckId) : null;
      if (!record || !truck) {
        return { status: 'invalid' };
      }
      const result = {
        status: 'failed',
        source: authoritative ? 'registry' : 'digest',
        record,
        truck: {
          id: truck.id,
          vehicleClass: truck.vehicleClass,
          consignmentId: truck.consignmentId,
          cargo: truck.cargo,
          tempMin: truck.tempMin,
          tempMax: truck.tempMax,
          serial: truck.certificate.serial
        }
      };
      const digest = sha256(certificatePayload(truck, record)).slice(0, DIGEST_LENGTH);
      if (digest !== record.digest) {
        return result;
      }
      if (!authoritative) {
        result.status = 'verified';
        return result;
      }
      const entry = state.registry.find(
        (item) => item.truckId === truck.id && item.signedAt === record.signedAt
          && item.digest.slice(0, DIGEST_LENGTH) === record.digest
      );
      if (!entry) {
        result.status = 'unknown';
      } else {
        result.status = entry.status === 'current' ? 'verified' : 'revoked';
      }
      return result;
    }

    const accounts = () => seed.users.map((user) => ({
      id: user.id,
      portal: user.portal,
      identifier: user.identifier,
      name: user.name,
      title: user.title || '',
      permissions: (user.permissions || []).slice(),
      access: user.access || null
    }));

    const exportState = () => JSON.parse(JSON.stringify(state));

    function importState(saved) {
      Object.keys(state).forEach((key) => {
        if (saved && key in saved) {
          state[key] = JSON.parse(JSON.stringify(saved[key]));
        }
      });
      state.lastTickAt = now();
    }

    if (settings.restore) {
      importState(settings.restore);
    } else {
      seedState();
    }

    return { state, tick, command, ingest, log, snapshot, verify, accounts, exportState, importState, visibleTo };
  }

  return {
    createEngine,
    sha256,
    distanceKm,
    routeLength,
    pointAt,
    fractionNear,
    fill,
    plainTemp,
    hardwareChecks,
    parseVerificationRecord,
    EXCURSION_DELTA_C,
    DIGEST_LENGTH,
    ROLE_ERROR,
    CLIENT_FIELDS
  };
});
