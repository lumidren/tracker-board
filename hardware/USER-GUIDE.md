# Fitting and using the tracker and its temperature modules

This guide is for the person who fits the hardware in a truck and the person who looks after it.

**Read this first.** It describes how the design is meant to be used. No board has been built yet, so nothing here has been tried on real hardware. Steps that depend on firmware are marked, because the firmware is not written.

## What goes in one truck

| Item | How many | Where |
| --- | --- | --- |
| Tracker in its enclosure, with the backup cell inside | 1 | In the cab |
| Vehicle harness with a 2 A blade fuse | 1 | Cab fuse box to the tracker |
| GNSS antenna and LTE antenna | 1 each | Cab, with a view of the sky |
| SIM card with a data plan, PIN switched off | 1 | In the tracker |
| Temperature module | 1 or more | In the cargo space |
| Shielded network cable | 1 per module | Tracker to module, module to module |
| Magnetic door switch | 1 or 2 | Cargo doors |

## On the bench, before going to the truck

Do these at a desk. A fault found here costs minutes. The same fault found under a dashboard costs an afternoon.

1. **SIM.** Fit the nano SIM before any power is connected.
2. **Register the tracker on the server.** On the server, run

   ```
   node server/devices.js add TRK-104 "Cab unit 1"
   ```

   with the unit's own name in place of `TRK-104`. The key is printed once. Loading it into the tracker is done over USB-C with a tool the firmware will provide.
3. **Give every module its own address** with the small switch block. Write the address on the box.

   | Address | Switches on | Address | Switches on |
   | --- | --- | --- | --- |
   | 1 | 1 | 9 | 1, 4 |
   | 2 | 2 | 10 | 2, 4 |
   | 3 | 1, 2 | 11 | 1, 2, 4 |
   | 4 | 3 | 12 | 3, 4 |
   | 5 | 1, 3 | 13 | 1, 3, 4 |
   | 6 | 2, 3 | 14 | 2, 3, 4 |
   | 7 | 1, 2, 3 | 15 | 1, 2, 3, 4 |
   | 8 | 4 | | |

   All switches off is not an address. A module left that way stays silent and blinks fast.
4. **Connect everything on the desk:** tracker, cable, module, cable, module. Fit the END TERM jumper on the last module only.
5. **Connect the cell,** then 12 V from a bench supply.
6. **Check the lights** (see the next table) and check that the unit appears in the control room with a temperature.

## The lights

On the tracker:

| Light | Meaning |
| --- | --- |
| PWR, green | The board has power, from the truck or from its cell |
| EXT, green | The truck supply is present. Dark with the engine running means a blown fuse or a loose wire |
| NET, blue | Steady: looking for a network. Slow blinking: connected on 2G. Quick blinking: connected on LTE, or sending data on either network. Dark: the modem is off or asleep, which is normal on the battery |
| STATUS, amber | Set by the firmware. The pattern proposed in [FIRMWARE.md](FIRMWARE.md): one short flash every 5 s means working and connected |

On each module: one green light that blinks briefly every time the tracker questions it. Fast, constant blinking means its address switches are all off.

## Fitting the tracker

**Where.** In the cab, behind the dashboard or under a seat. Never in the cargo space: the cell must not be charged in the cold, and the mobile signal is poor inside an insulated box. Keep it out of direct sun and away from heater outlets. Fix it firmly, because it senses movement.

**Power.** Three wires into the square four-pin plug. The board is designed for 12 V trucks; do not fit it to a 24 V truck until the 24 V question in the [README](README.md) has been settled and tested.

| Wire | Tracker pin | Connect to |
| --- | --- | --- |
| Supply | 1 | A point that is live all the time, through the 2 A blade fuse fitted close to that point |
| Ground | 2 or 4 | A chassis ground bolt or the fuse-box ground |
| Ignition | 3 | A point that is live only with the key on |

Do not take the supply from the refrigeration unit or from anything the driver can switch off. Every interruption will be reported as a power cut.

**Antennas.** The GNSS antenna lies flat facing the sky, on top of the dashboard or on the roof, never under metal. The LTE antenna goes on glass or plastic, at least a hand's width from the GNSS antenna, never inside a metal box.

**Doors.** Fit the switch on the door frame and its magnet on the door, so the switch is closed when the door is shut. Two wires per switch, into the long single-row four-pin plug (it cannot go into the square power socket by mistake).

| Door | Door plug pins |
| --- | --- |
| Door 1 | 1 and 2 |
| Door 2 | 3 and 4 |

If only one door is watched, join pins 3 and 4 with a short wire link. An unconnected input reads as a door standing open.

## Fitting the modules

**The cable.** Run it from the tracker through the bulkhead into the cargo space, to the first module, then from module to module in one line. Seal the hole. Keep it away from the refrigeration unit's power cables. Fix it every 30 cm.

**Where to put them.** These are common practice for refrigerated transport. A customer with regulated goods will have a temperature map of the cargo space that says exactly where.

- One near the rear doors, high up. It is the warmest spot and the first to feel a door opening.
- One near the front, where the air returns to the cooling unit.
- Never directly in the stream of cold air leaving the unit, never touching the wall or the goods, never where a forklift will hit it.
- For the temperature in the middle of the load, plug a probe on a lead into the nearest module.

**How to mount them.** Sockets facing down, with the cable rising to the socket from below, so water runs off the cable and not into the plug.

**The last module** gets the END TERM jumper. No other module has one.

**Use straight-through network cables only.** A crossover cable ties the data lines to the supply: nothing answers and the terminators run hot.

**Never plug the sensor cable into a computer, a router or a network switch.** It looks like a network cable. It carries 5 V and can damage them.

## The first test in the truck

1. Engine on: PWR and EXT lit, NET blinking within a minute or two.
2. In the control room, the unit shows a temperature, a position and closed doors.
3. Open a cargo door. The door shows as open within seconds.
4. Pull the blade fuse. EXT goes dark, PWR stays lit, and a power alert appears within a minute. Put the fuse back and the alert clears.
5. Unplug the sensor cable at the tracker. Within a minute the modules' lights stop blinking and the tracker's STATUS light blinks fast. Plug it back and both return to normal. (The control room does not show a lost sensor yet: it keeps showing the last temperature. That is a gap in the server, listed in [PROTOCOL.md](PROTOCOL.md).)

A unit that passes all five is fitted correctly.

## Day to day

Nothing needs doing. The tracker reports by itself, keeps reporting on its cell when the truck supply is cut, and stores its readings while there is no signal.

Tell the driver three things: it reports door openings, it reports being unplugged, and unplugging it does not stop it.

## When something is wrong

| What you see | Likely cause | What to do |
| --- | --- | --- |
| No lights at all | No truck supply and the cell is empty or unplugged | Check the blade fuse, the vehicle connector and the cell plug |
| PWR lit, EXT dark with the engine running | Blown fuse, supply wire on a switched point, or supply and ground swapped. Swapped wires do no damage | Check the fuse and the wiring |
| NET steady for many minutes | No coverage, SIM not active, antenna unplugged | Check the antenna, try the SIM in a phone |
| Unit shown as not reporting | No signal, or the key was not loaded or was revoked | Check NET first, then the key |
| A power alert while the truck is running | Supply taken from a switched point, or a loose ground | Move the supply wire, tighten the ground |
| STATUS blinks fast, module lights dark | No module answers: cable unplugged, a crossover cable, or END TERM missing or fitted twice. The control room keeps showing the last temperature | Watch the module lights. With everything unplugged from power, measure between the two data wires: 55 to 60 Ω is right |
| One module missing | Two modules share an address, or the cable after the previous module is bad | Give every module its own address, swap the cable |
| All modules vanish at once, position lost too | The cable supply has switched itself off on a short, usually water in a socket or a crushed cable. The tracker tries once more and then keeps it off | Dry the socket or replace the cable, then press the tracker's RESET button so it tries again. (Unplugging the vehicle connector does not help: the tracker keeps running on its cell) |
| A module restarts again and again | The 5 V arriving is too low: very long cable, or a damaged one | Shorten or replace the cable |
| A door shows open all the time | Switch and magnet too far apart, a cut wire, or an unused input left open | Align the switch, check the wire, link the unused input |
| Position missing or jumping | GNSS antenna under metal | Move the antenna |
| Battery runs down quickly | An old cell, or a very hot cab | Replace the cell, move the unit out of the sun |

## Checking a sensor's accuracy

Do this before first use and once a year, and keep the record. Customers with regulated goods will ask for it.

- **A probe on a lead:** fill an insulated cup with crushed ice and a little water, stir, wait ten minutes, and hold the probe in the middle. It should read 0.0 °C, give or take 0.5.
- **A module:** put it in a closed box in a refrigerator or freezer next to a calibrated reference thermometer. Wait at least half an hour and compare.
- If the difference is steady, store it in the module as a correction ([SENSOR-BUS.md](SENSOR-BUS.md)): settings register 0 for the module's own sensor, register 2 for a probe plugged into it.
- Write down the date, the module's serial number, the reference thermometer used, both readings and the correction.

## Care and safety

- The tracker contains a lithium cell. Keep it out of the cargo space and out of the sun. Replace a cell that has swollen or no longer holds charge, and hand the old one to a battery recycling point.
- Unplug the tracker's vehicle connector before any electric welding on the truck.
- The modules are not sealed against a pressure washer. Cover or unplug them before the cargo space is washed.
- Do not open the tracker with the truck supply connected.
