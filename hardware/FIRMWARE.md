# What the firmware has to do

**Status:** no firmware exists for either board. This page is the brief for whoever writes it. It lists what follows from the hardware, with the timings and formulas the design depends on. Figures marked *check* come from memory of a manual and must be confirmed before use.

Two documents sit beside this one: [SENSOR-BUS.md](SENSOR-BUS.md) for the cable between the boards, and [PROTOCOL.md](PROTOCOL.md) for the tracker's reports to the server. `tools/device-sim.js` in the repository plays the tracker's part against the server and is the quickest reference for the second.

## Tracker (ESP32-S3)

Every pin is listed in [tracker/pin-map.md](tracker/pin-map.md).

### What is on at start

When the processor starts, every switchable supply is off: resistors hold `MODEM_PWR_EN`, `5V_SW_EN` and the power-key transistor low. The firmware decides what to turn on.

### Measuring voltages

Use the analog inputs with the widest range setting and the chip's calibration, and average a few samples.

| Signal | Pin | Formula | Use |
| --- | --- | --- | --- |
| Vehicle supply | GPIO 5 | pin volts × 22.28 | Sent as `main`. Below 6 V means the truck supply is gone |
| Ignition line | GPIO 4 | pin volts × 22.28 | Above 6 V means ignition on. Sent as `ign` |
| Backup cell | GPIO 6 | pin volts × 2 | Sent as `batt` |

`CHG_STAT` on GPIO 41 is low while the cell is charging.

### The 5 V rail for GNSS and sensors

- `5V_SW_EN` (GPIO 15) high starts the 5 V converter and connects the GNSS module and the sensor cable.
- Wait 300 ms before questioning the modules.
- Before switching the rail off, set the GNSS transmit pin (GPIO 17) low or to an input. A 470 Ω resistor limits the current if this is forgotten, but the module should not be fed through its data pin.

### The modem (A7670E)

Timings from the SIMCom hardware guide:

| Step | What to do |
| --- | --- |
| Supply on | `MODEM_PWR_EN` (GPIO 40) high. Wait 100 ms for 3.8 V |
| Power on | `MODEM_PWRKEY` (GPIO 38) high for 100 ms, then low. The transistor presses the key for you; the guide gives 50 ms as the typical press |
| Ready | `MODEM_STATUS_3V3` (GPIO 39) goes high after about 11 s. Allow 20 s before treating it as a failure |
| Talk | Serial on GPIO 47 (to the modem) and GPIO 48 (from the modem), 115200 baud |
| Power off | Hold the power key for 2.5 s or more. Status falls about 2 s later. Wait 2 more seconds before powering on again |
| Supply off | `MODEM_PWR_EN` low, only after a power off or as the last resort |

The modem's reset pin is not connected to the processor on purpose. The recovery ladder is: no answer for 10 s, power off and on with the key; still nothing, remove the supply for 5 s and start again.

`MODEM_DTR_3V3` (GPIO 11) is the modem's sleep line. Keep it low while talking to the modem. With the modem's sleep setting enabled (`AT+CSCLK=1`, *check* in the A76XX command manual), raising the line lets the modem sleep between uploads while staying registered on the network.

The blue light is driven by the modem itself: steady while searching, quick blinking when registered on LTE, slow blinking when registered on 2G, dark when off or asleep.

**Getting online.** Two routes, either is fine:

1. A data link from the modem to the processor's own network stack, with the secure connection made on the processor. This keeps certificate checking in code you control, and the same code runs over Wi-Fi on the bench. Espressif's modem component is expected to drive this modem as a SIM7600-class device (*check*).
2. The modem's built-in web commands. Less code, but certificate handling lives inside the modem.

Either way the server's certificate must be checked, as [PROTOCOL.md](PROTOCOL.md) explains.

### One reading, once a minute

1. Switch the 5 V rail on if it is off.
2. Question every known module ([SENSOR-BUS.md](SENSOR-BUS.md)).
3. Read position, speed and time from the GNSS module: serial on GPIO 18, 9600 baud, standard position sentences.
4. Read the doors on GPIO 1 and 2. **Low means shut, high means open.** A cut wire therefore reads as an open door, which is the safe direction.
5. Read the three voltages.
6. Ask the modem for signal strength.
7. Number the reading, store it in flash, and upload as [PROTOCOL.md](PROTOCOL.md) describes.

**Several modules, one temperature.** The server accepts one cargo temperature per reading today. Until it accepts one per sensor, send the warmest valid air temperature, with the humidity from the same module, and note in the log which address it came from. The warm side is where frozen and chilled goods are lost. If no module answers, leave `temp` out. Carrying every sensor to the server is a change to the server contract and belongs with the backend.

**Upload at once** when a door changes, when the vehicle supply disappears or returns, and when a module goes missing.

### On vehicle power and on the battery

| | On vehicle power | On the battery |
| --- | --- | --- |
| Processor | Awake. Check the supply every second so a cut is seen at once | Sleep between readings. Wake on a door (GPIO 1, 2), on motion (GPIO 7) or on the timer |
| 5 V rail | On | On only while taking a reading |
| GNSS | On | Off while the motion sensor reports no movement: a parked truck has not moved. Send the last position |
| Modem | On | Asleep between uploads |
| Uploads | Every 5 minutes | Every 15 minutes, and at once on a door, on motion or when power returns |

In the processor's deepest sleep its pins float, and the resistors then switch the modem supply and the 5 V rail off. Hold `MODEM_PWR_EN` and `5V_SW_EN` in their state before sleeping if they should stay on.

Protect the cell: below 3.3 V with no vehicle supply, send one last reading, power the modem off, switch both supplies off and sleep, waking every few minutes only to see whether the supply is back.

### Motion sensor and enclosure sensor

Both on I2C: data GPIO 8, clock GPIO 9. The LIS3DH answers at address 0x18, with its interrupt on GPIO 7. The SHT40 answers at 0x44 and measures the air inside the enclosure. Report that value in the device log, never as `temp`.

### Status light (GPIO 42)

A suggestion, so installers learn one language:

| Pattern | Meaning |
| --- | --- |
| Short flash every 5 s | Working and connected |
| Two flashes every 5 s | Working, readings waiting for a connection |
| Fast blinking | No module answers, or no SIM |
| Steady | Key refused by the server |

### Security

- One key per tracker, in encrypted flash, never printed on a serial port in a production build.
- Turn on the chip's flash encryption and secure start-up before units leave the workshop, or the key can be read out of a stolen board.
- Check the server's certificate on every connection.

## Temperature module (ATmega328P)

### Chip settings

The same clock and low-voltage settings as the widely used 3.3 V, 8 MHz Arduino boards with this chip:

| Fuse | Value | Why |
| --- | --- | --- |
| Low | `0xFF` | External crystal, no division of the clock |
| High | `0xD9` | No boot loader. Use `0xDA` with one |
| Extended | `0xFD` | Restart cleanly if the supply sags below 2.7 V |

**Program at 3.3 V only.** The programming header is wired to the board's 3.3 V supply. A programmer set to 5 V puts 5 V on the SHT45, whose limit is 3.6 V.

### What it does

1. At start, read the address switch on PD4 to PD7 with the internal pull-ups on. A closed switch reads low and counts as 1: switch 1 is worth 1, switch 2 is worth 2, switch 3 is worth 4, switch 4 is worth 8.
2. Every two seconds, measure with the SHT45 over I2C (address 0x44): send `0xFD`, wait 10 ms, read six bytes, check both checksums. Temperature is −45 + 175 × value ÷ 65535, humidity is −6 + 125 × value ÷ 65535, kept between 0 and 100.
3. If a probe is connected on PD3, read it too. A full-resolution DS18B20 reading takes about 0.75 s.
4. Measure the cable supply on ADC7 using the 3.3 V supply as the reference: pin volts × 4.03.
5. Answer the tracker as [SENSOR-BUS.md](SENSOR-BUS.md) describes. Serial on PD0 and PD1 at 9600 baud. Raise PD2 to transmit and lower it as soon as the last byte has left, or the module blocks the line for everyone.
6. Blink the light on PB0 briefly for each answer. Keep it short: a lit LED warms the board.
7. Keep the watchdog running, so a stuck module restarts itself and says so in its status.

The SHT45 has a small built-in heater. A short heater pulse after the doors have been open clears condensation from the sensor, at the cost of a wrong temperature for the next few seconds. Worth trying once real units are in a truck.

### Keeping the reading honest

The sensor sits at the board edge so that the board does not warm it, and the firmware must do its part: sleep between tasks, never leave the light on, and do not measure more often than needed.

Corrections found during a calibration check are stored through the settings registers and survive power loss. Each module reports the serial number of its sensor, so a calibration record can name the exact unit.

## Testing without the other half

- **A module alone:** a USB to RS-485 adapter and any Modbus program on a PC. Power the module with 5 V on the cable pins.
- **The server alone:** `node tools/device-sim.js --key <key> --scenario all` sends what a tracker would, including a power cut, an opened door and a loss of signal.
- **The tracker alone:** point it at a server started with `node server/server.js --demo` on the bench Wi-Fi before trying the mobile network.
