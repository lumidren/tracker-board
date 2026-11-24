# What the firmware has to do

**Status:** no firmware exists for either board. This page is the brief for whoever writes it. It lists what follows from the hardware, with the timings and formulas the design depends on. Figures marked *check* come from memory of a manual and must be confirmed before use.

Two documents sit beside this one: [SENSOR-BUS.md](SENSOR-BUS.md) for the cable between the boards, and [PROTOCOL.md](PROTOCOL.md) for the tracker's reports to the server. `tools/device-sim.js` in the repository plays the tracker's part against the server and is the quickest reference for the second.

## Tracker (ESP32-S3)

Every pin is listed in [tracker/pin-map.md](tracker/pin-map.md).

### What is on at start

When the processor starts, every switchable supply is off: resistors hold `MODEM_PWR_EN`, `5V_SW_EN`, `MODEM_DISCHARGE` and the power-key transistor low. The firmware decides what to turn on.

### Measuring voltages

Use the chip's calibration and average a few samples. Pick the narrowest input range that covers each signal: the error of the widest range is about ±50 mV, which the 22× dividers turn into ±1.1 V.

| Signal | Pin | Range | Formula | Use |
| --- | --- | --- | --- | --- |
| Vehicle supply | GPIO 5 | the one reaching about 1.6 V (covers 35 V) | pin volts × 22.28 | Sent as `main`. Below 6 V means the truck supply is gone |
| Ignition line | GPIO 4 | the same | pin volts × 22.23 | Sent as `ign`. On above 8 V, off below 5 V: the gap stops it flickering |
| Backup cell | GPIO 6 | the widest | pin volts × 2 | Sent as `batt` |

Expected accuracy is about ±0.5 V for the supply and ignition and ±0.15 V for the cell, including the resistor tolerances.

`CHG_STAT` on GPIO 41 is not a plain "charging" signal. It is low during the first charge after vehicle power returns, and while charging waits for the cell to warm up or cool down. It is high when charging is done, during later top-up charges and without vehicle power. Toggling at about 2 Hz means the charger's safety timer ran out (with the 9-hour timer this should not happen); only removing vehicle power clears it. Sample it fast enough to see 2 Hz, and judge the real charge state from the cell voltage.

### The switched 5 V rail: GNSS and sensor cable

- `5V_SW_EN` (GPIO 15) high starts the 5 V converter and turns on the current-limited switch to the GNSS module and the sensor cable.
- Wait 300 ms before questioning the modules. While the rail is off, ignore the RS-485 receive line: its idle bias comes from this rail.
- `CABLE_FAULT_N` (GPIO 35) goes low when the switch has turned off on a short or an overload. Set `5V_SW_EN` low, wait a second, try once more; if it faults again, keep the rail off, report it and light the status pattern for a sensor fault. The GNSS module is on the same rail, so a cable short also costs the position until it is cleared.
- Before switching the rail off, set the GNSS transmit pin (GPIO 17) low or to an input. A 470 Ω resistor limits the current if this is forgotten, but the module should not be fed through its data pin.

### The modem (A7670E)

Timings from the SIMCom hardware guide:

| Step | What to do |
| --- | --- |
| Supply on | `MODEM_DISCHARGE` (GPIO 37) low, then `MODEM_PWR_EN` (GPIO 40) high. Wait 100 ms; `MODEM_PG` (GPIO 36) goes high when 3.8 V is there |
| Power on | `MODEM_PWRKEY` (GPIO 38) high for 100 ms, then low. The transistor presses the key for you; the guide gives 50 ms as the typical press |
| Ready | `MODEM_STATUS_N` (GPIO 39) goes **low** when the modem has started, after 7 to 11 s depending on the module version. Some module firmware gives a short pulse during start-up, so count it as started only once it has stayed low for about a second and the modem answers `AT`. Allow 20 s before treating it as a failure |
| Talk | Serial on GPIO 47 (to the modem) and GPIO 48 (from the modem), 115200 baud. Turn on GPIO 48's internal pull-up: the line floats while the modem is off |
| Power off | Hold the power key for 2.5 s or more. Status goes high about 2 s later. Wait 2 more seconds before powering on again |
| Supply off | `MODEM_PWR_EN` low, only after a power off or as the last resort. Then `MODEM_DISCHARGE` high for 3 s and low again: without it the 1000 µF capacitor keeps the modem near 3 V for minutes. Never set `MODEM_DISCHARGE` high while `MODEM_PWR_EN` is high |

The modem's reset pin is not connected to the processor on purpose. The recovery ladder is: no answer for 10 s, power off and on with the key; still nothing, switch the supply off, discharge it as above, wait 2 more seconds and start again. SIMCom's later manual asks for the supply to fall below 0.1 V and stay there for at least 2 s.

**Do not let a processor restart cut the modem.** `MODEM_PWR_EN` floats during any reset, and the resistor then switches the modem supply off without the shut-down SIMCom asks for. After raising it, hold the pin (`gpio_hold_en` in ESP-IDF) and release the hold only when the supply is meant to go off; after a reset that is not a power-on, read the reset reason and leave the modem running. A reset through the EN pin (the RESET button, programming over USB or the header, or a brown-out) still cuts the modem; that is accepted on the bench.

`MODEM_PG` low while the modem is on means the converter is at its current limit. Log it: it is the first sign of the problem in the next paragraph.

**2G on the battery.** A 2G burst at full power draws up to 2.8 A, which on the battery becomes 3 to 4 A through the charger's battery switch, close to the point where the charger cuts the system supply for 60 ms. Until a real board has been measured, keep the modem on LTE only while running from the cell (the LTE-only setting must be taken from the A76XX AT command manual, *check*). On vehicle power, 2G is fine.

`MODEM_DTR_3V3` (GPIO 11) is the modem's sleep line. Keep it low while talking to the modem. With the modem's sleep setting enabled (`AT+CSCLK=1`, *check* in the A76XX command manual), raising the line lets the modem sleep between uploads while staying registered on the network.

The blue light is driven by the modem itself: steady while searching; slow blinking when registered on 2G and idle; quick blinking when registered on LTE, or while sending data on either network; dark when off or asleep.

**Getting online.** Two routes, either is fine:

1. A data link from the modem to the processor's own network stack, with the secure connection made on the processor. This keeps certificate checking in code you control, and the same code runs over Wi-Fi on the bench. Espressif's modem component is expected to drive this modem as a SIM7600-class device (*check*).
2. The modem's built-in web commands. Less code, but certificate handling lives inside the modem.

Either way the server's certificate must be checked, as [PROTOCOL.md](PROTOCOL.md) explains.

### One reading, once a minute

1. Switch the 5 V rail on if it is off.
2. Question every known module ([SENSOR-BUS.md](SENSOR-BUS.md)).
3. If a DS18B20 probe is fitted to the tracker's own probe input (GPIO 10), read it too.
4. Read position, speed and time from the GNSS module: serial on GPIO 18, 9600 baud, standard position sentences.
5. Read the doors on GPIO 1 and 2. **Low means shut, high means open.** A cut wire therefore reads as an open door, which is the safe direction.
6. Read the three voltages.
7. Ask the modem for signal strength.
8. Number the reading, store it in flash, and upload as [PROTOCOL.md](PROTOCOL.md) describes.

**Several sensors, one temperature.** The server accepts one cargo temperature per reading today. Until it accepts one per sensor, send the warmest valid value among the modules' air sensors and all probes (on the modules and on the tracker), with the humidity from the same module when it came from one, and note in the log which sensor it came from. The warm side is where frozen and chilled goods are lost. A truck with only the tracker's probe sends that probe. If no sensor answers, leave `temp` out. Carrying every sensor to the server is a change to the server contract and belongs with the backend.

**A lost sensor is invisible on the server today.** A reading without `temp` still counts as a fresh reading, so the control room keeps showing the last temperature as if it were current, and there is no field or alert for "no cargo sensor". Until the server has one, the status light shows it in the truck, and the log keeps it. This is a gap in the server contract, listed in [PROTOCOL.md](PROTOCOL.md).

**Upload at once** when a door changes, when the vehicle supply disappears or returns, when a sensor goes missing or the cable switch faults, and, on the battery, when the truck starts moving. [PROTOCOL.md](PROTOCOL.md) lists the same triggers.

### On vehicle power and on the battery

| | On vehicle power | On the battery |
| --- | --- | --- |
| Processor | Awake. Check the supply every second so a cut is seen at once | Sleep between readings. Wake on a door (GPIO 1, 2), on motion (GPIO 7) or on the timer |
| Switched 5 V rail (GNSS and modules together) | On | On while the truck moves. Parked (no motion), on only while taking a reading, and send the last known position |
| Modem | On | Asleep between uploads, LTE only |
| Uploads | At most every 4 minutes | At most every 4 minutes, and at once on a door, on motion or when power returns |

The upload interval is set by the server: it marks a tracker as not reporting after 5 minutes without an upload and shows that to the customer. Waking every 4 minutes on the battery costs runtime; the alternative is a longer limit on the server for trackers on their battery, which is a server change.

In the processor's deepest sleep its pins float, and the resistors then switch the modem supply and the 5 V rail off. Hold `MODEM_PWR_EN` and `5V_SW_EN` in their state before sleeping if they should stay on (both are on pins that can be held in sleep).

Protect the cell: below 3.3 V with no vehicle supply, send one last reading, power the modem off, switch both supplies off and sleep, waking every few minutes only to see whether the supply is back.

### Motion sensor and enclosure sensor

Both on I2C: data GPIO 8, clock GPIO 9. The LIS3DH answers at address 0x18, with its interrupt on GPIO 7. The SHT40 answers at 0x44 and measures the air inside the enclosure. Report that value in the device log, never as `temp`.

### Status light (GPIO 42)

A suggestion, so installers learn one language:

| Pattern | Meaning |
| --- | --- |
| Short flash every 5 s | Working and connected |
| Two flashes every 5 s | Working, readings waiting for a connection |
| Fast blinking | No temperature sensor answers, the cable switch has faulted, or no SIM |
| Steady | Key refused by the server |

A truck fitted with only the tracker's probe and no modules must not show "no sensor": count the probe.

### Security

- One key per tracker, in encrypted flash, never printed on a serial port in a production build.
- Turn on the chip's flash encryption and secure start-up before units leave the workshop, or the key can be read out of a stolen board.
- Check the server's certificate on every connection.

## Temperature module (ATmega328P)

### Chip settings

The same clock and low-voltage settings as the widely used 3.3 V, 8 MHz Arduino boards with this chip, with the EEPROM kept across reprogramming:

| Fuse | Value | Why |
| --- | --- | --- |
| Low | `0xFF` | External crystal, no division of the clock |
| High | `0xD1` | No boot loader, and the EEPROM survives reprogramming, so stored corrections stay. Use `0xD2` with a boot loader |
| Extended | `0xFD` | Restart cleanly if the supply sags below 2.7 V |

Because the EEPROM now outlives firmware versions, store the corrections in a block with a layout version and a checksum, and treat a blank (all `0xFF`) or invalid block as "no correction". Confirm the high fuse bits (EESAVE is bit 3) in the ATMEGA328P-AU datasheet before programming.

**Program at 3.3 V only.** The programming header is wired to the board's 3.3 V supply. A programmer set to 5 V puts 5 V on the SHT45, whose limit is 3.6 V.

### What it does

1. At start, read the address switch on PD4 to PD7 with the internal pull-ups on. A closed switch reads low and counts as 1: switch 1 is worth 1, switch 2 is worth 2, switch 3 is worth 4, switch 4 is worth 8.
2. Every two seconds, measure with the SHT45 over I2C (address 0x44): send `0xFD`, wait 10 ms, read six bytes, check both checksums. Temperature is −45 + 175 × value ÷ 65535, humidity is −6 + 125 × value ÷ 65535, kept between 0 and 100.
3. If a probe is connected on PD3, read it too. A full-resolution DS18B20 reading takes about 0.75 s.
4. Measure the supply on ADC7, using the 3.3 V supply as the reference: pin volts × 4.03. That is the voltage after the module's fuse and input diode, about 0.3 V below the cable pins.
5. Answer the tracker as [SENSOR-BUS.md](SENSOR-BUS.md) describes. Serial on PD0 and PD1 at 9600 baud. Raise PD2 to transmit and lower it as soon as the last byte has left, or the module blocks the line for everyone.
6. Blink the light on PB0 briefly for each answer. Keep it short: a lit LED warms the board.
7. Keep the watchdog running, so a stuck module restarts itself and says so in its status.

The SHT45 has a small built-in heater. A short heater pulse after the doors have been open clears condensation from the sensor, at the cost of a wrong temperature for the next few seconds. Start with the lowest heater setting (20 mW) and never pulse several modules at once: fifteen modules heating together would exceed the cable's 0.5 A.

### Keeping the reading honest

The sensor sits at the board edge so that the board does not warm it, and the firmware must do its part: sleep between tasks, never leave the light on, and do not measure more often than needed.

Corrections found during a calibration check are stored through the settings registers and survive power loss and firmware updates. Each module reports the serial number of its sensor, so a calibration record can name the exact unit.

## Testing without the other half

- **A module alone:** a USB to RS-485 adapter and any Modbus program on a PC. Power the module with 5 V on the cable pins.
- **The server alone:** `node tools/device-sim.js --key <key> --scenario all` sends what a tracker would, including a power cut, an opened door and a loss of signal. [PROTOCOL.md](PROTOCOL.md) gives the details.
- **The tracker alone:** start a server the board can reach with `node server/server.js --demo --lan` (without `--lan` it listens on the PC itself only) and point the tracker at it over the bench Wi-Fi before trying the mobile network. That server speaks plain HTTP on port 4310, so the certificate check has to be tested separately against an HTTPS address.
