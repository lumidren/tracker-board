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
