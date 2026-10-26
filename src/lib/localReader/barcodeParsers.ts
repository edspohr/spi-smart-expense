import type { BarcodeData } from './types';

// Parsers for the machine-readable codes printed on electronic tax documents:
// the Chilean "timbre electrónico" (TED, PDF417) and the Colombian DIAN QR.
// Pure functions: the decoding itself lives in barcode.ts.

const DTE_LABELS: Record<string, string> = {
  '33': 'Factura electrónica',
  '34': 'Factura exenta electrónica',
  '39': 'Boleta electrónica',
  '41': 'Boleta exenta electrónica',
  '46': 'Factura de compra electrónica',
  '52': 'Guía de despacho electrónica',
  '56': 'Nota de débito electrónica',
  '61': 'Nota de crédito electrónica',
  '110': 'Factura de exportación electrónica',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(m[1]!.trim()) : undefined;
}

/** Normalizes a RUT to "12345678-9" (no dots, upper-case K). */
export function normalizeRut(raw: string): string {
  const clean = raw.replace(/[.\s]/g, '').replace(/[–—]/g, '-').toUpperCase();
  const m = clean.match(/^(\d{1,9})-?([\dK])$/);
  return m ? `${m[1]}-${m[2]}` : clean;
}

/** Parses the XML of a Chilean TED. Returns null if it is not one. */
export function parseTed(text: string): BarcodeData | null {
  if (!/<TED[\s>]/.test(text) || !/<DD>/.test(text)) return null;
  const dd = text.match(/<DD>([\s\S]*?)<\/DD>/)?.[1] ?? text;
  // The issuer's legal name travels in the CAF (folio authorisation) inside DD.
  const da = dd.match(/<DA>([\s\S]*?)<\/DA>/)?.[1] ?? '';
  // Tags inside DD but outside the CAF block.
  const ddOwn = dd.replace(/<CAF[\s\S]*?<\/CAF>/, '');
  const td = tag(ddOwn, 'TD');
  const total = Number(tag(ddOwn, 'MNT'));
  const re = tag(ddOwn, 'RE');
  const rr = tag(ddOwn, 'RR');
  return {
    kind: 'ted',
    docType: td,
    docLabel: td ? DTE_LABELS[td] ?? `DTE tipo ${td}` : undefined,
    issuerTaxId: re ? normalizeRut(re) : undefined,
    issuerName: tag(da, 'RS'),
    folio: tag(ddOwn, 'F'),
    date: tag(ddOwn, 'FE'),
    total: Number.isFinite(total) && total > 0 ? total : undefined,
    firstItem: tag(ddOwn, 'IT1'),
    receiverTaxId: rr ? normalizeRut(rr) : undefined,
  };
}

const toNumber = (v: string | undefined): number | undefined => {
  if (!v) return undefined;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Parses the QR of a Colombian DIAN electronic invoice ("NumFac: …\nFecFac: …").
 * A QR that only carries the DIAN lookup URL yields just the CUFE.
 */
export function parseDianQr(text: string): BarcodeData | null {
  const pairs: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z]+)\s*[:=]\s*(.+?)\s*$/);
    if (m) pairs[m[1]!.toLowerCase()] = m[2]!;
  }
  const urlKey = text.match(/catalogo-vpfe(?:-hab)?\.dian\.gov\.co\/[^\s]*documentkey=([0-9a-fA-F]{40,})/)?.[1];
  const cufe = pairs.cufe ?? pairs.cude ?? urlKey;
  if (!pairs.numfac && !pairs.nitfac && !cufe) return null;
  const date = pairs.fecfac?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const time = pairs.horfac?.match(/\d{2}:\d{2}/)?.[0];
  return {
    kind: 'dian',
    docType: 'dian',
    docLabel: 'Factura electrónica DIAN',
    issuerTaxId: pairs.nitfac?.replace(/[^\d-]/g, ''),
    folio: pairs.numfac,
    date,
    time,
    total: toNumber(pairs.valtolfac ?? pairs.valtotfac ?? pairs.valfac),
    vat: toNumber(pairs.valiva),
    receiverTaxId: pairs.docadq,
    cufe,
  };
}

/** Tries every known format; returns the first match. */
export function parseTaxBarcode(text: string): BarcodeData | null {
  return parseTed(text) ?? parseDianQr(text);
}
