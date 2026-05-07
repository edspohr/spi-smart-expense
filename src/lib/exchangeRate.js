/**
 * Exchange Rate utilities for TRM (Tasa Representativa del Mercado) capture.
 *
 * Primary source: datos.gov.co (Banco de la República official historical TRM).
 *   Returns the exact TRM for the requested date — accurate for past expenses.
 * Fallback source: open.er-api.com (live rate, no date support).
 *   Used when the BanRep API is unavailable or the date is today/future.
 */

const BANREP_API = 'https://www.datos.gov.co/resource/32sa-8pi3.json';
const ER_API_URL = 'https://open.er-api.com/v6/latest/USD';

async function fetchTRMFromBanRep(date) {
  // date: YYYY-MM-DD → query for the TRM range that covers that date
  const iso = `${date}T00:00:00.000`;
  const params = new URLSearchParams();
  params.set('$where', `vigenciadesde <= '${iso}' AND vigenciahasta >= '${iso}'`);
  params.set('$limit', '1');
  const response = await fetch(`${BANREP_API}?${params}`);
  if (!response.ok) throw new Error(`BanRep HTTP ${response.status}`);
  const json = await response.json();
  if (!Array.isArray(json) || json.length === 0 || !json[0].valor) {
    throw new Error('Sin TRM para esa fecha en BanRep');
  }
  return parseFloat(json[0].valor);
}

/**
 * Fetches the USD→COP exchange rate (TRM).
 * Uses the official Banco de la República API for historical dates.
 * Falls back to open.er-api.com (live rate) when BanRep is unavailable.
 *
 * @param {string} date - YYYY-MM-DD of the expense
 * @returns {Promise<{ trm: number|null, source: string, fetchedAt: string|null }>}
 */
export async function fetchTRM(date) {
  // Try official historical TRM first when a date is provided
  if (date) {
    try {
      const trm = await fetchTRMFromBanRep(date);
      return {
        trm,
        source: 'Banco de la República',
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.warn('[fetchTRM] BanRep API failed, using fallback:', err.message);
    }
  }

  // Fallback: open.er-api.com (live rate — acceptable for today's expenses)
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
    console.error('[fetchTRM] Both APIs failed:', err);
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
