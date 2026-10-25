// Prompt and post-processing for receipt extraction, isolated from the
// Firebase runtime so they can be unit-tested. Ported verbatim from the
// former client-side src/lib/gemini.js.

export type CountryCode = 'CO' | 'CL';

// Country-specific extraction rules. Colombia keeps the original prompt
// verbatim; Chile reads RUT, boleta/factura and CLP without decimals.
const COUNTRY_RULES: Record<CountryCode, string> = {
  CO: `
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
      4. Language: The "description" field MUST be written in Spanish.`,
  CL: `
      Act as an expert accounting data extractor for receipts from Chile, the USA, and Europe (EUR).
      Analyze Image 1 (Boleta/Factura/Receipt) and Image 2 (Voucher if available).

      CRITICAL EXTRACTION RULES:
      1. Tax ID (taxId):
         - For Chile: Look for "RUT" or "R.U.T." of the ISSUER (the merchant), formatted 76.123.456-7 (the check digit can be K). Never return the buyer's RUT.
         - For USA: "Tax ID"/"EIN". For Europe: "NIF", "CIF", "VAT".
      2. Document number (invoiceNumber): the "Boleta Electrónica N°" or "Factura Electrónica N°" folio.
      3. Amount (amount): the final "TOTAL" including IVA (19%). Chilean pesos have NO decimals: "$12.500" means 12500 and dots are thousands separators. Ignore "Neto" and "IVA" lines when a total exists; include the tip ("propina") only if it is part of the charged total.
      4. Currency & Location:
         - Set currency to 'CLP' if you find "RUT", "Boleta", "SII", "CLP", Chilean addresses or comunas, or a "$" amount without decimals.
         - Set currency to 'USD' if you find US addresses or "USD"; 'EUR' for "€"/"EUR" or European addresses.
         - Infer the City (comuna) from the merchant's address.
      5. Language: The "description" field MUST be written in Spanish.`,
};

// Category hints. Colombia: the original SPI list, verbatim.
const CATEGORY_AFFINITY: Record<CountryCode, string> = {
  CO: `
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
      - 'PUBLICIDAD': Advertising, marketing services.`,
  CL: `
      CATEGORY AFFINITY (use these mappings strictly when the category exists in the list):
      - 'COMBUSTIBLE': bencina, diésel, combustible, Copec, Shell, Aramco, Enex, Petrobras, estación de servicio. NEVER use 'VARIOS' for fuel.
      - 'ALIMENTACIÓN': restaurantes, cafeterías, colaciones, supermercado para colación.
      - 'ALOJAMIENTO': hoteles, hostales, cabañas, arriendos por noche.
      - 'TRANSPORTE TERRESTRE': taxi, Uber, Cabify, DiDi, buses, Metro, arriendo de vehículo.
      - 'PASAJES AÉREOS': LATAM, Sky, JetSMART, pasajes aéreos.
      - 'PEAJES Y TAG': peajes, autopistas, TAG, pases diarios.
      - 'ESTACIONAMIENTOS': estacionamientos, parquímetros.
      - 'MATERIALES Y HERRAMIENTAS': ferreterías (Sodimac, Easy, Construmart), insumos, herramientas.
      - 'EPP Y SEGURIDAD': elementos de protección personal, guantes, cascos, zapatos de seguridad.
      - 'TELEFONÍA E INTERNET': recargas, planes móviles, internet.`,
};

export function buildReceiptPrompt(availableCategories: string[], country: CountryCode = 'CO'): string {
  const categoriesList =
    availableCategories.length > 0
      ? `\n- category: one of the following exact strings: ${availableCategories.join(', ')}. If unsure, use 'VARIOS'.`
      : `\n- category: suggest a category if possible, or null.`;
  const currencies = country === 'CL' ? "'CLP', 'USD', or 'EUR'" : "'COP', 'USD', or 'EUR'";

  return `${COUNTRY_RULES[country] ?? COUNTRY_RULES.CO}

      Return a JSON with these fields:
      - date: YYYY-MM-DD
      - time: HH:MM (24h)
      - invoiceNumber: The invoice or ticket number.
      - merchant: Name of the vendor.
      - taxId: ${country === 'CL' ? 'RUT of the issuer' : 'NIT, EIN, NIF/CIF/VAT'}, or equivalent Tax ID.
      - address: Full address.
      - phone: Vendor phone.
      - city: City of transaction.
      - amount: Total amount as a number.
      - currency: ${currencies}.
      - paymentMethod: 'Credit Card', 'Debit Card', 'Cash', 'Transfer', 'Wallet', or 'Other'.
      - description: Brief summary in SPANISH (e.g., "Almuerzo de trabajo").
      - cardLast4: Last 4 digits of the card used.
      - cardBrand: One of 'visa', 'mastercard', 'amex', 'citi', 'diners' if clearly identifiable from the receipt, otherwise null. Return null when uncertain — never guess.
      - cardCompany: null (this field cannot be determined from a receipt; always return null).
      ${categoriesList}
      ${CATEGORY_AFFINITY[country] ?? CATEGORY_AFFINITY.CO}

      If a field is not found, return null.
      JSON output only:
    `;
}

export function fuelCategoryOf(categories: string[]): string | null {
  return ['GASOLINA', 'COMBUSTIBLE'].find((c) => categories.includes(c)) ?? null;
}

export function isTransientGeminiError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /503|502|500|504|429|Quota exceeded|Resource has been exhausted|high demand|overloaded/.test(msg);
}

const FUEL_RE =
  /gasolina|combustible|bencina|di[eé]sel|fuel|gas\s*station|estaci[oó]n\s*de\s*servicio|terpel|primax|texaco|esso|mobil|shell|copec|aramco|enex|petrobras|biomax|puma|gasolinera|\beds\b|petrol|nafta/i;

export function postProcessExtraction(rawText: string, availableCategories: string[]): Record<string, unknown> {
  let jsonStr = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  const first = jsonStr.indexOf('{');
  const last = jsonStr.lastIndexOf('}');
  if (first !== -1 && last !== -1) jsonStr = jsonStr.substring(first, last + 1);
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  const needsOverride = !parsed.category || parsed.category === 'VARIOS';
  const isFuel = FUEL_RE.test(`${parsed.merchant ?? ''} ${parsed.description ?? ''}`);
  const fuel = fuelCategoryOf(availableCategories);
  if (needsOverride && isFuel && fuel) {
    parsed.category = fuel;
  }
  return parsed;
}
