import { tenant } from './tenant';

// Wording of "Listo para terreno" per tenant (tenants/<id>.json →
// offline.context): field crews prepare for a site without coverage;
// travellers (SPI at trade fairs) prepare for a flight or roaming off.

export interface FieldReadyCopy {
  readyTitle: string;
  readyBody: string;
  readyToast: string;
  /** Installed app, kit not there yet: it prepares itself on the next open with signal. */
  pendingInstalled: string;
  /** Browser tab: the kit comes with installing the app (or the button). */
  pendingBrowser: string;
  icon: 'mountain' | 'plane';
}

const FIELD: FieldReadyCopy = {
  readyTitle: 'Listo para terreno',
  readyBody: 'Puedes rendir sin señal: la app lee la boleta en el teléfono.',
  readyToast: 'Listo para terreno: puedes rendir sin señal.',
  pendingInstalled: 'Se prepara sola al abrir la app con señal.',
  pendingBrowser: 'Instala la app y quedará lista para rendir sin señal.',
  icon: 'mountain',
};

const TRAVEL: FieldReadyCopy = {
  readyTitle: 'Listo para viajar',
  readyBody: 'Puedes rendir en el avión o sin datos: la app lee la boleta en el teléfono y la envía sola cuando vuelvas a tener señal.',
  readyToast: 'Listo para viajar: puedes rendir en el avión o sin datos.',
  pendingInstalled: 'Se prepara sola al abrir la app con wifi, antes de viajar.',
  pendingBrowser: 'Instala la app y quedará lista para rendir en el avión o sin datos.',
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
