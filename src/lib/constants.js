// Shared constants for expense capture, edit, display, and reporting flows.
// Values are stored as-is in Firestore; labels are Spanish UI strings.

// Extension point — add new categories here; they propagate to all forms, filters and exports.
export const CATEGORIES_COMMON = [
  "RESTAURANTE - ALIMENTACION",
  "HOTEL",
  "ROOMING",
  "TRANSPORTE TERRESTRE",
  "TRANSPORTE AEREO",
  "PARQUEADEROS",
  "GASOLINA",
  "PEAJES",
  "TICKET FERIA",
  "TECNOLOGÍA",
  "SUSCRIPCIONES",
  "FEES BANCARIOS",
  "PUBLICIDAD",
  "VARIOS",
];

// Amex and Citi removed from PAYMENT_METHODS — they are now captured under CARD_BRANDS (Marca de tarjeta).
// Legacy expenses that still hold "Amex" or "Citi" are resolved via PAYMENT_METHOD_LABELS below.
export const PAYMENT_METHODS = [
  { value: "Credit Card", label: "Tarjeta de Crédito" },
  { value: "Debit Card", label: "Tarjeta Débito" },
  { value: "Cash", label: "Efectivo" },
  { value: "Transfer", label: "Transferencia" },
  { value: "Wallet", label: "Billetera Digital (Nequi/Daviplata)" },
  { value: "Other", label: "Otro" },
];

export const PAYMENT_METHOD_LABELS = Object.fromEntries(
  [
    ...PAYMENT_METHODS,
    { value: "Amex", label: "American Express (heredado)" },
    { value: "Citi", label: "Citi (heredado)" },
  ].map(p => [p.value, p.label])
);

export const CARD_BRANDS = [
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "amex", label: "American Express" },
  { value: "citi", label: "Citi" },
  { value: "diners", label: "Diners Club" },
  { value: "other", label: "Otra" },
];

export const CARD_COMPANIES = [
  { value: "SPI Americas", label: "SPI Americas" },
  { value: "SPI Advisors", label: "SPI Advisors" },
  { value: "Socios SPI Advisors", label: "Socios SPI Advisors" },
  { value: "Socios SPI Americas", label: "Socios SPI Américas" },
];

export const CURRENCIES = [
  { value: "COP", label: "COP ($)" },
  { value: "USD", label: "USD (u$s)" },
  { value: "CLP", label: "CLP ($)" },
];

export const CARD_BRAND_LABELS = Object.fromEntries(
  CARD_BRANDS.map(b => [b.value, b.label])
);
