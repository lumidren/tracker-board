# Maatora

Cold-chain temperature monitoring for goods in active transit. One mobile-first web app with two portals: a **client portal** that answers "is my cargo safe?" and a **control room** that shows the hardware behind that answer.

No framework, no build step, no dependencies: `index.html`, `style.css`, `script.js`.

## What it does

**Client portal** (consignor, shipper, receiving depot)

- Reassurance banner, live temperature against the permitted range, route corridor and ETA
- Four-stage route progress and a milestone timeline
- Official compliance certificate, printable on a single A4 page
- Scoped to the signed-in account's own consignments
- Never shows hardware or sensor diagnostics

**Control room** (dispatch and compliance controller)

- Fleet telemetry grid: chiller power, uplink and internal temperature per unit
- Hardware health: seven checks per unit (probe battery, uplink, compressor, reserve tank, tamper seal, calibration, firmware), each rated Nominal, Attention or Fault
- Incident drill: simulate a compressor failure and a +9.0 C excursion, normalize the sensor, then re-sign the certificate
- Hash-chained audit log covering drills, signatures and sign-in activity

**Access control**

- Separate sign-in page for each portal
- Five failed attempts lock the form for 30 seconds
- Idle sessions sign out automatically (10 minutes in the control room, 30 in the client portal)
- The certificate cannot be opened or printed while signed out

## Run it

Any static file server works. With Python:

```bash
python -m http.server 4180
```

Then open `http://localhost:4180`. Each sign-in page has a **Use Demo Credentials** button.

## Structure

| File | Role |
| --- | --- |
| `index.html` | Semantic markup, inline SVG icon sprite, certificate document |
| `style.css` | Design tokens, phone frame, glass dock, components, A4 print rules |
| `script.js` | Single state object, role and session logic, simulation, rendering |

There are no inline styles, inline scripts or emojis anywhere in the code.

## Limits of this build

This is a front-end prototype. Be clear about what is simulated:

- **Authentication runs in the browser.** Demo accounts ship inside `script.js`, so sign-in is a user-experience layer, not a security boundary. A production build needs a server that verifies credentials, issues sessions and returns only the data each role may see.
- **Telemetry is generated locally.** There is no device feed; a reload resets all state.
- **The certificate digest is a real SHA-256** of the certificate fields, but nothing signs or stores it server-side.
- **The verification block is a visual placeholder**, not a decodable QR code.
