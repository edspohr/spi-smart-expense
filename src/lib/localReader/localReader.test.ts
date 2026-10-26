import { describe, expect, it } from 'vitest';
import { normalizeRut, parseDianQr, parseTaxBarcode, parseTed } from './barcodeParsers';
import { amountCandidates, amountLabel, extractFromText, parseAmount, receiptLocale, textLines } from './rules';
import { guessCategory } from './categories';
import { dictionaryKey, learnedLabels, mergeLocalRead, toFormPatch } from './merge';

const TODAY = new Date('2026-10-26T12:00:00Z');
const CL = { country: 'CL' as const, baseCurrency: 'CLP', today: TODAY };
const CO = { country: 'CO' as const, baseCurrency: 'COP', today: TODAY };

const TED =
  '<TED version="1.0"><DD><RE>99520000-7</RE><TD>39</TD><F>4815162</F><FE>2026-10-20</FE><RR>66666666-6</RR>' +
  '<RSR>CLIENTE BOLETA</RSR><MNT>68400</MNT><IT1>COMBUSTIBLE 95 OCTANOS</IT1><CAF version="1.0"><DA><RE>99520000-7</RE>' +
  '<RS>COMBUSTIBLES DEL NORTE SPA</RS><TD>39</TD><RNG><D>1</D><H>9999999</H></RNG><FA>2026-01-02</FA></DA>' +
  '<FRMA algoritmo="SHA1withRSA">xx</FRMA></CAF><TSTED>2026-10-20T10:31:00</TSTED></DD><FRMT algoritmo="SHA1withRSA">yy</FRMT></TED>';

// Real output of the local OCR on a synthetic parking receipt (spike).
const PARKING = `ESTACIONAMIENTOS CENTRAL LTDA
RUT: 76.354.771—K

AV. LIBERTADOR B. O'HIGGINS 1234
SANTIAGO

BOLETA N 0012345

FECHA: 21/10/2026 HORA: 14:32
TIEMPO ESTACIONADO 2 HRS
TARIFA 3.500
TOTAL $ 3.500
PAGO: TARJETA DEBITO

GRACIAS POR SU VISITA`;

const FUEL = `ESTACION DE SERVICIO
COPEC S.A.
R.U.T. 99.520.000-7
GIRO: VENTA DE COMBUSTIBLES
BOLETA ELECTRONICA N° 4815162
21-OCT-2026 08:15
GASOLINA 95  40,5 L
NETO        $ 57.479
IVA 19%     $ 10.921
TOTAL       $ 68.400
VISA ****1234  CREDITO`;

const RESTAURANT = `RESTAURANTE EL MINERO SPA
RUT 76354771-K
MESA 4  FECHA 20/10/26
2 MENU EJECUTIVO   25.800
1 BEBIDA            2.500
SUBTOTAL           28.300
PROPINA 10%         2.830
TOTAL A PAGAR      31.130
EFECTIVO`;

const COLOMBIA = `PARQUEADERO LA 93 S.A.S.
NIT: 900.123.456-7
Factura de venta No. FE-20931
Fecha: 2026-10-18 Hora: 09:05
Valor total $ 45.000
Pago en efectivo`;

const CL_CATEGORIES = ['ALIMENTACIÓN', 'ALOJAMIENTO', 'TRANSPORTE TERRESTRE', 'COMBUSTIBLE', 'PEAJES Y TAG', 'ESTACIONAMIENTOS', 'VARIOS'];

describe('barcode parsers', () => {
  it('reads every field of a Chilean TED, including the issuer name from the CAF', () => {
    const b = parseTed(TED)!;
    expect(b).toMatchObject({
      kind: 'ted', docType: '39', docLabel: 'Boleta electrónica', issuerTaxId: '99520000-7',
      issuerName: 'COMBUSTIBLES DEL NORTE SPA', folio: '4815162', date: '2026-10-20', total: 68400,
      firstItem: 'COMBUSTIBLE 95 OCTANOS', receiverTaxId: '66666666-6',
    });
  });

  it('reads a DIAN QR and a URL-only QR', () => {
    const qr = 'NumFac: SETP990000002\nFecFac: 2026-10-18\nHorFac: 09:05:00-05:00\nNitFac: 900373115\nDocAdq: 1020304050\nValFac: 1000.00\nValIva: 190.00\nValTolFac: 1190.00\nCUFE: ' + 'a'.repeat(96);
    expect(parseDianQr(qr)).toMatchObject({ kind: 'dian', folio: 'SETP990000002', date: '2026-10-18', time: '09:05', issuerTaxId: '900373115', total: 1190, vat: 190 });
    const url = 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=' + 'b'.repeat(96);
    expect(parseDianQr(url)?.cufe).toBe('b'.repeat(96));
  });

  it('ignores unrelated codes', () => {
    expect(parseTaxBarcode('https://example.com/promo')).toBeNull();
    expect(normalizeRut('76.354.771—k')).toBe('76354771-K');
  });
});

describe('amount parsing', () => {
  it.each([
    ['$ 3.500', true, 3500],
    ['1.240.000', true, 1240000],
    ['45.000,50', false, 45000.5],
    ['1,190.00', false, 1190],
    ['149.00', false, 149],
  ])('%s → %d', (raw, whole, expected) => {
    expect(parseAmount(raw, whole)).toBe(expected);
  });
});

describe('text rules', () => {
  it('reads the parking receipt (real OCR output)', () => {
    const f = extractFromText(PARKING, CL);
    expect(f.taxId).toMatchObject({ value: '76354771-K', confidence: 'high' });
    expect(f.amount).toMatchObject({ value: 3500, confidence: 'high' });
    expect(f.date).toMatchObject({ value: '2026-10-21', confidence: 'high' });
    expect(f.time?.value).toBe('14:32');
    expect(f.invoiceNumber?.value).toBe('12345');
    expect(f.paymentMethod?.value).toBe('Debit Card');
    expect(f.merchant?.value).toBe('ESTACIONAMIENTOS CENTRAL LTDA');
  });

  it('takes TOTAL, not NETO or IVA, and reads card data', () => {
    const f = extractFromText(FUEL, CL);
    expect(f.amount?.value).toBe(68400);
    expect(f.date?.value).toBe('2026-10-21');
    expect(f.taxId?.value).toBe('99520000-7');
    expect(f.cardBrand?.value).toBe('visa');
    expect(f.cardLast4?.value).toBe('1234');
    expect(f.paymentMethod?.value).toBe('Credit Card');
    expect(f.invoiceNumber?.value).toBe('4815162');
  });

  it('prefers TOTAL A PAGAR over subtotal and tip lines', () => {
    const f = extractFromText(RESTAURANT, CL);
    expect(f.amount).toMatchObject({ value: 31130, confidence: 'high' });
    expect(f.date?.value).toBe('2026-10-20');
    expect(f.paymentMethod?.value).toBe('Cash');
  });

  it('reads a Colombian receipt with NIT and check digit', () => {
    const f = extractFromText(COLOMBIA, CO);
    expect(f.taxId?.value).toBe('900123456-7');
    expect(f.amount?.value).toBe(45000);
    expect(f.date?.value).toBe('2026-10-18');
    expect(f.invoiceNumber?.value).toBe('FE-20931');
    expect(f.currency?.value).toBe('COP');
  });

  it('rejects an invalid RUT and dates far in the future', () => {
    const f = extractFromText('TIENDA\nRUT 76.354.771-0\nFECHA 01/01/2030\nTOTAL 1.000', CL);
    expect(f.taxId).toBeUndefined();
    expect(f.date?.confidence).toBe('low');
  });

  it('tolerates common OCR confusions (comma in a RUT, zero for O in a month)', () => {
    const f = extractFromText('COPEC\nRUT: 76.354,771-K\n22-0CT-2026 08:15\nTOTAL $ 68.400', CL);
    expect(f.taxId?.value).toBe('76354771-K');
    expect(f.date?.value).toBe('2026-10-22');
  });
});

describe('categories', () => {
  it('maps keywords onto the tenant category names', () => {
    expect(guessCategory('COPEC GASOLINA 95', CL_CATEGORIES)?.value).toBe('COMBUSTIBLE');
    expect(guessCategory('PARQUEADERO LA 93', ['GASOLINA', 'PARQUEADERO', 'ALIMENTACION'])?.value).toBe('PARQUEADERO');
    expect(guessCategory('AUTOPISTA DEL ITATA', CL_CATEGORIES)?.value).toBe('PEAJES Y TAG');
    expect(guessCategory('ALGO DESCONOCIDO', CL_CATEGORIES)).toBeUndefined();
  });
});

describe('merge', () => {
  it('lets the barcode win and the dictionary fill merchant and category', () => {
    const r = mergeLocalRead({
      barcode: parseTed(TED),
      ocrFields: extractFromText(FUEL, CL),
      ocrText: FUEL,
      dictionary: { [dictionaryKey('99.520.000-7')]: { merchant: 'Copec Ruta 5 Norte', category: 'COMBUSTIBLE' } },
      categories: CL_CATEGORIES,
      baseCurrency: 'CLP',
      durationMs: 10,
    });
    expect(r.complete).toBe(true);
    expect(r.fields.amount).toMatchObject({ value: 68400, source: 'barcode' });
    expect(r.fields.merchant).toMatchObject({ value: 'COMBUSTIBLES DEL NORTE SPA', source: 'barcode' });
    expect(r.fields.category).toMatchObject({ value: 'COMBUSTIBLE', source: 'dictionary' });
    expect(r.fields.currency?.value).toBe('CLP');
    const { patch } = toFormPatch(r);
    expect(patch).toMatchObject({ amount: '68400', date: '2026-10-20', invoiceNumber: '4815162', taxId: '99520000-7' });
  });

  it('falls back to OCR + keywords without a barcode', () => {
    const r = mergeLocalRead({ barcode: null, ocrFields: extractFromText(PARKING, CL), ocrText: PARKING, dictionary: {}, categories: CL_CATEGORIES, baseCurrency: 'CLP', durationMs: 5 });
    expect(r.fields.category).toMatchObject({ value: 'ESTACIONAMIENTOS', source: 'keyword' });
    expect(r.sources).toEqual(expect.arrayContaining(['ocr', 'keyword']));
  });
});

describe('learning hooks (Ola 8b)', () => {
  const RECEIPT = 'MINIMARKET DON LUCHO\nRUT 76.354.771-K\nFECHA 20/10/2026\nSUMA 12.400\nTOTAL ARTICULOS 3\nPAGO EFECTIVO 15.000';

  it('lists labelled amounts with short labels', () => {
    expect(amountLabel('TOTAL A PAGAR $ 31.130')).toBe('TOTAL A PAGAR');
    const c = amountCandidates(textLines(RECEIPT), true);
    expect(c).toEqual(expect.arrayContaining([{ label: 'SUMA', value: 12400 }, { label: 'PAGO EFECTIVO', value: 15000 }]));
    expect(c.find((x) => x.value === 20)).toBeUndefined(); // the date line is skipped
  });

  it('prefers the label learned for the issuer', () => {
    expect(extractFromText(RECEIPT, CL).amount?.value).not.toBe(12400);
    const learned = extractFromText(RECEIPT, { ...CL, amountLabels: { '76354771-K': 'SUMA' } });
    expect(learned.amount).toMatchObject({ value: 12400, confidence: 'high' });
  });
});

describe('reader pack (Ola 8c)', () => {
  it("uses the pack's labels unless the tenant learned its own", () => {
    const pack = { version: '2026-11-01', issuers: { '99520000-7': { amountLabel: 'TOTAL' }, '76354771-K': { amountLabel: 'SUMA' } } };
    const dictionary = { '76354771-K': { merchant: 'El Minero', amountLabel: 'TOTAL A PAGAR' } };
    expect(learnedLabels(dictionary, pack)).toEqual({ '99520000-7': 'TOTAL', '76354771-K': 'TOTAL A PAGAR' });
    expect(learnedLabels({}, { version: '0', issuers: {} })).toEqual({});
  });
});

describe('receipts abroad (SPI at trade fairs)', () => {
  it('detects US receipts and reads month/day dates, AM/PM times and USD', () => {
    const f = extractFromText('HYATT REGENCY\nCHICAGO, IL 60616\nDATE 10/03/2026 7:05 PM\nROOM CHARGE 289.00\nTAX 50.29\nTOTAL DUE $339.29\nTHANK YOU', CO);
    expect(f.date).toMatchObject({ value: '2026-10-03', confidence: 'high' });
    expect(f.time?.value).toBe('19:05');
    expect(f.amount?.value).toBe(339.29);
    expect(f.currency).toMatchObject({ value: 'USD', confidence: 'high' });
  });

  it('keeps day/month on Latin American receipts', () => {
    expect(receiptLocale('PARQUEADERO LA 93\nNIT 900.123.456-7\nTOTAL 45.000')).toBe('latam');
    expect(extractFromText('PARQUEADERO LA 93\nFECHA 03/10/2026\nTOTAL 45.000', CO).date?.value).toBe('2026-10-03');
    expect(extractFromText('TIENDA\nFECHA 05/10/2026\nTOTAL 45.000', CO).date?.value).toBe('2026-10-05');
  });

  it('flags an ambiguous date when the receipt locale is unsure', () => {
    const f = extractFromText('SHOP\nTHANK YOU\n05/10/2026\nTOTAL 45.00', CO);
    expect(receiptLocale('SHOP\nTHANK YOU')).toBe('unsure');
    expect(f.date?.confidence).toBe('low');
  });

  it('reads English month names and English totals, skipping tax and tip', () => {
    const f = extractFromText('YELLOW CAB\nRECEIPT\nOCT 12, 2026 06:15 AM\nFARE 42.50\nTIP 8.00\nTOTAL $50.50\nCREDIT VISA', CO);
    expect(f.date?.value).toBe('2026-10-12');
    expect(f.amount?.value).toBe(50.5);
    expect(f.paymentMethod?.value).toBe('Credit Card');
  });

  it("maps fair and travel receipts onto SPI's categories", () => {
    const spi = ['RESTAURANTE - ALIMENTACION', 'HOTEL', 'TRANSPORTE TERRESTRE', 'TRANSPORTE AEREO', 'TICKET FERIA', 'TECNOLOGÍA', 'VARIOS'];
    expect(guessCategory('IMTS 2026 EXHIBITOR REGISTRATION BADGE', spi)?.value).toBe('TICKET FERIA');
    expect(guessCategory('MARRIOTT MARQUIS ROOM CHARGE', spi)?.value).toBe('HOTEL');
    expect(guessCategory('LYFT RIDE TO OHARE', spi)?.value).toBe('TRANSPORTE TERRESTRE');
    expect(guessCategory('COPA AIRLINES BAGGAGE FEE', spi)?.value).toBe('TRANSPORTE AEREO');
    expect(guessCategory('BEST BUY USB-C ADAPTER', spi)?.value).toBe('TECNOLOGÍA');
    expect(guessCategory('STARBUCKS COFFEE', spi)?.value).toBe('RESTAURANTE - ALIMENTACION');
  });
});
