// Tenant configuration is injected at build time by vite.config.js from
// tenants/<VITE_TENANT>.json. These are build-time defaults; runtime-editable
// settings (PIN toggle, approval policy) will live in Firestore from Ola 3.

export type BrandPalette = Record<'50' | '100' | '500' | '600' | '700' | '800' | '900', string>;

export type FxProvider = 'banrep' | 'mindicador' | 'open-er-api';

/** Commercial landing around the login card (LoginLanding). */
export interface TenantLanding {
  eyebrow: string;
  headline: string;
  subheadline: string;
  highlights?: string[];
  /** icon: sparkles | workflow | offline | phone | budget | security */
  features: { icon: string; title: string; text: string }[];
  cta?: {
    title: string;
    text: string;
    primary: { label: string; url: string };
    secondary?: { label: string; url: string };
  };
  /** "How it works without signal" section, told from the user's side. */
  offline?: {
    eyebrow: string;
    title: string;
    intro: string;
    steps: { title: string; text: string }[];
    note?: string;
  };
  /** One-click demo by role (needs DEMO_MODE functions). */
  demo?: {
    title: string;
    text: string;
    roles: { role: 'worker' | 'manager' | 'finance'; label: string; description: string; path: string }[];
  };
}

/** "Powered by" badge for the platform vendor. */
export interface TenantPoweredBy {
  name: string;
  logo: string;
  url: string;
}

export interface TenantConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  // Must match FUNCTIONS_REGION in functions/.env.<projectId> (Firestore location).
  functionsRegion: string;
  branding: {
    logo: string;
    // Square symbol used for app icons (scripts/generate-icons.py); defaults to logo.
    icon?: string;
    /** Shared design tokens this tenant follows, e.g. design/growth-buddies-light. */
    designSystem?: string;
    /** Primary call-to-action colour (600/700); green when absent. */
    ctaPalette?: Partial<Record<'600' | '700' | 'fg', string>>;
    /** App frame (sidebar, header, landing): 'light' (default) or Growth Buddies 'ink'. */
    chrome?: 'light' | 'ink';
    /** Script that owns this tenant's PWA icons (generate-icons.py skips it). */
    iconsBy?: string;
    // Short product name shown in the login card and the sidebar.
    productName: string;
    legalName: string;
    emailPlaceholder: string;
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
    // false = no public "Regístrate aquí": people join only by invitation.
    selfSignup: boolean;
  };
  // Paying entities shown in "Empresa tarjeta" (empty list hides nothing).
  cardCompanies: string[];
  landing?: TenantLanding;
  poweredBy?: TenantPoweredBy;
  /** Starter cost centres offered by "Cargar centros por defecto" (AdminProjects). */
  defaultProjects?: { code: string; name: string; client: string }[];
  // Expense categories; omitted = the historical SPI list.
  categories?: string[];
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
  for (const [step, hex] of Object.entries(config.branding.ctaPalette ?? {})) {
    root.style.setProperty(`--cta-${step}`, hexToRgbTriplet(hex));
  }
  if (config.branding.chrome === 'ink') root.setAttribute('data-chrome', 'ink');
  else root.removeAttribute('data-chrome');
}
