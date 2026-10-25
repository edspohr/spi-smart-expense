// Prompt and post-processing for receipt extraction, isolated from the
// Firebase runtime so they can be unit-tested. Ported verbatim from the
// former client-side src/lib/gemini.js.

export function buildReceiptPrompt(availableCategories: string[]): string {
  const categoriesList =
    availableCategories.length > 0
      ? `\n- category: one of the following exact strings: ${availableCategories.join(', ')}. If unsure, use 'VARIOS'.`
      : `\n- category: suggest a category if possible, or null.`;

  return `
      Act as an expert accounting data extractor for receipts from Colombia, the USA, and Europe (EUR).
      Analyze Image 1 (Receipt/Invoice) and Image 2 (Voucher if available).

      CRITICAL EXTRACTION RULES:
      1. Tax ID (taxId):
         - For Colombia: Look for "NIT". Include the verification digit (e.g., 900.123.456-7).
         - For USA: Look for "Tax ID", "EIN", or "Business ID".
         - For Europe: Look for "NIF", "CIF", "VAT", "IVA", or country-specific tax IDs.
      2. Amount (amount): Extract ONLY the final total. Ignore sub-totals or tips unless they are part of the final balance.
      3. Currency & Location:
         - Set currency to 'COP' if you find "NIT", "RUT", "COP", or Colombian addresses.
         - Set currency to 'USD' if you find US addresses, "USD", or a lone "$" without other currency cues.
         - Set currency to 'EUR' if you find "€", "EUR", "IVA" (Spanish/EU VAT), "NIF", "CIF", or European addresses (España, Alemania, Francia, Italia, Portugal, Países Bajos, Bélgica, Irlanda, Austria, Grecia, Finlandia, etc.).
         - Infer the City from the merchant's address or Tax ID region.
      4. Language: The "description" field MUST be written in Spanish.

      Return a JSON with these fields:
      - date: YYYY-MM-DD
      - time: HH:MM (24h)
      - invoiceNumber: The invoice or ticket number.
      - merchant: Name of the vendor.
      - taxId: NIT, EIN, NIF/CIF/VAT, or equivalent Tax ID.
      - address: Full address.
      - phone: Vendor phone.
      - city: City of transaction.
      - amount: Total amount as a number.
      - currency: 'COP', 'USD', or 'EUR'.
      - paymentMethod: 'Credit Card', 'Debit Card', 'Cash', 'Transfer', 'Wallet', or 'Other'.
      - description: Brief summary in SPANISH (e.g., "Almuerzo de trabajo").
      - cardLast4: Last 4 digits of the card used.
      - cardBrand: One of 'visa', 'mastercard', 'amex', 'citi', 'diners' if clearly identifiable from the receipt, otherwise null. Return null when uncertain — never guess.
      - cardCompany: null (this field cannot be determined from a receipt; always return null).
      ${categoriesList}

      CATEGORY AFFINITY (use these mappings strictly):
      - 'GASOLINA': Fuel and service stations. If the merchant or description matches ANY of these keywords (case-insensitive): gasolina, combustible, fuel, gas station, estación de servicio, Terpel, Primax, Texaco, Esso, Mobil, Shell, Petrobras, Biomax, Puma, gasolinera, EDS, petrol, nafta — set category to 'GASOLINA'. NEVER use 'VARIOS' for fuel purchases.
      - 'RESTAURANTE - ALIMENTACION': Food, drinks, cafes, restaurants.
      - 'HOTEL': Individual lodging, hotel stays.
      - 'ROOMING': Multiple guests or rooms mentioned.
      - 'TRANSPORTE TERRESTRE': Taxis, Uber, bus, metro, ground transport (NOT fuel stations).
      - 'TRANSPORTE AEREO': Flights, airline tickets.
      - 'PARQUEADEROS': Parking lots, parking fees.
      - 'SUSCRIPCIONES': Software subscriptions, SaaS, digital services.
      - 'TECNOLOGÍA': Technology purchases, hardware, electronics.
      - 'PUBLICIDAD': Advertising, marketing services.

      If a field is not found, return null.
      JSON output only:
    `;
}

export function isTransientGeminiError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /503|502|500|504|429|Quota exceeded|Resource has been exhausted|high demand|overloaded/.test(msg);
}

const FUEL_RE =
  /gasolina|combustible|fuel|gas\s*station|estaci[oó]n\s*de\s*servicio|terpel|primax|texaco|esso|mobil|shell|petrobras|biomax|puma|gasolinera|\beds\b|petrol|nafta/i;

export function postProcessExtraction(rawText: string, availableCategories: string[]): Record<string, unknown> {
  let jsonStr = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  const first = jsonStr.indexOf('{');
  const last = jsonStr.lastIndexOf('}');
  if (first !== -1 && last !== -1) jsonStr = jsonStr.substring(first, last + 1);
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  const needsOverride = !parsed.category || parsed.category === 'VARIOS';
  const isFuel = FUEL_RE.test(`${parsed.merchant ?? ''} ${parsed.description ?? ''}`);
  if (needsOverride && isFuel && availableCategories.includes('GASOLINA')) {
    parsed.category = 'GASOLINA';
  }
  return parsed;
}
