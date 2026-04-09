/**
 * Exchange Rate utilities for TRM (Tasa Representativa del Mercado) capture.
 *
 * NOTE: open.er-api.com only returns the LATEST exchange rate, not historical rates.
 * For the official TRM by date (Banco de la República), a paid API would be required.
 * The date parameter is accepted for future compatibility but is not used in the request.
 */

const ER_API_URL = 'https://open.er-api.com/v6/latest/USD';

/**
 * Fetches the current USD→COP exchange rate (TRM).
 * @param {string} _date - YYYY-MM-DD (reserved for future historical lookup)
 * @returns {Promise<{ trm: number|null, source: string, fetchedAt: string|null }>}
 */
// eslint-disable-next-line no-unused-vars
export async function fetchTRM(_date) {
  try {
    const response = await fetch(ER_API_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (json.result !== 'success' || !json.rates?.COP) {
      throw new Error('Respuesta inesperada de la API de tasas');
    }
    return {
      trm: json.rates.COP,
      source: 'open.er-api.com',
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[fetchTRM] Error al obtener TRM:', err);
    return { trm: null, source: 'error', fetchedAt: null };
  }
}

/**
 * Calculates the COP equivalent for a USD amount given a TRM.
 * @param {number|string} amountUSD
 * @param {number|null} trm
 * @returns {number|null}
 */
export function calculateCOPEquivalent(amountUSD, trm) {
  const amt = Number(amountUSD);
  const rate = Number(trm);
  if (!rate || !amt || isNaN(amt) || isNaN(rate)) return null;
  return Math.round(amt * rate);
}
