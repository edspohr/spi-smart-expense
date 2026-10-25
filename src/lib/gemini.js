import { callFunction } from './functions';

// Thin client for the `extractReceipt` Cloud Function. The Gemini API key,
// model selection, retries and rate limiting live server-side
// (functions/src/extractReceipt.ts).
export const PRIMARY_MODEL = 'gemini-3.6-flash';
export const FALLBACK_MODEL = 'gemini-3.5-flash-lite';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Cheap health probe so the UI can warn before an upload.
 * @returns {Promise<{ ok: boolean, model: string, reason?: string }>}
 */
export async function checkGeminiHealth() {
  try {
    return await callFunction('extractReceipt', { mode: 'health' });
  } catch (err) {
    return { ok: false, model: PRIMARY_MODEL, reason: err?.message || 'unknown' };
  }
}

/**
 * Extracts expense fields from a receipt (and optional voucher) image.
 * Throws an Error with a Spanish, user-facing message on failure.
 */
export async function parseExpenseDocuments(receiptFile, voucherFile, availableCategories = []) {
  const images = [];
  for (const file of [receiptFile, voucherFile]) {
    if (!file) continue;
    images.push({ data: await fileToBase64(file), mimeType: file.type });
  }
  if (images.length === 0) throw new Error('No files provided for analysis.');

  return callFunction('extractReceipt', { images, categories: availableCategories });
}
