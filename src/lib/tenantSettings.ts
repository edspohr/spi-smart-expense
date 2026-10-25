import { tenant, type TenantConfig } from './tenant';

// Runtime settings a superadmin edits in /admin/settings (Firestore
// settings/tenant). Build-time tenants/<id>.json values are the defaults, so
// a missing or unreadable doc never changes behaviour.
export type PinAction = 'approve' | 'reject' | 'delete' | 'export' | 'users' | 'settings';

export const PIN_ACTION_LABELS: Record<PinAction, string> = {
  approve: 'Aprobar rendiciones',
  reject: 'Rechazar rendiciones',
  delete: 'Eliminar rendiciones de otros',
  export: 'Exportar reportes',
  users: 'Gestionar usuarios y permisos',
  settings: 'Cambiar estos ajustes',
};

const ALL_ACTIONS = Object.keys(PIN_ACTION_LABELS) as PinAction[];

export interface TenantSettings {
  security: { pinEnabled: boolean; pinApprovalThreshold: number | null; pinActions: Record<PinAction, boolean> };
  modules: TenantConfig['modules'];
  ai: { dailyLimitUser: number | null; dailyLimitTenant: number | null };
  updatedAt?: string;
  updatedByName?: string;
}

export type ModuleKey = keyof TenantConfig['modules'];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  bulkUpload: 'Carga masiva',
  reports: 'Reportes',
  reconciliation: 'Conciliación',
  balances: 'Finanzas',
};

export const DEFAULT_SETTINGS: TenantSettings = {
  security: {
    pinEnabled: tenant.security.pinEnabled,
    pinApprovalThreshold: null,
    pinActions: Object.fromEntries(ALL_ACTIONS.map((a) => [a, true])) as Record<PinAction, boolean>,
  },
  modules: { ...tenant.modules },
  ai: { dailyLimitUser: null, dailyLimitTenant: null },
};

export function mergeSettings(doc: Record<string, unknown> | undefined | null): TenantSettings {
  if (!doc) return DEFAULT_SETTINGS;
  const security = (doc.security ?? {}) as Record<string, unknown>;
  const pinActions = (security.pinActions ?? {}) as Record<string, unknown>;
  const threshold = security.pinApprovalThreshold;
  const modules = (doc.modules ?? {}) as Partial<TenantSettings['modules']>;
  const ai = (doc.ai ?? {}) as Partial<TenantSettings['ai']>;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const int = (v: unknown) => (Number.isInteger(v) ? (v as number) : null);
  return {
    security: {
      pinEnabled: bool(security.pinEnabled, DEFAULT_SETTINGS.security.pinEnabled),
      pinApprovalThreshold: typeof threshold === 'number' && threshold >= 0 ? threshold : null,
      pinActions: Object.fromEntries(ALL_ACTIONS.map((a) => [a, pinActions[a] !== false])) as Record<PinAction, boolean>,
    },
    modules: {
      bulkUpload: bool(modules.bulkUpload, DEFAULT_SETTINGS.modules.bulkUpload),
      reports: bool(modules.reports, DEFAULT_SETTINGS.modules.reports),
      reconciliation: bool(modules.reconciliation, DEFAULT_SETTINGS.modules.reconciliation),
      balances: bool(modules.balances, DEFAULT_SETTINGS.modules.balances),
    },
    ai: { dailyLimitUser: int(ai.dailyLimitUser), dailyLimitTenant: int(ai.dailyLimitTenant) },
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : undefined,
    updatedByName: typeof doc.updatedByName === 'string' ? doc.updatedByName : undefined,
  };
}
