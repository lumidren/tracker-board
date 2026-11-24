# How the tracker talks to the server

This is the contract between the board's firmware and the Maatora server. The server side is built and tested; `tools/device-sim.js` is a working example of a client that follows it.

## In one paragraph

Every tracker has its own key. It collects a reading about once a minute, keeps readings in flash, and uploads them in small batches over HTTPS. The server answers with the number of the last reading it has stored. The tracker deletes everything up to that number and keeps the rest to send again. Nothing is lost when there is no signal, and nothing is counted twice when a batch is sent again.

## The key

Register a tracker on the server. The key is printed once and only its hash is stored:

```bash
node server/devices.js add TRK-104 "Cab unit 1"
```

The key looks like `DEV-3F9A1C.<43 characters>`. Store it in the board's encrypted flash, one key per board. If a board is lost or stolen, stop accepting it with `node server/devices.js revoke DEV-3F9A1C`.

Send it on every request:

```
Authorization: Bearer DEV-3F9A1C.<secret>
```

## Start-up: ask where to continue

```
GET /api/device/state
```

```json
{ "unit": "TRK-104", "lastSeq": 1041, "time": 1794966000 }
```

- `lastSeq`: the last reading number the server has. A board whose flash was erased continues from `lastSeq + 1`.
- `time`: server time in Unix seconds, for setting the clock before the first GPS fix.

## Sending readings

```
POST /api/device/readings
Content-Type: application/json
```

```json
{
  "readings": [
    {
      "seq": 1042,
      "at": 1794966060,
      "temp": -21.4,
      "hum": 41,
      "doors": [false, false],
      "lat": 30.512,
      "lon": 30.41,
      "speed": 71,
      "ign": true,
      "main": 13.9,
      "batt": 4.05,
      "rssi": -74
    }
  ]
}
```

| Field | Meaning | Unit | Accepted range | Required |
| --- | --- | --- | --- | --- |
| `seq` | Reading number, rising by one each time, kept in flash | whole number | 1 and up | yes |
| `at` | When the reading was taken | Unix seconds | not more than 5 minutes ahead, not older than 7 days | recommended |
| `temp` | Cargo temperature. With several sensors, the warmest one (see [FIRMWARE.md](FIRMWARE.md)) | °C | -90 to 90 | |
| `hum` | Cargo humidity | % | 0 to 100 | |
| `doors` | Each door, `true` when open | up to four values | | |
| `lat`, `lon` | Position | degrees | valid coordinates | |
| `speed` | Speed | km/h | 0 to 250 | |
| `ign` | Ignition on | true or false | | |
| `main` | Vehicle supply voltage at the board | volts | 0 to 60 | |
| `batt` | Backup battery voltage | volts | 0 to 5 | |
| `rssi` | Mobile signal strength | dBm | -140 to 0 | |

Leave a field out when the board has no value for it. A value outside its range is ignored on its own; the rest of the reading is still used. A reading with no valid `seq` is rejected. A reading whose `at` is missing or outside the window is stamped with its arrival time.

The answer:

```json
{ "ack": 1042, "accepted": 1, "duplicates": 0, "rejected": 0, "time": 1794966061 }
```

Delete every stored reading numbered `ack` or lower. Keep the others and send them with the next batch.

| Status | Meaning | What the firmware does |
| --- | --- | --- |
| 200 | Stored | Delete up to `ack` |
| 400 | Empty batch, more than 200 readings, or not valid JSON | A firmware fault: log it, do not retry the same body forever |
| 401 | Key unknown or revoked | Stop sending, show a fault light |
| 413 | Body over 64 KB | Send fewer readings per batch |
| 415 | Not sent as JSON | A firmware fault |
| anything else, or no answer | Network or server trouble | Keep the readings, try again later with a growing delay |

## When to send

- Take a reading every 60 seconds.
- Upload every 5 minutes, up to 200 readings per request.
- Upload **immediately** when a door changes, when the vehicle supply drops or returns, or when the temperature leaves its range.
- Send at least one reading every few minutes even when nothing changes: after 5 minutes of silence the server reports the tracker as not reporting.

## What the server does with them

- **Temperature excursion:** two readings in a row outside the unit's range start an excursion; two in a row inside end it. It suspends the certificate and stays on the compliance record permanently.
- **Door opened in transit:** counted on the certificate and raised as an alert. A door opened before departure or after arrival is only logged.
- **Power cut:** `main` below 6 V means the board is running on its backup battery. Raised as an alert until the supply returns.
- **Position:** moves the unit along its route, marks departure when it starts moving, and marks arrival at the destination.

## Storage on the board

One reading a minute is 1,440 a day. Keep at least a week (about 10,000 readings). Store them in a compact binary form and build the JSON only when sending. Save `seq` in non-volatile storage every time it changes.

## Data use

A reading is about 170 bytes of JSON. Uploading five at a time every five minutes, with a new secure connection each time, comes to roughly 60 MB a month. Reusing the secure session between uploads brings that to about 15 to 20 MB. Sending every reading on its own new connection would use around 280 MB, so batch.

## Security the firmware must provide

- **Use HTTPS and check the server's certificate.** Without that check anyone on the network path can read the key and impersonate the tracker.
- Keep the key in encrypted flash and never print it on a debug port in production builds.
- One key per board. Never share a key between boards.

## Trying it without a board

```bash
node server/server.js --demo
node server/devices.js add TRK-951 "Simulator"
node tools/device-sim.js --key DEV-XXXXXX.<secret> --scenario all
```

Scenarios: `normal`, `door`, `warm`, `power-cut`, `offline`, `detour`, `stop`, `all`. Watch the unit in the control room while it runs. In `offline` the simulator holds readings and delivers them together when the signal returns.
