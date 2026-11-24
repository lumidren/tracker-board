# The sensor cable

One cable runs from the tracker in the cab to the temperature modules in the cargo space. It carries 5 V to power the modules and one RS-485 pair for the tracker to question them.

**Status:** this is a specification. The hardware design follows it. No firmware implements it yet.

## The cable

Ordinary shielded network cable (Cat5e) with RJ45 plugs, wired straight through. It runs as one line: tracker, module, module, module. Each module has two sockets, in and out, and it does not matter which is used for which. Never split the cable into branches.

| Pin | Colour (T568B) | Rev A pinout, as built | Network-safe pinout, optional |
| --- | --- | --- | --- |
| 1 | white/orange | Ground | Ground |
| 2 | orange | 5 V | Ground |
| 3 | white/green | B | Ground |
| 4 | blue | A | A |
| 5 | white/blue | B | B |
| 6 | green | A | Ground |
| 7 | white/brown | 5 V | 5 V |
| 8 | brown | Ground | 5 V |
| Shell | shield | Ground | Ground |

A is the line that sits higher while nobody is talking. B is the lower one.

**This is not a network cable in use, only in shape.** Never plug it into a computer, a router, a switch or a power-over-network injector.

- With the Rev A pinout, 5 V and ground share a pair. A network socket has a transformer across each pair, so plugging in puts 5 V across that transformer. The tracker's 0.5 A fuse limits the current, but the other device can still be damaged.
- The network-safe pinout gives both wires of a pair the same signal, so nothing flows if it is plugged into a network socket. It works with straight and crossover cables alike. It does **not** work with boards wired to the Rev A pinout. To switch, set `CABLE = 'network-safe'` in `tools/build.py`, rebuild, and change every board together.
- Neither pinout survives an injector that puts 24 V or 48 V on the cable.

## Electrical rules

| | |
| --- | --- |
| Signalling | RS-485, half duplex, 3.3 V transceivers (SP3485) |
| Terminators | 120 Ω at the tracker (solder jumper `TERM`, closed as built) and 120 Ω at the last module (the END TERM jumper). No other module has its jumper fitted |
| Idle state | Set at the tracker only: 390 Ω from A to 3.3 V and 390 Ω from B to ground. With both terminators that gives about 235 mV between A and B |
| Supply | 5 V from the tracker through a 0.5 A resettable fuse. Each module has its own 0.2 A fuse and a diode against a reversed supply |
| Modules on one cable | Up to 15, addresses 1 to 15 |
| Module current | About 5 mA each, more for the few milliseconds it answers (estimate, not measured) |

**A quick check with a multimeter, everything unpowered:** between A and B you should read 55 to 60 Ω when both terminators are in place, and 100 to 120 Ω when the END TERM jumper is missing. A reading near 40 Ω means a third terminator is fitted somewhere.

**Length.** The data would run for hundreds of metres. The limit is the 5 V arriving at the far end. Network cable has roughly 0.09 Ω per metre of wire, and the cable uses two wires each way, so 30 m with 15 modules loses about a quarter of a volt. Every module reports the voltage it receives (register 4 below). Keep it above 4.2 V.

## Messages

Modbus RTU, the common industrial protocol, so a module can be tested with a USB to RS-485 adapter and any Modbus program.

| | |
| --- | --- |
| Speed and format | 9600 baud, 8 data bits, no parity, 1 stop bit |
| Who speaks | Only the tracker starts an exchange. A module only answers |
| Module address | The four-way switch: 1 to 15. With all switches off the module stays silent and blinks fast, so an unset module cannot disturb the others |
| Answer time | Within 20 ms. A module always has its latest measurement ready |
| Tracker gives up after | 100 ms, then tries twice more |
| Gap between messages | At least 4 ms of silence |
| Check | Modbus CRC-16, low byte first |

After the tracker switches the cable supply on, it waits 300 ms before the first question. A probe needs about one second more for its first value.

### Measurements: read with function 04

All values are 16 bits, high byte first.

| Register | Value | Scale | Notes |
| --- | --- | --- | --- |
| 0 | Air temperature | °C × 100, signed | `7FFF` means no valid reading |
| 1 | Relative humidity | % × 100 | `FFFF` means no valid reading |
| 2 | Probe temperature | °C × 100, signed | `7FFF` means no probe, or a probe fault |
| 3 | Status | bits | See the next table |
| 4 | Cable supply at the module | millivolts | Measured after the module's input diode |
| 5 | Age of the air reading | tenths of a second | Stops at 65535 |
| 6 | Seconds since start, low half | | |
| 7 | Seconds since start, high half | | |
| 8 | Hardware revision | | 2 for this design |
| 9 | Firmware version | major × 256 + minor | |
| 10 | Serial number, high half | | The serial number of the SHT45 on the board |
| 11 | Serial number, low half | | |

Status bits in register 3:

| Bit | Meaning when set |
| --- | --- |
| 0 | The air sensor did not answer, or its checksum was wrong |
| 1 | A probe is connected |
| 2 | A probe was found earlier and now fails |
| 3 | Cable supply below 4.0 V |
| 4 | The module has restarted since this bit was last cleared |
| 5 | The address switch was moved after start. The new address applies after a restart |

### Settings: read with function 03, write with function 06

| Register | Value | Scale | Notes |
| --- | --- | --- | --- |
| 0 | Air temperature correction | °C × 100, signed | Added to every reading. Limited to ±5.00. Kept when power is removed |
| 1 | Humidity correction | % × 100, signed | Limited to ±10.00 |
| 2 | Probe temperature correction | °C × 100, signed | Limited to ±5.00 |
| 3 | Clear the restart bit | write 1 | |
| 4 | Find me | seconds, up to 60 | The module blinks quickly for that long, so an installer can see which box has which address |

A request the module cannot serve gets a standard Modbus exception: 01 for an unknown function, 02 for a register that does not exist, 03 for a value outside its limits.

### A worked example

The tracker asks module 3 for registers 0 to 5:

```
03 04 00 00 00 06 71 EA
```

The module answers:

```
03 04 0C F7 A4 10 1D 7F FF 00 00 12 16 00 01 4F 9C
```

| Bytes | Meaning |
| --- | --- |
| `03 04 0C` | Module 3, function 04, 12 bytes follow |
| `F7 A4` | −2140, so −21.40 °C |
| `10 1D` | 4125, so 41.25 % |
| `7F FF` | No probe |
| `00 00` | Status: nothing wrong |
| `12 16` | 4630 mV on the cable |
| `00 01` | The reading is 0.1 s old |
| `4F 9C` | Check |

A question about a register that does not exist is answered with `03 84 02 63 01`.

The check bytes in these examples were calculated, and the same routine reproduces the well-known test message `01 03 00 00 00 0A C5 CD`.

## How the tracker uses it

- At start, and every ten minutes after, it asks addresses 1 to 15 once each. The ones that answer are the modules it knows.
- For every reading it asks each known module for registers 0 to 5.
- A module that fails three readings in a row is treated as missing.
- [FIRMWARE.md](FIRMWARE.md) says which value is sent to the server when there are several modules.

## What the cable does not protect against

Nothing on the cable is secret or signed. Someone with a tool and access to the cable can answer in place of a module, or write a correction into one. Three things limit the damage: corrections are capped at ±5 °C, the tracker should read each module's serial number and corrections at start and record any change, and module enclosures can be sealed. For customers who need evidence that holds up against a determined cheat, signed answers from the module are a later step.
