// On-device receipt reading (Ola 8): shared types.

export type Confidence = 'high' | 'medium' | 'low';
export type FieldSource = 'barcode' | 'ocr' | 'dictionary' | 'keyword';

export interface LocalField<T = string> {
  value: T;
  confidence: Confidence;
  source: FieldSource;
}

/** Fields the expense form understands, as read on the device. */
export interface LocalFields {
  taxId?: LocalField;
  merchant?: LocalField;
  date?: LocalField; // YYYY-MM-DD
  time?: LocalField; // HH:MM
  amount?: LocalField<number>;
  currency?: LocalField;
  invoiceNumber?: LocalField;
  paymentMethod?: LocalField; // form option values: 'Credit Card' | 'Debit Card' | 'Cash' | 'Transfer'
  cardBrand?: LocalField; // 'visa' | 'mastercard' | 'amex' | 'diners'
  cardLast4?: LocalField;
  category?: LocalField;
  description?: LocalField;
}

export interface BarcodeData {
  kind: 'ted' | 'dian';
  docType?: string; // Chilean DTE type code (33, 39...) or 'dian'
  docLabel?: string;
  issuerTaxId?: string;
  issuerName?: string;
  folio?: string;
  date?: string;
  time?: string;
  total?: number;
  vat?: number;
  firstItem?: string;
  receiverTaxId?: string;
  cufe?: string;
}

export interface LocalReadResult {
  fields: LocalFields;
  barcode: BarcodeData | null;
  /** True when amount and date were found (enough to submit after review). */
  complete: boolean;
  /** Which engines produced data, for metrics: e.g. ['barcode', 'ocr']. */
  sources: FieldSource[];
  ocrConfidence?: number;
  durationMs: number;
}
