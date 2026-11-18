'use strict';

/* A stand-in for the tracker board. It talks to the server exactly the way the
   firmware will: its own key, batched readings, resend until acknowledged,
   and a buffer for when there is no connection.

   Register a tracker first, then run this with the key it printed:

     node server/devices.js add TRK-104 "Simulator"
     node tools/device-sim.js --key DEV-XXXXXX.secret --scenario all

   Options
     --key       the tracker key (required)
     --server    server address                     default http://localhost:4190
     --interval  seconds between readings           default 5
     --speed     how much faster than real time the unit drives   default 30
     --scenario  normal | door | warm | power-cut | offline | all   default normal */

const path = require('node:path');
const seed = require(path.join(__dirname, '..', 'data.js'));
const Engine = require(path.join(__dirname, '..', 'engine.js'));

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const key = option('key', '');
const server = option('server', 'http://localhost:4190').replace(/\/$/, '');
const intervalSeconds = Number(option('interval', 5));
const speedUp = Number(option('speed', 30));
const scenario = option('scenario', 'normal');

/* What happens at which reading, counted from the first one sent. */
const SCRIPTS = {
  normal: {},
  door: { door: [4, 7] },
  warm: { warm: [4, 10] },
  'power-cut': { powerCut: [4, 12] },
  offline: { offline: [4, 10] },
  all: { door: [3, 6], warm: [9, 15], powerCut: [18, 24], offline: [27, 32] }
};

if (!key || !SCRIPTS[scenario]) {
  console.error('Usage: node tools/device-sim.js --key <tracker key> [--scenario normal|door|warm|power-cut|offline|all]');
  process.exit(1);
}

const script = SCRIPTS[scenario];
const during = (name, tick) => Boolean(script[name]) && tick >= script[name][0] && tick < script[name][1];
const noise = (span) => (Math.random() - 0.5) * span;
const round = (value, digits) => Number(value.toFixed(digits));
const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function main() {
  const stateReply = await fetch(`${server}/api/device/state`, { headers });
  if (stateReply.status !== 200) {
    console.error(`The server refused this key (HTTP ${stateReply.status}). Register the tracker and try again.`);
    process.exit(1);
  }
  const state = await stateReply.json();
  /* Starting figures for this unit, taken from the same dataset the server uses. */
  const unit = Engine.createEngine(seed).state.trucks.find((truck) => truck.id === state.unit);

  let seq = state.lastSeq;
  let progress = unit.progress;
  let battery = 4.12;
  let warmth = 0;
  let tick = 0;
  const buffer = [];
  console.log(`Simulating the tracker on unit ${state.unit} (${unit.cargoShort}), scenario "${scenario}".`);
  console.log(`A reading every ${intervalSeconds} s; the unit drives ${speedUp} times faster than real time.\n`);

  async function step() {
    tick += 1;
    seq += 1;
    const moving = progress < 1;
    if (moving) {
      progress = Math.min(1, progress + ((unit.cruiseKmh * intervalSeconds * speedUp) / 3600) / unit.routeKm);
    }
    const [lon, lat] = Engine.pointAt(unit.routePoints, progress);

    /* Temperature drifts up past the limit, then recovers. */
    if (during('warm', tick)) {
      warmth = Math.min(warmth + 1.7, unit.tempMax - unit.tempBaseline + 4);
    } else {
      warmth = Math.max(0, warmth - 2.5);
    }
    const onBattery = during('powerCut', tick);
    battery = onBattery ? Math.max(3.3, battery - 0.012) : Math.min(4.12, battery + 0.02);

    const reading = {
      seq,
      at: Math.floor(Date.now() / 1000),
      temp: round(unit.tempBaseline + warmth + noise(0.4), 1),
      hum: Math.round(unit.humidity + noise(3)),
      doors: [false, during('door', tick)],
      lat: round(lat, 5),
      lon: round(lon, 5),
      speed: moving ? Math.round(unit.cruiseKmh + noise(8)) : 0,
      ign: moving,
      main: onBattery ? round(0.2 + Math.random() * 0.2, 1) : round(13.8 + noise(0.4), 1),
      batt: round(battery, 2),
      rssi: Math.round(unit.uplinkSignal + noise(6))
    };
    buffer.push(reading);

    const notes = [];
    if (reading.doors[1]) notes.push('door 2 OPEN');
    if (warmth > 0) notes.push('warming');
    if (onBattery) notes.push('MAIN POWER CUT');
    const line = `#${String(seq).padStart(4)}  ${String(reading.temp).padStart(6)} C  ${Math.round(progress * 100)}% of route  ${notes.join(', ')}`;

    if (during('offline', tick)) {
      console.log(`${line}   no signal, holding ${buffer.length} reading(s)`);
      return;
    }
    try {
      const reply = await fetch(`${server}/api/device/readings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ readings: buffer.slice(0, 200) })
      });
      if (reply.status !== 200) {
        console.log(`${line}   server answered HTTP ${reply.status}, holding ${buffer.length} reading(s)`);
        return;
      }
      const result = await reply.json();
      /* Drop everything the server has confirmed; anything else is sent again. */
      const sent = buffer.length;
      while (buffer.length > 0 && buffer[0].seq <= result.ack) {
        buffer.shift();
      }
      console.log(`${line}   sent ${sent}, accepted ${result.accepted}`);
    } catch (error) {
      console.log(`${line}   server unreachable, holding ${buffer.length} reading(s)`);
    }
  }

  await step();
  setInterval(step, intervalSeconds * 1000);
}

main().catch((error) => {
  console.error(`Could not reach ${server}: ${error.message}`);
  process.exit(1);
});
