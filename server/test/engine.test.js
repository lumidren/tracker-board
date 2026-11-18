'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const seed = require('../../data.js');
const Engine = require('../../engine.js');

const user = (id) => seed.users.find((item) => item.id === id);
const auditor = user('admin-qa');
const dispatcher = user('admin-dispatch');
const regulator = user('admin-regulator');
const platform = user('admin-platform');
const consignor = user('client-biopharma');
const depot = user('client-depot-north');

function freshEngine(options = {}) {
  let clock = 1_800_000_000_000;
  const engine = Engine.createEngine(seed, {
    now: () => clock,
    random: () => 0.5,
    ...options
  });
  return { engine, advance: (ms) => { clock += ms; } };
}

test('sha256 matches the platform implementation', () => {
  ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(1000), 'شهادة'].forEach((text) => {
    assert.equal(Engine.sha256(text), crypto.createHash('sha256').update(text).digest('hex'));
  });
});

test('seed produces the documented first unit', () => {
  const { engine } = freshEngine();
  const truck = engine.state.trucks.find((item) => item.id === 'TRK-104');
  assert.equal(engine.state.trucks.length, 10);
  assert.equal(truck.eta, 42);
  assert.equal(truck.tempCurrent, -21.5);
  assert.equal(truck.routeStep, 1);
  assert.equal(truck.certificate.status, 'valid');
  assert.match(truck.certificate.hash, /^[0-9a-f]{64}$/);
});

test('a client receives only its own units and no hardware data', () => {
  const { engine } = freshEngine();
  const view = engine.snapshot(consignor);
  const hardware = [
    'sensorBattery', 'uplinkPing', 'uplinkPingBase', 'uplinkSignal', 'compressorRpm', 'compressorNominalRpm',
    'fuelPercent', 'firmware', 'calibrationDays', 'humidity', 'ambientTemp', 'health', 'signBlock'
  ];
  assert.deepEqual(view.trucks.map((truck) => truck.id).sort(), ['TRK-104', 'TRK-208', 'TRK-412', 'TRK-509']);
  view.trucks.forEach((truck) => {
    hardware.forEach((field) => assert.equal(field in truck, false, `${field} leaked to a client`));
  });
  assert.equal('alerts' in view, false);
  assert.equal('audit' in view, false);
  assert.equal('accounts' in view, false);
  assert.equal(/battery|dBm|rpm|firmware/i.test(JSON.stringify(view)), false);
});

test('a receiving depot sees only shipments addressed to it', () => {
  const { engine } = freshEngine();
  assert.deepEqual(engine.snapshot(depot).trucks.map((truck) => truck.id), ['TRK-104']);
});

test('the control room sees every unit with health and the audit log', () => {
  const { engine } = freshEngine();
  const view = engine.snapshot(auditor);
  assert.equal(view.trucks.length, 10);
  assert.equal(view.trucks.find((truck) => truck.id === 'TRK-412').health.warnings, 1);
  assert.equal(view.trucks.find((truck) => truck.id === 'TRK-104').health.faults, 0);
  assert.ok(view.audit.length > 0);
  assert.equal(view.accounts, null);
  assert.ok(Array.isArray(engine.snapshot(platform, { accounts: [] }).accounts));
});

test('roles limit control room actions', () => {
  const { engine } = freshEngine();
  assert.equal(engine.command(regulator, 'trigger-incident', { truckId: 'TRK-104' }).error, Engine.ROLE_ERROR);
  assert.equal(engine.command(consignor, 'trigger-incident', { truckId: 'TRK-104' }).error, Engine.ROLE_ERROR);
  assert.equal(engine.command(dispatcher, 'sign-certificate', { truckId: 'TRK-104' }).error, Engine.ROLE_ERROR);
  assert.equal(engine.command(dispatcher, 'trigger-incident', { truckId: 'TRK-104' }).ok, true);
});

test('drill, normalize, acknowledge, sign', () => {
  const { engine, advance } = freshEngine();
  const truck = () => engine.state.trucks.find((item) => item.id === 'TRK-104');
  const firstHash = truck().certificate.hash;

  assert.equal(engine.command(auditor, 'trigger-incident', { truckId: 'TRK-104' }).ok, true);
  assert.equal(truck().status, 'excursion');
  assert.equal(truck().tempCurrent, -12.5);
  assert.equal(truck().certificate.status, 'hold');
  assert.equal(engine.snapshot(auditor).trucks.find((item) => item.id === 'TRK-104').health.faults, 1);
  assert.equal(engine.command(auditor, 'trigger-incident', { truckId: 'TRK-208' }).ok, false);
  assert.equal(engine.command(auditor, 'sign-certificate', { truckId: 'TRK-104' }).ok, false);

  advance(120000);
  assert.equal(engine.command(auditor, 'normalize-sensor').ok, true);
  assert.equal(truck().status, 'en-route');
  assert.equal(truck().certificate.status, 'revalidate');
  assert.equal(truck().log.excursions, 0);

  const blocked = engine.command(auditor, 'sign-certificate', { truckId: 'TRK-104' });
  assert.equal(blocked.error, 'Acknowledge the open alert for this unit before signing.');
  const alert = engine.state.alerts.find((item) => item.truckId === 'TRK-104' && item.kind === 'excursion');
  assert.equal(alert.endedAt - alert.startedAt, 120000);
  assert.equal(engine.command(auditor, 'acknowledge-alert', { alertId: alert.id }).ok, true);

  advance(1000);
  assert.equal(engine.command(auditor, 'sign-certificate', { truckId: 'TRK-104' }).ok, true);
  assert.equal(truck().certificate.status, 'valid');
  assert.notEqual(truck().certificate.hash, firstHash);
  assert.equal(truck().certificate.signedBy, auditor.name);
});

test('verification follows the registry on the server', () => {
  const { engine, advance } = freshEngine({ authoritative: true });
  const record = () => engine.snapshot(auditor).trucks.find((item) => item.id === 'TRK-104').certificate.verification;
  const original = record();

  assert.equal(engine.verify(original).status, 'verified');
  assert.equal(engine.verify(original.replace('~-20.8~', '~-19.9~')).status, 'failed');
  assert.equal(engine.verify('not a record').status, 'invalid');
  assert.equal(engine.verify(original.replace('TRK-104', 'TRK-999')).status, 'invalid');

  engine.command(auditor, 'trigger-incident', { truckId: 'TRK-104' });
  assert.equal(engine.verify(original).status, 'revoked');
  advance(5000);
  engine.command(auditor, 'normalize-sensor');
  engine.command(auditor, 'acknowledge-alert', { alertId: engine.state.alerts.at(-1).id });
  engine.command(auditor, 'sign-certificate', { truckId: 'TRK-104' });
  assert.equal(engine.verify(original).status, 'revoked');
  assert.equal(engine.verify(record()).status, 'verified');
});

test('without a registry a consistent record verifies by digest', () => {
  const { engine } = freshEngine();
  const record = engine.snapshot(auditor).trucks.find((item) => item.id === 'TRK-208').certificate.verification;
  const result = engine.verify(record);
  assert.equal(result.status, 'verified');
  assert.equal(result.source, 'digest');
});

test('ticks move units along their route and keep the audit chain linked', () => {
  const { engine, advance } = freshEngine();
  const before = engine.state.trucks.find((item) => item.id === 'TRK-951').progress;
  for (let i = 0; i < 30; i += 1) {
    advance(60000);
    engine.tick();
  }
  const truck = engine.state.trucks.find((item) => item.id === 'TRK-951');
  assert.ok(truck.progress > before);
  assert.equal(truck.eta, 1);
  for (let i = 0; i < 5; i += 1) {
    advance(60000);
    engine.tick();
  }
  assert.equal(truck.baseStatus, 'delivered');
  assert.equal(truck.routeStep, 4);

  let chain = 'MAATORA-AUDIT-GENESIS';
  engine.state.audit.forEach((entry) => {
    const expected = Engine.sha256(
      `${chain}|${entry.seq}|${new Date(entry.time).toISOString()}|${Engine.fill(entry.source, entry.params)}`
    );
    assert.equal(entry.digest, expected);
    chain = entry.digest;
  });
});

test('state survives export and restore', () => {
  const { engine } = freshEngine({ authoritative: true });
  engine.command(auditor, 'trigger-incident', { truckId: 'TRK-509' });
  const restored = Engine.createEngine(seed, { restore: engine.exportState(), authoritative: true });
  assert.equal(restored.state.drillTruckId, 'TRK-509');
  assert.equal(restored.state.audit.length, engine.state.audit.length);
  assert.equal(restored.command(auditor, 'normalize-sensor').ok, true);
});

/* --- Readings from a real tracker --- */
const unit = (engine, id) => engine.state.trucks.find((item) => item.id === id);

test('tracker readings replace simulated values and survive the tick', () => {
  const { engine, advance } = freshEngine();
  assert.equal(engine.ingest('TRK-999', { temp: 1 }).ok, false);
  assert.equal(engine.ingest('TRK-208', { at: 1_800_000_000, temp: 3.6, hum: 55, rssi: -70, batt: 4.02, ign: true }).ok, true);
  const truck = unit(engine, 'TRK-208');
  assert.equal(truck.live, true);
  assert.equal(truck.tempCurrent, 3.6);
  advance(4000);
  engine.tick();
  assert.equal(truck.tempCurrent, 3.6);
  assert.equal(truck.humidity, 55);
  assert.equal(truck.backupVolts, 4.02);
});

test('a real excursion needs two readings, holds the certificate and stays on record', () => {
  const { engine, advance } = freshEngine({ authoritative: true });
  const truck = unit(engine, 'TRK-208');
  const record = engine.snapshot(auditor).trucks.find((item) => item.id === 'TRK-208').certificate.verification;

  engine.ingest('TRK-208', { temp: 9.4 });
  assert.equal(truck.status, 'en-route', 'one stray reading must not raise an excursion');
  advance(60000);
  engine.ingest('TRK-208', { temp: 10.1 });
  assert.equal(truck.status, 'excursion');
  assert.equal(truck.certificate.status, 'hold');
  assert.equal(truck.log.excursions, 1);
  assert.equal(engine.verify(record).status, 'revoked');
  const alert = engine.state.alerts.at(-1);
  assert.deepEqual([alert.kind, alert.drill, alert.limit, alert.peak], ['excursion', false, 8, 10.1]);

  advance(60000);
  engine.ingest('TRK-208', { temp: 11.3 });
  assert.equal(alert.peak, 11.3);
  engine.ingest('TRK-208', { temp: 5 });
  assert.equal(truck.status, 'excursion');
  engine.ingest('TRK-208', { temp: 4.2 });
  assert.equal(truck.status, 'en-route');
  assert.equal(truck.certificate.status, 'revalidate');
  assert.equal(truck.log.excursions, 1, 'a real excursion is not erased when the temperature recovers');
  assert.equal(truck.log.max, 11.3);
  assert.ok(alert.endedAt);

  assert.equal(engine.command(auditor, 'sign-certificate', { truckId: 'TRK-208' }).ok, false);
  engine.command(auditor, 'acknowledge-alert', { alertId: alert.id });
  assert.equal(engine.command(auditor, 'sign-certificate', { truckId: 'TRK-208' }).ok, true);
  assert.equal(truck.certificate.record.excursions, 1);
});

test('door openings in transit are counted; a power cut raises and clears', () => {
  const { engine, advance } = freshEngine();
  const moving = unit(engine, 'TRK-104');
  const parked = unit(engine, 'TRK-315');

  engine.ingest('TRK-104', { doors: [false, false], main: 13.8 });
  engine.ingest('TRK-104', { doors: [false, true], main: 13.8 });
  assert.equal(moving.log.doorOpenings, 1);
  const door = engine.state.alerts.at(-1);
  assert.deepEqual([door.kind, door.detail, door.endedAt], ['door', 2, null]);
  advance(30000);
  engine.ingest('TRK-104', { doors: [false, false], main: 13.8 });
  assert.equal(door.endedAt - door.startedAt, 30000);

  engine.ingest('TRK-315', { doors: [true] });
  assert.equal(parked.log.doorOpenings, 0, 'loading at the dock is not an in-transit opening');
  assert.equal(engine.state.alerts.filter((item) => item.truckId === 'TRK-315').length, 0);

  engine.ingest('TRK-104', { main: 0.3, batt: 3.9 });
  const power = engine.state.alerts.at(-1);
  assert.deepEqual([power.kind, power.endedAt], ['power', null]);
  engine.ingest('TRK-104', { main: 14.1 });
  assert.ok(power.endedAt);
});

test('a quiet tracker is flagged silent and recovers', () => {
  const { engine, advance } = freshEngine();
  engine.ingest('TRK-509', { temp: -31 });
  advance(4 * 60000);
  engine.tick();
  assert.equal(unit(engine, 'TRK-509').silent, false);
  advance(2 * 60000);
  engine.tick();
  assert.equal(unit(engine, 'TRK-509').silent, true);
  assert.equal(engine.snapshot(auditor).trucks.find((item) => item.id === 'TRK-509').health.checks.uplink, 'fault');
  const alert = engine.state.alerts.at(-1);
  assert.equal(alert.kind, 'silent');
  engine.ingest('TRK-509', { temp: -31 });
  assert.equal(unit(engine, 'TRK-509').silent, false);
  assert.ok(alert.endedAt);
});

test('position reports move the unit along its route and deliver it', () => {
  const { engine } = freshEngine();
  const truck = unit(engine, 'TRK-315');
  const [start, , middle, , end] = truck.routePoints;
  assert.equal(truck.baseStatus, 'standby');
  engine.ingest('TRK-315', { lon: start[0], lat: start[1], speed: 0 });
  assert.equal(truck.baseStatus, 'standby');
  engine.ingest('TRK-315', { lon: middle[0], lat: middle[1], speed: 62 });
  assert.equal(truck.baseStatus, 'en-route');
  assert.ok(truck.progress > 0.4 && truck.progress < 0.7);
  assert.deepEqual(truck.position, [middle[0], middle[1]]);
  engine.ingest('TRK-315', { lon: end[0], lat: end[1], speed: 10 });
  assert.equal(truck.baseStatus, 'delivered');
  assert.equal(truck.routeStep, 4);
});

test('drills are refused on live units and clients gain no tracker fields', () => {
  const { engine } = freshEngine();
  engine.ingest('TRK-104', { temp: -21, main: 13.9, batt: 4.1, doors: [false], rssi: -80 });
  assert.equal(engine.command(auditor, 'trigger-incident', { truckId: 'TRK-104' }).ok, false);
  const truck = engine.snapshot(consignor).trucks.find((item) => item.id === 'TRK-104');
  ['live', 'silent', 'doors', 'ignition', 'mainVolts', 'backupVolts', 'receivedAt'].forEach((field) => {
    assert.equal(field in truck, false, `${field} leaked to a client`);
  });
});

test('a state saved before trackers existed still loads', () => {
  const { engine } = freshEngine();
  const old = engine.exportState();
  old.trucks.forEach((truck) => {
    ['live', 'fix', 'silent', 'doors', 'ignition', 'mainVolts', 'backupVolts', 'receivedAt', 'reportedAt'].forEach((field) => {
      delete truck[field];
    });
  });
  old.alerts.forEach((alert) => {
    delete alert.drill;
    delete alert.detail;
  });
  const restored = Engine.createEngine(seed, { restore: old });
  const truck = restored.snapshot(auditor).trucks[0];
  assert.deepEqual([truck.live, truck.doors, truck.mainVolts], [false, [], null]);
  assert.equal(restored.state.alerts[0].drill, false);
  assert.equal(restored.ingest('TRK-104', { doors: [false, true] }).ok, true);
});
