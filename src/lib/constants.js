// Shared constants for expense capture, edit, display, and reporting flows.
// Values are stored as-is in Firestore; labels are Spanish UI strings.

export const CATEGORIES_COMMON = [
  "RESTAURANTE - ALIMENTACION",
  "HOTEL",
  "ROOMING",
  "TRANSPORTE TERRESTRE",
  "TRANSPORTE AEREO",
  "VARIOS",
];

export const PAYMENT_METHODS = [
  { value: "Credit Card", label: "Tarjeta de Crédito" },
  { value: "Debit Card", label: "Tarjeta Débito" },
  { value: "Cash", label: "Efectivo" },
  { value: "Transfer", label: "Transferencia" },
  { value: "Wallet", label: "Billetera Digital (Nequi/Daviplata)" },
  { value: "Other", label: "Otro" },
];

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
];

export const CURRENCIES = [
  { value: "COP", label: "COP ($)" },
  { value: "USD", label: "USD (u$s)" },
  { value: "CLP", label: "CLP ($)" },
];

export const CARD_BRAND_LABELS = Object.fromEntries(
  CARD_BRANDS.map(b => [b.value, b.label])
);
