# -*- coding: utf-8 -*-
"""A small schematic kit.

One description of a board (parts, pins, nets) produces:
  * a KiCad schematic (.kicad_sch) with its own symbol library,
  * the same drawing as SVG (printed to PDF by build.py),
  * a parts list and a netlist as CSV,
  * wiring checks, including one that reads the drawing back from its geometry.

Every connection is made by a net label on a short wire at the pin, so the
drawing needs no routed wires and cannot hide a wrong junction.
"""
import collections
import csv
import io
import math
import uuid

H = 1.27            # half grid
G = 2.54            # grid: pin pitch
CHAR = 1.25         # width of one label character in KiCad at 1.27 mm text
NAMESPACE = uuid.UUID('6d616174-6f72-6121-8000-000000000001')
NC = 'NC'


def uid(*parts):
    return str(uuid.uuid5(NAMESPACE, '|'.join(str(part) for part in parts)))


def num(value):
    text = ('%.4f' % value).rstrip('0').rstrip('.')
    return '0' if text in ('', '-0') else text


def snap(value, step=H):
    return round(value / step) * step


def quote(text):
    return '"%s"' % str(text).replace('\\', '\\\\').replace('"', '\\"')


# --------------------------------------------------------------------------
# Symbols. Coordinates are millimetres with Y pointing up, as in a KiCad library.
# --------------------------------------------------------------------------
class Pin(object):
    def __init__(self, number, name, x, y, angle, length):
        self.number = str(number)
        self.name = name
        self.x, self.y, self.angle, self.length = x, y, angle, length

    @property
    def side(self):
        return {0: 'L', 180: 'R', 270: 'T', 90: 'B'}[self.angle]


class Symbol(object):
    def __init__(self, name, prefix, kind, graphics, pins, show_names=True, show_numbers=True, text=None):
        self.name, self.prefix, self.kind = name, prefix, kind
        self.graphics, self.pins = graphics, pins
        self.show_names, self.show_numbers = show_names, show_numbers
        self.text = text or []
        numbers = [pin.number for pin in pins]
        assert len(numbers) == len(set(numbers)), 'duplicate pin number in %s' % name
        xs = [pin.x for pin in pins]
        ys = [pin.y for pin in pins]
        for shape in graphics:
            if shape[0] == 'rect':
                xs += [shape[1], shape[3]]
                ys += [shape[2], shape[4]]
        self.xmin, self.xmax, self.ymin, self.ymax = min(xs), max(xs), min(ys), max(ys)

    def pin(self, number):
        for pin in self.pins:
            if pin.number == str(number):
                return pin
        raise KeyError('%s has no pin %s' % (self.name, number))

    # ---- KiCad text -------------------------------------------------------
    def kicad(self, library, indent):
        pad = ' ' * indent
        top = '%s:%s' % (library, self.name) if library else self.name
        font = '(effects (font (size 1.27 1.27)))'
        hidden = '(effects (font (size 1.27 1.27)) hide)'
        lines = []
        flags = ''
        if not self.show_numbers:
            flags += ' (pin_numbers hide)'
        flags += ' (pin_names (offset %s)%s)' % ('1.016' if self.show_names else '0', '' if self.show_names else ' hide')
        lines.append('%s(symbol %s%s (in_bom %s) (on_board yes)' % (pad, quote(top), flags, in_bom(self)))
        lines.append('%s  (property "Reference" %s (at 0 %s 0) %s)' % (pad, quote(self.prefix), num(self.ymax + G), font))
        lines.append('%s  (property "Value" %s (at 0 %s 0) %s)' % (pad, quote(self.name), num(self.ymin - G), font))
        lines.append('%s  (property "Footprint" "" (at 0 0 0) %s)' % (pad, hidden))
        lines.append('%s  (property "Datasheet" "" (at 0 0 0) %s)' % (pad, hidden))
        lines.append('%s  (symbol %s' % (pad, quote(self.name + '_0_1')))
        stroke = '(stroke (width 0.254) (type default))'
        for shape in self.graphics:
            if shape[0] == 'rect':
                fill = shape[5] if len(shape) > 5 else 'background'
                lines.append('%s    (rectangle (start %s %s) (end %s %s) %s (fill (type %s)))' % (
                    pad, num(shape[1]), num(shape[2]), num(shape[3]), num(shape[4]), stroke, fill))
            elif shape[0] == 'poly':
                points = ' '.join('(xy %s %s)' % (num(x), num(y)) for x, y in shape[1])
                fill = shape[2] if len(shape) > 2 else 'none'
                lines.append('%s    (polyline (pts %s) %s (fill (type %s)))' % (pad, points, stroke, fill))
            elif shape[0] == 'circle':
                lines.append('%s    (circle (center %s %s) (radius %s) %s (fill (type none)))' % (
                    pad, num(shape[1]), num(shape[2]), num(shape[3]), stroke))
        for x, y, label in self.text:
            lines.append('%s    (text %s (at %s %s 0) (effects (font (size 1.016 1.016))))' % (pad, quote(label), num(x), num(y)))
        lines.append('%s  )' % pad)
        lines.append('%s  (symbol %s' % (pad, quote(self.name + '_1_1')))
        for pin in self.pins:
            lines.append('%s    (pin passive line (at %s %s %d) (length %s) (name %s %s) (number %s %s))' % (
                pad, num(pin.x), num(pin.y), pin.angle, num(pin.length), quote(pin.name or '~'), font, quote(pin.number), font))
        lines.append('%s  )' % pad)
        lines.append('%s)' % pad)
        return '\n'.join(lines)


def two_pin(name, prefix, graphics, lead=H, text=None):
    """A vertical two-pin part: pin 1 on top, pin 2 at the bottom."""
    pins = [Pin(1, '', 0, 3 * H, 270, lead), Pin(2, '', 0, -3 * H, 90, lead)]
    return Symbol(name, prefix, 'two', graphics, pins, show_names=False, show_numbers=False, text=text)


def three_pin(name, prefix, left, top, bottom, caption):
    """A small box with a pin on the left, the top and the bottom: (number, name) each."""
    pins = [
        Pin(left[0], left[1], -2 * G, 0, 0, G),
        Pin(top[0], top[1], 0, 2.5 * G, 270, G),
        Pin(bottom[0], bottom[1], 0, -2.5 * G, 90, G),
    ]
    graphics = [('rect', -G, -1.5 * G, G, 1.5 * G)]
    return Symbol(name, prefix, 'three', graphics, pins, show_names=True, show_numbers=True, text=[(0.6, -1.5, caption)])


def box(name, prefix, left, right, min_half=3 * G):
    """An integrated circuit, module or connector: (number, name) lists for each side.
    None in a list leaves a gap."""
    rows = max(len(left), len(right))
    longest_left = max([len(item[1]) for item in left if item] or [0])
    longest_right = max([len(item[1]) for item in right if item] or [0])
    half = max(min_half, math.ceil(((longest_left + longest_right) * 1.05 + 5) / 2.0 / G) * G)
    first = (rows - 1) * G / 2.0
    pins = []
    for index, item in enumerate(left):
        if item:
            pins.append(Pin(item[0], item[1], -half - G, first - index * G, 0, G))
    for index, item in enumerate(right):
        if item:
            pins.append(Pin(item[0], item[1], half + G, first - index * G, 180, G))
    graphics = [('rect', -half, -first - G, half, first + G)]
    return Symbol(name, prefix, 'ic', graphics, pins)


def standard_symbols():
    s = {}
    s['R'] = two_pin('R', 'R', [('rect', -1.016, -G, 1.016, G, 'none')])
    s['C'] = two_pin('C', 'C', [('poly', [(-2.032, 0.762), (2.032, 0.762)]), ('poly', [(-2.032, -0.762), (2.032, -0.762)])], lead=3.048)
    s['CP'] = two_pin('CP', 'C', [
        ('poly', [(-2.032, 0.762), (2.032, 0.762)]), ('poly', [(-2.032, -0.762), (2.032, -0.762)]),
        ('poly', [(-2.54, 2.032), (-1.524, 2.032)]), ('poly', [(-2.032, 2.54), (-2.032, 1.524)])], lead=3.048)
    s['L'] = two_pin('L', 'L', [('rect', -1.016, -G, 1.016, G, 'outline')])
    s['F'] = two_pin('PPTC', 'F', [('rect', -1.016, -G, 1.016, G, 'none'), ('poly', [(-1.778, -1.778), (-1.016, -1.778), (1.016, 1.778), (1.778, 1.778)])])
    triangle = ('poly', [(-H, -H), (H, -H), (0, H), (-H, -H)])
    s['D'] = two_pin('D', 'D', [triangle, ('poly', [(-H, H), (H, H)])], lead=G)
    s['DS'] = two_pin('D_Schottky', 'D', [triangle, ('poly', [(-H, 0.762), (-H, H), (H, H), (H, 1.778)])], lead=G)
    s['DZ'] = two_pin('D_TVS', 'D', [triangle, ('poly', [(-1.778, 0.762), (-H, H), (H, H), (1.778, 1.778)])], lead=G)
    s['DB'] = two_pin('D_TVS_Bidirectional', 'D', [
        ('poly', [(-H, -G), (H, -G), (0, 0), (-H, -G)]), ('poly', [(-H, G), (H, G), (0, 0), (-H, G)]),
        ('poly', [(-1.778, -0.508), (-H, 0), (H, 0), (1.778, 0.508)])])
    s['LED'] = two_pin('LED', 'D', [
        triangle, ('poly', [(-H, H), (H, H)]),
        ('poly', [(-1.778, -0.254), (-3.048, 1.016)]), ('poly', [(-2.286, 1.016), (-3.048, 1.016), (-3.048, 0.254)]),
        ('poly', [(-1.778, -1.524), (-3.048, -0.254)]), ('poly', [(-2.286, -0.254), (-3.048, -0.254), (-3.048, -1.016)])], lead=G)
    s['SW'] = two_pin('SW_Push', 'SW', [
        ('circle', 0, 2.032, 0.508), ('circle', 0, -2.032, 0.508), ('poly', [(1.524, 2.032), (1.524, -2.032)]),
        ('poly', [(1.524, 0), (2.54, 0)])])
    s['Y'] = two_pin('Crystal', 'Y', [
        ('rect', -1.524, -0.762, 1.524, 0.762, 'none'), ('poly', [(-1.778, 1.524), (1.778, 1.524)]),
        ('poly', [(-1.778, -1.524), (1.778, -1.524)])], lead=2.286)
    s['JPO'] = two_pin('Jumper_Open', 'JP', [('circle', 0, 1.778, 0.762), ('circle', 0, -1.778, 0.762)])
    s['JPC'] = two_pin('Jumper_Closed', 'JP', [
        ('circle', 0, 1.778, 0.762), ('circle', 0, -1.778, 0.762), ('poly', [(0.762, 1.778), (1.524, 0), (0.762, -1.778)])])
    s['TP'] = Symbol('TestPoint', 'TP', 'one', [('circle', 0, 0, 0.9)], [Pin(1, '', 0, -G, 90, 1.64)], show_names=False, show_numbers=False)
    s['NPN'] = three_pin('Q_NPN_BEC', 'Q', (1, 'B'), (3, 'C'), (2, 'E'), 'NPN')
    s['NMOS'] = three_pin('Q_NMOS_GSD', 'Q', (1, 'G'), (3, 'D'), (2, 'S'), 'N-FET')
    s['PMOS'] = three_pin('Q_PMOS_GSD', 'Q', (1, 'G'), (2, 'S'), (3, 'D'), 'P-FET')
    s['BAT54S'] = three_pin('BAT54S', 'D', (3, 'COM'), (2, 'K'), (1, 'A'), 'x2')
    s['SM712'] = three_pin('SM712', 'D', (1, 'IO1'), (2, 'IO2'), (3, 'GND'), 'TVS')
    return s


# --------------------------------------------------------------------------
# Board description
# --------------------------------------------------------------------------
class Part(object):
    def __init__(self, ref, value, symbol, nets, footprint, mpn, desc, price, dnp, section):
        self.ref, self.value, self.symbol = ref, value, symbol
        self.nets = dict((str(key), net) for key, net in nets.items())
        self.footprint, self.mpn, self.desc, self.price, self.dnp, self.section = footprint, mpn, desc, price, dnp, section
        self.x = self.y = 0.0

    def pin_xy(self, pin):
        return (round(self.x + pin.x, 4), round(self.y - pin.y, 4))


class Board(object):
    def __init__(self, key, title, revision, date, company, comment):
        self.key, self.title, self.revision, self.date, self.company, self.comment = key, title, revision, date, company, comment
        self.parts, self.sections, self.counters = [], [], collections.Counter()
        self.symbols = standard_symbols()
        self._section = None
        self.single_ok = set()

    def section(self, name, note=''):
        self._section = {'name': name, 'note': note, 'parts': []}
        self.sections.append(self._section)
        return self

    def add(self, symbol, value, nets, footprint='', mpn='', desc='', price=0.0, dnp=False, ref=None):
        if isinstance(symbol, str):
            symbol = self.symbols[symbol]
        if ref is None:
            self.counters[symbol.prefix] += 1
            ref = '%s%d' % (symbol.prefix, self.counters[symbol.prefix])
        part = Part(ref, value, symbol, nets, footprint, mpn, desc, price, dnp, self._section)
        self.parts.append(part)
        self._section['parts'].append(part)
        return part

    # ---- shorthand for the common parts -----------------------------------
    def R(self, value, a, b, **extra):
        extra.setdefault('footprint', 'Resistor_SMD:R_0603_1608Metric')
        extra.setdefault('desc', 'Resistor, 1 %, 0603')
        extra.setdefault('price', 0.01)
        return self.add('R', value, {1: a, 2: b}, **extra)

    def C(self, value, a, b, **extra):
        extra.setdefault('footprint', 'Capacitor_SMD:C_0603_1608Metric')
        extra.setdefault('desc', 'Ceramic capacitor, X7R')
        extra.setdefault('price', 0.02)
        return self.add('C', value, {1: a, 2: b}, **extra)

    def CP(self, value, plus, minus, **extra):
        extra.setdefault('footprint', 'Capacitor_THT:CP_Radial_D8.0mm_P3.50mm')
        extra.setdefault('desc', 'Polarised capacitor, low ESR')
        extra.setdefault('price', 0.25)
        return self.add('CP', value, {1: plus, 2: minus}, **extra)

    def D(self, kind, value, cathode, anode, **extra):
        extra.setdefault('footprint', 'Diode_SMD:D_SMA')
        extra.setdefault('price', 0.08)
        return self.add(kind, value, {1: cathode, 2: anode}, **extra)

    def LED(self, colour, anode, cathode, **extra):
        extra.setdefault('footprint', 'LED_SMD:LED_0603_1608Metric')
        extra.setdefault('desc', 'Indicator LED, 0603')
        extra.setdefault('price', 0.03)
        return self.add('LED', colour, {1: cathode, 2: anode}, **extra)

    def TP(self, net, name):
        return self.add('TP', name, {1: net}, footprint='TestPoint:TestPoint_Pad_D1.5mm', desc='Test pad', price=0.0)

    # ---- nets ---------------------------------------------------------------
    def nets(self):
        table = collections.OrderedDict()
        for part in self.parts:
            for pin in part.symbol.pins:
                net = part.nets.get(pin.number)
                if net and net != NC:
                    table.setdefault(net, []).append((part.ref, pin.number, pin.name))
        return table

    def check(self):
        """Returns a list of problems found in the description itself."""
        problems = []
        seen = set()
        for part in self.parts:
            if part.ref in seen:
                problems.append('%s is used twice' % part.ref)
            seen.add(part.ref)
            numbers = set(pin.number for pin in part.symbol.pins)
            for number in numbers:
                if number not in part.nets:
                    problems.append('%s pin %s has no net and is not marked NC' % (part.ref, number))
            for number in part.nets:
                if number not in numbers:
                    problems.append('%s names pin %s, which %s does not have' % (part.ref, number, part.symbol.name))
        for net, pins in self.nets().items():
            if len(pins) < 2 and net not in self.single_ok:
                problems.append('net %s reaches only %s.%s' % (net, pins[0][0], pins[0][1]))
        return problems


# --------------------------------------------------------------------------
# Layout: big parts in a row, small parts in a grid under them, one box per section.
# --------------------------------------------------------------------------
PAD = 7.62
TITLE = 10.16
CELL_TWO = 10 * G
CELL_THREE = 18 * G
CELL_ONE = 7 * G
ROW = 9 * G
STUB = G


def label_width(text):
    return len(text) * CHAR + 2.0


def side_room(part, side):
    longest = 0.0
    for pin in part.symbol.pins:
        if pin.side == side:
            net = part.nets.get(pin.number)
            if net and net != NC:
                longest = max(longest, label_width(net) + STUB)
    return longest


def layout(board, page_width=760.0):
    for section in board.sections:
        big = [part for part in section['parts'] if part.symbol.kind == 'ic']
        small = [part for part in section['parts'] if part.symbol.kind != 'ic']
        top = max([part.symbol.ymax for part in big] or [0]) + 2 * G
        bottom = max([-part.symbol.ymin for part in big] or [0]) + 2 * G
        cursor = PAD
        base = snap(TITLE + PAD + top)
        for part in big:
            x = snap(cursor + side_room(part, 'L') - part.symbol.xmin, G)
            part.x, part.y = x, snap(base - (0 if len(part.symbol.pins) % 2 else 0), H)
            # Symbols with an even number of rows sit half a pitch off; keep their pins on the grid.
            cursor = x + part.symbol.xmax + max(side_room(part, 'R'), label_width(part.value) - part.symbol.xmax) + 3 * G
        big_width = cursor
        width = max(big_width, 6 * CELL_TWO + 2 * PAD, label_width(section['name']) * 2.2 + 2 * PAD)
        y = snap((base + bottom + 6 * G) if big else (TITLE + PAD + 3 * G), G)
        x = PAD
        used_rows = 0
        for part in small:
            cell = {'two': CELL_TWO, 'three': CELL_THREE, 'one': CELL_ONE}[part.symbol.kind]
            if x + cell > width - PAD + 0.01:
                x = PAD
                y += ROW
            offset = cell - 6 * G if part.symbol.kind == 'three' else 2 * G
            part.x, part.y = snap(x + offset, G), snap(y, G)
            x += cell
            used_rows = 1
        height = (y + 4 * G) if small else (base + bottom)
        section['w'], section['h'] = snap(width, G), snap(height + PAD, G)

    # Shelves across the page.
    margin = 12.7
    x = y = margin
    shelf = 0.0
    right = 0.0
    for section in board.sections:
        if x > margin and x + section['w'] > page_width - margin:
            x = margin
            y += shelf + 7.62
            shelf = 0.0
        section['x'], section['y'] = snap(x, G), snap(y, G)
        for part in section['parts']:
            part.x = round(part.x + section['x'], 4)
            part.y = round(part.y + section['y'], 4)
        x += section['w'] + 7.62
        shelf = max(shelf, section['h'])
        right = max(right, x)
    board.page = (snap(right + margin, G), snap(y + shelf + margin + 25.4, G))
    return board.page


# --------------------------------------------------------------------------
# The drawing as a neutral list, shared by the KiCad writer, the SVG writer and the checks.
# --------------------------------------------------------------------------
def drawing(board):
    wires, labels, flags = [], [], []
    for part in board.parts:
        for pin in part.symbol.pins:
            x, y = part.pin_xy(pin)
            net = part.nets.get(pin.number)
            if not net or net == NC:
                flags.append((x, y, part.ref, pin.number))
                continue
            dx, dy = {'L': (-STUB, 0), 'R': (STUB, 0), 'T': (0, -H), 'B': (0, H)}[pin.side]
            end = (round(x + dx, 4), round(y + dy, 4))
            wires.append(((x, y), end, part.ref, pin.number))
            labels.append((end[0], end[1], 180 if pin.side == 'L' else 0, net, part.ref, pin.number))
    return wires, labels, flags


def read_back(board):
    """Rebuilds the netlist from coordinates alone and compares it with the description."""
    wires, labels, flags = drawing(board)
    parent = {}

    def find(point):
        parent.setdefault(point, point)
        while parent[point] != point:
            parent[point] = parent[parent[point]]
            point = parent[point]
        return point

    def join(a, b):
        parent[find(a)] = find(b)

    for start, end, _ref, _pin in wires:
        join(start, end)
    names = collections.defaultdict(set)
    for x, y, _angle, net, _ref, _pin in labels:
        names[find((x, y))].add(net)
    problems = []
    flagged = set((x, y) for x, y, _ref, _pin in flags)
    seen_points = {}
    for part in board.parts:
        for pin in part.symbol.pins:
            point = part.pin_xy(pin)
            other = seen_points.get(point)
            if other:
                problems.append('%s.%s sits exactly on %s' % (part.ref, pin.number, other))
            seen_points[point] = '%s.%s' % (part.ref, pin.number)
            want = part.nets.get(pin.number)
            got = names.get(find(point), set())
            if not want or want == NC:
                if got or point not in flagged:
                    problems.append('%s.%s should be unconnected but the drawing gives it %s' % (part.ref, pin.number, sorted(got)))
            elif got != set([want]):
                problems.append('%s.%s should be on %s but the drawing gives %s' % (part.ref, pin.number, want, sorted(got)))
    # A wire end or label must not land on another part's pin or wire by accident.
    owners = collections.defaultdict(set)
    for start, end, ref, pin in wires:
        owners[start].add((ref, pin))
        owners[end].add((ref, pin))
    for point, who in owners.items():
        if len(who) > 1:
            problems.append('wires of %s meet at %s' % (sorted(who), point))
    return problems


# --------------------------------------------------------------------------
# KiCad schematic
# --------------------------------------------------------------------------
def used_symbols(board):
    seen = collections.OrderedDict()
    for part in board.parts:
        seen[part.symbol.name] = part.symbol
    return list(seen.values())


def property_positions(part):
    symbol = part.symbol
    if symbol.kind == 'ic':
        left = part.x + symbol.graphics[0][1]
        return (left, part.y - symbol.ymax - 2 * H), (left, part.y - symbol.ymin + 3 * H)
    if symbol.kind == 'three':
        return (part.x + 1.5 * G, part.y - G), (part.x + 1.5 * G, part.y + G)
    if symbol.kind == 'one':
        return (part.x + G, part.y - H), (part.x + G, part.y + H)
    return (part.x + G, part.y - H), (part.x + G, part.y + H)


def kicad_schematic(board, library='maatora'):
    root = uid(board.key, 'root')
    font = '(effects (font (size 1.27 1.27)) (justify left))'
    hidden = '(effects (font (size 1.27 1.27)) hide)'
    out = ['(kicad_sch (version 20230121) (generator maatora_kit)', '', '  (uuid %s)' % root, '',
           '  (paper "User" %s %s)' % (num(board.page[0]), num(board.page[1])), '',
           '  (title_block', '    (title %s)' % quote(board.title), '    (date %s)' % quote(board.date),
           '    (rev %s)' % quote(board.revision), '    (company %s)' % quote(board.company),
           '    (comment 1 %s)' % quote(board.comment), '  )', '', '  (lib_symbols']
    for symbol in used_symbols(board):
        out.append(symbol.kicad(library, 4))
    out.append('  )')
    out.append('')
    wires, labels, flags = drawing(board)
    for x, y, ref, pin in flags:
        out.append('  (no_connect (at %s %s) (uuid %s))' % (num(x), num(y), uid(board.key, 'nc', ref, pin)))
    for start, end, ref, pin in wires:
        out.append('  (wire (pts (xy %s %s) (xy %s %s)) (stroke (width 0) (type default)) (uuid %s))' % (
            num(start[0]), num(start[1]), num(end[0]), num(end[1]), uid(board.key, 'wire', ref, pin)))
    for section in board.sections:
        key = section['name']
        out.append('  (rectangle (start %s %s) (end %s %s) (stroke (width 0.2) (type dash)) (fill (type none)) (uuid %s))' % (
            num(section['x']), num(section['y']), num(section['x'] + section['w']), num(section['y'] + section['h']), uid(board.key, 'box', key)))
        out.append('  (text %s (at %s %s 0) (effects (font (size 2.54 2.54)) (justify left bottom)) (uuid %s))' % (
            quote(key), num(section['x'] + 2.54), num(section['y'] + 6.35), uid(board.key, 'title', key)))
        if section['note']:
            out.append('  (text %s (at %s %s 0) (effects (font (size 1.27 1.27)) (justify left bottom)) (uuid %s))' % (
                quote(section['note']), num(section['x'] + 2.54), num(section['y'] + 9.5), uid(board.key, 'note', key)))
    for x, y, angle, net, ref, pin in labels:
        out.append('  (label %s (at %s %s %d) (fields_autoplaced) (effects (font (size 1.27 1.27)) (justify %s bottom)) (uuid %s))' % (
            quote(net), num(x), num(y), angle, 'right' if angle == 180 else 'left', uid(board.key, 'label', ref, pin)))
    for part in board.parts:
        ref_at, value_at = property_positions(part)
        out.append('  (symbol (lib_id %s) (at %s %s 0) (unit 1) (in_bom %s) (on_board yes) (dnp %s)' % (
            quote('%s:%s' % (library, part.symbol.name)), num(part.x), num(part.y), in_bom(part.symbol), 'yes' if part.dnp else 'no'))
        out.append('    (uuid %s)' % uid(board.key, 'symbol', part.ref))
        out.append('    (property "Reference" %s (at %s %s 0) %s)' % (quote(part.ref), num(ref_at[0]), num(ref_at[1]), font))
        out.append('    (property "Value" %s (at %s %s 0) %s)' % (quote(part.value), num(value_at[0]), num(value_at[1]), font))
        out.append('    (property "Footprint" %s (at %s %s 0) %s)' % (quote(part.footprint), num(part.x), num(part.y), hidden))
        out.append('    (property "Datasheet" "" (at %s %s 0) %s)' % (num(part.x), num(part.y), hidden))
        out.append('    (property "MPN" %s (at %s %s 0) %s)' % (quote(part.mpn), num(part.x), num(part.y), hidden))
        for pin in part.symbol.pins:
            out.append('    (pin %s (uuid %s))' % (quote(pin.number), uid(board.key, 'pin', part.ref, pin.number)))
        out.append('    (instances (project %s (path %s (reference %s) (unit 1))))' % (
            quote(board.key), quote('/' + root), quote(part.ref)))
        out.append('  )')
    out.append('')
    out.append('  (sheet_instances (path "/" (page "1")))')
    out.append(')')
    out.append('')
    return '\n'.join(out)


def in_bom(symbol):
    """Test pads are bare copper: nothing to buy, so they stay out of KiCad's parts list, as they do in the CSV."""
    return 'no' if symbol.kind == 'one' else 'yes'


def kicad_library(board):
    out = ['(kicad_symbol_lib (version 20220914) (generator maatora_kit)']
    for symbol in used_symbols(board):
        out.append(symbol.kicad('', 2))
    out.append(')')
    out.append('')
    return '\n'.join(out)


def balanced(text):
    """True when every bracket outside a quoted string is closed."""
    depth = 0
    quoted = False
    escape = False
    for char in text:
        if quoted:
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
            if depth < 0:
                return False
    return depth == 0 and not quoted


# --------------------------------------------------------------------------
# SVG, drawn from the same geometry with KiCad's default colours.
# --------------------------------------------------------------------------
STYLE = '''
  .sheet { fill: #ffffff; }
  .wire { stroke: #009600; stroke-width: 0.15; fill: none; }
  .body { stroke: #840000; stroke-width: 0.2; fill: #ffffc2; }
  .line { stroke: #840000; stroke-width: 0.2; fill: none; }
  .solid { stroke: #840000; stroke-width: 0.2; fill: #840000; }
  .pin { stroke: #840000; stroke-width: 0.15; fill: none; }
  .nc { stroke: #0000c2; stroke-width: 0.18; fill: none; }
  .frame { stroke: #1a4d99; stroke-width: 0.2; stroke-dasharray: 1.2 0.8; fill: none; }
  .border { stroke: #840000; stroke-width: 0.3; fill: none; }
  text { font-family: "DejaVu Sans Mono", Consolas, "Courier New", monospace; }
  .label { font-size: 1.45px; fill: #0f0f0f; }
  .ref { font-size: 1.5px; fill: #008484; font-weight: bold; }
  .value { font-size: 1.4px; fill: #008484; }
  .pinname { font-size: 1.25px; fill: #006464; }
  .pinnum { font-size: 0.95px; fill: #a90000; }
  .caption { font-size: 1.0px; fill: #840000; }
  .title { font-size: 3.2px; fill: #1a4d99; font-weight: bold; }
  .note { font-size: 1.5px; fill: #1a4d99; }
  .block { font-size: 2.2px; fill: #840000; }
  .dnp { font-size: 1.3px; fill: #c20000; font-weight: bold; }
'''


def esc(text):
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def svg_part(part):
    out = []
    symbol = part.symbol
    ox, oy = part.x, part.y
    for shape in symbol.graphics:
        if shape[0] == 'rect':
            x1, y1, x2, y2 = shape[1], shape[2], shape[3], shape[4]
            fill = shape[5] if len(shape) > 5 else 'background'
            css = {'background': 'body', 'none': 'line', 'outline': 'solid'}[fill]
            out.append('<rect class="%s" x="%s" y="%s" width="%s" height="%s"/>' % (
                css, num(ox + min(x1, x2)), num(oy - max(y1, y2)), num(abs(x2 - x1)), num(abs(y2 - y1))))
        elif shape[0] == 'poly':
            points = ' '.join('%s,%s' % (num(ox + x), num(oy - y)) for x, y in shape[1])
            out.append('<polyline class="line" points="%s"/>' % points)
        elif shape[0] == 'circle':
            out.append('<circle class="line" cx="%s" cy="%s" r="%s"/>' % (num(ox + shape[1]), num(oy - shape[2]), num(shape[3])))
    for x, y, caption in symbol.text:
        out.append('<text class="caption" x="%s" y="%s" text-anchor="middle">%s</text>' % (num(ox + x), num(oy - y + 0.35), esc(caption)))
    for pin in symbol.pins:
        x, y = ox + pin.x, oy - pin.y
        dx, dy = {0: (1, 0), 180: (-1, 0), 270: (0, 1), 90: (0, -1)}[pin.angle]
        out.append('<line class="pin" x1="%s" y1="%s" x2="%s" y2="%s"/>' % (num(x), num(y), num(x + dx * pin.length), num(y + dy * pin.length)))
        if symbol.show_numbers or symbol.kind == 'three':
            if pin.side in 'LR':
                out.append('<text class="pinnum" x="%s" y="%s" text-anchor="middle">%s</text>' % (num(x + dx * pin.length / 2), num(y - 0.3), esc(pin.number)))
            else:
                out.append('<text class="pinnum" x="%s" y="%s" text-anchor="start">%s</text>' % (num(x + 0.3), num(y + dy * pin.length / 2 + 0.3), esc(pin.number)))
        if symbol.kind == 'ic' and pin.name:
            inside = x + dx * (pin.length + 0.7)
            out.append('<text class="pinname" x="%s" y="%s" text-anchor="%s">%s</text>' % (
                num(inside), num(y + 0.45), 'start' if pin.side == 'L' else 'end', esc(pin.name)))
        if symbol.kind == 'three' and pin.name:
            if pin.side == 'L':
                out.append('<text class="pinnum" x="%s" y="%s" text-anchor="start">%s</text>' % (num(ox - G + 0.3), num(oy - 0.5), esc(pin.name)))
            else:
                out.append('<text class="pinnum" x="%s" y="%s" text-anchor="end">%s</text>' % (
                    num(ox - 0.3), num(oy - pin.y / 2.5 * 1.5 + (0.9 if pin.side == 'T' else -0.3) + (0 if pin.side == 'T' else 0)), esc(pin.name)))
    ref_at, value_at = property_positions(part)
    out.append('<text class="ref" x="%s" y="%s">%s</text>' % (num(ref_at[0]), num(ref_at[1] + 0.5), esc(part.ref)))
    out.append('<text class="value" x="%s" y="%s">%s</text>' % (num(value_at[0]), num(value_at[1] + 0.5), esc(part.value)))
    if part.dnp:
        out.append('<text class="dnp" x="%s" y="%s">not fitted</text>' % (num(value_at[0]), num(value_at[1] + 2.3)))
    return out


def svg_body(board, only=None):
    out = []
    wires, labels, flags = drawing(board)
    chosen = set(part.ref for part in board.parts if only is None or part.section is only)
    for section in board.sections:
        if only is not None and section is not only:
            continue
        out.append('<rect class="frame" x="%s" y="%s" width="%s" height="%s"/>' % (num(section['x']), num(section['y']), num(section['w']), num(section['h'])))
        out.append('<text class="title" x="%s" y="%s">%s</text>' % (num(section['x'] + 2.54), num(section['y'] + 5.8), esc(section['name'])))
        if section['note']:
            out.append('<text class="note" x="%s" y="%s">%s</text>' % (num(section['x'] + 2.54), num(section['y'] + 9.2), esc(section['note'])))
    for start, end, ref, _pin in wires:
        if ref in chosen:
            out.append('<line class="wire" x1="%s" y1="%s" x2="%s" y2="%s"/>' % (num(start[0]), num(start[1]), num(end[0]), num(end[1])))
    for x, y, ref, _pin in flags:
        if ref in chosen:
            out.append('<path class="nc" d="M%s %sl1.2 1.2m0 -1.2l-1.2 1.2"/>' % (num(x - 0.6), num(y - 0.6)))
    for x, y, angle, net, ref, _pin in labels:
        if ref in chosen:
            if angle == 180:
                out.append('<text class="label" x="%s" y="%s" text-anchor="end">%s</text>' % (num(x - 0.3), num(y - 0.35), esc(net)))
            else:
                out.append('<text class="label" x="%s" y="%s">%s</text>' % (num(x + 0.3), num(y - 0.35), esc(net)))
    for part in board.parts:
        if part.ref in chosen:
            out.extend(svg_part(part))
    return out


def svg_sheet(board):
    width, height = board.page
    out = ['<svg xmlns="http://www.w3.org/2000/svg" width="%smm" height="%smm" viewBox="0 0 %s %s">' % (num(width), num(height), num(width), num(height)),
           '<style>%s</style>' % STYLE,
           '<rect class="sheet" width="%s" height="%s"/>' % (num(width), num(height)),
           '<rect class="border" x="5" y="5" width="%s" height="%s"/>' % (num(width - 10), num(height - 10))]
    out.extend(svg_body(board))
    out.append('<rect class="border" x="%s" y="%s" width="180" height="22"/>' % (num(width - 185), num(height - 27)))
    out.append('<text class="title" x="%s" y="%s">%s</text>' % (num(width - 182), num(height - 20), esc(board.title)))
    out.append('<text class="block" x="%s" y="%s">Rev %s   %s   %s</text>' % (num(width - 182), num(height - 15), esc(board.revision), esc(board.date), esc(board.company)))
    out.append('<text class="note" x="%s" y="%s">%s</text>' % (num(width - 182), num(height - 10.5), esc(board.comment)))
    out.append('<text class="note" x="%s" y="%s">Generated by hardware/tools/build.py. Connections are by net label: equal names are joined.</text>' % (num(width - 182), num(height - 7.2)))
    out.append('</svg>')
    return '\n'.join(out)


def svg_section(board, section):
    margin = 4.0
    x, y, w, h = section['x'] - margin, section['y'] - margin, section['w'] + 2 * margin, section['h'] + 2 * margin
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s %s %s %s" preserveAspectRatio="xMidYMid meet">' % (num(x), num(y), num(w), num(h)),
           '<style>%s</style>' % STYLE,
           '<rect class="sheet" x="%s" y="%s" width="%s" height="%s"/>' % (num(x), num(y), num(w), num(h))]
    out.extend(svg_body(board, section))
    out.append('</svg>')
    return '\n'.join(out)


# --------------------------------------------------------------------------
# Lists
# --------------------------------------------------------------------------
def write_bom(board, path):
    groups = collections.OrderedDict()
    for part in board.parts:
        if part.symbol.kind == 'one':
            continue
        key = (part.value, part.footprint, part.mpn, part.desc, part.dnp)
        groups.setdefault(key, []).append(part)
    total = 0.0
    with io.open(path, 'w', encoding='utf-8', newline='') as handle:
        writer = csv.writer(handle, lineterminator=chr(10))
        writer.writerow(['References', 'Quantity', 'Value', 'Description', 'Part number', 'Footprint', 'Fitted', 'Unit price USD (estimate)', 'Line total USD'])
        for (value, footprint, mpn, desc, dnp), parts in groups.items():
            price = parts[0].price
            line = 0.0 if dnp else price * len(parts)
            total += line
            writer.writerow([' '.join(part.ref for part in parts), len(parts), value, desc, mpn, footprint, 'no' if dnp else 'yes', '%.2f' % price, '%.2f' % line])
        writer.writerow([])
        writer.writerow(['Total of fitted parts (estimate, small quantities)', '', '', '', '', '', '', '', '%.2f' % total])
    return total, len(groups)


def write_netlist(board, path):
    with io.open(path, 'w', encoding='utf-8', newline='') as handle:
        writer = csv.writer(handle, lineterminator=chr(10))
        writer.writerow(['Net', 'Pins', 'Connections (reference.pin name)'])
        for net, pins in sorted(board.nets().items()):
            writer.writerow([net, len(pins), '  '.join('%s.%s%s' % (ref, number, (' ' + name) if name else '') for ref, number, name in pins)])
