/**
 * Exchange Rate utilities for capturing conversion rates to COP.
 *
 * USD:
 *   Primary: datos.gov.co (Banco de la República — official historical TRM).
 *   Fallback: open.er-api.com (live rate).
 * EUR:
 *   Uses open.er-api.com (EUR base → rates.COP). Live rate at time of query;
 *   BanRep does not publish an official historical EUR→COP series comparable
 *   to the USD TRM, so past EUR gastos capture the spot rate at edit time.
 * Other currencies: unsupported (returns rate = null).
 */

const BANREP_API = 'https://www.datos.gov.co/resource/32sa-8pi3.json';
const ER_API_BASE = 'https://open.er-api.com/v6/latest';

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

async function fetchLiveRateToCOP(base) {
  const response = await fetch(`${ER_API_BASE}/${base}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  if (json.result !== 'success' || !json.rates?.COP) {
    throw new Error('Respuesta inesperada de la API de tasas');
  }
  return json.rates.COP;
}

/**
 * Fetches the conversion rate from `currency` to COP.
 *
 * @param {string} currency - 'USD' | 'EUR' | (others → unsupported)
 * @param {string} date - YYYY-MM-DD of the expense (used only for USD historical)
 * @returns {Promise<{ rate: number|null, source: string, fetchedAt: string|null }>}
 */
export async function fetchRate(currency, date) {
  if (currency === 'COP') {
    return { rate: 1, source: 'identity', fetchedAt: new Date().toISOString() };
  }

  if (currency === 'USD') {
    // Try official historical TRM first when a date is provided
    if (date) {
      try {
        const rate = await fetchTRMFromBanRep(date);
        return { rate, source: 'Banco de la República', fetchedAt: new Date().toISOString() };
      } catch (err) {
        console.warn('[fetchRate USD] BanRep API failed, using fallback:', err.message);
      }
    }
    try {
      const rate = await fetchLiveRateToCOP('USD');
      return { rate, source: 'open.er-api.com', fetchedAt: new Date().toISOString() };
    } catch (err) {
      console.error('[fetchRate USD] Both APIs failed:', err);
      return { rate: null, source: 'error', fetchedAt: null };
    }
  }

  if (currency === 'EUR') {
    try {
      const rate = await fetchLiveRateToCOP('EUR');
      return { rate, source: 'open.er-api.com', fetchedAt: new Date().toISOString() };
    } catch (err) {
      console.error('[fetchRate EUR] API failed:', err);
      return { rate: null, source: 'error', fetchedAt: null };
    }
  }

  return { rate: null, source: 'unsupported', fetchedAt: null };
}

/**
 * Backwards-compatible USD-only wrapper. Returns `{ trm, source, fetchedAt }`
 * (keeps the historical field name for callers not yet migrated).
 */
export async function fetchTRM(date) {
  const { rate, source, fetchedAt } = await fetchRate('USD', date);
  return { trm: rate, source, fetchedAt };
}

/**
 * Calculates the COP equivalent for a foreign-currency amount given a rate.
 * @param {number|string} amount
 * @param {number|null} rate
 * @returns {number|null}
 */
export function calculateCOPEquivalent(amount, rate) {
  const amt = Number(amount);
  const r = Number(rate);
  if (!r || !amt || isNaN(amt) || isNaN(r)) return null;
  return Math.round(amt * r);
}
