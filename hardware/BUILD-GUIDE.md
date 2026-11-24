# From these files to working boards

The steps between the schematic in this folder and a tracker that works in a truck: review, layout, ordering, assembly and the first power-up, in that order.

## 1. Open the design in KiCad

The files are in KiCad 7's format and are meant for KiCad 7, 8 or 9. KiCad 10 also opens them, but see the USB-C note in section 3.

1. Open `tracker/maatora-tracker.kicad_pro`. The schematic is `maatora-tracker.kicad_sch`.
2. Do the same for `temperature-module/maatora-temperature-module.kicad_pro`.

**These files were written by a script and have never been opened in KiCad.** An independent review compared them with KiCad 7's source code and test files and found every wire ending exactly on its pin, and every build reads the written file back the same way. Opening them is still the first real test. If KiCad reports an error, note the message and the line number. Nothing is lost in the meantime: the PDFs show the same drawing and the netlist CSV lists every connection.

What you will see is one large sheet with a dashed box per section. Each part carries short wires that end in a net name. Two pins with the same name are connected; there are no long wires to follow. It is not the prettiest way to draw a schematic, but a wrong connection cannot hide in it. Move parts together and replace names with wires wherever you prefer.

Run the electrical rules check once. Every pin in the symbols is of the plain passive type, so the check will not complain about outputs joined together, and it will not catch that kind of mistake either. The review below is what stands in for it.

## 2. Review before layout

Work through this list with the datasheet of the exact part you intend to buy. [REVIEW.md](REVIEW.md) lists what the first review already checked.

1. **Small parts with three or six pins** from the maker you buy: transistors, the dual diodes (BAT54S, BAV99, BAV199), the protection parts. Pin numbers vary between makers more often than people expect.
2. **The direction of every diode.** In the drawing the cathode is the side with the bar.
3. **Connectors:** USB-C, SIM holder, RJ45, Micro-Fit, JST. Use the pin numbering of the part you buy.
4. **Both resettable fuses.** The input fuse must be rated 60 V or more. The MF-R160 is a 30 V part and is not suitable; RXEF160 or MF-RX160/72 are the kind meant.
5. **The SMC diodes:** buy SS510C (or a part whose own datasheet says SMC / DO-214AB). Several makers sell the bare SS510 in the smaller SMA body, which does not fit the pads.
6. **The modem:** the 88-pad A7670E edition, and its bands against your SIM provider's. The newer -LASE and -FASE modules have 124 pads and need a different footprint (section 3).
7. **The GNSS module's header order** (VCC, GND, TXD, RXD, PPS) and that it accepts 5 V.
8. **The input surge diode** if the unit will go in 24 V trucks. See "Decisions that are yours" in the [README](README.md).

## 3. Footprints

Most parts already name a footprint from KiCad's standard libraries. Those names were typed from memory of the library, so KiCad will mark any that do not exist in your version. Pick the nearest match and check it against the part's drawing.

These have no footprint assigned and need one chosen or drawn:

| Part | Footprint to use |
| --- | --- |
| A7670E modem | The land pattern in SIMCom's hardware guide, from V1.04 or later. Draw it exactly, including the areas the guide says to keep free of copper. A 124-pad R2 module needs its own pattern and 36 more pads on the symbol |
| TPS63020 | Texas Instruments DSJ package, 14 pins, 3 × 4 mm with a centre pad |
| Nano SIM holder | From the drawing of the holder you buy |
| Input resettable fuse | Radial, 5.1 mm between the leads |
| Address switch on the module | Four-way DIP switch, surface-mount or through-hole |

**USB-C shell.** The symbol numbers the shell pin `S1`, which matches the HRO footprint in KiCad 7, 8 and 9. KiCad 10's library names those pads `SH`. After the first update from the schematic, check that the four shell pads of J6 carry GND, and rename the pin if they do not.

## 4. Layout rules

### Tracker: four layers

Top for parts and signals, a full ground layer under it, a supply layer, bottom for signals.

- **Input stage.** Fuse, surge diode, reverse diode and capacitor in a straight line from the connector. Give the surge diode a short, wide path back to the connector's ground pin. The two 499 k ignition resistors are 1206 parts on purpose: keep the clearance around them, they carry the ignition line's surges.
- **The 5 V converter (LM2596HV).** Keep the input capacitor, the chip and the catch diode in one tight loop. Route the feedback trace away from the inductor. Give the chip's tab a generous copper area: it is the warmest part on the board.
- **The three small converters.** For each, the capacitor at the input, the chip, the inductor and the capacitor at the output sit shoulder to shoulder. The TPS63020 datasheet has a layout example. Follow it, including the small capacitor on its `VINA` pin.
- **Modem supply.** A track at least 2 mm wide (SIMCom's later guide asks for 3 mm; wider is better), or a copper area, from the converter to the modem. The 1000 µF capacitor and the four small capacitors (1 µF, 100 nF, 33 pF, 10 pF) go right at the modem's supply pads.
- **Antenna trace.** The path from the modem's antenna pad to the connector must be a 50 Ω line. Get the width from your board maker's calculator for their layer stack. Keep it short, with the matching parts in line and nothing routed underneath. On a first board this trace is the part most likely to be wrong.
- **SIM.** Short traces, away from the antenna and the converters. One protection diode per SIM line, right at the holder.
- **Processor module.** Its antenna end goes at the board edge with no copper beneath it, as its datasheet shows. The tracker reports over the mobile network, so Wi-Fi is only for the workshop. In a metal enclosure it will not work at all, which is acceptable.
- **GNSS module.** As far from the modem antenna and the converters as the board allows.
- **Cable and door protection.** Put the protection parts at the connectors, so a surge is stopped where it enters.
- **Vibration.** Glue the tall capacitors down. Use locking connectors only.
- **Labels.** Print PWR, EXT, NET and STATUS beside the lights, the pin functions beside each connector and the serial header, and "never link to VBUS" beside the modem's BOOT pin. The user guide refers to them by those names.
- **Coating.** Plan a protective coating for the finished board, leaving connectors, the SIM holder, the buttons, the antenna connector and the small humidity sensor uncovered.

### Temperature module: two layers

- **The sensor decides the layout.** Put the SHT45 at the edge farthest from the regulator and the sockets. Cut a slot in the board around three sides of it. Keep copper areas away from it and use thin traces to it. The enclosure needs an opening at that spot.
- Sockets together at the other end, protection parts right behind them.
- Crystal close to the microcontroller.
- Coat the board, with the sensor masked.

## 5. Ordering and assembly

- The parts lists are `tracker/maatora-tracker-parts.csv` and `temperature-module/maatora-temperature-module-parts.csv`. Rows marked as not fitted stay empty: the antenna matching parts, the modem's service header, the three SIM line capacitors, the 3.3 V feed-forward capacitor and the stand-in resistor for a battery without a temperature sensor.
- The modem, the charger, the TPS63020, the motion sensor and both humidity sensors have their contacts underneath. They need solder paste and an oven or hot plate, or an assembly service. The SIM protection diodes are tiny (1 × 0.6 mm). Everything else can be soldered by hand.
- Order two or three boards more than you need. First boards get reworked.

## 6. First power-up: tracker

Tools: a bench supply with a current limit, a multimeter, and an oscilloscope for steps 9 and 10. Take the steps in order and stop at the first surprise. The voltage windows below are the parts' worst-case tolerances; most boards sit near the middle.

| Step | Do | Expect |
| --- | --- | --- |
| 1 | No cell, no SIM, no cables. Measure resistance from supply to ground | Not a short |
| 2 | 12 V, limit 0.2 A | `+5V` test point 4.8 to 5.2 V. `VSYS` about 4.4 V. `+3V3` 3.20 to 3.45 V. PWR and EXT lit |
| 3 | Raise slowly to 32 V, lower to 9 V | The three voltages do not move |
| 4 | Reverse the supply at 12 V | No current, nothing warm |
| 5 | Raise the current limit to 0.6 A. Check the cell's polarity, connect it | `VBAT` shows the cell voltage and the supply current rises while it charges |
| 6 | Remove the supply | The board keeps running. `VSYS` falls to the cell voltage. EXT goes dark |
| 7 | Load a test program over USB-C that reports the three voltage inputs | Supply and ignition within 0.5 V of the multimeter, cell within 0.15 V |
| 8 | Set `5V_SW_EN` high, with and without the supply. Then short `5V_SW` to ground through a 1 Ω resistor for a moment | `5V_SW` test point 4.80 to 5.20 V both times. With the short, `CABLE_FAULT_N` goes low within about 10 ms and the switch stays off until `5V_SW_EN` is toggled; the board does not restart |
| 9 | Raise the current limit to 1 A. Set `MODEM_PWR_EN` high, pulse the power key | `V_MODEM` 3.75 to 4.15 V with the modem idle (about 3.95 V: the converter regulates about 3 % high at light load), 3.7 to 3.95 V while it transmits. `MODEM_STATUS_N` low after 7 to 11 s. The modem answers at 115200 baud, finds the SIM and registers. On the oscilloscope, `V_MODEM` dips less than 0.3 V while it transmits, and the SIM clock edges are under 40 ns |
| 10 | On the cell only, cell near 3.6 V: force the modem onto 2G at full power and transmit | Watch `VBAT`, `VSYS` and `+3V3`. `VBAT` minus `VSYS` must stay under 200 mV, and `VSYS` must never drop out for 60 ms. If it does, keep LTE only on the battery ([FIRMWARE.md](FIRMWARE.md)) and record it |
| 11 | Switch the modem supply off, set `MODEM_DISCHARGE` high | `V_MODEM` below 0.1 V within about 2 s |
| 12 | Step the load on `+3V3` (Wi-Fi transmit on and off) and on `+5V` | No ringing. If `+3V3` rings, fit the 6.8 pF feed-forward capacitor |
| 13 | GNSS outdoors with the real antenna | A position. The first one can take several minutes |
| 14 | One module on 5 m of cable | With nobody talking, wire A is about 0.35 V above wire B. The module answers |
| 15 | Door switches, then 24 V on both door wires at once for a minute | A closed switch reads low. With 24 V on both, `+3V3` stays below 3.45 V |
| 16 | A day in a real truck, with several engine starts | No restarts. The cell carries the board through the dip when the starter turns |

## 7. First power-up: module

| Step | Do | Expect |
| --- | --- | --- |
| 1 | 5 V limited to 50 mA on the cable pins | `+3V3` test point 3.2 to 3.4 V, a few milliamps drawn |
| 2 | Reverse the 5 V | No current |
| 3 | Program it **at 3.3 V**, set the fuses from [FIRMWARE.md](FIRMWARE.md) | The light blinks |
| 4 | Read the sensor after 15 minutes at rest | Within 0.3 °C of a reference thermometer beside it |
| 5 | Set an address, question it from a PC through a USB to RS-485 adapter | It answers at that address only. On the oscilloscope `+3V3` moves less than 0.1 V while it answers |
| 6 | Unpowered, END TERM jumper on, measure between the data wires | About 120 Ω |

## 8. Tests still owed before customers rely on it

Nothing below has been done. Each one is a reason a unit can fail in the field after it passed on the bench.

- **Cold and wet.** Modules for a day at −25 °C, then repeated door-open cycles that soak them in condensation.
- **Vehicle electrical disturbances.** The input stage was designed for them and has not been tested against the vehicle standards (ISO 7637-2, ISO 16750-2). For 24 V trucks this test decides the surge protection.
- **Heat.** The tracker at 60 °C or more, as in a parked cab in summer, with attention to the cell and to the ignition reading.
- **Battery runtime.** The real draw in each mode, on a real board, before any runtime is promised.
- **Radio approval.** The modem and the processor module carry their own approvals. A finished product that uses the mobile network may still need approval from the national regulator. Ask before selling.
- **Calibration.** A written procedure and records for every sensor, as [USER-GUIDE.md](USER-GUIDE.md) describes.
- **A long run.** Several trucks for several weeks, compared against an independent data logger in the same cargo space.
