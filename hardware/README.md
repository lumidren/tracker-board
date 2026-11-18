# Maatora tracker board: Rev B design

A proposed second revision of the vehicle unit, based on a review of the Rev A schematic (`Schematic.pdf`, one page: ESP32-S3, NEO-7M GPS, RS-485, 12 V input).

**Status: a design proposal, not a finished schematic.** It was written from a drawing and from datasheets, without a board to measure. An electronics engineer must review it, and every part value marked *verify* must be checked against the manufacturer's datasheet, before anything is ordered. Figures quoted from datasheets list their source at the end.

![Rev B block diagram](rev-b-blocks.svg)

## What Rev B changes, and why

| Rev A | Problem | Rev B |
| --- | --- | --- |
| 18 V spike suppressor, 16 V converter, 30 V transistor | Works on 12 V only. A 24 V truck would trip the fuse or destroy the converter | Input stage rated for 9 to 36 V, parts rated 60 V |
| MT2492 5 V converter (16 V operating, 17 V absolute maximum) behind a suppressor that clamps near 25 V | The converter is the first thing to fail on a voltage spike, even on 12 V | A 5 V converter rated for 60 V input |
| No mobile modem on the board | The board cannot report by itself | LTE module with SIM holder and antenna connector |
| No backup battery | Cutting the supply silences the unit, which is exactly what a dishonest driver would do | One lithium cell with a temperature-supervised charger; the unit keeps reporting and says when main power was cut |
| No door input | Door openings are the main driver-accountability signal | Two protected door inputs that can wake the processor |
| RS-485 lines leave the board bare | Static and surges from a long cable into the cargo area | Surge protection, a fused sensor supply, proper idle bias |
| Processor cannot tell main supply from battery | Firmware cannot report "main power cut" or battery level | Voltage sensing for main supply and battery |
| Serial header only | Needs an adapter to program or read logs | USB-C on the processor's native USB, header kept |
| Nothing shows the unit's state | Installers cannot tell whether it works | Power, network and status lights |

Everything else in Rev A is kept: the processor, the GPS module, the RS-485 transceiver and RJ45 pinout, ignition sensing, the switched 5 V rail and the automatic programming circuit.
