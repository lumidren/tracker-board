# From these files to working boards

The steps between the schematic in this folder and a tracker that works in a truck: review, layout, ordering, assembly and the first power-up, in that order.

## 1. Open the design in KiCad

Use KiCad 7 or newer.

1. Open `tracker/maatora-tracker.kicad_pro`. The schematic is `maatora-tracker.kicad_sch`.
2. Do the same for `temperature-module/maatora-temperature-module.kicad_pro`.

**These files were written by a script and have never been opened in KiCad.** They pass the script's checks, which is not the same thing. If KiCad reports an error, note the message and the line number. Nothing is lost in the meantime: the PDFs show the same drawing and the netlist CSV lists every connection.

What you will see is one large sheet with a dashed box per section. Each part carries short wires that end in a net name. Two pins with the same name are connected; there are no long wires to follow. It is not the prettiest way to draw a schematic, but a wrong connection cannot hide in it. Move parts together and replace names with wires wherever you prefer.

Run the electrical rules check once. Every pin in the symbols is of the plain passive type, so the check will not complain about outputs joined together, and it will not catch that kind of mistake either. The review below is what stands in for it.

## 2. Review before layout

Work through this list with the datasheet of the exact part you intend to buy.

1. **ESP32-S3-WROOM-1 pin numbers** against the module datasheet, using `tracker/pin-map.md`. This is the one large part whose datasheet could not be fetched when the design was made.
2. **Small parts with three or six pins:** transistors, the dual diodes, the protection parts (USBLC6-2SC6, SM712). Pin numbers vary between makers more often than people expect.
3. **The direction of every diode.** In the drawing the cathode is the side with the bar.
4. **Connectors:** USB-C, SIM holder, RJ45, Micro-Fit, JST. Use the pin numbering of the part you buy.
5. **Both resettable fuses.** The input fuse must be rated 60 V or more. The MF-R160 is a 30 V part and is not suitable; RXEF160 or MF-RX160/72 are the kind meant.
6. **The modem variant** against your SIM provider's bands.
7. **The surge diode on the input** if the unit will go in 24 V trucks. See "Decisions that are yours" in the [README](README.md).

## 3. Footprints

Most parts already name a footprint from KiCad's standard libraries. Those names were typed from memory of the library, so KiCad will mark any that do not exist in your version. Pick the nearest match and check it against the part's drawing.

These have no footprint assigned and need one chosen or drawn:

| Part | Footprint to use |
| --- | --- |
| A7670E modem | The land pattern in SIMCom's hardware guide. Draw it exactly, including the areas the guide says to keep free of copper |
| TPS63020 | Texas Instruments DSJ package, 14 pins, 3 × 4 mm with a centre pad |
| Nano SIM holder | From the drawing of the holder you buy |
| Input resettable fuse | Radial, 5.1 mm between the leads |
| Address switch on the module | Four-way DIP switch, surface-mount or through-hole |

## 4. Layout rules

### Tracker: four layers

Top for parts and signals, a full ground layer under it, a supply layer, bottom for signals.

- **Input stage.** Fuse, surge diode, reverse diode and capacitor in a straight line from the connector. Give the surge diode a short, wide path back to the connector's ground pin.
- **The 5 V converter (LM2596HV).** Keep the input capacitor, the chip and the catch diode in one tight loop. Route the feedback trace away from the inductor. Give the chip's tab a generous copper area: it is the warmest part on the board.
- **The three small converters.** For each, the capacitor at the input, the chip, the inductor and the capacitor at the output sit shoulder to shoulder. The TPS63020 datasheet has a layout example. Follow it, including the small capacitor on its `VINA` pin.
- **Modem supply.** A track at least 2 mm wide, or a copper area, from the converter to the modem. The 1000 µF capacitor and the small capacitors go right at the modem's supply pads.
- **Antenna trace.** The path from the modem's antenna pad to the connector must be a 50 Ω line. Get the width from your board maker's calculator for their layer stack. Keep it short, with the matching parts in line and nothing routed underneath. On a first board this trace is the part most likely to be wrong.
- **SIM.** Short traces, away from the antenna and the converters.
- **Processor module.** Its antenna end goes at the board edge with no copper beneath it, as its datasheet shows. The tracker reports over the mobile network, so Wi-Fi is only for the workshop. In a metal enclosure it will not work at all, which is acceptable.
- **GNSS module.** As far from the modem antenna and the converters as the board allows.
- **Cable and door protection.** Put the protection parts at the connectors, so a surge is stopped where it enters.
- **Vibration.** Glue the tall capacitors down. Use locking connectors only.
- **Labels.** Print PWR, EXT, NET and STATUS beside the lights, and the pin functions beside each connector. The user guide refers to them by those names.
- **Coating.** Plan a protective coating for the finished board, leaving connectors, the SIM holder, the buttons, the antenna connector and the small humidity sensor uncovered.

### Temperature module: two layers

- **The sensor decides the layout.** Put the SHT45 at the edge farthest from the regulator and the sockets. Cut a slot in the board around three sides of it. Keep copper areas away from it and use thin traces to it. The enclosure needs an opening at that spot.
- Sockets together at the other end, protection parts right behind them.
- Crystal close to the microcontroller.
- Coat the board, with the sensor masked.

## 5. Ordering and assembly

- The parts lists are `tracker/maatora-tracker-parts.csv` and `temperature-module/maatora-temperature-module-parts.csv`. Rows marked as not fitted stay empty: the antenna matching parts, the modem's service header and the stand-in resistor for a battery without a temperature sensor.
- The modem, the charger, the TPS63020, the motion sensor and both humidity sensors have their contacts underneath. They need solder paste and an oven or hot plate, or an assembly service. Everything else can be soldered by hand.
- Order two or three boards more than you need. First boards get reworked.

## 6. First power-up: tracker

Tools: a bench supply with a current limit, a multimeter, and an oscilloscope for step 9. Take the steps in order and stop at the first surprise.

| Step | Do | Expect |
| --- | --- | --- |
| 1 | No cell, no SIM, no cables. Measure resistance from supply to ground | Not a short |
| 2 | 12 V, limit 0.2 A | `+5V` test point 4.8 to 5.2 V. `VSYS` about 4.4 V. `+3V3` 3.25 to 3.40 V. PWR and EXT lit |
| 3 | Raise slowly to 36 V, lower to 9 V | The three voltages do not move |
| 4 | Reverse the supply at 12 V | No current, nothing warm |
| 5 | Check the cell's polarity, connect it | `VBAT` shows the cell voltage and the supply current rises while it charges |
| 6 | Remove the supply | The board keeps running. `VSYS` falls to the cell voltage. EXT goes dark |
| 7 | Load a test program over USB-C that reports the three voltage inputs | Within 3 % of the multimeter |
| 8 | Set `5V_SW_EN` high, with and without the supply | `5V_SW` test point 4.85 to 5.15 V both times |
| 9 | Set `MODEM_PWR_EN` high, pulse the power key | `V_MODEM` 3.7 to 3.9 V. Status high after about 11 s. The modem answers at 115200 baud, finds the SIM and registers. On the oscilloscope, `V_MODEM` dips less than 0.3 V while it transmits |
| 10 | GNSS outdoors with the real antenna | A position. The first one can take several minutes |
| 11 | One module on 5 m of cable | With nobody talking, wire A is at least 0.2 V above wire B. The module answers |
| 12 | Door switches | A closed switch reads low |
| 13 | A day in a real truck, with several engine starts | No restarts. The cell carries the board through the dip when the starter turns |

## 7. First power-up: module

| Step | Do | Expect |
| --- | --- | --- |
| 1 | 5 V limited to 50 mA on the cable pins | `+3V3` test point 3.2 to 3.4 V, a few milliamps drawn |
| 2 | Reverse the 5 V | No current |
| 3 | Program it **at 3.3 V**, set the fuses from [FIRMWARE.md](FIRMWARE.md) | The light blinks |
| 4 | Read the sensor after 15 minutes at rest | Within 0.3 °C of a reference thermometer beside it |
| 5 | Set an address, question it from a PC through a USB to RS-485 adapter | It answers at that address only |
| 6 | Unpowered, END TERM jumper on, measure between the data wires | About 120 Ω |

## 8. Tests still owed before customers rely on it

Nothing below has been done. Each one is a reason a unit can fail in the field after it passed on the bench.

- **Cold and wet.** Modules for a day at −25 °C, then repeated door-open cycles that soak them in condensation.
- **Vehicle electrical disturbances.** The input stage was designed for them and has not been tested against the vehicle standards (ISO 7637-2, ISO 16750-2).
- **Heat.** The tracker at 60 °C or more, as in a parked cab in summer, with attention to the cell.
- **Radio approval.** The modem and the processor module carry their own approvals. A finished product that uses the mobile network may still need approval from the national regulator. Ask before selling.
- **Calibration.** A written procedure and records for every sensor, as [USER-GUIDE.md](USER-GUIDE.md) describes.
- **A long run.** Several trucks for several weeks, compared against an independent data logger in the same cargo space.
