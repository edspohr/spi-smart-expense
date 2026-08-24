import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini
// Note: In production, you should proxy this request or use Firebase Cloud Functions
// to avoid exposing the key if this is a public client, but for internal tools it might be acceptable
// with restricted keys.
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

export async function parseExpenseDocuments(
  receiptFile,
  voucherFile,
  availableCategories = [],
) {
  if (!API_KEY) {
    console.warn("Gemini API Key is missing.");
    throw new Error("Falta la API Key de Gemini (VITE_GEMINI_API_KEY).");
  }

  try {
    // Helper to convert to base64
    const fileToPart = async (file) => {
      if (!file) return null;
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return {
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      };
    };

    const parts = [];
    const receiptPart = await fileToPart(receiptFile);
    if (receiptPart) parts.push(receiptPart);

    const voucherPart = await fileToPart(voucherFile);
    if (voucherPart) parts.push(voucherPart);

    if (parts.length === 0) throw new Error("No files provided for analysis.");

    const categoriesList =
      availableCategories.length > 0
        ? `\n- category: one of the following exact strings: ${availableCategories.join(
            ", ",
          )}. If unsure, use 'VARIOS'.`
        : `\n- category: suggest a category if possible, or null.`;

    const prompt = `
      Act as an expert accounting data extractor for receipts from Colombia and the USA.
      Analyze Image 1 (Receipt/Invoice) and Image 2 (Voucher if available).
      
      CRITICAL EXTRACTION RULES:
      1. Tax ID (taxId): 
         - For Colombia: Look for "NIT". Include the verification digit (e.g., 900.123.456-7).
         - For USA: Look for "Tax ID", "EIN", or "Business ID".
      2. Amount (amount): Extract ONLY the final total. Ignore sub-totals or tips unless they are part of the final balance.
      3. Currency & Location: 
         - Set currency to 'COP' if you find "NIT", "RUT", "COP", or Colombian addresses.
         - Set currency to 'USD' if you find US addresses, "USD", or "$".
         - Infer the City from the merchant's address or Tax ID region.
      4. Language: The "description" field MUST be written in Spanish.
      
      Return a JSON with these fields:
      - date: YYYY-MM-DD
      - time: HH:MM (24h)
      - invoiceNumber: The invoice or ticket number.
      - merchant: Name of the vendor.
      - taxId: NIT, EIN, or equivalent Tax ID.
      - address: Full address.
      - phone: Vendor phone.
      - city: City of transaction.
      - amount: Total amount as a number.
      - currency: 'COP' or 'USD'.
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

    const isTransient = (error) => {
      const msg = error?.message || "";
      return (
        msg.includes("503") ||
        msg.includes("502") ||
        msg.includes("500") ||
        msg.includes("504") ||
        msg.includes("429") ||
        msg.includes("Quota exceeded") ||
        msg.includes("Resource has been exhausted") ||
        msg.includes("high demand") ||
        msg.includes("overloaded")
      );
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const tryModel = async (modelName, maxAttempts = 3) => {
      const model = genAI.getGenerativeModel({ model: modelName });
      let lastError;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await model.generateContent([prompt, ...parts]);
        } catch (err) {
          lastError = err;
          if (!isTransient(err) || attempt === maxAttempts) throw err;
          const delay = 800 * Math.pow(2, attempt - 1) + Math.random() * 400;
          console.warn(
            `Gemini ${modelName} transient error (attempt ${attempt}/${maxAttempts}), retrying in ${Math.round(delay)}ms:`,
            err.message,
          );
          await sleep(delay);
        }
      }
      throw lastError;
    };

    let result;
    try {
      result = await tryModel("gemini-3.6-flash");
    } catch (error) {
      if (isTransient(error)) {
        console.warn(
          "Gemini 3.6-flash unavailable after retries, falling back to gemini-3.5-flash-lite",
        );
        result = await tryModel("gemini-3.5-flash-lite", 2);
      } else {
        throw error;
      }
    }

    const response = await result.response;
    const text = response.text();

    // Clean up markdown code blocks if present
    let jsonStr = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(jsonStr);

    // Safety net: if Gemini still returned VARIOS/empty for a fuel receipt, override locally.
    const FUEL_RE = /gasolina|combustible|fuel|gas\s*station|estaci[oó]n\s*de\s*servicio|terpel|primax|texaco|esso|mobil|shell|petrobras|biomax|puma|gasolinera|\beds\b|petrol|nafta/i;
    const needsOverride = !parsed.category || parsed.category === 'VARIOS';
    const isFuel = FUEL_RE.test(`${parsed.merchant || ''} ${parsed.description || ''}`);
    if (needsOverride && isFuel && availableCategories.includes('GASOLINA')) {
      parsed.category = 'GASOLINA';
    }

    return parsed;
  } catch (error) {
    console.error("Error parsing documents with Gemini:", error);
    const msg = error?.message || "";
    if (
      msg.includes("503") ||
      msg.includes("502") ||
      msg.includes("500") ||
      msg.includes("504") ||
      msg.includes("high demand") ||
      msg.includes("overloaded")
    ) {
      throw new Error(
        "El servicio de IA está saturado momentáneamente. Intente nuevamente en 30-60 segundos o ingrese el gasto manualmente.",
      );
    }
    if (msg.includes("429") || msg.includes("Quota exceeded")) {
      throw new Error(
        "Se alcanzó el límite de uso de IA. Por favor intente en 1 minuto o ingrese el gasto manualmente.",
      );
    }
    throw error;
  }
}
