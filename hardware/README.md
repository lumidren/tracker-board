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

## Power input: 9 to 36 V

Order of parts from the vehicle connector:

1. **Fuse.** A 2 A blade fuse in the harness, close to where it taps the vehicle supply, plus a resettable fuse on the board rated for 60 V and about 1.1 A hold.
2. **Spike suppressor.** Standoff voltage of 33 V so that it stays off on a 24 V system while charging (about 28.8 V). Minimum: a 1500 W part such as SMCJ33CA. Preferred: a load-dump rated part such as SM8S33A or SM8S36A. *Verify the clamp voltage is below the rating of every part after it.*
3. **Reverse-polarity protection.** Either keep the Rev A P-MOSFET circuit with a 60 V transistor, a 12 V gate clamp and the 100 kΩ gate resistor, or replace it with a 60 V, 5 A Schottky diode (for example SS56). The diode is simpler and costs about 0.4 V.
4. **Bulk capacitor.** 100 µF or more, rated 63 V.

Everything connected to this node must be rated for at least 60 V. Vehicle transients are governed by ISO 7637-2 and ISO 16750-2; whether the suppressor survives an unsuppressed load dump on a 24 V system is a question for the reviewing engineer.

## 5 V rail

A step-down converter rated for 60 V input and at least 3 A output:

- **LM2596HVS-5.0**: rated to 60 V input (63 V absolute maximum), 3 A, needs at least 8 V in. Large but simple and widely stocked.
- Smaller alternatives: LMR16030 or TPS54360B. *Verify.*

Its catch diode and input capacitor must also be rated above the input maximum (the LM2596HV datasheet asks for a capacitor rating 1.25 times the maximum input).

The switched rail from Rev A (`5V_Controlled`, P-MOSFET driven from GPIO15) is kept. Add 100 nF from the P-MOSFET gate to its source so the rail rises gently instead of dipping the 5 V supply.

## Backup battery and system rail

**Requirement:** when vehicle power disappears, the processor and the modem keep running long enough to report it, and keep reporting position and door events for hours.

**Recommended arrangement:** one lithium-ion cell forms the system rail (3.4 to 4.2 V). A charger fed from the 5 V rail keeps it full. The modem and the 3.3 V regulator both draw from that rail, so the cell also supplies the modem's short current bursts.

- **Cell:** one 18650 (about 2600 mAh) with a protection circuit and a 10 kΩ temperature sensor against the cell.
- **Charger:** must stop charging when the cell is too cold or too hot. A lithium cell must not be charged below 0 °C or above about 45 °C, and a parked truck cab reaches both. The BQ24074 does this through its TS pin and its datasheet thresholds correspond to roughly 0 °C and 50 °C with a 10 kΩ sensor; it accepts 4.35 to 10.2 V in and charges at up to 1.5 A. Set the charge current to about 0.5 A.
- **Caution with the BQ24074:** its system output regulates at 4.4 V, which is above the modem's 4.2 V maximum. The modem must therefore be connected to the battery pin, not to the system output. *The reviewing engineer should confirm the charge-termination behaviour with a load on the battery pin.*
- **Battery placement:** in the cab with the unit, never in the refrigerated space.

**Strong suggestion:** do not design this section from scratch. Published boards that combine an ESP32, an A7670 modem and an 18650 cell already solve the modem supply and charging together. Start from one of those schematics, or from the reference circuits in the modem's hardware design guide.

## 3.3 V rail

Keep the SY8089 circuit but feed it from the system rail instead of the 5 V rail, so the processor runs on battery. Change the inductor to 2.2 µH. *Verify how the converter behaves when the cell is nearly empty and its input approaches 3.3 V; if it does not pass the input through cleanly, use a 1 A low-dropout regulator instead.* Add 10 µF and 100 nF directly at the module's 3V3 pin.

## Mobile modem

An LTE Cat 1 module with 2G fallback. Example: SIMCom A7670E, whose commonly listed bands are LTE 1, 3, 5, 7, 8 and 20. *Check the exact variant against the bands your SIM provider uses before choosing.*

From the A7670 hardware design guide:

- **Supply:** 3.4 to 4.2 V, 3.8 V recommended. Peaks reach 2.8 A when transmitting on 2G. Place at least 300 µF close to the module if the supply can deliver that peak, 1000 µF if it cannot, plus 100 nF and small high-frequency capacitors at the pins.
- **Logic level is 1.8 V.** The processor is 3.3 V, so the serial lines need level conversion: a dual-supply translator powered from the module's 1.8 V output, or the transistor circuit shown in the guide.
- **Power key:** pulled up inside the module to its supply. Drive it through a transistor, never directly from a GPIO.
- **SIM holder** with protection diodes on its lines, close to the module.
- **Antenna:** 50 Ω trace to a U.FL or SMA connector, with a matching network footprint. This trace is the part most likely to be wrong on a first board; follow the guide's layout rules exactly.

Add a P-MOSFET switch on the modem supply so firmware can cut power completely if the modem stops responding.

If the team prefers to keep an external 4G stick on the USB socket instead: add 1000 µF next to the socket and expect the stick, not the board, to be the least reliable part.

## GPS

Keep the NEO-7M module and its pins. Fit an external active antenna; a GPS antenna inside a metal cab sees very little sky.

## Door and tamper inputs

Two inputs for door switches (a magnetic reed switch that closes to ground when the door is shut):

- 10 kΩ pull-up to 3.3 V, 10 kΩ in series to the processor pin, 100 nF to ground at the pin.
- A dual diode clamp (BAT54S) to 3.3 V and ground at the pin, and a small protection diode at the connector. With the series resistor this survives a wire being shorted to 24 V.
- Both on pins that can wake the processor from sleep.

Add a motion sensor (LIS3DH or similar, I2C) with its interrupt on a wake-capable pin. It detects the unit being moved or struck while the vehicle is parked, and lets the processor sleep until something happens.

## Sensor connections

- **RS-485 (kept).** Add an SM712 protection diode across A and B. Replace the 4.7 kΩ bias resistors with 680 Ω so the idle state is defined with the 120 Ω terminator fitted, and make the terminator a solder jumper. Put a 500 mA resettable fuse in the 5 V line that leaves on the RJ45.
- **One-wire probe input (new).** 4.7 kΩ pull-up, 100 Ω in series, a protection diode. Takes inexpensive sealed temperature probes.
- **I2C (new).** The motion sensor, plus a footprint for a board temperature and humidity sensor.

For pharmaceutical customers the cargo temperature sensor needs a calibration record against a reference thermometer. That is a procedure and a document, not a component.
