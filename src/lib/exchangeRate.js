/**
 * Exchange rates from a foreign currency to the tenant's base currency.
 *
 * Providers (tenants/<id>.json → locale.fxProvider):
 *   banrep      — base COP. USD: datos.gov.co (Banco de la República,
 *                 official historical TRM); EUR and others: open.er-api spot.
 *   mindicador  — base CLP. USD/EUR: mindicador.cl (Banco Central de Chile
 *                 series, historical by date); others: open.er-api spot.
 *   open-er-api — any base, spot rate at the moment of the query.
 * Every provider falls back to open.er-api spot when the official source
 * fails. Returns { rate, source, fetchedAt }; rate is null when unavailable.
 */
import { tenant } from './tenant';

const BANREP_API = 'https://www.datos.gov.co/resource/32sa-8pi3.json';
const ER_API_BASE = 'https://open.er-api.com/v6/latest';
const MINDICADOR_API = 'https://mindicador.cl/api';

const BASE = tenant.locale.baseCurrency;
const PROVIDER = tenant.locale.fxProvider;

async function fetchTRMFromBanRep(date) {
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

// mindicador.cl publishes daily values; weekends/holidays have no entry, so
// walk back up to a week to the last published value.
async function fetchFromMindicador(currency, date) {
  const indicator = { USD: 'dolar', EUR: 'euro' }[currency];
  if (!indicator) throw new Error(`mindicador no publica ${currency}`);
  const start = date ? new Date(`${date}T12:00:00`) : new Date();
  for (let back = 0; back < 7; back++) {
    const d = new Date(start);
    d.setDate(d.getDate() - back);
    const ddmmyyyy = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    const response = await fetch(`${MINDICADOR_API}/${indicator}/${ddmmyyyy}`);
    if (!response.ok) throw new Error(`mindicador HTTP ${response.status}`);
    const json = await response.json();
    const value = json?.serie?.[0]?.valor;
    if (value) return Number(value);
  }
  throw new Error('Sin valor publicado en mindicador para esa semana');
}

async function fetchSpotRate(currency, base) {
  const response = await fetch(`${ER_API_BASE}/${currency}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  if (json.result !== 'success' || !json.rates?.[base]) {
    throw new Error('Respuesta inesperada de la API de tasas');
  }
  return json.rates[base];
}

const now = () => new Date().toISOString();

/**
 * @param {string} currency - currency of the expense
 * @param {string} date - YYYY-MM-DD of the expense (historical sources)
 * @param {string} [base] - target currency, defaults to the tenant's base
 * @returns {Promise<{ rate: number|null, source: string, fetchedAt: string|null }>}
 */
export async function fetchRate(currency, date, base = BASE) {
  if (!currency || currency === base) return { rate: 1, source: 'identity', fetchedAt: now() };

  const official =
    PROVIDER === 'banrep' && base === 'COP' && currency === 'USD' && date
      ? { name: 'Banco de la República', fn: () => fetchTRMFromBanRep(date) }
      : PROVIDER === 'mindicador' && base === 'CLP' && (currency === 'USD' || currency === 'EUR')
        ? { name: 'Banco Central de Chile (mindicador.cl)', fn: () => fetchFromMindicador(currency, date) }
        : null;

  if (official) {
    try {
      return { rate: await official.fn(), source: official.name, fetchedAt: now() };
    } catch (err) {
      console.warn(`[fetchRate ${currency}→${base}] ${official.name} failed, using spot:`, err.message);
    }
  }
  try {
    return { rate: await fetchSpotRate(currency, base), source: 'open.er-api.com', fetchedAt: now() };
  } catch (err) {
    console.error(`[fetchRate ${currency}→${base}] spot API failed:`, err);
    return { rate: null, source: 'error', fetchedAt: null };
  }
}

/**
 * Backwards-compatible USD wrapper. Returns `{ trm, source, fetchedAt }`.
 */
export async function fetchTRM(date) {
  const { rate, source, fetchedAt } = await fetchRate('USD', date);
  return { trm: rate, source, fetchedAt };
}

/**
 * Base-currency equivalent of a foreign amount given a rate.
 * @param {number|string} amount
 * @param {number|null} rate
 * @returns {number|null}
 */
export function calculateBaseEquivalent(amount, rate) {
  const amt = Number(amount);
  const r = Number(rate);
  if (!r || !amt || isNaN(amt) || isNaN(r)) return null;
  return Math.round(amt * r);
}

// Historical name kept for callers written when the base was always COP.
export const calculateCOPEquivalent = calculateBaseEquivalent;
