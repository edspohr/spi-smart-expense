import { tenant } from './tenant';

// Wording of "Listo para terreno" per tenant (tenants/<id>.json →
// offline.context): field crews prepare for a site without coverage;
// travellers (SPI at trade fairs) prepare for a flight or roaming off.

export interface FieldReadyCopy {
  readyTitle: string;
  prepareTitle: string;
  prepareButton: string;
  readyBody: string;
  prepareBody: string;
  readyToast: string;
  homeNudge: string;
  icon: 'mountain' | 'plane';
}

const FIELD: FieldReadyCopy = {
  readyTitle: 'Listo para terreno',
  prepareTitle: 'Prepara la app para terreno',
  prepareButton: 'Preparar para terreno',
  readyBody: 'Puedes rendir sin señal: la app lee la boleta en el teléfono.',
  prepareBody: 'Descarga ahora, con buena señal, lo necesario para rendir y leer boletas sin conexión (unos 7 MB, una sola vez).',
  readyToast: 'Listo para terreno: puedes rendir sin señal.',
  homeNudge: '¿Vas a terreno? Prepara la app para rendir sin señal.',
  icon: 'mountain',
};

const TRAVEL: FieldReadyCopy = {
  readyTitle: 'Listo para viajar',
  prepareTitle: 'Prepara la app para tu viaje',
  prepareButton: 'Preparar para el viaje',
  readyBody: 'Puedes rendir en el avión o sin datos: la app lee la boleta en el teléfono y la envía sola cuando vuelvas a tener señal.',
  prepareBody: 'Antes de viajar, con wifi, descarga lo necesario para rendir y leer boletas sin conexión (unos 7 MB, una sola vez).',
  readyToast: 'Listo para viajar: puedes rendir en el avión o sin datos.',
  homeNudge: '¿Viajas pronto? Prepara la app para rendir en el avión o sin datos.',
  icon: 'plane',
};

export const fieldReadyCopy: FieldReadyCopy = tenant.offline?.context === 'travel' ? TRAVEL : FIELD;

export function ago(iso: string | null): string {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}
