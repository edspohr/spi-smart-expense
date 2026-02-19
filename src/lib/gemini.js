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
      ${categoriesList}
      
      CATEGORY AFFINITY:
      - 'RESTAURANTE - ALIMENTACION': Food, drinks, cafes.
      - 'HOTEL': Individual lodging.
      - 'ROOMING': Multiple guests/rooms mentioned.
      - 'TRANSPORTE TERRESTRE': Taxis, Uber, gas.
      - 'TRANSPORTE AEREO': Flights.
      
      If a field is not found, return null. 
      JSON output only:
    `;

    let result;
    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
      });
      result = await model.generateContent([prompt, ...parts]);
    } catch (error) {
      const isQuotaError =
        error.message.includes("429") ||
        error.message.includes("Quota exceeded") ||
        error.message.includes("Resource has been exhausted");
      if (isQuotaError) {
        console.warn(
          "Gemini 2.0 quota exceeded, falling back to gemini-1.5-pro",
        );
        const modelFallback = genAI.getGenerativeModel({
          model: "gemini-1.5-pro",
        });
        result = await modelFallback.generateContent([prompt, ...parts]);
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

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Error parsing documents with Gemini:", error);
    // Provide a more user-friendly error if it's still quota issues
    if (
      error.message.includes("429") ||
      error.message.includes("Quota exceeded")
    ) {
      throw new Error(
        "El sistema de IA está saturado momentáneamente. Por favor intente en 1 minuto o ingrese el gasto manualmente.",
      );
    }
    throw error;
  }
}
