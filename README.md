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
- Incident drill: simulate a compressor failure and a +9.0 C excursion, normalize the sensor, acknowledge the alert, then re-sign the certificate
- Alert history: every excursion stays on record after it ends, with start time, duration, peak reading and who acknowledged it. A certificate cannot be re-signed while its unit has an unacknowledged alert
- Hash-chained audit log covering drills, acknowledgements, signatures and sign-in activity

**Certificate verification**

- Every signed certificate carries a real QR code, generated in the page with no library (byte mode, error correction level M, Reed-Solomon, automatic mask selection)
- Scanning it opens a public verification page that recomputes the SHA-256 digest from the fields in the code and reports whether they match
- Changing any field in the link (a reading, the excursion count, the signing time) makes verification fail

**Languages**

- English and Arabic, switched from the top bar and remembered per browser
- Arabic uses a full right-to-left layout; identifiers, readings and numeric scales keep their left-to-right order
- Translations live in one table in `script.js` keyed by the English text, so the markup needs no per-element keys

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
- **Verification proves integrity, not origin.** The QR code carries the record and its digest, so the page can show the fields were not altered after signing. It cannot show who issued them; that needs a server-side registry or a digital signature whose private key never reaches the browser.
- **A phone can only open the QR link if it can reach the address in it.** A code generated on `localhost` points at `localhost`; host the site, or open it through the computer's network address, before scanning from another device.
- **Alert history lasts for the session**, like the rest of the simulated state.
