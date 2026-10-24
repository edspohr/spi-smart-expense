// Tenant configuration is injected at build time by vite.config.js from
// tenants/<VITE_TENANT>.json. These are build-time defaults; runtime-editable
// settings (PIN toggle, approval policy) will live in Firestore from Ola 3.

export type BrandPalette = Record<'50' | '100' | '500' | '600' | '700' | '800' | '900', string>;

export type FxProvider = 'banrep' | 'mindicador' | 'open-er-api';

export interface TenantConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  branding: {
    logo: string;
    themeColor: string;
    palette: BrandPalette;
  };
  locale: {
    country: string;
    language: string;
    baseCurrency: string;
    currencies: string[];
    taxIdLabel: string;
    fxProvider: FxProvider;
  };
  auth: {
    googleLogin: boolean;
    bootstrapAdminEmails: string[];
  };
  modules: {
    bulkUpload: boolean;
    reports: boolean;
    reconciliation: boolean;
    balances: boolean;
  };
  security: {
    pinEnabled: boolean;
  };
}

declare const __TENANT__: TenantConfig;

export const tenant: TenantConfig = __TENANT__;

export function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

// Tailwind's `brand` palette reads `--brand-*` CSS variables (see index.css),
// so swapping the tenant palette requires no rebuild of utility classes.
export function applyTenantTheme(config: TenantConfig = tenant, root: HTMLElement = document.documentElement): void {
  for (const [step, hex] of Object.entries(config.branding.palette)) {
    root.style.setProperty(`--brand-${step}`, hexToRgbTriplet(hex));
  }
}
