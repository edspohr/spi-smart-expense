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
      Analyze the provided document(s). Image 1 is likely the Receipt/Invoice (Comprobante). Image 2 (if present) is likely the Payment Voucher (Voucher Transbank).
      
      Extract the following information in JSON format:
      - date: standardized YYYY-MM-DD format (prefer date from Receipt, fallback to Voucher).
      - time: HH:MM format (24h) if available.
      - invoiceNumber: Invoice / Receipt number (Nro Factura / Comprobante).
      - merchant: name of the place/vendor.
      - taxId: Tax Identification Number (NIT / RUT / RUC). Look for "NIT", "RUT", "RUC" followed by numbers.
      - address: Physical address of the merchant.
      - phone: Phone number of the merchant.
      - city: City of the transaction.
      - amount: total amount as a number (remove currency symbols).
      - currency: 'COP' or 'USD' or 'CLP'.
      - paymentMethod: 'Credit Card', 'Debit Card', 'Cash', 'Transfer', 'Wallet' (Nequi/Daviplata), or 'Other'.
      - description: a short summary of the items (Concepto / Detalle). E.g. "Lunch with client", "Hardware materials", "Taxi to airport".
      - cardLast4: Look specifically in the VOUCHER or RECEIPT for the last 4 digits of the card (e.g. **** 1234 -> "1234"). If not found, null.
      ${categoriesList}
      
      CRITICAL CATEGORIZATION RULES:
      - If the document contains a list of names (guests) or references multiple rooms, strictly classify as 'ROOMING'.
      - If it is a standard individual lodging/stay, classify as 'HOTEL'.
      - For food/meals, use 'RESTAURANTE - ALIMENTACION'.
      
      If you cannot find a field, return null for it.
      JSON:
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
