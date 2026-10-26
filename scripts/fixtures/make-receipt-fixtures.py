#!/usr/bin/env python3
"""Synthetic receipt corpus for the on-device reader (Ola 8).

Usage: python3 scripts/fixtures/make-receipt-fixtures.py

Writes PNGs + expected.json to src/lib/localReader/__fixtures__/receipts/.
Thermal-receipt look (monospace, narrow), with mild blur, rotation and
contrast noise. Electronic receipts carry a real PDF417 TED generated with
bwip-js (node). Real, anonymised receipts go in the same folder as real-*.jpg
with their own entries in expected.json; the corpus test measures both.
"""
import json
import pathlib
import random
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'src/lib/localReader/__fixtures__/receipts'
FONT = '/System/Library/Fonts/Menlo.ttc'
random.seed(7)


def ted_xml(re_, rs, td, folio, fe, mnt, it1):
    return (f'<TED version="1.0"><DD><RE>{re_}</RE><TD>{td}</TD><F>{folio}</F><FE>{fe}</FE><RR>66666666-6</RR>'
            f'<RSR>CLIENTE</RSR><MNT>{mnt}</MNT><IT1>{it1}</IT1><CAF version="1.0"><DA><RE>{re_}</RE><RS>{rs}</RS>'
            f'<TD>{td}</TD><RNG><D>1</D><H>9999999</H></RNG><FA>2026-01-02</FA><RSAPK><M>0a4O6Kbx8Qj3K4iWSP4w7KP5</M>'
            f'<E>Aw==</E></RSAPK><IDK>100</IDK></DA><FRMA algoritmo="SHA1withRSA">g1Ss5d8a8SPfY2C8b9</FRMA></CAF>'
            f'<TSTED>{fe}T10:31:00</TSTED></DD><FRMT algoritmo="SHA1withRSA">Zm9vYmFyYmF6</FRMT></TED>')


DIAN_CUFE = 'a7c3f0e1b2d4c6e8f0a1b3c5d7e9f1a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8'


def dian_qr_text(num, fec, hor, nit, adq, val, iva, total):
    return (f'NumFac: {num}\nFecFac: {fec}\nHorFac: {hor}-05:00\nNitFac: {nit}\nDocAdq: {adq}\n'
            f'ValFac: {val:.2f}\nValIva: {iva:.2f}\nValOtroIm: 0.00\nValTolFac: {total:.2f}\nCUFE: {DIAN_CUFE}\n'
            f'QRCode: https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey={DIAN_CUFE}')


def qr_png(text):
    tmp = pathlib.Path(tempfile.mkstemp(suffix='.png')[1])
    code = (
        "const b=require('bwip-js');const fs=require('fs');"
        "b.toBuffer({bcid:'qrcode',text:process.argv[1],scale:3,eclevel:'M',paddingwidth:16,paddingheight:16,backgroundcolor:'FFFFFF'})"
        ".then(p=>fs.writeFileSync(process.argv[2],p));"
    )
    subprocess.run(['node', '-e', code, text, str(tmp)], check=True, cwd=ROOT)
    return Image.open(tmp).convert('L')


def pdf417_png(text):
    tmp = pathlib.Path(tempfile.mkstemp(suffix='.png')[1])
    code = (
        "const b=require('bwip-js');const fs=require('fs');"
        "b.toBuffer({bcid:'pdf417',text:process.argv[1],scale:2,columns:10,eclevel:5,paddingwidth:12,paddingheight:12,backgroundcolor:'FFFFFF'})"
        ".then(p=>fs.writeFileSync(process.argv[2],p));"
    )
    subprocess.run(['node', '-e', code, text, str(tmp)], check=True, cwd=ROOT)
    return Image.open(tmp).convert('L')


def render(lines, barcode=None, width=460, size=20, blur=0.5, angle=0.0, contrast=1.0):
    font = ImageFont.truetype(FONT, size)
    lh = int(size * 1.45)
    bh = barcode.height + 20 if barcode else 0
    img = Image.new('L', (width, 40 + lh * len(lines) + bh + 20), 248)
    d = ImageDraw.Draw(img)
    for i, t in enumerate(lines):
        d.text((22, 24 + lh * i), t, font=font, fill=int(30 + 20 * (1 - contrast)))
    if barcode:
        bw = min(width - 30, barcode.width)
        b = barcode.resize((bw, int(barcode.height * bw / barcode.width)))
        img.paste(b, ((width - bw) // 2, 30 + lh * len(lines)))
    if angle:
        img = img.rotate(angle, expand=True, fillcolor=248)
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    return img


CASES = [
    # --- electronic receipts with TED (barcode path, expected exact)
    dict(file='ted-boleta-combustible.png', country='CL', kind='ted',
         ted=('99520000-7', 'COMBUSTIBLES DEL NORTE SPA', '39', '4815162', '2026-10-20', 68400, 'GASOLINA 95'),
         lines=['COMBUSTIBLES DEL NORTE SPA', 'RUT 99.520.000-7', 'BOLETA ELECTRONICA', 'N 4815162', 'GASOLINA 95   40,5 L', 'TOTAL  $ 68.400', '', 'Timbre Electronico SII'],
         expect=dict(amount=68400, date='2026-10-20', taxId='99520000-7', invoiceNumber='4815162', merchant='COMBUSTIBLES DEL NORTE SPA')),
    dict(file='ted-factura-ferreteria.png', country='CL', kind='ted', angle=2.0,
         ted=('96792430-K', 'FERRETERIA INDUSTRIAL NORTE LTDA', '33', '20931', '2026-10-15', 312800, 'DISCO CORTE 7 PULG'),
         lines=['FERRETERIA INDUSTRIAL NORTE LTDA', 'R.U.T. 96.792.430-K', 'FACTURA ELECTRONICA N 20931', 'NETO 262.857', 'IVA 49.943', 'TOTAL 312.800', '', 'Timbre Electronico SII'],
         expect=dict(amount=312800, date='2026-10-15', taxId='96792430-K', invoiceNumber='20931')),
    dict(file='ted-boleta-restaurant.png', country='CL', kind='ted', blur=0.9,
         ted=('76354771-K', 'RESTAURANTE EL MINERO SPA', '39', '777123', '2026-10-21', 31130, 'MENU EJECUTIVO'),
         lines=['RESTAURANTE EL MINERO SPA', 'RUT 76.354.771-K', 'BOLETA ELECTRONICA N 777123', 'TOTAL A PAGAR 31.130', '', 'Timbre Electronico SII'],
         expect=dict(amount=31130, date='2026-10-21', taxId='76354771-K', invoiceNumber='777123')),
    # --- paper receipts without barcode (OCR path)
    dict(file='papel-estacionamiento.png', country='CL', kind='paper', angle=1.2,
         lines=['ESTACIONAMIENTOS CENTRAL LTDA', 'RUT: 76.354.771-K', "AV. LIBERTADOR B. O'HIGGINS 1234", 'SANTIAGO', '', 'BOLETA N 0012345', 'FECHA: 21/10/2026  HORA: 14:32', '', 'TIEMPO ESTACIONADO   2 HRS', 'TARIFA                3.500', '', 'TOTAL                $ 3.500', '', 'PAGO: TARJETA DEBITO'],
         expect=dict(amount=3500, date='2026-10-21', taxId='76354771-K', invoiceNumber='12345')),
    dict(file='papel-peaje.png', country='CL', kind='paper', blur=0.8,
         lines=['AUTOPISTA DEL ITATA S.A.', 'RUT 96.977.920-K', 'PLAZA DE PEAJE CONCEPCION', 'FECHA 19-10-2026 07:58', 'CATEGORIA 1', 'TOTAL $ 7.400', 'EFECTIVO'],
         expect=dict(amount=7400, date='2026-10-19', taxId='96977920-K')),
    dict(file='papel-combustible.png', country='CL', kind='paper', angle=-1.5,
         lines=['ESTACION DE SERVICIO', 'COPEC S.A.', 'R.U.T. 99.520.000-7', 'GIRO: VENTA DE COMBUSTIBLES', 'BOLETA N 4815170', '22-OCT-2026 08:15', 'GASOLINA 95  40,5 L', 'NETO        $ 57.479', 'IVA 19%     $ 10.921', 'TOTAL       $ 68.400', 'VISA ****1234  CREDITO'],
         expect=dict(amount=68400, date='2026-10-22', taxId='99520000-7')),
    dict(file='papel-restaurant-propina.png', country='CL', kind='paper', contrast=0.8, blur=0.7,
         lines=['RESTAURANTE EL MINERO SPA', 'RUT 76354771-K', 'MESA 4  FECHA 20/10/26', '2 MENU EJECUTIVO   25.800', '1 BEBIDA            2.500', 'SUBTOTAL           28.300', 'PROPINA 10%         2.830', 'TOTAL A PAGAR      31.130', 'EFECTIVO'],
         expect=dict(amount=31130, date='2026-10-20', taxId='76354771-K')),
    # --- Colombia: electronic invoice with the DIAN QR (barcode path)
    dict(file='co-factura-dian-qr.png', country='CO', kind='dian',
         dian=('SETT48211', '2026-10-17', '13:05:44', '900123456', '800199436', 380000.0, 72200.0, 452200.0),
         lines=['HOTEL CASA DANN CARLTON S.A.S.', 'NIT 900.123.456-7', 'FACTURA ELECTRONICA DE VENTA', 'No. SETT48211', 'Fecha: 2026-10-17', 'ALOJAMIENTO 1 NOCHE  380.000', 'IVA 19%              72.200', 'TOTAL               452.200', '', 'CUFE: a7c3f0e1b2d4...'],
         expect=dict(amount=452200, date='2026-10-17', taxId='900123456', invoiceNumber='SETT48211')),
    # --- Receipts abroad (SPI at trade fairs): month/day dates, English, USD
    dict(file='us-hotel-chicago.png', country='CO', kind='paper',
         lines=['HYATT REGENCY MCCORMICK PLACE', '2233 S MARTIN L KING DR', 'CHICAGO, IL 60616', 'GUEST FOLIO', 'ROOM 1418   GUESTS 1', 'DATE 10/03/2026', 'ROOM CHARGE        289.00', 'STATE TAX           50.29', 'TOTAL DUE        $339.29', 'VISA ****4421', 'THANK YOU FOR STAYING WITH US'],
         expect=dict(amount=339.29, date='2026-10-03', currency='USD')),
    dict(file='us-restaurant-tip.png', country='CO', kind='paper', angle=1.0, blur=0.7,
         lines=['GIBSONS BAR & STEAKHOUSE', '1028 N RUSH ST', 'CHICAGO, IL 60611', 'SERVER: MIKE   TABLE 12', 'GUESTS: 3', '10/14/26  7:42 PM', 'SUBTOTAL          186.50', 'TAX                19.12', 'TOTAL            205.62', 'TIP ____________', 'THANK YOU!'],
         expect=dict(amount=205.62, date='2026-10-14', time='19:42', currency='USD')),
    dict(file='us-taxi.png', country='CO', kind='paper',
         lines=['YELLOW CAB CHICAGO', 'RECEIPT', 'OCT 12, 2026  06:15 AM', 'FARE             42.50', 'TOLLS             0.00', 'TIP               8.00', 'TOTAL           $50.50', 'CREDIT  VISA', 'THANK YOU'],
         expect=dict(amount=50.50, date='2026-10-12', time='06:15', currency='USD')),
    dict(file='papel-colombia-parqueadero.png', country='CO', kind='paper',
         lines=['PARQUEADERO LA 93 S.A.S.', 'NIT: 900.123.456-7', 'Factura de venta No. FE-20931', 'Fecha: 2026-10-18 Hora: 09:05', 'Valor total $ 45.000', 'Pago en efectivo'],
         expect=dict(amount=45000, date='2026-10-18')),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    expected = []
    for c in CASES:
        barcode = pdf417_png(ted_xml(*c['ted'])) if c.get('ted') else qr_png(dian_qr_text(*c['dian'])) if c.get('dian') else None
        img = render(c['lines'], barcode, blur=c.get('blur', 0.5), angle=c.get('angle', 0.0), contrast=c.get('contrast', 1.0))
        img.save(OUT / c['file'], optimize=True)
        expected.append(dict(file=c['file'], country=c['country'], kind=c['kind'], expect=c['expect']))
        print('wrote', c['file'], img.size)
    (OUT / 'expected.json').write_text(json.dumps(expected, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
