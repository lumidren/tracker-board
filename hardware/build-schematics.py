"""Builds the Rev B schematic sheets as one HTML file that prints to an A4
landscape PDF, one sheet per page.

    python hardware/build-schematics.py out.html
    chrome --headless --no-pdf-header-footer --print-to-pdf=out.pdf out.html

Each sheet draws one section of the board as a signal path: series parts sit on
the line, parts to ground or to a rail hang below it, net names are in capsules.
The content mirrors hardware/README.md and carries the same status: a design
proposal, to be redrawn in a CAD tool and reviewed by an electronics engineer.
"""

import html
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
WIDTH, HEIGHT = 1400, 880
INK, MUTED, LINE = '#0F172A', '#475569', '#334155'
KINDS = {
    'kept': ('#FFFFFF', '#94A3B8'),
    'changed': ('#E0F2FE', '#0284C7'),
    'new': ('#D1FAE5', '#059669'),
}
GAP = 24
DATE = '2026-11-18'


def esc(value):
    return html.escape(str(value), quote=True)


def text_width(value, size, bold=False, mono=False):
    factor = 0.56 if mono else (0.6 if bold else 0.55)
    return len(value) * size * factor


# Items of a signal path ------------------------------------------------------

def port(*lines):
    return ('port', lines)


def blk(kind, *lines):
    return ('box', kind, lines)


def node(label, *shunts):
    return ('node', label, shunts)


def sh(kind, end, *lines):
    return (kind, end, lines)


def shunt_size(shunt):
    lines = shunt[2]
    width = max([text_width(lines[0], 11, bold=True)] + [text_width(line, 10) for line in lines[1:]]) + 16
    return max(width, 92), 14 * len(lines) + 12


def item_size(item):
    if item[0] == 'port':
        lines = item[1]
        return max(text_width(line, 11, mono=True) for line in lines) + 20, 14 * len(lines) + 12
    if item[0] == 'box':
        lines = item[2]
        width = max([text_width(lines[0], 12, bold=True)] + [text_width(line, 10.5) for line in lines[1:]]) + 24
        return max(width, 110), max(44, 22 + 14 * len(lines))
    label, shunts = item[1], item[2]
    total = sum(shunt_size(shunt)[0] for shunt in shunts) + 12 * max(0, len(shunts) - 1)
    return max(total, text_width(label, 10.5, mono=True) + 14, 24), 0


class Sheet:
    def __init__(self, title):
        self.title = title
        self.parts = []
        self.html = None

    def add(self, markup):
        self.parts.append(markup)

    def text(self, x, y, value, size=11, bold=False, anchor='middle', fill=INK, mono=False):
        extra = (' font-weight="600"' if bold else '') + (' class="m"' if mono else '')
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" text-anchor="{anchor}" fill="{fill}"{extra}>{esc(value)}</text>')

    def line(self, points, width=1.5, color=LINE):
        path = 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in points)
        self.add(f'<path d="{path}" fill="none" stroke="{color}" stroke-width="{width}"/>')

    def dot(self, x, y):
        self.add(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="{LINE}"/>')

    def ground(self, x, y):
        for index, half in enumerate((10, 6.5, 3)):
            self.line([(x - half, y + index * 4), (x + half, y + index * 4)])

    def rect(self, x, y, width, height, fill, stroke, radius=8, stroke_width=1.5):
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{width:.1f}" height="{height:.1f}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"/>')

    def heading(self, x, y, value):
        self.text(x, y, value, size=13, bold=True, anchor='start')

    def note(self, x, y, lines, size=11.5):
        for index, value in enumerate(lines):
            self.text(x, y + index * 17, value, size=size, anchor='start', fill=MUTED)

    def legend(self, y=868):
        x = 20
        for kind, label in (('kept', 'Kept from Rev A'), ('changed', 'Changed in Rev B'), ('new', 'New in Rev B')):
            fill, stroke = KINDS[kind]
            self.rect(x, y - 13, 16, 16, fill, stroke, radius=4)
            self.text(x + 24, y, label, size=11.5, anchor='start')
            x += 170

    def chain(self, x0, y, items, direction=1, lead=False):
        """Draws items along a horizontal line at height y. With direction -1
        the items are listed from x0 outwards to the left."""
        sizes = [item_size(item) for item in items]
        total = sum(size[0] for size in sizes) + GAP * (len(items) - 1) + (GAP if lead else 0)
        order = list(zip(items, sizes))
        if direction == 1:
            x = x0 + (GAP if lead else 0)
            if lead:
                self.line([(x0, y), (x, y)])
        else:
            order.reverse()
            x = x0 - total
        if x < 12 or x + total - (GAP if lead and direction == 1 else 0) > WIDTH - 12:
            print(f'warning: "{self.title}" row at y={y} runs from {x:.0f} for {total:.0f}', file=sys.stderr)
        for index, (item, (width, height)) in enumerate(order):
            if item[0] == 'port':
                self.rect(x, y - height / 2, width, height, '#F1F5F9', LINE, radius=min(13, height / 2), stroke_width=1.3)
                lines = item[1]
                top = y - (len(lines) - 1) * 7 + 4
                for row, value in enumerate(lines):
                    self.text(x + width / 2, top + row * 14, value, size=11, mono=True, bold=(row == 0))
            elif item[0] == 'box':
                fill, stroke = KINDS[item[1]]
                self.rect(x, y - height / 2, width, height, fill, stroke)
                lines = item[2]
                top = y - (len(lines) - 1) * 7 + 4
                self.text(x + width / 2, top, lines[0], size=12, bold=True)
                for row, value in enumerate(lines[1:], start=1):
                    self.text(x + width / 2, top + row * 14, value, size=10.5, fill=MUTED)
            else:
                label, shunts = item[1], item[2]
                self.line([(x, y), (x + width, y)])
                self.text(x + width / 2, y - 8, label, size=10.5, mono=True, bold=True)
                widths = [shunt_size(shunt) for shunt in shunts]
                used = sum(size[0] for size in widths) + 12 * max(0, len(shunts) - 1)
                cursor = x + (width - used) / 2
                if not shunts:
                    self.dot(x + width / 2, y)
                for shunt, (shunt_width, shunt_height) in zip(shunts, widths):
                    centre = cursor + shunt_width / 2
                    fill, stroke = KINDS[shunt[0]]
                    self.dot(centre, y)
                    self.line([(centre, y), (centre, y + 20)])
                    self.rect(cursor, y + 20, shunt_width, shunt_height, fill, stroke, radius=6)
                    self.text(centre, y + 36, shunt[2][0], size=11, bold=True)
                    for row, value in enumerate(shunt[2][1:], start=1):
                        self.text(centre, y + 36 + row * 14, value, size=10, fill=MUTED)
                    foot = y + 20 + shunt_height
                    self.line([(centre, foot), (centre, foot + 10)])
                    if shunt[1] == 'GND':
                        self.ground(centre, foot + 10)
                    else:
                        self.line([(centre - 10, foot + 10), (centre + 10, foot + 10)], width=2)
                        self.text(centre, foot + 23, shunt[1], size=10, mono=True)
                    cursor += shunt_width + 12
            x += width
            last = index == len(order) - 1
            if not last or (direction == -1 and lead):
                self.line([(x, y), (x + GAP, y)])
                x += GAP
        return x

    def chip(self, x, y, width, title, left, right, pitch):
        """An IC outline with pin names inside. Returns the height of each pin."""
        rows = max(len(left), len(right))
        height = pitch * rows + 20
        self.rect(x, y, width, height, '#F8FAFC', INK, radius=10, stroke_width=1.8)
        middle = y + height / 2
        self.text(x + width / 2, middle - 4, title[0], size=15, bold=True)
        for row, value in enumerate(title[1:], start=1):
            self.text(x + width / 2, middle - 4 + row * 16, value, size=11, fill=MUTED)
        heights = {}
        for side, pins in (('L', left), ('R', right)):
            for index, name in enumerate(pins):
                pin_y = y + 10 + pitch * (index + 0.5)
                heights[(side, index)] = pin_y
                if side == 'L':
                    self.text(x + 8, pin_y + 4, name, size=10.5, anchor='start', mono=True)
                else:
                    self.text(x + width - 8, pin_y + 4, name, size=10.5, anchor='end', mono=True)
        return heights

    def svg(self):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" '
                f'font-family="Segoe UI, Arial, sans-serif">' + ''.join(self.parts) + '</svg>')


# Sheets ----------------------------------------------------------------------

def overview():
    sheet = Sheet('Overview')
    source = (HERE / 'rev-b-blocks.svg').read_text(encoding='utf-8')
    inner = re.search(r'<svg[^>]*>(.*)</svg>', source, re.S).group(1)
    inner = re.sub(r'<title.*?</title>|<desc.*?</desc>', '', inner, flags=re.S)
    sheet.add(f'<svg x="150" y="14" width="1100" height="677" viewBox="0 0 1040 640">{inner}</svg>')
    sheet.heading(150, 730, 'How to read these sheets')
    sheet.note(150, 752, [
        'Sheets 2 to 7 draw each section of the board as a signal path. Series parts sit on the line; parts that go to ground or to a supply rail hang below it.',
        'A capsule is a named net or a connector. The same name on two sheets is the same wire. Part numbers such as U1 are proposals for this document.',
        'Sheet 8 lists the parts, what has to be confirmed before ordering, and the decisions still open.',
        'Status: a design proposal written from the Rev A schematic and from datasheets, without a board to measure. It is not a fabrication-ready',
        'schematic. It has to be redrawn in a CAD tool and reviewed by an electronics engineer, and every value marked "verify" checked against the datasheet.',
    ])
    return sheet


def power_input():
    sheet = Sheet('Power input and 5 V rails')
    sheet.heading(20, 60, 'Vehicle input, 9 to 36 V')
    sheet.chain(20, 120, [
        port('J1 VEHICLE +', '12 V or 24 V'),
        blk('new', 'F1 blade fuse', '2 A, in the harness'),
        blk('changed', 'F2 resettable fuse', '60 V, about 1.1 A hold'),
        node('VIN_F', sh('changed', 'GND', 'D1 SM8S33A', '33 V standoff', 'verify clamp voltage')),
        blk('changed', 'Q1 reverse polarity', 'P-MOSFET 60 V, 12 V gate clamp,', '100 kΩ gate resistor', 'or D2: SS56 Schottky diode'),
        node('VIN_PROT', sh('changed', 'GND', 'C1 bulk capacitor', '100 µF or more, 63 V')),
        port('VIN_PROT'),
    ])
    sheet.heading(20, 300, '5 V rail')
    sheet.chain(20, 365, [
        port('VIN_PROT'),
        blk('changed', 'U1 LM2596HVS-5.0', 'rated for 60 V input, 3 A output', 'needs 8 V or more at its input', 'catch diode and input capacitor', 'rated above the input maximum'),
        node('+5V'),
        port('+5V', 'charger, sheet 3'),
    ])
    sheet.heading(20, 500, 'Switched 5 V rail')
    sheet.chain(20, 560, [
        port('+5V'),
        blk('changed', 'Q2 P-MOSFET switch', 'gate driven from GPIO15 (as Rev A)', 'add 100 nF from gate to source'),
        node('5V_CONTROLLED'),
        port('5V_CONTROLLED', 'GPS, sensor supply'),
    ])
    sheet.heading(20, 680, 'Notes')
    sheet.note(20, 704, [
        'Every part connected to VIN_F or VIN_PROT must be rated for at least 60 V.',
        'D1: SM8S33A or SM8S36A preferred (load-dump rated); SMCJ33CA is the minimum. Its clamp voltage must stay below the rating of every part after it.',
        'Vehicle transients are governed by ISO 7637-2 and ISO 16750-2. Whether D1 survives an unsuppressed load dump on a 24 V system is for the reviewing engineer.',
        'U1 alternatives, smaller: LMR16030 or TPS54360B (verify). The LM2596HV datasheet asks for an input capacitor rated 1.25 times the maximum input.',
        'The ignition wire from J1 goes to its sensing divider on sheet 3.',
    ])
    sheet.legend()
    return sheet


def battery():
    sheet = Sheet('Battery, system rail, 3.3 V and voltage sensing')
    sheet.heading(20, 40, 'Charger and backup battery')
    sheet.chain(20, 110, [
        port('+5V'),
        blk('new', 'U2 BQ24074 charger', 'input 4.35 to 10.2 V', 'charge current set to about 0.5 A', 'TS pin: RT1, 10 kΩ sensor on the cell', 'status output to GPIO41'),
        node('VSYS = U2 battery pin', sh('new', 'GND', 'BT1 18650 cell', 'about 2600 mAh', 'with protection circuit')),
        port('VSYS', '3.4 to 4.2 V'),
    ])
    sheet.note(760, 62, [
        'Caution: the BQ24074 system output regulates at 4.4 V, above the',
        'modem maximum of 4.2 V. The modem and the 3.3 V converter are',
        'therefore fed from the battery pin, named VSYS here.',
        'To confirm: charge termination with a load on the battery pin.',
        'RT1 makes the charger stop below about 0 °C and above about 50 °C.',
        'The cell stays in the cab with the unit, never in the cold space.',
    ])
    sheet.heading(20, 250, '3.3 V rail')
    sheet.chain(20, 310, [
        port('VSYS'),
        blk('changed', 'U3 SY8089', 'inductor changed to 2.2 µH', 'verify behaviour as the input nears 3.3 V;', 'otherwise a 1 A low-dropout regulator'),
        node('+3V3', sh('changed', 'GND', 'C 10 µF + 100 nF', 'at the module 3V3 pin')),
        port('+3V3', 'processor, sheet 4'),
    ])
    sheet.chain(760, 310, [
        port('VSYS'),
        blk('new', 'Q3 P-MOSFET switch', 'gate driven from GPIO40', 'firmware can cut modem power'),
        node('VBAT_MODEM', sh('new', 'GND', 'C 300 to 1000 µF', 'plus 100 nF,', 'close to the module')),
        port('VBAT_MODEM', 'modem, sheet 5'),
    ])
    sheet.heading(760, 250, 'Modem supply')
    sheet.heading(20, 455, 'Voltage sensing (analog inputs)')
    rows = (
        (515, 'VIN_PROT', 'R 1 MΩ', 'VIN_SENSE', 'R 47 kΩ', 'GPIO5', 'main supply'),
        (625, 'J1 IGNITION', 'R 1 MΩ', 'IGN_SENSE', 'R 47 kΩ', 'GPIO4', 'ignition'),
        (735, 'VSYS', 'R 220 kΩ', 'VBAT_SENSE', 'R 220 kΩ', 'GPIO6', 'battery'),
    )
    for y, source, upper, net, lower, pin, meaning in rows:
        sheet.chain(20, y, [
            port(source),
            blk('new' if pin != 'GPIO4' else 'kept', upper, 'in series'),
            node(net, sh('new' if pin != 'GPIO4' else 'kept', 'GND', lower, 'to ground'), sh('new' if pin != 'GPIO4' else 'kept', 'GND', 'C 100 nF', 'at the pin')),
            port(pin, meaning),
        ])
    sheet.note(760, 505, [
        'With 1 MΩ over 47 kΩ, 36 V at the input reads as about 1.6 V at the pin.',
        'With 220 kΩ over 220 kΩ, the pin sees half the battery voltage.',
        'Analog inputs use GPIO1 to GPIO10 only: the others stop working',
        'as analog inputs while Wi-Fi is on.',
        'Firmware reports "main power cut" when VIN_SENSE falls while',
        'VBAT_SENSE still shows a healthy cell.',
    ])
    sheet.legend()
    return sheet


def processor():
    sheet = Sheet('Processor and pin map')
    left = [
        ('3V3', '+3V3', '10 µF and 100 nF at the pin'),
        ('EN', 'RESET', 'button to ground; automatic programming circuit'),
        ('GPIO0', 'BOOT', 'button to ground; automatic programming circuit'),
        ('GPIO1', 'DOOR1', 'door 1, wake-capable (sheet 6)'),
        ('GPIO2', 'DOOR2', 'door 2, wake-capable (sheet 6)'),
        ('GPIO4', 'IGN_SENSE', 'ignition, analog (sheet 3)'),
        ('GPIO5', 'VIN_SENSE', 'main supply, analog (sheet 3)'),
        ('GPIO6', 'VBAT_SENSE', 'battery, analog (sheet 3)'),
        ('GPIO7', 'MOTION_INT', 'motion sensor interrupt, wake-capable'),
        ('GPIO8', 'I2C_SDA', 'sensors (sheet 7)'),
        ('GPIO9', 'I2C_SCL', 'sensors (sheet 7)'),
        ('GPIO10', 'ONEWIRE', 'temperature probe (sheet 6)'),
        ('GPIO11', 'MODEM_RI', 'modem ring indicator, wake-capable'),
        ('GPIO13', 'RS485_RO', 'from the RS-485 receiver'),
        ('GPIO16', 'GPS_PPS', 'pulse from the GPS'),
        ('GPIO18', 'GPS_TX', 'from the GPS transmit pin'),
        ('GPIO39', 'MODEM_STATUS', 'modem running'),
        ('GPIO41', 'CHG_STATUS', 'charger status'),
        ('GPIO48', 'MODEM_TXD', 'from the modem transmit pin'),
        ('GND', 'GND', ''),
    ]
    right = [
        ('GPIO12', 'RS485_DI', 'to the RS-485 driver'),
        ('GPIO14', 'RS485_RE', 'receiver enable'),
        ('GPIO21', 'RS485_DE', 'driver enable'),
        ('GPIO15', '5V_CTRL_EN', 'switched 5 V rail (sheet 2)'),
        ('GPIO17', 'GPS_RX', 'to the GPS receive pin'),
        ('GPIO19', 'USB_D-', 'USB-C (sheet 7)'),
        ('GPIO20', 'USB_D+', 'USB-C (sheet 7)'),
        ('GPIO38', 'MODEM_PWRKEY', 'through a transistor (sheet 5)'),
        ('GPIO40', 'MODEM_PWR_EN', 'modem supply switch (sheet 3)'),
        ('GPIO42', 'STATUS_LED', 'status light (sheet 7)'),
        ('GPIO43', 'DEBUG_TX', 'serial header, kept'),
        ('GPIO44', 'DEBUG_RX', 'serial header, kept'),
        ('GPIO47', 'MODEM_RXD', 'to the modem receive pin'),
        ('GPIO3/45/46', '', 'start-up mode pins: leave unconnected'),
        ('GPIO35-37', '', 'left free for a module with extra memory'),
    ]
    x, y, width, pitch = 540, 30, 320, 37
    pins = sheet.chip(x, y, width, ['U4 ESP32-S3-WROOM-1', 'kept from Rev A', '-1U variant with external', 'antenna in a metal enclosure'],
                      [pin[0] for pin in left], [pin[0] for pin in right], pitch)
    for index, (_, net, meaning) in enumerate(left):
        pin_y = pins[('L', index)]
        sheet.line([(x - 22, pin_y), (x, pin_y)])
        sheet.text(x - 28, pin_y + 4, net, size=11, bold=True, anchor='end', mono=True)
        sheet.text(x - 28 - text_width(net, 11, mono=True) - 10, pin_y + 4, meaning, size=10.5, anchor='end', fill=MUTED)
    for index, (_, net, meaning) in enumerate(right):
        pin_y = pins[('R', index)]
        if net:
            sheet.line([(x + width, pin_y), (x + width + 22, pin_y)])
            sheet.text(x + width + 28, pin_y + 4, net, size=11, bold=True, anchor='start', mono=True)
            sheet.text(x + width + 28 + text_width(net, 11, mono=True) + 10, pin_y + 4, meaning, size=10.5, anchor='start', fill=MUTED)
        else:
            sheet.text(x + width + 28, pin_y + 4, meaning, size=10.5, anchor='start', fill=MUTED)
    sheet.note(900, 640, [
        'New in Rev B: GPIO1, 2, 5 to 11, 19, 20, 38 to 42, 47, 48.',
        'Unchanged from Rev A: GPIO4, 12 to 18, 21, 43, 44.',
        'The modem lines pass through 1.8 V level conversion (sheet 5).',
        'Verify the whole table against the module datasheet.',
    ])
    return sheet


def modem():
    sheet = Sheet('LTE modem')
    left = ['VBAT', 'PWRKEY', 'UART RXD', 'UART TXD', 'RI', 'STATUS', '1.8 V output', 'GND']
    right = ['SIM VDD/DATA/CLK/RST', 'NETLIGHT', 'Main antenna']
    x, y, width, pitch = 540, 70, 330, 66
    pins = sheet.chip(x, y, width, ['U5 SIMCom A7670E', 'LTE Cat 1 with 2G fallback', 'supply 3.4 to 4.2 V, peaks to 2.8 A', 'all logic pins are 1.8 V'], left, right, pitch)
    shifter = blk('new', 'U6 level translator', '1.8 V to 3.3 V')
    attachments = {
        0: [port('VBAT_MODEM', 'sheet 3')],
        1: [blk('new', 'Q4 transistor', 'never drive from a GPIO directly'), port('GPIO38', 'MODEM_PWRKEY')],
        2: [shifter, port('GPIO47', 'MODEM_RXD')],
        3: [shifter, port('GPIO48', 'MODEM_TXD')],
        4: [shifter, port('GPIO11', 'MODEM_RI')],
        5: [shifter, port('GPIO39', 'MODEM_STATUS')],
        6: [port('U6 low-voltage supply')],
    }
    for index, items in attachments.items():
        sheet.chain(x, pins[('L', index)], items, direction=-1, lead=True)
    ground_y = pins[('L', 7)]
    sheet.line([(x - 40, ground_y), (x, ground_y)])
    sheet.line([(x - 40, ground_y), (x - 40, ground_y + 12)])
    sheet.ground(x - 40, ground_y + 12)
    sheet.chain(x + width, pins[('R', 0)], [
        blk('new', 'D protection diodes', 'on each SIM line'),
        port('J SIM holder', 'close to the module'),
    ], lead=True)
    sheet.chain(x + width, pins[('R', 1)], [
        blk('new', 'Q5 transistor'),
        blk('new', 'LED network', 'with series resistor'),
    ], lead=True)
    sheet.chain(x + width, pins[('R', 2)], [
        blk('new', 'Matching network', 'footprint'),
        port('J U.FL or SMA', '50 ohm trace'),
    ], lead=True)
    sheet.heading(20, 660, 'Notes')
    sheet.note(20, 684, [
        'Pin functions are named here; take the exact pin names and numbers from the A7670 hardware design guide, which is also the source of the figures on this sheet.',
        'Supply: 3.8 V recommended. At least 300 µF close to the module if the supply can deliver the 2.8 A peak, 1000 µF if it cannot, plus 100 nF at the pins (sheet 3).',
        'Power key: pulled up inside the module to its supply, so it is switched through Q4. Q3 on sheet 3 lets firmware cut the supply if the modem stops responding.',
        'U6 is powered on its low side from the module 1.8 V output. The transistor circuit in the guide is an alternative. Confirm that every logic line is converted.',
        'Antenna: the 50 ohm trace is the part most likely to be wrong on a first board; follow the layout rules in the guide exactly.',
        'Check the exact A7670 variant against the bands of the SIM provider before choosing. Commonly listed for the A7670E: LTE bands 1, 3, 5, 7, 8 and 20.',
    ])
    sheet.legend()
    return sheet


def inputs():
    sheet = Sheet('Door inputs and cargo sensor connections')
    sheet.heading(20, 40, 'Door input 1 (door 2 is identical, on GPIO2)')
    sheet.chain(20, 100, [
        port('J DOOR1', 'reed switch to GND'),
        node('DOOR1_IN', sh('new', 'GND', 'D protection', 'diode at the', 'connector'), sh('new', '+3V3', 'R 10 kΩ', 'pull-up')),
        blk('new', 'R 10 kΩ', 'in series'),
        node('DOOR1', sh('new', 'GND', 'C 100 nF', 'at the pin'), sh('new', '+3V3 and GND', 'D BAT54S', 'dual clamp')),
        port('GPIO1', 'wake-capable'),
    ])
    sheet.note(860, 80, [
        'The switch closes to ground when the door is shut.',
        'With the series resistor and the clamp, the input',
        'survives a wire shorted to 24 V.',
    ])
    sheet.heading(20, 250, 'RS-485 to the cargo sensors')
    sheet.chain(20, 315, [
        port('GPIO12 DI   GPIO13 RO', 'GPIO14 RE   GPIO21 DE'),
        blk('kept', 'U7 SP3485', 'transceiver, as Rev A'),
        node('RS485_A / RS485_B',
             sh('changed', 'GND', 'D SM712', 'across A and B'),
             sh('changed', 'A: +3V3  B: GND', 'R 680 Ω × 2', 'idle bias', '(was 4.7 kΩ)'),
             sh('changed', 'A to B', 'R 120 Ω', 'terminator, through', 'a solder jumper')),
        port('J RJ45', 'pinout as Rev A'),
    ])
    sheet.heading(20, 480, 'Sensor supply on the RJ45')
    sheet.chain(20, 535, [
        port('5V_CONTROLLED'),
        blk('new', 'F3 resettable fuse', '500 mA'),
        port('J RJ45 +5 V'),
    ])
    sheet.heading(20, 630, 'One-wire temperature probe')
    sheet.chain(20, 690, [
        port('J PROBE', 'data line'),
        node('PROBE_IN', sh('new', 'GND', 'D protection', 'diode')),
        blk('new', 'R 100 Ω', 'in series'),
        node('ONEWIRE', sh('new', '+3V3', 'R 4.7 kΩ', 'pull-up')),
        port('GPIO10'),
    ])
    sheet.note(860, 640, [
        'Connectors: locking automotive types for power, doors',
        'and sensors. Screw terminals work loose under vibration.',
        'For pharmaceutical customers the cargo temperature',
        'sensor needs a calibration record against a reference',
        'thermometer: a procedure and a document, not a part.',
    ])
    sheet.legend()
    return sheet


def peripherals():
    sheet = Sheet('GPS, I2C sensors, USB-C, lights and buttons')
    sheet.heading(20, 40, 'GPS')
    sheet.chain(20, 105, [
        port('GPIO17 to GPS receive', 'GPIO18 from GPS transmit', 'GPIO16 from GPS pulse'),
        blk('kept', 'U8 NEO-7M module', 'supplied from 5V_CONTROLLED', 'pins as Rev A'),
        blk('changed', 'External active antenna', 'an antenna inside a metal cab', 'sees very little sky'),
    ])
    sheet.heading(20, 200, 'I2C sensors')
    sheet.chain(20, 265, [
        port('GPIO8 SDA', 'GPIO9 SCL'),
        node('I2C_SDA / I2C_SCL', sh('new', '+3V3', 'R pull-ups', 'on both lines', 'value: verify')),
        blk('new', 'U9 LIS3DH or similar', 'motion sensor', 'interrupt to GPIO7 (wake)'),
        blk('new', 'U10 footprint', 'board temperature', 'and humidity sensor'),
    ])
    sheet.heading(20, 410, 'USB-C: programming and logs')
    sheet.chain(20, 470, [
        port('J USB-C'),
        node('at the connector', sh('new', 'GND', 'D protection', 'diode array', 'on the data lines'), sh('new', 'GND', 'R 5.1 kΩ × 2', 'CC1 and CC2', 'each to ground')),
        port('GPIO20 USB_D+', 'GPIO19 USB_D-'),
    ])
    sheet.heading(20, 620, 'Lights')
    sheet.chain(20, 670, [port('+3V3'), blk('new', 'LED power', 'with series resistor'), port('GND')])
    sheet.chain(430, 670, [port('GPIO42'), blk('new', 'LED status', 'with series resistor'), port('GND')])
    sheet.chain(840, 670, [port('NETLIGHT', 'sheet 5'), blk('new', 'Q5 transistor'), blk('new', 'LED network', 'with series resistor'), port('GND')])
    sheet.heading(20, 750, 'Buttons and programming')
    sheet.chain(20, 800, [port('GPIO0'), blk('new', 'SW1 boot button'), port('GND')])
    sheet.chain(430, 800, [port('EN'), blk('new', 'SW2 reset button'), port('GND')])
    sheet.chain(840, 800, [port('GPIO0, EN'), blk('kept', 'Automatic programming circuit', 'and serial header, as Rev A')])
    sheet.legend()
    return sheet


PARTS = [
    ('J1', 'Vehicle connector, locking automotive type', '9 to 36 V, with ignition wire', 'changed', 2),
    ('F1', 'Blade fuse in the harness', '2 A', 'new', 2),
    ('F2', 'Resettable fuse', '60 V, about 1.1 A hold', 'changed', 2),
    ('D1', 'Spike suppressor SM8S33A or SM8S36A (minimum SMCJ33CA)', '33 V standoff; verify clamp', 'changed', 2),
    ('Q1 / D2', 'Reverse polarity: 60 V P-MOSFET with 12 V gate clamp, or SS56 diode', '60 V', 'changed', 2),
    ('C1', 'Bulk capacitor', '100 µF or more, 63 V', 'changed', 2),
    ('U1', '5 V converter LM2596HVS-5.0', '60 V in, 3 A', 'changed', 2),
    ('Q2', 'P-MOSFET switch for 5V_CONTROLLED, plus 100 nF gate to source', 'GPIO15', 'changed', 2),
    ('U2', 'Charger BQ24074', '4.35 to 10.2 V in, about 0.5 A charge', 'new', 3),
    ('BT1, RT1', '18650 cell with protection, 10 kΩ temperature sensor', 'about 2600 mAh', 'new', 3),
    ('U3', '3.3 V converter SY8089, inductor 2.2 µH', 'fed from VSYS', 'changed', 3),
    ('Q3', 'P-MOSFET modem supply switch', 'GPIO40', 'new', 3),
    ('U4', 'ESP32-S3-WROOM-1', '', 'kept', 4),
    ('U5', 'LTE module SIMCom A7670E', '3.4 to 4.2 V, 2.8 A peaks, 1.8 V logic', 'new', 5),
    ('U6', 'Level translator, 1.8 V to 3.3 V', 'four lines', 'new', 5),
    ('Q4, Q5', 'Transistors for the power key and the network light', '', 'new', 5),
    ('J SIM', 'SIM holder with protection diodes', '', 'new', 5),
    ('U7', 'RS-485 transceiver SP3485, with SM712, 680 Ω bias, 120 Ω jumper terminator', '', 'changed', 6),
    ('F3', 'Resettable fuse for the sensor supply', '500 mA', 'new', 6),
    ('Door inputs', '10 kΩ pull-up, 10 kΩ series, 100 nF, BAT54S, connector diode (two sets)', 'GPIO1, GPIO2', 'new', 6),
    ('One-wire', '4.7 kΩ pull-up, 100 Ω series, protection diode', 'GPIO10', 'new', 6),
    ('U8', 'GPS module NEO-7M with external active antenna', '', 'kept', 7),
    ('U9, U10', 'Motion sensor LIS3DH or similar; board temperature and humidity footprint', 'I2C', 'new', 7),
    ('J USB-C', 'USB-C with protection array and 5.1 kΩ on each CC line', 'GPIO19, GPIO20', 'new', 7),
]

CHECKS = [
    'D1 clamp voltage is below the rating of every part after it, and whether it survives a 24 V load dump (ISO 7637-2, ISO 16750-2).',
    'U1: catch diode and input capacitor rated above the input maximum. Alternatives LMR16030 and TPS54360B are unchecked.',
    'U2: the modem sits on the battery pin, not on the 4.4 V system output. Confirm charge termination with a load on that pin.',
    'U3: behaviour when the cell is nearly empty. If it does not pass the input through cleanly, use a 1 A low-dropout regulator.',
    'U5: the exact A7670 variant against the SIM provider bands; pin names and numbers from the hardware design guide.',
    'Every modem logic line is converted between 1.8 V and 3.3 V.',
    'The antenna trace follows the 50 ohm layout rules in the guide.',
    'The whole pin map against the ESP32-S3 module datasheet.',
    'I2C pull-up values and LED resistor values, which this proposal does not set.',
]

DECISIONS = [
    'Do the first customers run 12 V or 24 V vehicles?',
    'On-board modem, or an external 4G stick for the first prototype?',
    'Which SIM provider, and which bands?',
    'Battery runtime target after main power is cut.',
    'Which cargo sensors, and how they are calibrated.',
]

BRING_UP = [
    'Power section alone at 9, 12, 24 and 36 V; reverse the input; nothing gets hot.',
    'Pull the input while loaded: the system rail holds on the battery.',
    'Fit the processor, program over USB-C, compare the three voltage inputs with a multimeter.',
    'Modem: power key, SIM, registration, data. The supply must not dip more than 300 mV.',
    'GPS fix outdoors with the real antenna and enclosure.',
    'RS-485 sensor on five metres of cable; door inputs with the real switches.',
    'A day in a real vehicle, including engine cranking, before showing a customer.',
]


def parts_sheet():
    sheet = Sheet('Parts, checks and open decisions')
    rows = ''.join(
        f'<tr><td class="ref">{esc(ref)}</td><td>{esc(part)}</td><td>{esc(rating)}</td>'
        f'<td class="kind"><i class="tag {kind}"></i>{kind}</td><td class="num">{page}</td></tr>'
        for ref, part, rating, kind, page in PARTS)
    items = lambda values: ''.join(f'<li>{esc(value)}</li>' for value in values)
    sheet.html = (
        '<div class="lists"><div>'
        '<h2>Main parts</h2>'
        '<table><thead><tr><th>Ref</th><th>Part</th><th>Rating or value</th><th>Rev B</th><th>Sheet</th></tr></thead>'
        f'<tbody>{rows}</tbody></table>'
        '</div><div>'
        f'<h2>To confirm before ordering</h2><ol>{items(CHECKS)}</ol>'
        f'<h2>Decisions for the hardware team</h2><ol>{items(DECISIONS)}</ol>'
        f'<h2>Bring-up test order</h2><ol>{items(BRING_UP)}</ol>'
        '<p class="src">Figures come from the MT2492, LM2596HV and BQ24074 datasheets and the A7670 Series Hardware Design guide; '
        'links are in hardware/README.md.</p>'
        '</div></div>')
    return sheet


CSS = """
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #FFFFFF; color: #0F172A; font-family: "Segoe UI", Arial, sans-serif; }
.m { font-family: Consolas, "Courier New", monospace; }
.sheet { width: 297mm; height: 210mm; padding: 7mm; page-break-after: always; overflow: hidden; }
.sheet:last-child { page-break-after: auto; }
.frame { height: 100%; border: 0.5mm solid #0F172A; display: flex; flex-direction: column; }
.body { flex: 1; min-height: 0; padding: 3mm 4mm; }
.body > svg { display: block; width: 100%; height: 100%; }
.titleblock { display: grid; grid-template-columns: 2.4fr 3fr 2.6fr 0.9fr; border-top: 0.5mm solid #0F172A; font-size: 8pt; color: #475569; }
.titleblock div { padding: 1.5mm 3mm; border-left: 0.3mm solid #0F172A; }
.titleblock div:first-child { border-left: 0; }
.titleblock b { display: block; font-size: 10.5pt; color: #0F172A; }
.lists { display: grid; grid-template-columns: 1.7fr 1fr; gap: 7mm; height: 100%; font-size: 7.6pt; line-height: 1.3; }
.lists h2 { font-size: 10pt; margin: 0 0 1.5mm; }
.lists ol + h2 { margin-top: 3.5mm; }
.lists ol { margin: 0; padding-left: 5mm; }
.lists li { margin-bottom: 0.7mm; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 0.7mm 1.5mm; border-bottom: 0.2mm solid #CBD5E1; vertical-align: top; }
th { border-bottom: 0.4mm solid #0F172A; font-weight: 600; }
td.ref { font-family: Consolas, monospace; white-space: nowrap; font-weight: 600; }
td.num { text-align: center; }
td.kind { white-space: nowrap; }
.tag { display: inline-block; width: 2.6mm; height: 2.6mm; border-radius: 0.6mm; margin-right: 1.4mm; vertical-align: -0.3mm; border: 0.25mm solid #94A3B8; background: #FFFFFF; }
.tag.changed { background: #E0F2FE; border-color: #0284C7; }
.tag.new { background: #D1FAE5; border-color: #059669; }
.src { color: #475569; margin: 3mm 0 0; }
"""


def build():
    sheets = [overview(), power_input(), battery(), processor(), modem(), inputs(), peripherals(), parts_sheet()]
    pages = []
    for number, sheet in enumerate(sheets, start=1):
        body = sheet.html if sheet.html is not None else sheet.svg()
        pages.append(
            '<section class="sheet"><div class="frame">'
            f'<div class="body">{body}</div>'
            '<div class="titleblock">'
            '<div><b>Maatora tracker board</b>Rev B schematic sheets</div>'
            f'<div><b>{esc(sheet.title)}</b>Design proposal, not for fabrication</div>'
            f'<div><b>lumidren</b>{DATE} · review by an electronics engineer before ordering</div>'
            f'<div><b>{number} / {len(sheets)}</b>Sheet</div>'
            '</div></div></section>')
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<title>Maatora tracker board, Rev B schematic sheets</title>'
            f'<style>{CSS}</style></head><body>{"".join(pages)}</body></html>')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: python build-schematics.py <output.html>')
    pathlib.Path(sys.argv[1]).write_text(build(), encoding='utf-8', newline='\n')
