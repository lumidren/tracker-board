# Maatora

Cold-chain temperature monitoring for goods in active transit. One mobile-first interface with two portals: a **client portal** that answers "is my shipment safe?" in plain words, and a **control room** that shows the fleet, the hardware and the paperwork behind that answer.

It runs three ways from the same code:

| Way | What you get |
| --- | --- |
| **With the server** | Real accounts, a database, role enforcement, live updates on every device |
| **As plain files** | An offline demo: the same engine runs inside the page with test data |
| **Android app** | The offline demo packaged as an installable app |

No framework, no build step for the web app, and **no dependencies anywhere**: the server uses only what ships with Node.

## Run it

**Server** (Node 22.13 or newer):

```bash
node server/server.js --demo
```

Open `http://localhost:4310`. `--demo` puts a list of test accounts on each sign-in page; leave it off and the accounts still exist but are not advertised. Add `--lan` to let phones on the same network connect; the server prints the address to use.

**Offline demo**: serve the folder with any static server, for example `python -m http.server 4180`.

**Tests**:

```bash
cd server && node --test
```

## Client portal

Written for someone who does not work in logistics.

- **My Shipments**: one card per shipment with a green, red, blue or grey icon and a sentence such as "On the road, arrives in about 42 minutes". The heading says whether everything is safe
- **Status**: one large answer ("Your shipment is safe"), the temperature now with "It should stay between ... and ...", when it arrives, how far it has gone, and a button for the certificate
- **Map**: the route with the truck's position, plus milestones and chain of custody
- **Documents**: the certificate status with one sentence explaining what it proves
- A client sees only shipments their organisation sent or is receiving, and **never any hardware or sensor diagnostics**

## Control room

- **Fleet**: summary tiles, filters (All, Attention, On the Road, Parked) and a card per unit with temperature, chiller power, uplink and hardware health
- **Map**: every unit on a map of the country; tap one for its details
- **Unit**: temperature trace, seven hardware health checks, trip (route, distance, speed, arrival), cargo and environment
- **Alerts**: every excursion with start, duration, peak reading and who acknowledged it
- **Controls**: incident drill, sensor normalize, certificate signing, the hash-chained audit log, and the account list for roles allowed to see it

### Roles

| Account | Can |
| --- | --- |
| Lead Quality Assurance Auditor | Run drills, acknowledge alerts, sign certificates |
| Fleet Dispatch Controller | Run drills, acknowledge alerts |
| Cold-Chain Regulatory Officer | Read only |
| Platform Administrator | Everything, plus the account list |
| Three consignors | Their own shipments |
| Three receiving depots | Shipments addressed to them |

Identifiers and demo passwords are in `data.js`.

## Certificate and verification

- Printable on one A4 page, in English or Arabic
- Every signed certificate carries a QR code generated in the page (byte mode, level M error correction, Reed-Solomon, automatic masking), cross-checked module for module against a reference encoder
- With the server, verification consults the **issuing registry**: it reports Verified, Not Current (suspended or replaced by a newer certificate), Not On Record, or Digest Mismatch
- Without the server it can only recompute the SHA-256 digest, which shows the fields were not altered but not who issued them

## How it is built

```
index.html   style.css   script.js      the interface: draws views, sends commands
engine.js                               the rules, with no screen attached
data.js                                 test dataset: 10 units, 10 routes, 10 accounts
server/                                 accounts, sessions, database, API, live stream
android/                                native shell that bundles the web files
```

`engine.js` is the centre. It owns telemetry, route progress, drills, alerts, signing, the audit chain and, most importantly, **what each kind of account is allowed to receive**. The server runs it as the source of truth; the offline demo runs the very same file in the browser. The interface cannot tell the difference: both sit behind one small backend interface in `script.js`.

### Security, with the server

- Passwords stored only as scrypt hashes with a per-account salt
- Sign-in answers identically for a wrong password and an unknown account, and spends the same time on both
- Five failed attempts lock an identifier for 30 seconds; a per-address limit backs that up
- Sessions are random 256-bit tokens kept only as hashes, in `HttpOnly`, `SameSite=Strict` cookies, with a 10 minute idle limit in the control room and 30 minutes for clients
- Writes must be JSON carrying a page-only header and a matching origin, so another site cannot submit them
- Roles are enforced in the engine, not in the page; a hidden button is a courtesy, not the control
- Client responses are built from an allow-list of fields, so hardware data cannot leak by omission
- Static files are an allow-list; the dataset sent to browsers has the accounts and units stripped out
- A strict Content-Security-Policy and the usual hardening headers on every response

Twenty-three tests cover these, including a restart that must continue an active drill from the database.

## Languages

English and Arabic, switched from the top bar and remembered per browser. Arabic uses a full right-to-left layout; identifiers, readings and maps keep their left-to-right order. Translations live in one table in `script.js` keyed by the English text.

## Android app

```bash
cd android && ./gradlew assembleDebug
```

Needs JDK 17 or 21 and the Android SDK (platform 35); produces `android/app/build/outputs/apk/debug/app-debug.apk` for Android 10 or newer. The app requests no permissions, prints certificates through Android's print service, and handles the back button and `maatora://verify/<record>` links. It runs the offline demo; to use the server from a phone, open the server's address in the phone's browser.

## Limits of this build

- **Telemetry is simulated.** The engine generates readings and moves units along their routes; no device is connected. Feeding it real sensor data is the next step.
- **The map is a schematic drawn from simplified outlines**, not a street map. It needs no internet and no map service, at the cost of detail.
- **Demo accounts have published passwords.** They are test data. A real deployment needs its own accounts, HTTPS in front of the server (`--secure-cookies`), and the `--demo` flag left off.
- **The offline demo and the Android app are not secure**, by design: everything runs in the page, including the accounts.
- **The Android app does not talk to the server yet.**
- **The Arabic has not been reviewed by a native speaker.**
- **Node's built-in SQLite is still marked experimental** and prints a warning at start-up.
