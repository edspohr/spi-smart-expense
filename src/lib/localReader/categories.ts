import { normalizeText } from './rules';
import type { LocalField } from './types';

// Guesses a category from receipt text, mapped onto the tenant's own
// category names (each tenant names them differently: COMBUSTIBLE vs
// GASOLINA, PEAJES Y TAG vs PEAJES...).

interface Concept {
  keywords: RegExp;
  /** Fragments that identify the concept in a tenant category name. */
  aliases: string[];
}

const CONCEPTS: Concept[] = [
  { keywords: /COPEC|SHELL|PETROBRAS|ARAMCO|ENEX|TERPEL|PRIMAX|BENCINA|GASOLINA|DIESEL|PETROLEO|COMBUSTIBLE|OCTANOS|\b9[3-7]\b OCT/, aliases: ['COMBUSTIBLE', 'GASOLINA', 'CARBURANTE'] },
  { keywords: /PEAJE|AUTOPISTA|\bTAG\b|CONCESION|RUTA \d|VIAS?\b.*CONCES/, aliases: ['PEAJE'] },
  { keywords: /ESTACIONAMIENTO|PARKING|PARQUEADERO/, aliases: ['ESTACIONAMIENTO', 'PARQUEADERO', 'PARKING'] },
  { keywords: /HOTEL|HOSTAL|HOSPEDAJE|APART|MOTEL|ALOJAMIENTO|CABANA/, aliases: ['ALOJAMIENTO', 'HOTEL', 'HOSPEDAJE'] },
  { keywords: /LATAM|SKY AIRLINE|JETSMART|AVIANCA|AEROLINEA|PASAJE AEREO|VUELO/, aliases: ['PASAJES AEREOS', 'AEREO', 'TIQUETE', 'VUELO'] },
  { keywords: /UBER|CABIFY|DIDI|TAXI|TURBUS|PULLMAN|BUSES|TRANSPORTE|ARRIENDO DE VEHICULO|RENT A CAR/, aliases: ['TRANSPORTE TERRESTRE', 'TRANSPORTE', 'TAXI', 'MOVILIZACION'] },
  { keywords: /RESTAUR|ALMUERZO|COLACION|CAFE|CAFETERIA|COMIDA|SANDWICH|MENU|PIZZ|SUSHI|BEBIDA|PANADERIA|FUENTE DE SODA|SUPERMERCADO|MINIMARKET/, aliases: ['ALIMENTACION', 'ALIMENTOS', 'COMIDA', 'RESTAURANTE', 'COLACION'] },
  { keywords: /FERRETERIA|SODIMAC|EASY|CONSTRUMART|IMPERIAL|HOMECENTER|HERRAMIENTA|MATERIALES|TORNILL|PERNO/, aliases: ['MATERIALES', 'HERRAMIENTA', 'FERRETERIA'] },
  { keywords: /\bEPP\b|SEGURIDAD INDUSTRIAL|GUANTES|CASCO|ZAPATO DE SEGURIDAD|CHALECO REFLECT/, aliases: ['EPP', 'SEGURIDAD'] },
  { keywords: /ENTEL|MOVISTAR|\bWOM\b|CLARO|TIGO|STARLINK|INTERNET|TELEFONIA|RECARGA/, aliases: ['TELEFONIA', 'INTERNET', 'COMUNICACION', 'CELULAR'] },
  { keywords: /LIBRERIA|PAPELERIA|FOTOCOPIA|IMPRESION|UTILES DE OFICINA|CORREOS/, aliases: ['PAPELERIA', 'UTILES', 'OFICINA', 'LIBRERIA'] },
];

/** Finds the tenant category whose name contains one of the concept aliases. */
function matchTenantCategory(concept: Concept, categories: string[]): string | undefined {
  const norm = categories.map((c) => ({ name: c, n: normalizeText(c) }));
  for (const alias of concept.aliases) {
    const hit = norm.find((c) => c.n.includes(alias));
    if (hit) return hit.name;
  }
  return undefined;
}

export function guessCategory(text: string, categories: string[]): LocalField | undefined {
  if (!categories.length) return undefined;
  const t = normalizeText(text);
  for (const concept of CONCEPTS) {
    if (!concept.keywords.test(t)) continue;
    const name = matchTenantCategory(concept, categories);
    if (name) return { value: name, confidence: 'medium', source: 'keyword' };
  }
  return undefined;
}
