# -*- coding: utf-8 -*-
"""Builds the hardware design files for both Maatora boards.

    python hardware/tools/build.py            writes KiCad files, lists and SVG pages
    python hardware/tools/build.py --pdf      also prints the PDFs with Chrome

The two boards are described below, part by part and pin by pin. Everything
else (drawings, parts lists, netlists, checks) is produced from that description.
"""
import io
import os
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
from kit import NC, Board, box  # noqa: E402

HARDWARE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATE = '2026-11-24'
CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

R0603 = 'Resistor_SMD:R_0603_1608Metric'
C0603 = 'Capacitor_SMD:C_0603_1608Metric'
C0805 = 'Capacitor_SMD:C_0805_2012Metric'
SOT23 = 'Package_TO_SOT_SMD:SOT-23'
SMA = 'Diode_SMD:D_SMA'
SMC = 'Diode_SMD:D_SMC'
SOIC8 = 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'

# --------------------------------------------------------------------------
# Symbols used by more than one board
# --------------------------------------------------------------------------
SP3485 = box('SP3485EN', 'U', [(1, 'RO'), (2, 'RE'), (3, 'DE'), (4, 'DI')], [(8, 'VCC'), (6, 'A'), (7, 'B'), (5, 'GND')])
SHT4X = box('SHT4x', 'U', [(3, 'VDD'), (2, 'SCL'), (1, 'SDA')], [(4, 'VSS')])
# The sensor cable, pin by pin.
#   'rev-a'         The pinout of the Rev A tracker and of the first temperature
#                   module, so boards built from this design plug into those.
#   'network-safe'  One net on both wires of every pair except the data pair, so
#                   plugging the cable into a network socket by mistake cannot
#                   push current through that socket. It does NOT match boards
#                   built with the Rev A pinout: change every board together.
CABLE = 'rev-a'
CABLE_PINS = {
    'rev-a': [(1, 'GND'), (2, '+5V'), (3, 'B'), (4, 'A'), (5, 'B'), (6, 'A'), (7, '+5V'), (8, 'GND')],
    'network-safe': [(1, 'GND'), (2, 'GND'), (3, 'GND'), (4, 'A'), (5, 'B'), (6, 'GND'), (7, '+5V'), (8, '+5V')],
}
RJ45 = box('RJ45', 'J', CABLE_PINS[CABLE] + [('SH', 'SHIELD')], [])
RJ45_FP = 'Connector_RJ:RJ45_Amphenol_RJHSE5380'


def rj45_nets(supply):
    names = {'GND': 'GND', '+5V': supply, 'A': 'RS485_A', 'B': 'RS485_B'}
    nets = dict((number, names[name]) for number, name in CABLE_PINS[CABLE])
    nets['SH'] = 'GND'
    return nets


# --------------------------------------------------------------------------
# Board 1: the tracker (vehicle unit), Rev B
# --------------------------------------------------------------------------
def tracker():
    b = Board('maatora-tracker', 'Maatora Tracker (vehicle unit)', 'B', DATE, 'lumidren',
              'Design for review. Not released for fabrication.')

    # ---- 1 ------------------------------------------------------------------
    b.section('1  Vehicle input and protection',
              '9 to 32 V in (the surge diode stays off up to 33 V). D2 is rated for the capacitor voltage plus a negative surge, so 100 V.')
    power = box('Vehicle_Power_2x2', 'J', [], [(1, 'VIN+'), (2, 'GND'), (3, 'IGN'), (4, 'GND')])
    b.add(power, 'Micro-Fit 2x2', {1: 'VIN_RAW', 2: 'GND', 3: 'IGN_RAW', 4: 'GND'},
          footprint='Connector_Molex:Molex_Micro-Fit_3.0_43045-0412_2x02_P3.00mm_Vertical', mpn='Molex 43045-0412',
          desc='Vehicle power and ignition, locking connector', price=0.90)
    b.add('F', 'PPTC 1.6A/72V', {1: 'VIN_RAW', 2: 'VIN_FUSED'}, mpn='Littelfuse RXEF160 or Bourns MF-RX160/72',
          desc='Resettable fuse, 72 V, 1.6 A hold (about 1 A in a hot cab), radial 5.1 mm pitch. Not the 30 V MF-R160', price=0.35)
    b.D('DB', 'SMCJ33CA', 'VIN_FUSED', 'GND', footprint=SMC, mpn='SMCJ33CA', desc='TVS, bidirectional, 33 V stand-off, 1500 W', price=0.35)
    b.D('DS', 'SS510C', 'VIN_PROT', 'VIN_FUSED', footprint=SMC, mpn='SS510C (SMC / DO-214AB; the bare SS510 is often SMA)',
        desc='Schottky 100 V 5 A, reverse-polarity protection. Sees the supply plus a negative surge clamped by D1', price=0.15)
    b.CP('220uF/63V', 'VIN_PROT', 'GND', footprint='Capacitor_THT:CP_Radial_D10.0mm_P5.00mm',
         desc='Electrolytic, low impedance, 105 C, ripple rating 0.8 A or more at 100 kHz', price=0.40)
    b.C('100nF/100V', 'VIN_PROT', 'GND', footprint=C0805, price=0.03)
    b.R('499k', 'IGN_RAW', 'IGN_MID', footprint='Resistor_SMD:R_1206_3216Metric',
        desc='Resistor, 1 %, 1206. Two in series carry the ignition line pulses (about -600 V on 24 V trucks)')
    b.R('499k', 'IGN_MID', 'IGN_SENSE', footprint='Resistor_SMD:R_1206_3216Metric', desc='Resistor, 1 %, 1206')
    b.R('47k', 'IGN_SENSE', 'GND')
    b.C('100nF', 'IGN_SENSE', 'GND')
    b.add('BAT54S', 'BAV199', {3: 'IGN_SENSE', 2: '+3V3', 1: 'GND'}, footprint=SOT23, mpn='BAV199',
          desc='Dual low-leakage diode clamp. A BAT54S leaks enough in a hot cab to fake ignition on', price=0.05)
    b.R('1M', 'VIN_PROT', 'VIN_SENSE', desc='Resistor, 1 %, 0603, 75 V working voltage or more')
    b.R('47k', 'VIN_SENSE', 'GND')
    b.C('100nF', 'VIN_SENSE', 'GND')

    # ---- 2 ------------------------------------------------------------------
    b.section('2  Vehicle supply down to 5 V', 'LM2596HV: 60 V input rating. This rail feeds the charger and nothing else.')
    buck = box('LM2596HVS-5.0', 'U', [(1, 'VIN'), (5, 'ON/OFF')], [(2, 'OUT'), (4, 'FB'), (3, 'GND')])
    b.add(buck, 'LM2596HVS-5.0', {1: 'VIN_PROT', 5: 'GND', 2: 'SW_5V', 4: '+5V', 3: 'GND'},
          footprint='Package_TO_SOT_SMD:TO-263-5_TabPin3', mpn='H&M Semi LM2596HVS-5.0 (not the 40 V LM2596S-5.0)',
          desc='Step-down converter, 60 V in, 5 V 3 A out. The common LM2596S-5.0 is a 40 V part and is not a substitute', price=1.20)
    b.add('L', '68uH/3A', {1: 'SW_5V', 2: '+5V'}, footprint='Inductor_SMD:L_12x12mm_H8mm', desc='Power inductor, shielded, 3 A saturation', price=0.35)
    b.D('DS', 'SS510C', 'SW_5V', 'GND', footprint=SMC, mpn='SS510C (SMC / DO-214AB)', desc='Schottky 100 V 5 A, catch diode', price=0.15)
    b.CP('470uF/16V', '+5V', 'GND', footprint='Capacitor_THT:CP_Radial_D10.0mm_P5.00mm',
         desc='Electrolytic, low ESR, 105 C. The value in the regulator datasheet reference circuit', price=0.20)
    b.C('100nF', '+5V', 'GND')
    b.TP('+5V', '+5V')

    # ---- 3 ------------------------------------------------------------------
    b.section('3  Charger and backup battery', 'Power path: VSYS comes from the input when it is present, from the cell when it is not.')
    charger = box('BQ24074RGT', 'U',
                  [(13, 'IN'), (5, 'EN2'), (6, 'EN1'), (4, 'CE'), (12, 'ILIM'), (16, 'ISET'), (15, 'ITERM'), (14, 'TMR')],
                  [(10, 'OUT'), (11, 'OUT'), (2, 'BAT'), (3, 'BAT'), (1, 'TS'), (7, 'PGOOD'), (9, 'CHG'), (8, 'VSS'), (17, 'PAD')])
    b.add(charger, 'BQ24074RGT', {13: '+5V', 5: 'CHG_EN2', 6: 'GND', 4: 'GND', 12: 'CHG_ILIM', 16: 'CHG_ISET', 15: NC, 14: 'CHG_TMR',
                                  10: 'VSYS', 11: 'VSYS', 2: 'VBAT', 3: 'VBAT', 1: 'BAT_NTC', 7: 'CHG_PGOOD_N', 9: 'CHG_STAT', 8: 'GND', 17: 'GND'},
          footprint='Package_DFN_QFN:VQFN-16-1EP_3x3mm_P0.5mm_EP1.6x1.6mm', mpn='BQ24074RGTR',
          desc='Li-ion charger with power path and cell temperature input', price=1.60)
    battery = box('Battery_1S_NTC', 'J', [], [(1, 'BAT+'), (2, 'NTC'), (3, 'BAT-')])
    b.add(battery, 'JST-PH 3', {1: 'VBAT', 2: 'BAT_NTC', 3: 'GND'}, footprint='Connector_JST:JST_PH_B3B-PH-K_1x03_P2.00mm_Vertical',
          mpn='JST B3B-PH-K', desc='Protected 1S cell with 10 k NTC', price=0.10)
    b.C('4.7uF', '+5V', 'GND', footprint=C0805, price=0.04)
    b.C('10uF', 'VSYS', 'GND', footprint=C0805, price=0.05)
    b.C('4.7uF', 'VBAT', 'GND', footprint=C0805, price=0.04)
    b.R('10k', '+5V', 'CHG_EN2')
    b.R('1.5k', 'CHG_ILIM', 'GND', desc='Input limit about 1.07 A (1610 / R)')
    b.R('1.78k', 'CHG_ISET', 'GND', desc='Charge current 0.5 A (890 / R)')
    b.R('68k', 'CHG_TMR', 'GND', desc='Charge safety timer about 9 h (6.8 h minimum). The 5 h default ends a full charge of the cell early')
    b.R('10k', 'BAT_NTC', 'GND', dnp=True, desc='Fit only when the pack has no NTC')
    b.R('220k', 'VBAT', 'BAT_SENSE')
    b.R('220k', 'BAT_SENSE', 'GND')
    b.C('100nF', 'BAT_SENSE', 'GND')
    b.R('10k', '+3V3', 'CHG_STAT')
    b.R('2.2k', '+5V', 'LED_EXT_A')
    b.LED('green', 'LED_EXT_A', 'CHG_PGOOD_N', desc='Indicator LED, 0603: external power present')
    b.TP('VBAT', 'VBAT')
    b.TP('VSYS', 'VSYS')

    # ---- 4 ------------------------------------------------------------------
    b.section('4  Logic supply, 3.3 V', 'Fed from VSYS so the processor keeps running on the battery.')
    buck33 = box('TLV62569DBV', 'U', [(4, 'VIN'), (1, 'EN')], [(3, 'SW'), (5, 'FB'), (2, 'GND')])
    b.add(buck33, 'TLV62569DBV', {4: 'VSYS', 1: 'VSYS', 3: 'SW_3V3', 5: 'FB_3V3', 2: 'GND'},
          footprint='Package_TO_SOT_SMD:SOT-23-5', mpn='TLV62569DBVR',
          desc='Step-down converter, 2 A, 2.5 to 5.5 V in. SY8089A1AAC is a cheaper part sold with the same pinout: check its datasheet', price=0.35)
    b.C('22uF', 'VSYS', 'GND', footprint=C0805, price=0.06)
    b.add('L', '2.2uH/2A', {1: 'SW_3V3', 2: '+3V3'}, footprint='Inductor_SMD:L_Taiyo-Yuden_NR-40xx', desc='Power inductor, 2 A', price=0.10)
    b.R('453k', '+3V3', 'FB_3V3', desc='Output 3.32 V: 0.6 V x (1 + 453k / 100k)')
    b.R('100k', 'FB_3V3', 'GND')
    b.C('6.8pF', '+3V3', 'FB_3V3', dnp=True,
        desc='Feed-forward capacitor, C0G. Not fitted; fit if the rail rings on a load step (it carries about 65 uF, more than TI characterises)')
    b.C('22uF', '+3V3', 'GND', footprint=C0805, price=0.06)
    b.C('22uF', '+3V3', 'GND', footprint=C0805, price=0.06)
    b.C('100nF', '+3V3', 'GND')
    b.R('2.2k', '+3V3', 'LED_PWR_A')
    b.LED('green', 'LED_PWR_A', 'GND', desc='Indicator LED, 0603: board powered')
    b.TP('+3V3', '+3V3')
    b.TP('GND', 'GND')

    # ---- 5 ------------------------------------------------------------------
    b.section('5  Modem supply, 3.8 V', 'Buck-boost keeps the modem at 3.8 V from a full cell down to an empty one. EN low removes the supply.')
    buckboost = box('TPS63020DSJ', 'U',
                    [(10, 'VIN'), (11, 'VIN'), (1, 'VINA'), (12, 'EN'), (13, 'PS/SYNC'), (8, 'L1'), (9, 'L1')],
                    [(4, 'VOUT'), (5, 'VOUT'), (3, 'FB'), (14, 'PG'), (6, 'L2'), (7, 'L2'), (2, 'GND'), (15, 'PGND')])
    b.add(buckboost, 'TPS63020DSJ', {10: 'VSYS', 11: 'VSYS', 1: 'VINA_MODEM', 12: 'MODEM_PWR_EN', 13: 'GND', 8: 'BB_L1', 9: 'BB_L1',
                                     4: 'V_MODEM', 5: 'V_MODEM', 3: 'FB_MODEM', 14: 'MODEM_PG', 6: 'BB_L2', 7: 'BB_L2', 2: 'GND', 15: 'GND'},
          mpn='TPS63020DSJR', desc='Buck-boost converter, 4 A switch, VSON-14 3x4 mm', price=2.20)
    b.C('10uF', 'VSYS', 'GND', footprint=C0805, price=0.05)
    b.C('10uF', 'VSYS', 'GND', footprint=C0805, price=0.05)
    b.C('100nF', 'VINA_MODEM', 'GND')
    b.add('L', '1.5uH/5A', {1: 'BB_L1', 2: 'BB_L2'}, footprint='Inductor_SMD:L_Vishay_IHLP-2020', desc='Power inductor, 5 A saturation, low DCR', price=0.35)
    b.R('1.2M', 'V_MODEM', 'FB_MODEM')
    b.R('180k', 'FB_MODEM', 'GND')
    b.C('22uF', 'V_MODEM', 'GND', footprint=C0805, price=0.06)
    b.C('22uF', 'V_MODEM', 'GND', footprint=C0805, price=0.06)
    b.C('22uF', 'V_MODEM', 'GND', footprint=C0805, price=0.06)
    b.R('100k', 'MODEM_PWR_EN', 'GND')
    b.R('100k', '+3V3', 'MODEM_PG', desc='Pull-up for the open-drain power-good output: low while the converter is at its current limit')
    b.CP('1000uF/6.3V', 'V_MODEM', 'GND', desc='Polymer or low-ESR electrolytic, the bulk capacitor SIMCom recommends. It covers the start of a burst, not all of it', price=0.40)
    b.C('1uF', 'V_MODEM', 'GND', desc='Ceramic capacitor, X7R, at the modem supply pads')
    b.C('100nF', 'V_MODEM', 'GND', desc='Ceramic capacitor, X7R, at the modem supply pads')
    b.C('33pF', 'V_MODEM', 'GND', desc='Ceramic capacitor, C0G, at the modem supply pads')
    b.C('10pF', 'V_MODEM', 'GND', desc='Ceramic capacitor, C0G, at the modem supply pads: works at the 1.8 to 2.6 GHz bands')
    b.R('470R', 'V_MODEM', 'MODEM_BLEED', desc='Discharge: takes the 3.8 V rail below 0.1 V about 2 s after the supply is switched off')
    b.add('NMOS', 'AO3400A', {1: 'MODEM_DISCHARGE', 3: 'MODEM_BLEED', 2: 'GND'}, footprint=SOT23, mpn='AO3400A',
          desc='N-MOSFET 30 V 5 A. On only while the modem supply is off', price=0.05)
    b.R('100k', 'MODEM_DISCHARGE', 'GND')
    b.D('DZ', 'SMF5.0A', 'V_MODEM', 'GND', footprint='Diode_SMD:D_SOD-123F', mpn='SMF5.0A', desc='TVS, 5 V stand-off', price=0.05)
    b.TP('V_MODEM', 'V_MODEM')

    # ---- 6 ------------------------------------------------------------------
    b.section('6  Switched 5 V for the GNSS module and the sensor cable',
              'Stepped up from VSYS, so position and cargo readings carry on when the vehicle supply is cut. 5V_SW_EN low switches both off. A short latches the switch off until 5V_SW_EN is toggled.')
    boost = box('MT3608', 'U', [(5, 'IN'), (4, 'EN')], [(1, 'SW'), (3, 'FB'), (2, 'GND'), (6, 'NC')])
    b.add(boost, 'MT3608', {5: 'VSYS', 4: '5V_SW_EN', 1: 'SW_AUX', 3: 'FB_AUX', 2: 'GND', 6: NC},
          footprint='Package_TO_SOT_SMD:SOT-23-6', mpn='MT3608', desc='Step-up converter, 4 A switch, 1.2 MHz', price=0.10)
    b.C('22uF', 'VSYS', 'GND', footprint=C0805, price=0.06)
    b.add('L', '4.7uH/2A', {1: 'VSYS', 2: 'SW_AUX'}, footprint='Inductor_SMD:L_Taiyo-Yuden_NR-40xx', mpn='Taiyo Yuden NRS4018T4R7MDGJ',
          desc='Power inductor, 4 x 4 mm, 2 A saturation', price=0.12)
    b.D('DS', 'SS24', '+5V_AUX', 'SW_AUX', footprint=SMA, mpn='SS24 in SMA / DO-214AC (MDD SS24, onsemi SSA24; Vishay SS24 is SMB)',
        desc='Schottky 40 V 2 A, step-up diode', price=0.04)
    b.R('220k', '+5V_AUX', 'FB_AUX', desc='Output 5.0 V: 0.6 V x (1 + 220k / 30k)')
    b.R('30k', 'FB_AUX', 'GND')
    b.C('22uF', '+5V_AUX', 'GND', footprint=C0805, price=0.06)
    b.C('100nF', '+5V_AUX', 'GND')
    switch = box('TPS2553DBV-1', 'U', [(1, 'IN'), (3, 'EN'), (5, 'ILIM')], [(6, 'OUT'), (4, 'FAULT'), (2, 'GND')])
    b.add(switch, 'TPS2553DBV-1', {1: '+5V_AUX', 3: '5V_SW_EN', 5: 'SW_ILIM', 6: '5V_SW', 4: 'CABLE_FAULT_N', 2: 'GND'},
          footprint='Package_TO_SOT_SMD:SOT-23-6', mpn='TPS2553DBVR-1',
          desc='Current-limited switch, latch-off version. Disconnects the loads, which a step-up converter cannot do, and turns off on a short', price=0.60)
    b.R('49.9k', 'SW_ILIM', 'GND', desc='Current limit 0.48 to 0.57 A (TI table)')
    b.R('10k', '+3V3', 'CABLE_FAULT_N', desc='Pull-up for the open-drain fault output')
    b.R('100k', '5V_SW_EN', 'GND')
    b.C('10uF', '5V_SW', 'GND', footprint=C0805, price=0.05)
    b.TP('5V_SW', '5V_SW')

    # ---- 7 ------------------------------------------------------------------
    b.section('7  LTE modem and SIM', 'A7670 logic is 1.8 V. The translator is powered from the modem, so it lets go of the lines when the modem is off.')
    modem_left = [(55, 'VBAT'), (56, 'VBAT'), (57, 'VBAT'), (15, 'VDD_1V8'), (1, 'PWRKEY'), (16, 'RESET'), (66, 'STATUS'), (52, 'NETLIGHT'),
                  (9, 'TXD'), (10, 'RXD'), (8, 'RTS'), (7, 'CTS'), (3, 'DTR'), (4, 'RI'), (5, 'DCD'), (6, 'USB_BOOT'), (24, 'VBUS'),
                  (27, 'USB_DP'), (28, 'USB_DM'), (30, 'SIM_VDD'), (31, 'SIM_DATA'), (32, 'SIM_CLK'), (33, 'SIM_RST'), (34, 'SIM_DET'),
                  (60, 'RF_ANT'), (25, 'ADC'), (37, 'I2C_SDA'), (38, 'I2C_SCL'), (22, 'UART_LOG_RX'), (23, 'UART_LOG_TX'), (11, 'PCM_CLK'),
                  (12, 'PCM_SYNC'), (13, 'PCM_DIN'), (14, 'PCM_OUT'), (19, 'GPIO1'), (20, 'GPIO2'), (21, 'GPIO3'), (48, 'GPIO9'),
                  (49, 'GPIO4'), (50, 'GPIO5'), (67, 'GPIO10'), (68, 'GPIO11')]
    modem_nc = (26, 35, 36, 40, 41, 42, 43, 44, 47, 51, 53)
    modem_gnd = (2, 17, 18, 29, 39, 45, 46, 54, 58, 59, 61, 62, 63, 64, 65) + tuple(range(69, 89))
    modem = box('A7670E', 'U', modem_left, [(n, 'NC') for n in modem_nc] + [(n, 'GND') for n in modem_gnd])
    assert sorted(int(pin.number) for pin in modem.pins) == list(range(1, 89)), 'the A7670 must have pads 1 to 88'
    nets = dict((n, NC) for n in range(1, 89))
    nets.update(dict((n, 'GND') for n in modem_gnd))
    nets.update({55: 'V_MODEM', 56: 'V_MODEM', 57: 'V_MODEM', 15: 'VDD_1V8', 1: 'MODEM_PWRKEY_N', 16: 'MODEM_RESET_N',
                 66: 'MODEM_STATUS', 52: 'MODEM_NETLIGHT', 9: 'MODEM_TXD', 10: 'MODEM_RXD', 3: 'MODEM_DTR',
                 6: 'MODEM_USB_BOOT', 24: 'MODEM_VBUS', 27: 'MODEM_USB_DP', 28: 'MODEM_USB_DM',
                 30: 'SIM_VDD', 31: 'SIM_DATA_M', 32: 'SIM_CLK_M', 33: 'SIM_RST_M', 60: 'RF_ANT', 23: 'MODEM_LOG_TX'})
    b.add(modem, 'A7670E', nets, mpn='SIMCom A7670E, 88-pad edition (Hardware Design V1.00 / V1.04). The -LASE and -FASE R2 modules have 124 pads',
          desc='LTE Cat 1 module with 2G fallback, 88 pads, footprint from the hardware guide', price=11.00)
    shifter = box('TXS0104E', 'U', [(1, 'VCCA'), (2, 'A1'), (3, 'A2'), (4, 'A3'), (5, 'A4'), (8, 'OE'), (6, 'NC')],
                  [(14, 'VCCB'), (13, 'B1'), (12, 'B2'), (11, 'B3'), (10, 'B4'), (7, 'GND'), (9, 'NC')])
    b.add(shifter, 'TXS0104EPWR', {1: 'VDD_1V8', 2: 'MODEM_TXD', 3: 'MODEM_RXD', 4: 'MODEM_DTR', 5: NC, 8: 'VDD_1V8', 6: NC,
                                   14: '+3V3', 13: 'MODEM_TX_3V3', 12: 'MODEM_RX_3V3', 11: 'MODEM_DTR_3V3', 10: NC, 7: 'GND', 9: NC},
          footprint='Package_SO:TSSOP-14_4.4x5mm_P0.65mm', mpn='TXS0104EPWR',
          desc='4-bit level translator, 1.8 V to 3.3 V. Channel 4 is unused; its internal pull-ups hold it', price=0.45)
    sim = box('SIM_Nano', 'J', [('C1', 'VCC'), ('C2', 'RST'), ('C3', 'CLK'), ('C5', 'GND'), ('C6', 'VPP'), ('C7', 'IO')], [])
    b.add(sim, 'Nano SIM', {'C1': 'SIM_VDD', 'C2': 'SIM_RST', 'C3': 'SIM_CLK', 'C5': 'GND', 'C6': NC, 'C7': 'SIM_DATA'},
          desc='Nano SIM holder, push-push, 6 contacts', price=0.25)
    for line in ('SIM_VDD', 'SIM_DATA', 'SIM_CLK', 'SIM_RST'):
        b.D('DZ', 'ESD9L5.0ST5G', line, 'GND', footprint='Diode_SMD:D_SOD-923', mpn='onsemi ESD9L5.0ST5G',
            desc='ESD diode, 5 V, 0.5 pF typical, one per SIM line. The modem allows about 50 pF of protection per line', price=0.04)
    antenna = box('Antenna_UFL', 'J', [(1, 'SIG'), (2, 'GND')], [])
    b.add(antenna, 'U.FL', {1: 'ANT_LTE', 2: 'GND'}, footprint='Connector_Coaxial:U.FL_Hirose_U.FL-R-SMT-1_Vertical',
          mpn='Hirose U.FL-R-SMT-1', desc='LTE antenna connector', price=0.10)
    service = box('Modem_Service_1x5', 'J', [(1, 'VBUS'), (2, 'D-'), (3, 'D+'), (4, 'GND'), (5, 'BOOT')], [])
    b.add(service, 'Header 1x5', {1: 'MODEM_VBUS', 2: 'MODEM_USB_DM', 3: 'MODEM_USB_DP', 4: 'GND', 5: 'MODEM_USB_BOOT'},
          footprint='Connector_PinHeader_2.54mm:PinHeader_1x05_P2.54mm_Vertical',
          desc='Modem USB for firmware updates. Never link BOOT to VBUS: the modem pins take 1.8 V', price=0.05, dnp=True)
    b.R('10k', 'VDD_1V8', 'MODEM_BOOT_PU', desc='Forced-download pull-up, used only through the BOOT 1V8 jumper')
    b.add('JPO', 'BOOT 1V8', {1: 'MODEM_BOOT_PU', 2: 'MODEM_USB_BOOT'}, footprint='Jumper:SolderJumper-2_P1.3mm_Open_RoundedPad1.0x1.5mm',
          desc='Solder jumper, open. Close only to force a modem firmware download, then open it again', price=0.0)
    b.add('NPN', 'MMBT3904', {1: 'Q_STAT_B', 3: 'MODEM_STATUS_N', 2: 'GND'}, footprint=SOT23, mpn='MMBT3904',
          desc='NPN transistor: modem status to the processor, defined even when the modem is off', price=0.02)
    b.R('4.7k', 'MODEM_STATUS', 'Q_STAT_B')
    b.R('47k', 'Q_STAT_B', 'GND')
    b.R('10k', '+3V3', 'MODEM_STATUS_N')
    b.add('NPN', 'MMBT3904', {1: 'Q_PWRKEY_B', 3: 'MODEM_PWRKEY_N', 2: 'GND'}, footprint=SOT23, mpn='MMBT3904', desc='NPN transistor', price=0.02)
    b.R('4.7k', 'MODEM_PWRKEY', 'Q_PWRKEY_B')
    b.R('47k', 'Q_PWRKEY_B', 'GND')
    b.add('NPN', 'MMBT3904', {1: 'Q_NET_B', 3: 'LED_NET_K', 2: 'GND'}, footprint=SOT23, mpn='MMBT3904', desc='NPN transistor', price=0.02)
    b.R('4.7k', 'MODEM_NETLIGHT', 'Q_NET_B')
    b.R('47k', 'Q_NET_B', 'GND')
    b.R('1k', 'V_MODEM', 'LED_NET_A')
    b.LED('blue', 'LED_NET_A', 'LED_NET_K', desc='Indicator LED, 0603: network')
    b.C('100nF', 'VDD_1V8', 'GND')
    b.C('100nF', '+3V3', 'GND')
    b.R('22R', 'SIM_DATA_M', 'SIM_DATA')
    b.R('22R', 'SIM_CLK_M', 'SIM_CLK')
    b.R('22R', 'SIM_RST_M', 'SIM_RST')
    b.C('100nF', 'SIM_VDD', 'GND')
    b.C('33pF', 'SIM_VDD', 'GND', desc='Ceramic capacitor, C0G, as in the modem guide')
    b.C('22pF', 'SIM_DATA', 'GND', dnp=True, desc='Ceramic capacitor, C0G. Not fitted, as in the modem guide')
    b.C('22pF', 'SIM_CLK', 'GND', dnp=True, desc='Ceramic capacitor, C0G. Not fitted, as in the modem guide')
    b.C('22pF', 'SIM_RST', 'GND', dnp=True, desc='Ceramic capacitor, C0G. Not fitted, as in the modem guide')
    b.R('0R', 'RF_ANT', 'ANT_LTE', desc='Series element of the antenna matching network')
    b.C('match', 'RF_ANT', 'GND', dnp=True, desc='Matching network, value from antenna tuning')
    b.C('match', 'ANT_LTE', 'GND', dnp=True, desc='Matching network, value from antenna tuning')
    b.TP('MODEM_RESET_N', 'RESET')
    b.TP('VDD_1V8', 'VDD_1V8')
    b.TP('MODEM_LOG_TX', 'LOG_TX')

    # ---- 8 ------------------------------------------------------------------
    b.section('8  Processor', 'ESP32-S3-WROOM-1-N8. IO3, IO45 and IO46 set the start-up mode and stay unconnected. IO35 to IO37 are usable on the N8 (no PSRAM).')
    esp = box('ESP32-S3-WROOM-1', 'U',
              [(2, '3V3'), (3, 'EN'), (27, 'IO0'), (39, 'IO1'), (38, 'IO2'), (15, 'IO3'), (4, 'IO4'), (5, 'IO5'), (6, 'IO6'), (7, 'IO7'),
               (12, 'IO8'), (17, 'IO9'), (18, 'IO10'), (19, 'IO11'), (20, 'IO12'), (21, 'IO13'), (22, 'IO14'), (8, 'IO15'), (9, 'IO16'),
               (10, 'IO17'), (11, 'IO18')],
              [(13, 'IO19'), (14, 'IO20'), (23, 'IO21'), (28, 'IO35'), (29, 'IO36'), (30, 'IO37'), (31, 'IO38'), (32, 'IO39'), (33, 'IO40'),
               (34, 'IO41'), (35, 'IO42'), (26, 'IO45'), (16, 'IO46'), (24, 'IO47'), (25, 'IO48'), (36, 'RXD0'), (37, 'TXD0'), (1, 'GND'),
               (40, 'GND'), (41, 'GND')])
    assert sorted(int(pin.number) for pin in esp.pins) == list(range(1, 42)), 'the module must have pins 1 to 41'
    b.add(esp, 'ESP32-S3-WROOM-1-N8', {
        2: '+3V3', 3: 'EN', 27: 'BOOT', 39: 'DOOR1', 38: 'DOOR2', 15: NC, 4: 'IGN_SENSE', 5: 'VIN_SENSE', 6: 'BAT_SENSE', 7: 'ACC_INT',
        12: 'I2C_SDA', 17: 'I2C_SCL', 18: 'ONEWIRE', 19: 'MODEM_DTR_3V3', 20: 'RS485_TX', 21: 'RS485_RX', 22: 'RS485_RE', 8: '5V_SW_EN',
        9: 'GPS_PPS', 10: 'GPS_RX', 11: 'GPS_TX', 13: 'USB_DM', 14: 'USB_DP', 23: 'RS485_DE', 28: 'CABLE_FAULT_N', 29: 'MODEM_PG', 30: 'MODEM_DISCHARGE',
        31: 'MODEM_PWRKEY', 32: 'MODEM_STATUS_N', 33: 'MODEM_PWR_EN', 34: 'CHG_STAT', 35: 'STATUS_LED', 26: NC, 16: NC,
        24: 'MODEM_RX_3V3', 25: 'MODEM_TX_3V3', 36: 'UART0_RX', 37: 'UART0_TX', 1: 'GND', 40: 'GND', 41: 'GND'},
          footprint='RF_Module:ESP32-S3-WROOM-1', mpn='ESP32-S3-WROOM-1-N8', desc='Wi-Fi and Bluetooth module, 8 MB flash', price=3.20)
    b.C('10uF', '+3V3', 'GND', footprint=C0805, price=0.05)
    b.C('100nF', '+3V3', 'GND')
    b.R('10k', '+3V3', 'EN')
    b.C('1uF', 'EN', 'GND')
    b.add('SW', 'RESET', {1: 'EN', 2: 'GND'}, footprint='Button_Switch_SMD:SW_SPST_TL3342', desc='Push button', price=0.05)
    b.R('10k', '+3V3', 'BOOT')
    b.add('SW', 'BOOT', {1: 'BOOT', 2: 'GND'}, footprint='Button_Switch_SMD:SW_SPST_TL3342', desc='Push button', price=0.05)
    b.R('1k', 'STATUS_LED', 'LED_ST_A')
    b.LED('amber', 'LED_ST_A', 'GND', desc='Indicator LED, 0603: status')

    # ---- 9 ------------------------------------------------------------------
    b.section('9  USB-C and programming header', 'USB-C carries data only. Power the board from the vehicle connector or the battery.')
    usb = box('USB_C_Receptacle_USB2.0', 'J',
              [('A4', 'VBUS'), ('A9', 'VBUS'), ('B4', 'VBUS'), ('B9', 'VBUS'), ('A5', 'CC1'), ('B5', 'CC2'), ('A6', 'D+'), ('B6', 'D+'),
               ('A7', 'D-'), ('B7', 'D-')],
              [('A8', 'SBU1'), ('B8', 'SBU2'), ('A1', 'GND'), ('A12', 'GND'), ('B1', 'GND'), ('B12', 'GND'), ('S1', 'SHIELD')])
    b.add(usb, 'USB-C 16P', {'A4': 'USB_VBUS', 'A9': 'USB_VBUS', 'B4': 'USB_VBUS', 'B9': 'USB_VBUS', 'A5': 'USB_CC1', 'B5': 'USB_CC2',
                             'A6': 'USB_DP_CONN', 'B6': 'USB_DP_CONN', 'A7': 'USB_DM_CONN', 'B7': 'USB_DM_CONN', 'A8': NC, 'B8': NC,
                             'A1': 'GND', 'A12': 'GND', 'B1': 'GND', 'B12': 'GND', 'S1': 'GND'},
          footprint='Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12', mpn='HRO TYPE-C-31-M-12', desc='USB-C receptacle, USB 2.0', price=0.20)
    usb_esd = box('USBLC6-2SC6', 'U', [(1, 'IO1'), (3, 'IO2'), (2, 'GND')], [(6, 'IO1'), (4, 'IO2'), (5, 'VBUS')])
    b.add(usb_esd, 'USBLC6-2SC6', {1: 'USB_DM_CONN', 6: 'USB_DM', 3: 'USB_DP_CONN', 4: 'USB_DP', 2: 'GND', 5: 'USB_VBUS'},
          footprint='Package_TO_SOT_SMD:SOT-23-6', mpn='USBLC6-2SC6', desc='USB ESD protection', price=0.15)
    header = box('Debug_1x6', 'J', [], [(1, '3V3'), (2, 'GND'), (3, 'ESP_TXD0'), (4, 'ESP_RXD0'), (5, 'DTR'), (6, 'RTS')])
    b.add(header, 'Header 1x6', {1: '+3V3', 2: 'GND', 3: 'UART0_TX', 4: 'UART0_RX', 5: 'PROG_DTR', 6: 'PROG_RTS'},
          footprint='Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical',
          desc='Serial programming and log header, same pin order as Rev A J4, so Rev A programming leads fit', price=0.05)
    b.R('5.1k', 'USB_CC1', 'GND')
    b.R('5.1k', 'USB_CC2', 'GND')
    b.C('100nF', 'USB_VBUS', 'GND')
    b.add('NPN', 'SS8050', {1: 'Q_EN_B', 3: 'EN', 2: 'PROG_RTS'}, footprint=SOT23, mpn='SS8050', desc='NPN transistor, automatic programming', price=0.02)
    b.R('10k', 'PROG_DTR', 'Q_EN_B')
    b.add('NPN', 'SS8050', {1: 'Q_BOOT_B', 3: 'BOOT', 2: 'PROG_DTR'}, footprint=SOT23, mpn='SS8050', desc='NPN transistor, automatic programming', price=0.02)
    b.R('10k', 'PROG_RTS', 'Q_BOOT_B')

    # ---- 10 -----------------------------------------------------------------
    b.section('10  GNSS module', 'NEO-7M module on a header, powered from the switched 5 V rail. Use an external active antenna.')
    gnss = box('GNSS_Module_1x5', 'J', [], [(1, 'VCC'), (2, 'GND'), (3, 'TXD'), (4, 'RXD'), (5, 'PPS')])
    b.add(gnss, 'Header 1x5', {1: '5V_SW', 2: 'GND', 3: 'GPS_TX', 4: 'GPS_RX_MOD', 5: 'GPS_PPS'},
          footprint='Connector_PinHeader_2.54mm:PinHeader_1x05_P2.54mm_Vertical', desc='Socket for the GNSS module', price=0.05)
    b.R('470R', 'GPS_RX', 'GPS_RX_MOD', desc='Limits the current into the module while its supply is switched off')
    b.C('10uF', '5V_SW', 'GND', footprint=C0805, price=0.05)
    b.C('100nF', '5V_SW', 'GND')

    # ---- 11 -----------------------------------------------------------------
    b.section('11  RS-485 sensor bus', 'The tracker is the master at one end of the cable: bias and termination are fitted here.')
    b.add(SP3485, 'SP3485EN', {1: 'RS485_RX', 2: 'RS485_RE', 3: 'RS485_DE', 4: 'RS485_TX', 8: '+3V3', 6: 'RS485_A', 7: 'RS485_B', 5: 'GND'},
          footprint=SOIC8, mpn='SP3485EN-L/TR', desc='RS-485 transceiver, 3.3 V', price=0.30)
    b.add(RJ45, 'RJ45', rj45_nets('5V_SW'), footprint=RJ45_FP, desc='Sensor bus socket, shielded', price=0.35)
    b.C('100nF', '+3V3', 'GND')
    b.R('10k', '+3V3', 'RS485_RX')
    b.R('10k', 'RS485_DE', 'GND')
    b.R('10k', 'RS485_RE', 'GND')
    b.R('390R', '5V_SW', 'RS485_A', desc='Bus bias from the switched cable supply: about 357 mV idle with both terminators, and no drain while the cable is off')
    b.R('390R', 'RS485_B', 'GND', desc='Bus bias: about 357 mV idle with both terminators fitted')
    b.R('120R', 'RS485_A', 'RS485_TERM', footprint='Resistor_SMD:R_1206_3216Metric',
        desc='Bus termination, 1206, 0.25 W: survives a crossover cable that puts 5 V across it')
    b.add('JPC', 'TERM', {1: 'RS485_TERM', 2: 'RS485_B'}, footprint='Jumper:SolderJumper-2_P1.3mm_Bridged_RoundedPad1.0x1.5mm',
          desc='Solder jumper, closed: termination on', price=0.0)
    b.add('SM712', 'SM712', {1: 'RS485_A', 2: 'RS485_B', 3: 'GND'}, footprint=SOT23, mpn='SM712', desc='RS-485 line protection', price=0.15)
    b.D('DZ', 'SMAJ5.0A', '5V_SW', 'GND', footprint=SMA, mpn='SMAJ5.0A', desc='TVS on the cable supply', price=0.08)
    b.C('1uF', '5V_SW', 'GND')

    # ---- 12 -----------------------------------------------------------------
    b.section('12  Door inputs', 'Reed switch to ground, closed when the door is shut. Both inputs survive 32 V without lifting the 3.3 V rail.')
    doors = box('Doors_1x4', 'J', [], [(1, 'DOOR1'), (2, 'GND'), (3, 'DOOR2'), (4, 'GND')])
    b.add(doors, 'Micro-Fit 1x4', {1: 'DOOR1_IN', 2: 'GND', 3: 'DOOR2_IN', 4: 'GND'},
          footprint='Connector_Molex:Molex_Micro-Fit_3.0_43650-0400_1x04_P3.00mm_Vertical', mpn='Molex 43650-0400',
          desc='Door switch connector, locking, single row: the 2x2 vehicle plug cannot go in it', price=0.90)
    for door in ('DOOR1', 'DOOR2'):
        b.D('DS', 'BAT46W', door + '_PU', '+3V3', footprint='Diode_SMD:D_SOD-123', mpn='BAT46W',
            desc='Schottky 100 V: stops a door wire at vehicle voltage pushing current back into +3V3', price=0.03)
        b.R('10k', door + '_PU', door + '_IN')
        b.R('220k', door + '_IN', door, desc='Limits the clamp current to 0.13 mA at 32 V')
        b.C('100nF', door, 'GND')
        b.add('BAT54S', 'BAV99', {3: door, 2: '+3V3', 1: 'GND'}, footprint=SOT23, mpn='BAV99',
              desc='Dual diode clamp, low leakage, so the 220 k does not pull an open door low', price=0.02)

    # ---- 13 -----------------------------------------------------------------
    b.section('13  Probe input and on-board sensors', 'One-wire probe, motion sensor (wakes the processor), board temperature and humidity.')
    probe = box('Probe_1x3', 'J', [], [(1, '3V3'), (2, 'DQ'), (3, 'GND')])
    b.add(probe, 'JST-XH 3', {1: 'PROBE_3V3', 2: 'ONEWIRE_IN', 3: 'GND'}, footprint='Connector_JST:JST_XH_B3B-XH-A_1x03_P2.50mm_Vertical',
          mpn='JST B3B-XH-A', desc='DS18B20 probe connector', price=0.08)
    b.R('100R', '+3V3', 'PROBE_3V3', footprint='Resistor_SMD:R_0805_2012Metric',
        desc='Resistor, 0805: a shorted probe lead draws 33 mA instead of stopping the board')
    b.C('100nF', 'PROBE_3V3', 'GND')
    motion = box('LIS3DH', 'U', [(14, 'VDD'), (1, 'VDD_IO'), (4, 'SCL'), (6, 'SDA'), (7, 'SA0'), (8, 'CS'), (10, 'RES')],
                 [(11, 'INT1'), (9, 'INT2'), (13, 'ADC3'), (15, 'ADC2'), (16, 'ADC1'), (2, 'NC'), (3, 'NC'), (5, 'GND'), (12, 'GND')])
    b.add(motion, 'LIS3DHTR', {14: '+3V3', 1: '+3V3', 4: 'I2C_SCL', 6: 'I2C_SDA', 7: 'GND', 8: '+3V3', 10: 'GND',
                               11: 'ACC_INT', 9: NC, 13: 'GND', 15: 'GND', 16: 'GND', 2: NC, 3: NC, 5: 'GND', 12: 'GND'},
          footprint='Package_LGA:LGA-16_3x3mm_P0.5mm_LayoutBorder3x5y', mpn='LIS3DHTR', desc='3-axis accelerometer, I2C address 0x18', price=0.80)
    b.add(SHT4X, 'SHT40-AD1B', {3: '+3V3', 2: 'I2C_SCL', 1: 'I2C_SDA', 4: 'GND'},
          footprint='Sensor_Humidity:Sensirion_DFN-4_1.5x1.5mm_P0.8mm_SHT4x_NoCentralPad', mpn='SHT40-AD1B',
          desc='Board temperature and humidity, I2C address 0x44', price=1.50)
    b.R('4.7k', '+3V3', 'ONEWIRE_IN')
    b.R('100R', 'ONEWIRE_IN', 'ONEWIRE')
    b.add('BAT54S', 'BAT54S', {3: 'ONEWIRE', 2: '+3V3', 1: 'GND'}, footprint=SOT23, mpn='BAT54S', desc='Dual Schottky clamp', price=0.03)
    b.R('4.7k', '+3V3', 'I2C_SDA')
    b.R('4.7k', '+3V3', 'I2C_SCL')
    b.C('100nF', '+3V3', 'GND')
    b.C('10uF', '+3V3', 'GND', footprint=C0805, price=0.05)
    b.C('100nF', '+3V3', 'GND')

    b.extras = [
        ('GNSS module NEO-7M with antenna connector', 1, 'Plugs onto the GNSS header', 'u-blox NEO-7M module', 4.00),
        ('Active GNSS antenna, 3 m cable', 1, 'Outside the metal cab', '', 2.00),
        ('LTE antenna with U.FL pigtail', 1, 'Adhesive or screw mount', '', 1.50),
        ('18650 cell with protection and 10 k NTC, JST-PH 3', 1, 'Backup battery, about 2600 mAh', '', 4.00),
        ('Printed circuit board, 4 layers', 1, 'About 100 x 70 mm', '', 4.00),
        ('Sealed enclosure with cable glands', 1, 'IP65 or better', '', 5.00),
        ('Vehicle harness with 2 A blade fuse', 1, 'Supply, ground and ignition', '', 3.00),
    ]
    return b


# --------------------------------------------------------------------------
# Board 2: the temperature and humidity module (sensor node), Rev B
# --------------------------------------------------------------------------
def module():
    b = Board('maatora-temperature-module', 'Maatora Temperature Module (RS-485 sensor node)', 'B', DATE, 'lumidren',
              'Design for review. Not released for fabrication.')

    b.section('1  Bus connectors and supply', 'Two sockets wired straight through: cable in, cable out. 5 V arrives on the cable.')
    b.add(RJ45, 'RJ45 IN', rj45_nets('BUS_5V'), footprint=RJ45_FP, desc='Sensor bus socket', price=0.35)
    b.add(RJ45, 'RJ45 OUT', rj45_nets('BUS_5V'), footprint=RJ45_FP, desc='Sensor bus socket', price=0.35)
    regulator = box('MCP1702-3302E', 'U', [(3, 'VIN')], [(2, 'VOUT'), (1, 'GND')])
    b.add(regulator, 'MCP1702-3302E/CB', {3: 'VIN_P', 2: '+3V3', 1: 'GND'}, footprint=SOT23, mpn='MCP1702T-3302E/CB',
          desc='3.3 V regulator, 250 mA, 13.2 V maximum input', price=0.45)
    b.add('F', 'PPTC 0.2A', {1: 'BUS_5V', 2: 'VIN_F'}, footprint='Fuse:Fuse_1206_3216Metric', desc='Resettable fuse, 0.2 A hold', price=0.08)
    b.D('DS', 'SS14', 'VIN_P', 'VIN_F', footprint=SMA, mpn='SS14', desc='Schottky 40 V 1 A, reverse-polarity protection', price=0.03)
    b.D('DZ', 'SMAJ5.0A', 'VIN_P', 'GND', footprint=SMA, mpn='SMAJ5.0A', desc='TVS on the cable supply', price=0.08)
    b.C('10uF', 'VIN_P', 'GND', footprint=C0805, price=0.05)
    b.C('100nF', 'VIN_P', 'GND')
    b.C('1uF', '+3V3', 'GND')
    b.C('100nF', '+3V3', 'GND')
    b.R('100k', 'VIN_P', 'VBUS_SENSE')
    b.R('33k', 'VBUS_SENSE', 'GND')
    b.C('100nF', 'VBUS_SENSE', 'GND')
    b.TP('+3V3', '+3V3')
    b.TP('GND', 'GND')

    b.section('2  RS-485 transceiver', 'One pin sets the direction. The END TERM jumper is fitted on the last module only.')
    b.add(SP3485, 'SP3485EN', {1: 'MCU_RXD', 2: 'RS485_DIR', 3: 'RS485_DIR', 4: 'MCU_TXD', 8: '+3V3', 6: 'RS485_A', 7: 'RS485_B', 5: 'GND'},
          footprint=SOIC8, mpn='SP3485EN-L/TR', desc='RS-485 transceiver, 3.3 V', price=0.30)
    b.C('100nF', '+3V3', 'GND')
    b.R('10k', 'RS485_DIR', 'GND')
    b.R('10k', '+3V3', 'MCU_RXD')
    b.add('SM712', 'SM712', {1: 'RS485_A', 2: 'RS485_B', 3: 'GND'}, footprint=SOT23, mpn='SM712', desc='RS-485 line protection', price=0.15)
    b.R('120R', 'RS485_A', 'RS485_TERM', footprint='Resistor_SMD:R_1206_3216Metric',
        desc='Bus termination, 1206, 0.25 W: survives a crossover cable that puts 5 V across it')
    b.add('JPO', 'END TERM', {1: 'RS485_TERM', 2: 'RS485_B'}, footprint='Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical',
          desc='Jumper: fit on the last module of the cable', price=0.03)

    b.section('3  Microcontroller', 'ATmega328P at 3.3 V and 8 MHz. A crystal is kept: the internal oscillator drifts too far in a freezer.')
    mcu = box('ATmega328P-AU', 'U',
              [(4, 'VCC'), (6, 'VCC'), (18, 'AVCC'), (20, 'AREF'), (29, 'PC6/RESET'), (7, 'PB6/XTAL1'), (8, 'PB7/XTAL2'), (30, 'PD0/RXD'),
               (31, 'PD1/TXD'), (32, 'PD2'), (1, 'PD3'), (2, 'PD4'), (9, 'PD5'), (10, 'PD6'), (11, 'PD7'), (19, 'ADC6')],
              [(12, 'PB0'), (13, 'PB1'), (14, 'PB2'), (15, 'PB3/MOSI'), (16, 'PB4/MISO'), (17, 'PB5/SCK'), (23, 'PC0'), (24, 'PC1'),
               (25, 'PC2'), (26, 'PC3'), (27, 'PC4/SDA'), (28, 'PC5/SCL'), (22, 'ADC7'), (3, 'GND'), (5, 'GND'), (21, 'GND')])
    assert sorted(int(pin.number) for pin in mcu.pins) == list(range(1, 33)), 'the TQFP-32 must have pins 1 to 32'
    b.add(mcu, 'ATmega328P-AU', {4: '+3V3', 6: '+3V3', 18: '+3V3', 20: 'AREF', 29: 'RESET_N', 7: 'XTAL1', 8: 'XTAL2', 30: 'MCU_RXD',
                                31: 'MCU_TXD', 32: 'RS485_DIR', 1: 'ONEWIRE', 2: 'ADDR0', 9: 'ADDR1', 10: 'ADDR2', 11: 'ADDR3', 19: NC,
                                12: 'LED_STATUS', 13: NC, 14: NC, 15: 'ISP_MOSI', 16: 'ISP_MISO', 17: 'ISP_SCK', 23: NC, 24: NC, 25: NC,
                                26: NC, 27: 'I2C_SDA', 28: 'I2C_SCL', 22: 'VBUS_SENSE', 3: 'GND', 5: 'GND', 21: 'GND'},
          footprint='Package_QFP:TQFP-32_7x7mm_P0.8mm', mpn='ATMEGA328P-AU', desc='8-bit microcontroller, TQFP-32', price=2.20)
    isp = box('AVR_ISP_2x3', 'J', [(1, 'MISO'), (3, 'SCK'), (5, 'RESET')], [(2, 'VCC'), (4, 'MOSI'), (6, 'GND')])
    b.add(isp, 'Header 2x3', {1: 'ISP_MISO', 3: 'ISP_SCK', 5: 'RESET_N', 2: '+3V3', 4: 'ISP_MOSI', 6: 'GND'},
          footprint='Connector_PinHeader_2.54mm:PinHeader_2x03_P2.54mm_Vertical', desc='Programming header', price=0.05)
    address = box('DIP_Switch_x4', 'SW', [(1, '1'), (2, '2'), (3, '4'), (4, '8')], [(8, 'COM'), (7, 'COM'), (6, 'COM'), (5, 'COM')])
    b.add(address, 'ADDRESS', {1: 'ADDR0', 2: 'ADDR1', 3: 'ADDR2', 4: 'ADDR3', 8: 'GND', 7: 'GND', 6: 'GND', 5: 'GND'},
          desc='4-way DIP switch: bus address 1 to 15', price=0.30)
    b.add('Y', '8MHz', {1: 'XTAL1', 2: 'XTAL2'}, footprint='Crystal:Crystal_SMD_HC49-SD',
          desc='Crystal, low profile, 18 pF load, rated -40 to +85 C', price=0.15)
    b.C('22pF', 'XTAL1', 'GND', desc='Ceramic capacitor, C0G')
    b.C('22pF', 'XTAL2', 'GND', desc='Ceramic capacitor, C0G')
    b.R('10k', '+3V3', 'RESET_N')
    b.C('10nF', 'RESET_N', 'GND')
    b.C('100nF', '+3V3', 'GND')
    b.C('100nF', '+3V3', 'GND')
    b.C('100nF', '+3V3', 'GND')
    b.C('100nF', 'AREF', 'GND')
    b.R('1k', 'LED_STATUS', 'LED_A')
    b.LED('green', 'LED_A', 'GND', desc='Indicator LED, 0603: blinks on every answer')

    b.section('4  Sensors', 'SHT4x at the board edge behind a routed slot. Optional probe on a lead for the middle of the load.')
    b.add(SHT4X, 'SHT45-AD1B', {3: '+3V3', 2: 'I2C_SCL', 1: 'I2C_SDA', 4: 'GND'},
          footprint='Sensor_Humidity:Sensirion_DFN-4_1.5x1.5mm_P0.8mm_SHT4x_NoCentralPad', mpn='SHT45-AD1B',
          desc='Temperature and humidity, 0.1 C typical, I2C address 0x44', price=4.50)
    probe = box('Probe_1x3', 'J', [], [(1, '3V3'), (2, 'DQ'), (3, 'GND')])
    b.add(probe, 'JST-XH 3', {1: '+3V3', 2: 'ONEWIRE_IN', 3: 'GND'}, footprint='Connector_JST:JST_XH_B3B-XH-A_1x03_P2.50mm_Vertical',
          mpn='JST B3B-XH-A', desc='DS18B20 probe connector', price=0.08)
    b.C('100nF', '+3V3', 'GND')
    b.R('4.7k', '+3V3', 'I2C_SDA')
    b.R('4.7k', '+3V3', 'I2C_SCL')
    b.R('4.7k', '+3V3', 'ONEWIRE_IN')
    b.R('100R', 'ONEWIRE_IN', 'ONEWIRE')
    b.add('BAT54S', 'BAT54S', {3: 'ONEWIRE', 2: '+3V3', 1: 'GND'}, footprint=SOT23, mpn='BAT54S', desc='Dual Schottky clamp', price=0.03)

    b.page_width = 430.0
    b.extras = [
        ('Printed circuit board, 2 layers', 1, 'About 60 x 45 mm', '', 0.80),
        ('Vented enclosure', 1, 'Lets air reach the sensor, keeps spray out', '', 1.50),
        ('Cat5e patch cable, shielded', 1, 'To the tracker or the previous module', '', 1.00),
    ]
    return b


# --------------------------------------------------------------------------
# What each processor pin is for. The pin numbers come from the board
# description above, so these tables cannot drift away from the schematic.
# --------------------------------------------------------------------------
TRACKER_PINS = {
    'EN': 'Reset. Pull-up, 1 uF, RESET button and the automatic programming circuit',
    'BOOT': 'Boot select. Pull-up, BOOT button and the automatic programming circuit',
    'DOOR1': 'Door 1 switch. Low when the door is shut. Can wake the processor',
    'DOOR2': 'Door 2 switch. Low when the door is shut. Can wake the processor',
    'IGN_SENSE': 'Ignition line through 2 x 499 k / 47 k. Line voltage = pin voltage x 22.23',
    'VIN_SENSE': 'Vehicle supply through 1 M / 47 k. Supply voltage = pin voltage x 22.28',
    'BAT_SENSE': 'Backup cell through 220 k / 220 k. Cell voltage = pin voltage x 2',
    'ACC_INT': 'Motion sensor interrupt. Can wake the processor',
    'I2C_SDA': 'I2C data: motion sensor at 0x18, board climate sensor at 0x44',
    'I2C_SCL': 'I2C clock',
    'ONEWIRE': 'One-wire probe input (DS18B20)',
    'MODEM_DTR_3V3': 'Modem sleep control. Low keeps the modem awake, high lets it sleep',
    'RS485_TX': 'Sensor bus: to the transceiver (DI)',
    'RS485_RX': 'Sensor bus: from the transceiver (RO)',
    'RS485_RE': 'Sensor bus: receiver enable, low = listening',
    'RS485_DE': 'Sensor bus: driver enable, high = transmitting',
    '5V_SW_EN': 'High starts the 5 V step-up converter and switches on 5V_SW: the GNSS module and the sensor cable',
    'CABLE_FAULT_N': 'Low when the 5 V switch has turned off on a short or overload. Toggle 5V_SW_EN to try again',
    'GPS_PPS': 'GNSS time pulse',
    'GPS_RX': 'Serial to the GNSS module (processor transmits)',
    'GPS_TX': 'Serial from the GNSS module (processor receives)',
    'USB_DM': 'Native USB D-: programming and logs',
    'USB_DP': 'Native USB D+',
    'MODEM_PWRKEY': 'High presses the modem power key',
    'MODEM_STATUS_N': 'Low when the modem has started. High when it is off, unpowered or starting',
    'MODEM_PWR_EN': 'High turns on the 3.8 V modem supply. Floats (supply off) during a processor reset unless held',
    'MODEM_PG': 'Modem supply power good. Low while the converter is off or at its current limit',
    'MODEM_DISCHARGE': 'High discharges the modem supply through 470 ohm. Use only while MODEM_PWR_EN is low',
    'CHG_STAT': 'Charger status. Low during the first charge after vehicle power returns, or while charging waits for the cell temperature. Toggling at about 2 Hz: charger timer fault. High: done, topping up, or no vehicle power',
    'STATUS_LED': 'Status light, high = on',
    'MODEM_RX_3V3': 'Serial to the modem (processor transmits)',
    'MODEM_TX_3V3': 'Serial from the modem (processor receives). Floats while the modem is off: enable the internal pull-up',
    'UART0_RX': 'Serial header: receive',
    'UART0_TX': 'Serial header: transmit, start-up log',
    '+3V3': 'Supply',
    'GND': 'Ground',
}

MODULE_PINS = {
    '+3V3': 'Supply',
    'GND': 'Ground',
    'AREF': 'Analog reference, 100 nF to ground',
    'RESET_N': 'Reset. Pull-up, 10 nF, programming header',
    'XTAL1': '8 MHz crystal',
    'XTAL2': '8 MHz crystal',
    'MCU_RXD': 'Serial from the transceiver (RO)',
    'MCU_TXD': 'Serial to the transceiver (DI)',
    'RS485_DIR': 'High = transmit, low = listen. Pulled low',
    'ONEWIRE': 'Optional DS18B20 probe',
    'ADDR0': 'Address switch 1 (value 1). Internal pull-up, low = on',
    'ADDR1': 'Address switch 2 (value 2)',
    'ADDR2': 'Address switch 3 (value 4)',
    'ADDR3': 'Address switch 4 (value 8)',
    'LED_STATUS': 'Status light, high = on',
    'ISP_MOSI': 'Programming header',
    'ISP_MISO': 'Programming header',
    'ISP_SCK': 'Programming header',
    'I2C_SDA': 'I2C data to the SHT4x at 0x44',
    'I2C_SCL': 'I2C clock',
    'VBUS_SENSE': 'Cable supply through 100 k / 33 k. Cable voltage = pin voltage x 4.03',
}


def write_pin_map(board, value, notes, path, heading):
    part = [item for item in board.parts if item.value == value][0]
    lines = ['# %s' % heading, '',
             'Generated by `hardware/tools/build.py` from the same description as the schematic. Do not edit by hand.', '',
             '| Pin name | Pin number | Net | What it does |', '| --- | --- | --- | --- |']
    free = []
    for pin in part.symbol.pins:
        net = part.nets[pin.number]
        if net == NC:
            free.append('%s (pin %s)' % (pin.name, pin.number))
            continue
        lines.append('| %s | %s | `%s` | %s |' % (pin.name, pin.number, net, notes[net]))
    lines += ['', 'Not connected: ' + ', '.join(free) + '.', '']
    write(path, '\n'.join(lines))


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------
PROJECT = '{\n  "meta": {\n    "filename": "%s.kicad_pro",\n    "version": 1\n  }\n}\n'
LIB_TABLE = '(sym_lib_table\n  (lib (name "maatora")(type "KiCad")(uri "${KIPRJMOD}/maatora.kicad_sym")(options "")(descr "Symbols generated by hardware/tools/build.py"))\n)\n'


def write(path, text):
    with io.open(path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(text)


def sheet_html(board):
    width, height = board.page
    return ('<!doctype html><html><head><meta charset="utf-8"><title>%s</title><style>@page { size: %smm %smm; margin: 0 } '
            'html, body { margin: 0 } svg { display: block }</style></head><body>%s</body></html>') % (
        kit.esc(board.title), kit.num(width), kit.num(height), kit.svg_sheet(board))


def sections_html(board):
    pages = []
    for section in board.sections:
        pages.append('<section><header><b>%s</b> &nbsp; %s &nbsp; Rev %s &nbsp; %s</header><div>%s</div></section>' % (
            kit.esc(board.title), kit.esc(section['name']), kit.esc(board.revision), kit.esc(board.date), kit.svg_section(board, section)))
    return ('<!doctype html><html><head><meta charset="utf-8"><title>%s</title><style>'
            '@page { size: 420mm 297mm; margin: 0 } html, body { margin: 0; font-family: Consolas, monospace } '
            'section { width: 420mm; height: 297mm; page-break-after: always; box-sizing: border-box; padding: 8mm } '
            'header { height: 8mm; font-size: 11pt; color: #1a4d99; border-bottom: 0.3mm solid #1a4d99 } '
            'div { height: 270mm; margin-top: 3mm } svg { width: 100%%; height: 100%% }'
            '</style></head><body>%s</body></html>') % (kit.esc(board.title), ''.join(pages))


def print_pdf(html_path, pdf_path, profile):
    if not os.path.exists(CHROME):
        return False
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--user-data-dir=' + profile,
                    '--print-to-pdf=' + pdf_path, 'file:///' + html_path.replace('\\', '/')],
                   check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)
    return os.path.exists(pdf_path)


def build(board, folder, name, work, want_pdf):
    os.makedirs(folder, exist_ok=True)
    problems = board.check()
    kit.layout(board, getattr(board, 'page_width', 760.0))
    problems += kit.read_back(board)
    schematic = kit.kicad_schematic(board)
    library = kit.kicad_library(board)
    if not kit.balanced(schematic) or not kit.balanced(library):
        problems.append('unbalanced brackets in the KiCad output')
    write(os.path.join(folder, name + '.kicad_sch'), schematic)
    write(os.path.join(folder, 'maatora.kicad_sym'), library)
    write(os.path.join(folder, name + '.kicad_pro'), PROJECT % name)
    write(os.path.join(folder, 'sym-lib-table'), LIB_TABLE)
    total, lines = kit.write_bom(board, os.path.join(folder, name + '-parts.csv'), )
    kit.write_netlist(board, os.path.join(folder, name + '-netlist.csv'))
    extras = sum(price * quantity for _name, quantity, _desc, _mpn, price in board.extras)
    with io.open(os.path.join(folder, name + '-parts.csv'), 'a', encoding='utf-8', newline='') as handle:
        import csv
        writer = csv.writer(handle, lineterminator=chr(10))
        writer.writerow([])
        writer.writerow(['Not on the schematic', 'Quantity', 'Item', 'Note', 'Part number', '', '', 'Unit price USD (estimate)', 'Line total USD'])
        for item, quantity, desc, mpn, price in board.extras:
            writer.writerow(['', quantity, item, desc, mpn, '', '', '%.2f' % price, '%.2f' % (price * quantity)])
        writer.writerow([])
        writer.writerow(['Whole unit (estimate, small quantities)', '', '', '', '', '', '', '', '%.2f' % (total + extras)])
    sheet = os.path.join(work, name + '-sheet.html')
    sections = os.path.join(work, name + '-sections.html')
    write(sheet, sheet_html(board))
    write(sections, sections_html(board))
    made = []
    if want_pdf:
        profile = os.path.join(work, 'chrome-profile')
        for source, target in ((sheet, name + '-schematic.pdf'), (sections, name + '-sections.pdf')):
            if print_pdf(source, os.path.join(folder, target), profile):
                made.append(target)
    nets = board.nets()
    pins = sum(len(part.symbol.pins) for part in board.parts)
    print('%s' % board.title)
    print('  parts %d   pins %d   nets %d   sections %d   sheet %s x %s mm' % (
        len(board.parts), pins, len(nets), len(board.sections), kit.num(board.page[0]), kit.num(board.page[1])))
    print('  parts on the schematic: %.2f USD   whole unit: %.2f USD (estimates)' % (total, total + extras))
    print('  PDFs: %s' % (', '.join(made) if made else 'not printed'))
    print('  checks: %s' % ('all passed' if not problems else '%d problem(s)' % len(problems)))
    for problem in problems:
        print('    - ' + problem)
    return problems


def main():
    want_pdf = '--pdf' in sys.argv
    work = os.environ.get('MAATORA_BUILD_DIR') or os.path.join(tempfile.gettempdir(), 'maatora-hardware-build')
    os.makedirs(work, exist_ok=True)
    first, second = tracker(), module()
    problems = build(first, os.path.join(HARDWARE, 'tracker'), 'maatora-tracker', work, want_pdf)
    problems += build(second, os.path.join(HARDWARE, 'temperature-module'), 'maatora-temperature-module', work, want_pdf)
    write_pin_map(first, 'ESP32-S3-WROOM-1-N8', TRACKER_PINS, os.path.join(HARDWARE, 'tracker', 'pin-map.md'),
                  'Tracker: processor pin map (ESP32-S3-WROOM-1)')
    write_pin_map(second, 'ATmega328P-AU', MODULE_PINS, os.path.join(HARDWARE, 'temperature-module', 'pin-map.md'),
                  'Temperature module: microcontroller pin map (ATmega328P-AU)')
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
