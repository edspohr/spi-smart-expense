import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useTenantSettings } from '../context/SettingsContext';
import { updateSettings } from '../lib/userAdmin';
import { PinCancelled } from '../lib/pin';
import { CATEGORIES_COMMON } from '../lib/constants';
import { country } from '../lib/country';
import type { AccountingSettings, CostCentreSource } from '../../functions/src/accounting.logic';

const SOURCES: { value: CostCentreSource; label: string }[] = [
  { value: 'projectCode', label: 'Código del centro de costo' },
  { value: 'projectName', label: 'Nombre del centro de costo' },
  { value: 'none', label: 'No enviar centro de costo' },
];

interface Draft {
  liabilityAccount: string;
  companyCardAccount: string;
  vatAccount: string;
  vatPercent: string;
  docTypes: string;
  costCentreSource: CostCentreSource;
  categoryAccounts: Record<string, string>;
}

const toDraft = (a: AccountingSettings): Draft => ({
  liabilityAccount: a.liabilityAccount ?? '',
  companyCardAccount: a.companyCardAccount ?? '',
  vatAccount: a.vatAccount ?? '',
  vatPercent: a.vatRate ? String(Math.round(a.vatRate * 10000) / 100) : '',
  docTypes: a.recoverableDocTypes.join(', '),
  costCentreSource: a.costCentreSource,
  categoryAccounts: { ...a.categoryAccounts },
});

const inputClass = 'mt-1 w-full rounded-lg border border-zinc-200 p-2 text-sm';

// Superadmin card (Ola 11): chart-of-accounts mapping used by
// /admin/accounting. Shown only while the accounting module is on.
export default function AccountingCard() {
  const { modules, accounting } = useTenantSettings();
  const [draft, setDraft] = useState<Draft>(() => toDraft(accounting));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(toDraft(accounting)), [accounting]);

  const categories = useMemo(
    () => [...new Set([...CATEGORIES_COMMON, ...Object.keys(accounting.categoryAccounts)])],
    [accounting.categoryAccounts],
  );
  const unmapped = categories.filter((c) => !draft.categoryAccounts[c]?.trim()).length;

  if (!modules.accounting) return null;

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const save = async () => {
    const percent = draft.vatPercent.trim() === '' ? 0 : Number(draft.vatPercent.replace(',', '.'));
    if (!Number.isFinite(percent) || percent < 0 || percent >= 100) {
      toast.error('El IVA debe ser un porcentaje entre 0 y 99.');
      return;
    }
    setSaving(true);
    try {
      await updateSettings({
        accounting: {
          liabilityAccount: draft.liabilityAccount.trim() || null,
          companyCardAccount: draft.companyCardAccount.trim() || null,
          vatAccount: draft.vatAccount.trim() || null,
          vatRate: percent / 100,
          recoverableDocTypes: draft.docTypes.split(/[,\s]+/).filter(Boolean),
          costCentreSource: draft.costCentreSource,
          categoryAccounts: Object.fromEntries(
            Object.entries(draft.categoryAccounts).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v),
          ),
        },
      });
      toast.success('Mapeo contable guardado.');
    } catch (err) {
      if (!(err instanceof PinCancelled)) toast.error(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-zinc-100">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <BookOpenCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold text-zinc-900">Mapeo contable</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Cuentas que usa "Exportar a contabilidad". Una rendición sin cuenta para su categoría no se exporta.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-zinc-700">
          Cuenta por pagar al personal
          <input className={inputClass} value={draft.liabilityAccount} onChange={(e) => set({ liabilityAccount: e.target.value })} placeholder="p. ej. 2-1-05-001" />
        </label>
        <label className="text-sm text-zinc-700">
          Cuenta de tarjeta corporativa
          <input className={inputClass} value={draft.companyCardAccount} onChange={(e) => set({ companyCardAccount: e.target.value })} placeholder="Gastos con tarjeta de la empresa" />
        </label>
        <label className="text-sm text-zinc-700">
          Cuenta de IVA crédito fiscal
          <input className={inputClass} value={draft.vatAccount} onChange={(e) => set({ vatAccount: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-zinc-700">
            IVA incluido (%)
            <input className={inputClass} inputMode="decimal" value={draft.vatPercent} onChange={(e) => set({ vatPercent: e.target.value })} placeholder={country.code === 'CL' ? '19' : '0'} />
          </label>
          <label className="text-sm text-zinc-700">
            Tipos con IVA recuperable
            <input className={inputClass} value={draft.docTypes} onChange={(e) => set({ docTypes: e.target.value })} placeholder={country.code === 'CL' ? '33' : ''} />
          </label>
        </div>
        <label className="text-sm text-zinc-700 sm:col-span-2">
          Centro de costo en el asiento
          <select className={inputClass} value={draft.costCentreSource} onChange={(e) => set({ costCentreSource: e.target.value as CostCentreSource })}>
            {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>
      {country.code === 'CL' && (
        <p className="mt-2 text-xs text-zinc-500">
          El IVA se separa solo en documentos de los tipos indicados (33 = factura electrónica) cuyo timbre no falló. Las boletas (39) van completas al gasto.
        </p>
      )}

      <h3 className="mt-5 text-sm font-semibold text-zinc-900">
        Cuenta de gasto por categoría {unmapped > 0 && <span className="font-normal text-amber-700">· {unmapped} sin cuenta</span>}
      </h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {categories.map((cat) => (
          <label key={cat} className="flex items-center gap-2 text-sm text-zinc-700">
            <span className="w-1/2 truncate" title={cat}>{cat}</span>
            <input
              aria-label={`Cuenta para ${cat}`}
              className="w-1/2 rounded-lg border border-zinc-200 p-1.5 text-sm"
              value={draft.categoryAccounts[cat] ?? ''}
              onChange={(e) => set({ categoryAccounts: { ...draft.categoryAccounts, [cat]: e.target.value } })}
            />
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-5 rounded-lg bg-cta-600 px-4 py-2 text-sm font-medium text-cta-fg hover:bg-cta-700 disabled:opacity-50"
      >
        {saving ? 'Guardando…' : 'Guardar mapeo'}
      </button>
    </section>
  );
}
