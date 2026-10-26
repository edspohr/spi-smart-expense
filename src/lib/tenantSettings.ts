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

export interface ApprovalPolicy {
  mode: 'single' | 'levels';
  autoApproveBelow: number | null;
  managerApproval: boolean;
  secondSignatureAbove: number | null;
  allowDelegation: boolean;
  staleReminders: boolean;
  staleDays: number;
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  mode: 'single',
  autoApproveBelow: null,
  managerApproval: true,
  secondSignatureAbove: null,
  allowDelegation: true,
  staleReminders: false,
  staleDays: 7,
};

export interface TenantSettings {
  approvalPolicy: ApprovalPolicy;
  security: { pinEnabled: boolean; pinApprovalThreshold: number | null; pinActions: Record<PinAction, boolean> };
  modules: TenantConfig['modules'];
  ai: { dailyLimitUser: number | null; dailyLimitTenant: number | null; localFirst: boolean };
  /** Ola 8: on-device receipt reading and "Listo para terreno". Off by default. */
  /** Ola 8: on-device reader; shadowRead measures it on every online expense (8b). */
  offline: { localReader: boolean; shadowRead: boolean };
  /** Ola 8c: consent to share derived data across clients (ADR 0016). */
  learning: {
    shareDerived: boolean;
    termsVersion: string | null;
    acceptedAt: string | null;
    acceptedByName: string | null;
  };
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
  approvalPolicy: DEFAULT_APPROVAL_POLICY,
  security: {
    pinEnabled: tenant.security.pinEnabled,
    pinApprovalThreshold: null,
    pinActions: Object.fromEntries(ALL_ACTIONS.map((a) => [a, true])) as Record<PinAction, boolean>,
  },
  modules: { ...tenant.modules },
  ai: { dailyLimitUser: null, dailyLimitTenant: null, localFirst: false },
  offline: { localReader: false, shadowRead: false },
  learning: { shareDerived: false, termsVersion: null, acceptedAt: null, acceptedByName: null },
};

export function mergeSettings(doc: Record<string, unknown> | undefined | null): TenantSettings {
  if (!doc) return DEFAULT_SETTINGS;
  const security = (doc.security ?? {}) as Record<string, unknown>;
  const pinActions = (security.pinActions ?? {}) as Record<string, unknown>;
  const threshold = security.pinApprovalThreshold;
  const modules = (doc.modules ?? {}) as Partial<TenantSettings['modules']>;
  const ai = (doc.ai ?? {}) as Partial<TenantSettings['ai']>;
  const learning = (doc.learning ?? {}) as Record<string, unknown>;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const int = (v: unknown) => (Number.isInteger(v) ? (v as number) : null);
  const amount = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  const ap = (doc.approvalPolicy ?? {}) as Record<string, unknown>;
  return {
    approvalPolicy: {
      mode: ap.mode === 'levels' ? 'levels' : 'single',
      autoApproveBelow: amount(ap.autoApproveBelow),
      managerApproval: ap.managerApproval !== false,
      secondSignatureAbove: amount(ap.secondSignatureAbove),
      allowDelegation: ap.allowDelegation !== false,
      staleReminders: ap.staleReminders === true,
      staleDays: Number.isInteger(ap.staleDays) && (ap.staleDays as number) > 0 ? (ap.staleDays as number) : DEFAULT_APPROVAL_POLICY.staleDays,
    },
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
    ai: { dailyLimitUser: int(ai.dailyLimitUser), dailyLimitTenant: int(ai.dailyLimitTenant), localFirst: ai.localFirst === true },
    offline: {
      localReader: (doc.offline as { localReader?: unknown } | undefined)?.localReader === true,
      shadowRead: (doc.offline as { shadowRead?: unknown } | undefined)?.shadowRead === true,
    },
    learning: {
      shareDerived: learning.shareDerived === true,
      termsVersion: typeof learning.termsVersion === 'string' ? learning.termsVersion : null,
      acceptedAt: typeof learning.acceptedAt === 'string' ? learning.acceptedAt : null,
      acceptedByName: typeof learning.acceptedByName === 'string' ? learning.acceptedByName : null,
    },
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : undefined,
    updatedByName: typeof doc.updatedByName === 'string' ? doc.updatedByName : undefined,
  };
}
