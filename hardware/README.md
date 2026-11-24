# Maatora hardware

Two boards make up the hardware side of Maatora.

- **The tracker** sits in the cab. It takes power from the truck, keeps a backup cell charged, knows where it is, reads the door switches, powers and reads the temperature modules, and reports to the Maatora server over the mobile network.
- **The temperature module** sits in the cargo space. It measures air temperature and humidity and answers the tracker over one cable, which also brings its power. Several modules chain along the same cable.

![The tracker, its modules and the path to the app](system.svg)

## Status

This is a schematic-level design for review. Read this list before relying on anything in the folder.

- **Done.** Every part, pin and connection of both boards, with values. Drawings, parts lists, netlists and pin maps, all produced from one description. Automatic wiring checks. Pin numbers and limits of the main parts compared with their datasheets (listed below).
- **Not done.** No printed-circuit layout. No board has been built or measured. No firmware has been written.
- **Never opened in KiCad.** The `.kicad_sch` files are written by a script, and KiCad is not installed on the PC they were made on. An independent review compared them with KiCad 7's own source code and test files and found every wire landing on its pin, and every build now reads the written file back pin by pin. The first real test is still opening them. If KiCad refuses one, the PDFs and the CSV files carry the same design.
- **Reviewed once, independently.** Eight reviewers each checked one area against the datasheets, and a second reviewer tried to disprove every finding. Nothing critical was found; 75 findings held up and were fixed or written into these documents. [REVIEW.md](REVIEW.md) lists them.
- **Values come from datasheet formulas**, not from simulation or measurement. Prices and battery runtimes are estimates.
- An electronics engineer should still review it before boards are ordered. [BUILD-GUIDE.md](BUILD-GUIDE.md) says what to check, in what order.

## Files

| File | What it is |
| --- | --- |
| `tracker/maatora-tracker-schematic.pdf` | The whole tracker on one large sheet |
| `tracker/maatora-tracker-sections.pdf` | The same drawing, one section per A3 page: the one to print |
| `tracker/maatora-tracker.kicad_pro`, `.kicad_sch` | KiCad project and schematic |
| `tracker/maatora.kicad_sym` | The symbols the schematic uses |
| `tracker/maatora-tracker-parts.csv` | Parts list with part numbers, footprints and estimated prices |
| `tracker/maatora-tracker-netlist.csv` | Every net and the pins on it |
| `tracker/pin-map.md` | What each processor pin does |
| `temperature-module/` | The same set of files for the module |
| `tools/build.py` | The description of both boards. Edit this, then rebuild |
| `tools/kit.py` | Turns the description into the files above and checks it |
| [USER-GUIDE.md](USER-GUIDE.md) | Fitting it in a truck and using it |
| [BUILD-GUIDE.md](BUILD-GUIDE.md) | From these files to working boards: KiCad, layout rules, first power-up |
| [SENSOR-BUS.md](SENSOR-BUS.md) | The cable between the tracker and the modules, and the messages on it |
| [FIRMWARE.md](FIRMWARE.md) | What the software on each board has to do |
| [PROTOCOL.md](PROTOCOL.md) | How the tracker talks to the server |
| [REVIEW.md](REVIEW.md) | What the independent review found, and what was done about each finding |

## The tracker, section by section

The numbers match the sections of the drawing.

**1. Vehicle input and protection.** A locking four-pin connector brings supply, ground and the ignition line. In order: a resettable fuse, a surge diode that stays off up to 33 V and clamps spikes above that, a 100 V diode that blocks a reversed supply, and a 220 µF capacitor. The diode is rated 100 V because a negative surge is clamped only at about −45 V while the capacitor still holds the supply, so it briefly sees both added together. The continuous input range is 9 to 32 V. On 12 V trucks this is fine as drawn; 24 V trucks need decision 2 below. Two dividers let the processor measure the supply (pin voltage × 22.28) and the ignition line (× 22.23). The ignition line has no surge diode of its own, so its divider uses two 1206 resistors in series, which carry the −600 V switch-off pulse of a 24 V truck, and a low-leakage clamp that does not fake "ignition on" in a hot cab.

**2. Vehicle supply down to 5 V.** An LM2596HV from H&M Semi, chosen for its 60 V input rating. The common LM2596S-5.0 from other makers is a 40 V part and is not a substitute. Its output feeds the charger and nothing else, which is what lets the rest of the board ignore a power cut.

**3. Charger and backup battery.** A BQ24074 charges one lithium cell at 0.5 A and produces the system rail, `VSYS`. With vehicle power present `VSYS` is 4.4 V. Without it the charger passes the cell through, with no gap. It refuses to charge when the cell is below about 0 °C or above about 50 °C, which it reads from the temperature sensor inside the battery pack. Its safety timer is set to about 9 hours, because the 5-hour default would end the charge of a drained 2600 mAh cell early and leave it half full until the next power cut. A green light shows vehicle power. The processor measures the cell (pin voltage × 2). The charger's status pin only reports the first charge after power returns, so firmware judges charging from the cell voltage.

**4. Logic supply, 3.3 V.** A small step-down converter from `VSYS` feeds the processor, the on-board sensors and the cable driver. They keep running on the battery.

**5. Modem supply, 3.8 V.** The modem accepts 3.4 to 4.2 V. `VSYS` is 4.4 V on vehicle power, which is too high, and falls towards 3.3 V on a tired cell, which is too low. A TPS63020 converter holds 3.8 V across that whole range. A 1000 µF capacitor beside the modem, the value SIMCom recommends, holds the voltage while the converter responds; in 2G the converter still delivers most of each 2.8 A burst, which on a part-discharged cell means 3 to 4 A drawn from `VSYS` (see the 2G note under "Power"). One processor pin switches the supply off, a second discharges it through 470 Ω so the modem really sees 0 V before it is switched on again, and a third reads the converter's power-good signal.

**6. Switched 5 V for the GNSS module and the sensor cable.** An MT3608 steps `VSYS` up to 5 V, followed by a TPS2553-1 current-limited switch set to about 0.5 A. Because this rail starts from `VSYS` and not from the truck, position and cargo readings carry on when the truck supply is cut. One processor pin turns the rail off to save the battery or to restart a stuck sensor. A short on the cable makes the switch turn off and tell the processor, instead of dragging the whole tracker down; the processor tries again by switching the rail off and on.

**7. LTE modem and SIM.** A SIMCom A7670E (the 88-pad edition): LTE Cat 1 with 2G as a fallback. Its logic runs at 1.8 V, so a translator sits between it and the 3.3 V processor for the serial lines. The translator is powered from the modem's own 1.8 V output, so it lets go of the lines when the modem is off. The modem's status reaches the processor through a transistor instead, so it reads correctly even while the modem is off. There is a nano SIM holder with one low-capacitance protection diode per line, as SIMCom's later guides ask, an antenna connector with space for a matching network, test pads for the modem's 1.8 V and its log output, and a blue light driven by the modem. One line lets the processor put the modem to sleep and wake it, which is what makes days on the battery possible.

**8. Processor.** An ESP32-S3-WROOM-1-N8 module. All 41 pin numbers were compared with Espressif's datasheet. [tracker/pin-map.md](tracker/pin-map.md) lists every pin. The doors and the motion sensor are on pins that can wake the processor from sleep. Reset and boot buttons, and an amber status light.

**9. USB-C and programming header.** USB-C goes to the processor's own USB for programming and logs. It carries data only and does not power the board. The six-pin serial header has the same pin order as Rev A's J4 (1 3.3 V, 2 ground, 3 processor transmit, 4 processor receive, 5 DTR, 6 RTS), so Rev A programming leads fit, and the automatic programming circuit is kept.

**10. GNSS module.** The NEO-7M module from Rev A on a five-pin header, on the switched 5 V rail. It needs an external active antenna with a view of the sky.

**11. RS-485 sensor bus.** The cable driver, with surge protection on the data lines and on the cable's 5 V. The tracker is one end of the cable, so it carries the 120 Ω terminator and the two resistors that hold the line in a defined state while nobody talks. Those resistors hang on the switched cable supply, so they draw nothing while the cable is off and the tracker sleeps on its battery.

**12. Door inputs.** Two inputs for magnetic switches that close to ground when a door is shut. Both inputs can sit at 32 V at once without harm: a diode stops the pull-up feeding current back into the 3.3 V rail, and 220 kΩ limits what the clamp passes. The door plug is a single-row connector, so it cannot be swapped with the 2×2 vehicle plug.

**13. Probe input and on-board sensors.** A header for one sealed DS18B20 probe, for a truck that needs a single reading and no modules. Its supply goes through 100 Ω, so a crushed probe lead cannot stop the board. A motion sensor that notices the unit being moved or struck while parked. A temperature and humidity sensor for the air inside the enclosure: it warns of condensation or an overheating cab, and is not a cargo reading.

## The temperature module, section by section

**1. Bus connectors and supply.** Two sockets wired straight through: cable in, cable out. The 5 V from the cable passes a resettable fuse and a diode against a reversed supply, then a regulator makes 3.3 V. Above about 6.5 V a surge diode conducts and the fuse limits the current, which protects the regulator and the microcontroller. A steady wrong supply between about 7 and 11 V overheats that surge diode, and above the fuse's 30 V rating nothing is protected, so the cable must only ever carry the tracker's 5 V. The module measures its supply after the fuse and the diode (pin voltage × 4.03), about 0.3 V below the cable voltage, so a weak supply at the far end of a long cable shows up in the readings.

**2. RS-485 transceiver.** One processor pin switches between listening and answering. It listens by default. The END TERM jumper is fitted on the last module of the cable only.

**3. Microcontroller.** An ATmega328P running at 3.3 V from an 8 MHz crystal. The chip's internal oscillator would save three parts, but it drifts too far between a freezer and a hot loading dock for reliable serial timing. A four-way switch sets the module's address, 1 to 15. A green light blinks each time the module answers.

**4. Sensors.** A Sensirion SHT45 at the edge of the board, behind a slot cut in the board so the chips' warmth does not reach it. A header takes an optional DS18B20 probe on a lead, for the middle of the load.

## Power: what runs from what

```
Truck, 9 to 32 V
  fuse, surge diode, reverse diode             VIN_PROT
    LM2596HV step-down                         +5V       feeds the charger only
      BQ24074 charger and power path           VSYS      4.4 V on truck power, cell voltage without it
        backup cell, one lithium cell          VBAT
        TLV62569 step-down                     +3V3      processor, sensors, cable driver
        TPS63020 buck-boost, switchable        V_MODEM   3.8 V for the modem
        MT3608 step-up, current-limited switch 5V_SW     GNSS module and the sensor cable
```

When the truck supply is cut, `+5V` disappears and the charger passes the cell to `VSYS`. Everything below `VSYS` keeps running: processor, modem, GNSS and the temperature modules. The processor sees the supply reading fall and reports it. The server raises a power alert when the reported supply is below 6 V.

**2G on the battery needs a test on the first board.** In 2G the modem draws bursts of up to 2.8 A. On the battery that becomes 3 to 4 A through the charger's battery switch, close to where the charger's own short-circuit detector cuts `VSYS` for 60 ms, which would restart the processor. LTE draws far less. Until a board has been measured, firmware keeps the modem on LTE only while running from the cell ([FIRMWARE.md](FIRMWARE.md)).

**How long the battery lasts has not been measured.** A 2600 mAh cell holds about 9 Wh. With everything left running (processor awake, modem attached, GNSS on, two modules) expect a draw of roughly 0.5 to 0.8 W, so about half a day. The GNSS module and the cables share one switched rail, so while the truck moves both stay on. Parked, the firmware can switch that rail on only for each reading and let the modem sleep between uploads, and several days becomes realistic. SIMCom's later guide gives about 2 mA for the modem asleep and about 23 mA idle; measure the real figures on the first board before promising a runtime to a customer.

## What it costs

Estimates for small quantities, in US dollars. The parts lists carry the price of every line.

| | Parts on the board | Whole unit |
| --- | --- | --- |
| Tracker | about 32.50 | about 56, with GNSS module, antennas, cell, board, enclosure and harness |
| Temperature module | about 9.60 | about 13, with board, enclosure and one cable |

The modem (about 11) and the SHT45 sensor (about 4.50) are the largest single lines.

## What was compared with datasheets

Pin numbers and the limits that matter were read from the manufacturer's document for these parts.

| Part | What was compared | Document |
| --- | --- | --- |
| ESP32-S3-WROOM-1 | All 41 pins, strapping pins, analog and wake-capable pins, USB pins, the N8 variant's free pins | Espressif module datasheet v1.8 (checked by the review) |
| A7670E modem | All 88 pads, supply range and peak current, power-key and reset timing, 1.8 V logic, light patterns, SIM circuit | SIMCom A7670 Series Hardware Design V1.00, and the later V1.04 and A7670X R2 manuals (review) |
| BQ24074 charger | Pins, input range, 4.4 V output, current and timer formulas, temperature input, status pin | [TI datasheet SLUS810N](https://www.ti.com/lit/gpn/bq24074) |
| TPS63020 | Pins, 0.5 V feedback and divider, inductor, capacitors, the `VINA` pin, power-save mode | [TI datasheet](https://www.ti.com/lit/gpn/tps63020) |
| TLV62569 | Pins, 0.6 V feedback, 2.5 to 5.5 V input, 2 A, output capacitance range | [TI datasheet](https://www.ti.com/lit/ds/symlink/tlv62569.pdf) |
| TPS2553-1 | Pins, enable polarity, current-limit table, latch-off, reverse blocking | [TI datasheet SLVS841G](https://www.ti.com/lit/ds/symlink/tps2553.pdf) |
| LM2596HV | Pins, 60 V input rating | H&M Semi datasheet |
| MT3608 | Pins, 0.6 V feedback, input range, inductor range, enable level | Aerosemi datasheet |
| TXS0104E translator | Pins, supply rule, enable pin | TI datasheet |
| LIS3DH motion sensor | All 16 pins, address select, unused pins | ST datasheet |
| SHT4x sensors | Pins, supply range, address, measurement command | Sensirion datasheet v7.3 |
| MCP1702 regulator | Pins, 13.2 V input, dropout | [Microchip DS22008E](https://ww1.microchip.com/downloads/en/DeviceDoc/22008E.pdf) |
| ATmega328P | All 32 pins, clock limit, fuse tables | [Atmel 7810](https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf). This is the automotive datasheet; the ATMEGA328P-AU in the parts list has its own (Atmel 8271), with the same pinout and fuse layout as far as known, and 10 MHz allowed from 2.7 V. Confirm the high fuse byte and the 2.7 V brown-out setting in it before ordering |
| ESD9L5.0ST5G | Package, direction, 5 V working voltage, 0.5 pF | [onsemi datasheet](https://www.onsemi.com/pdf/datasheet/esd9l-d.pdf) |
| SP3485, SM712, USBLC6-2SC6, SS8050, MMBT3904, BAT54S, AO3400A, AO3401A | Pin numbers | Manufacturer datasheets (checked by the review) |

**Not compared.** These use the pin numbers or ratings such parts normally have, written from memory. Check each against the datasheet of the exact part you buy, before layout:

- **BAV199, BAV99 and BAT46W.** The review confirmed that BAV199 and BAV99 share the BAT54S pin order, but the makers' datasheets could not be downloaded here. Check the 100 V rating of the BAT46W.
- **The ratings of the diodes on the input and cable:** SS510C, SS24, SS14, SMCJ33CA, SMAJ5.0A, SMF5.0A. The bare numbers SS510 and SS56 are sold as SMA parts by some makers; the SMC versions carry a C.
- **The NEO-7M module's header** order (VCC, GND, TXD, RXD, PPS) and that it accepts 5 V. A wrong order puts 5 V on a data pin.
- **The connectors:** USB-C, nano SIM holder, RJ45, Micro-Fit, JST. A holder or socket from another maker can number its pins differently. Match a probe's wire colours to the 3V3, DQ and GND pins.
- **Both resettable fuses' voltage ratings.** The input fuse must be a 60 V or 72 V type. The common MF-R160 is a 30 V part and is not suitable.
- **The SY8089**, listed as a cheaper stand-in for the TLV62569.

## What changed since Rev A

| Rev A | Problem | Now |
| --- | --- | --- |
| 18 V surge diode, 16 V converter, 30 V transistor | Works on 12 V only. A 24 V truck would trip the fuse or destroy the converter | Input rated for 9 to 32 V, parts rated 60 V or more. 24 V trucks still need decision 2 |
| No mobile modem on the board | The board cannot report by itself | LTE modem with SIM holder and antenna connector |
| No backup battery | Cutting the supply silences the unit, which is what a dishonest driver would do | A lithium cell with a temperature-supervised charger. Processor, modem, GNSS and cargo sensors all keep running |
| No door input | Door openings are the main accountability signal | Two protected door inputs that can wake the processor |
| RS-485 lines leave the board bare | Static and surges from a long cable into the cargo area | Surge protection, a current-limited cable supply, a defined idle state |
| Processor cannot tell truck supply from battery | Firmware cannot report a power cut or the battery level | Voltage measurement for the supply, the ignition line and the cell |
| Serial header only | Needs an adapter to program or read logs | USB-C on the processor's own USB, header kept in the same pin order |
| Nothing shows the unit's state | An installer cannot tell whether it works | Power, vehicle supply, network and status lights |
| No motion sensing | The unit cannot sleep and still notice being moved | Motion sensor on a wake pin |

Kept from Rev A: the processor, the GNSS module and its pins, the RS-485 transceiver, the sensor cable pinout, the serial header's pin order, ignition sensing, the switchable 5 V rail and the automatic programming circuit.

The module here is a proposed next revision of the COLDCHAIN RS-485 board. It was drawn from a photo of that board's layout, not from its schematic, so its pin choices are new. It keeps the two sockets, the END TERM jumper, the 32-pin microcontroller, the crystal and the programming header. It adds an address switch, a low surface-mount crystal, protection on the cable, and a sensor placed on the board edge.

## Decisions that are yours

1. **The sensor cable pinout.** This design keeps the Rev A pinout so new boards plug into the ones you already have. That pinout puts 5 V and ground on the same pair of the cable. If someone plugs the sensor cable into a computer or a network switch, 5 V lands across that socket's transformer. The tracker's 0.5 A current limit holds it down, but the other device can still be damaged. A crossover cable is also wrong with this pinout: nothing answers and the terminators run hot. A second pinout is built in: set `CABLE = 'network-safe'` at the top of `tools/build.py` and rebuild. It puts no supply across any pair, though a few tens of milliamps can still flow through a network socket, so the cable must still never go into network equipment. It does not match boards built with the Rev A pinout, so choose before more modules are made. [SENSOR-BUS.md](SENSOR-BUS.md) shows both.
2. **12 V trucks only, or 24 V too?** As drawn, the board is designed for 12 V trucks. It runs on a 24 V supply (up to 32 V), but a 24 V truck's load dump, which central suppression clamps only to about 58 to 65 V for up to 350 ms, keeps the 33 V surge diode conducting far beyond its energy rating, with or without that suppression. Swapping in a larger diode with the same 36.7 V breakdown (the SM8S33A, which is also one-way only, so a reversed supply would then blow the harness fuse) does not cure it. Real 24 V support means one of two things: a surge diode chosen and tested against the 24 V load-dump and jump-start levels with a stated limit, or a front end rated about 100 V behind a 58 V surge diode, which replaces the 60 V regulator and input capacitor. That is an engineer's decision and a lab test, not an opinion.
3. **A lithium cell in a hot cab.** The charger stops charging above about 50 °C, which is right. A cab parked in the sun goes well past that, and heat shortens the life of any lithium cell. Mount the unit low and out of the sun, and plan to replace cells.
4. **Which cargo sensor.** The SHT45 is typically accurate to ±0.1 °C. For pharmaceutical customers, the SHT43 from the same family is delivered with an individual ISO 17025 calibration certificate. Your own board has a plug-in sensor on A1 that this design does not know.
5. **SIM provider and bands.** Check the exact A7670 variant against the bands your provider uses in Egypt before ordering modems.
6. **Connectors in the cargo space.** RJ45 and network cable are cheap and sold everywhere, which suits a pilot. They are not sealed. For series production in freezers, a sealed industrial connector (M12, five pins) carries the same signals.

## Rebuilding the files

```
python hardware/tools/build.py --pdf
```

It needs Python 3, and Chrome for the PDFs. It rewrites everything in `tracker/` and `temperature-module/` and ends with the result of its checks:

- every pin of every part is either on a net or marked as unconnected on purpose;
- no pin number is used that the part does not have, and no reference is used twice;
- every net reaches at least two pins;
- the finished drawing is read back from its coordinates alone, and the nets found that way must equal the description;
- the written `.kicad_sch` file is parsed again and every library pin is placed the way KiCad places it: each must meet exactly one wire whose far end carries the right net name, or carry an unconnected marker and nothing else. The symbols inside the schematic must equal the library file beside it.

To change the design, edit `tools/build.py`. Each part is one line: its value, then the net on each pin. Do not edit the generated files by hand, because the next build overwrites them.
