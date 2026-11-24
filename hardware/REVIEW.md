# Independent review, 24 November 2026

After the first version of this design was published, it was reviewed once more by eight reviewers, each taking one area: the vehicle input and charger, the three converters, the modem, the processor and its inputs, the temperature module, the small parts never compared with datasheets, the KiCad files, and the documents. Each worked from the manufacturers' datasheets and from calculation. A second reviewer then tried to disprove every finding from the primary sources. Findings that rested on memory alone were not accepted as confirmed.

This was a review on paper. No board was built or measured, and KiCad was still not used.

## Result

- **Nothing critical.** No wrong pin number on a main part, no reversed diode, no supply left unconnected.
- **75 findings held up:** 65 raised and confirmed, and 10 more found by the second reviewers. 15 were rated major (several of them the same problem seen by two reviewers), the rest minor or documentation errors.
- Every finding was either fixed in the design or written into the documents as a limit or a decision. The list below gives each one.

## Confirmed correct

These were checked against primary sources and needed no change:

- **ESP32-S3-WROOM-1:** all 41 pin numbers against Espressif's module datasheet v1.8; strapping pins safe at start-up; the three analog inputs on ADC1; the door and motion inputs on pins that can wake the chip; USB D− and D+ on the right pins; IO35 to IO37 and IO47, IO48 usable on the N8 variant; the reset and automatic programming circuit.
- **KiCad files:** coordinate convention, pin angles, the 1.27 mm grid, labels, symbol names, instances, paper size and the minimal project file, compared with KiCad 7's source code and two of KiCad's own test files. All 528 tracker and 145 module connections land exactly on their pins; the netlist rebuilt from the files alone equals the design.
- **Pin numbers** of the SP3485, SM712, USBLC6-2SC6, SS8050, BAT54S, LIS3DH, SHT40, SHT45, ATmega328P, MCP1702, BQ24074 and A7670E (pads 1 to 88 also against the later R2 manual).
- **Arithmetic:** the RS-485 idle bias, the multimeter readings for the terminators, the divider factors, the converter output voltages, the Modbus example frames and their check bytes.

## Findings and what was done

### Vehicle input and charger

| Finding | Done |
| --- | --- |
| The reverse-polarity diode (60 V) sees the supply plus a negative surge clamped at about −45 V: up to 78 V on a 24 V truck | Now a 100 V diode, SS510C |
| On 24 V trucks the 33 V surge diode conducts through a whole load dump, even with central suppression, far beyond its energy rating; the suggested SM8S33A does not cure it | Written as decision 2 in the README: the board is designed for 12 V trucks; 24 V needs a tested surge stage or a 100 V front end |
| The input range said 9 to 36 V; the surge diode only stays off to 33 V | Now 9 to 32 V everywhere, bench step 3 to 32 V |
| The charger's 5-hour default safety timer ends a full charge of the 2600 mAh cell early, and firmware cannot clear the fault | 68 kΩ timer resistor: about 9 hours |
| On the battery, a 2G burst can reach the charger's short-circuit detector, which cuts `VSYS` for 60 ms | A bench test on the first board (build guide step 10), and LTE only while on the battery until then |
| Leakage of the BAT54S clamp into the 47 kΩ ignition divider can read as "ignition on" in a hot cab | Low-leakage BAV199 clamp |
| The ignition line has no surge diode; a single 0603 resistor would see the −600 V switch-off pulse of a 24 V truck | Two 499 kΩ 1206 resistors in series; factor now 22.23 |
| The 60 V LM2596HV has no named maker; the common LM2596S-5.0 is a 40 V part | H&M Semi named, with a warning, in the parts list and the README |
| Input and output capacitors smaller than the regulator's reference circuit | 220 µF / 63 V with a stated ripple rating at the input, 470 µF at the output |
| `CHG_STAT` described as "low while charging"; it only reports the first charge, and flashes on a fault | Pin map, firmware brief and README corrected |
| The 0603 1 MΩ supply divider needs a 75 V rating | Stated in the parts list |

### Converters and the switched 5 V rail

| Finding | Done |
| --- | --- |
| A short on the sensor cable was limited only by a resettable fuse, and could pull `VSYS` down and restart the tracker | TPS2553-1 current-limited switch (about 0.5 A, latches off, reports a fault on GPIO 35) in place of the transistor switch and the fuse |
| 6.8 µH / 2 A does not exist in the inductor family named | 4.7 µH / 2 A, Taiyo Yuden NRS4018T4R7MDGJ |
| SS24 is an SMB part from some makers, but has an SMA footprint | SMA makers named in the parts list |
| The 3.3 V rail carries more capacitance than the TLV62569 is characterised for | Unfitted position for a 6.8 pF feed-forward capacitor, and a load-step test |
| A processor reset cuts the modem supply without the shut-down SIMCom asks for | Firmware holds the pin; resets through the EN pin are accepted on the bench (firmware brief) |
| Switching the modem supply off does not discharge it: about 1066 µF stays near 3 V for minutes | 470 Ω discharge switched by GPIO 37 |
| The modem converter's power-good signal was unused | Read on GPIO 36 |
| Bench windows for `V_MODEM`, `+3V3` and `5V_SW` were narrower than the parts' tolerance | Widened to the worst case |
| The README said the 1000 µF capacitor covers the transmit bursts; it covers about a fifth of one | Reworded |

### Modem

| Finding | Done |
| --- | --- |
| The status line floated with the modem off, and the translator pulled it high | Status now through a transistor, as in SIMCom's reference: low means started, defined at all times |
| The SIM lines carried about three times the capacitance SIMCom allows (33 pF fitted on each line plus an 80 pF array) | One 0.5 pF ESD9L5.0 diode per line; the three line capacitors left unfitted and 33 pF added on SIM_VDD, as in the guide |
| Two of the four small capacitors the guide asks for at the supply pads were missing | 1 µF and 10 pF added |
| No test pads for the modem's 1.8 V and its log output; the service header could only reach 5 V for the BOOT pin | Two test pads, and an open solder jumper to 1.8 V through 10 kΩ |
| The parts list did not say which A7670E; the newer -LASE and -FASE have 124 pads | 88-pad edition named, with the warning |
| NET light: quick blinking also happens on 2G while sending; start time is 7 to 11 s; one status pulse is not "ready" | User guide and firmware brief corrected |

### Processor, doors and probe

| Finding | Done |
| --- | --- |
| A door wire at vehicle voltage pushed current into the 3.3 V rail, which nothing can absorb while the processor sleeps; both inputs at once (for example the vehicle plug pushed into the identical door socket) could lift it to about 6 V | A diode in each pull-up, 220 kΩ into a low-leakage BAV99 clamp, and a single-row door connector that the 2×2 vehicle plug cannot enter |
| The serial header was not in the Rev A order: 3.3 V and ground swapped, transmit and receive swapped | Rev A order restored: 1 3.3 V, 2 GND, 3 processor transmit, 4 processor receive, 5 DTR, 6 RTS |
| The RS-485 bias drew 3.9 mA from the always-on 3.3 V rail, even asleep | Bias now from the switched cable supply: about 357 mV idle, nothing drawn while off |
| The probe connector carried the 3.3 V logic rail off the board unprotected | 100 Ω in series with 100 nF at the connector |
| The USB-C shell pin is called S1 in KiCad 7 to 9 but SH in KiCad 10 | Kept as S1, with a check in the build guide |

### Temperature module

| Finding | Done |
| --- | --- |
| 3.3 V rail had only the regulator's minimum capacitance | 10 µF |
| The README said a wrong supply "trips the fuse instead of killing the board"; between about 7 and 11 V the surge diode overheats instead | Reworded; the fuse is now named as a 30 V part |
| The high fuse 0xD9 lets every reprogramming erase the stored corrections | 0xD1 (0xD2 with a boot loader), with a versioned, checksummed EEPROM block |
| The supply reading was called the cable voltage; it is about 0.3 V lower | Pin map and documents corrected |
| The ATmega328P was compared with the automotive datasheet, not the one for the -AU part ordered | Stated in the README, with the two tables to confirm |
| A crossover cable puts 5 V across both terminators (0.21 W in an 0603 part) | Terminators now 1206, and "straight-through cables only" in the guides |

### KiCad files and the generator

| Finding | Done |
| --- | --- |
| The files named KiCad itself as their generator | Now `maatora_kit` |
| Test pads were marked for KiCad's parts list but left out of the CSV | Marked as not in the parts list |
| The script's read-back check never looked at the written file | A new check parses the written `.kicad_sch` and places every pin the way KiCad does; it catches a flipped sign and swapped labels |

### Documents and the server contract

| Finding | Done |
| --- | --- |
| Uploading every 5 or 15 minutes trips the server's 5-minute "not reporting" alarm | At most every 4 minutes in every mode; a longer battery limit listed as a server change |
| A missing sensor cannot be reported: the control room keeps showing the last temperature | Listed under "Gaps in this contract" in PROTOCOL.md; the truck test now checks the lights instead |
| PROTOCOL.md asked for an upload when the temperature leaves its range, but the tracker is never told the range | Removed; the trigger lists in PROTOCOL.md and FIRMWARE.md now match |
| A body over 64 KB gets a closed connection, not a 413 | PROTOCOL.md corrected |
| The bench server command listened on the PC only | `--lan` added, and plain HTTP noted |
| The bench supply limit stayed at 0.2 A while the cell charges at 0.5 A | Raised in steps 5 and 9 |
| The widest ADC range cannot meet a 3 % check | Narrowest range per signal; tolerances in volts |
| The tracker's own probe was never read, and the battery table had the GNSS on a rail that was off | Firmware brief corrected |
| The `stop` and `detour` simulator scenarios need `--stop-after 20`, a long route and a fresh database, and are only in newer versions of the simulator | PROTOCOL.md corrected |
| Smaller slips: a probe correction sent to the air register, three lights in the diagram instead of four, the crystal saving two parts instead of three, the "not compared" list missing several parts, the network-safe pinout overstated | All corrected |

## Still open

- **24 V trucks** (README decision 2).
- **2G on the battery** until build guide step 10 has been run.
- **Server changes:** a field and an alert for a missing cargo sensor, one temperature per sensor, the unit's range in `GET /api/device/state`, and a longer "not reporting" limit for trackers on their battery.
- **Parts still compared from memory only:** BAV99, BAV199 and BAT46W (the makers' sites refused the download), the diode ratings, the NEO-7M header and the connectors. The README lists them.
- **Opening the files in KiCad**, building a board and measuring it.
