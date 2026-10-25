import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { GitBranch, Loader2 } from 'lucide-react';
import { useTenantSettings } from '../context/SettingsContext';
import { updateSettings } from '../lib/userAdmin';
import { PinCancelled } from '../lib/pin';
import { tenant } from '../lib/tenant';

type Draft = {
  mode: 'single' | 'levels';
  managerApproval: boolean;
  allowDelegation: boolean;
  staleReminders: boolean;
  autoApproveBelow: string;
  secondSignatureAbove: string;
  staleDays: string;
};

// Approval policy editor (settings/tenant.approvalPolicy). "Simple" keeps the
// historical flow; "Por niveles" adds the submitter's manager before finance,
// an optional second finance signature and delegation.
export default function ApprovalPolicyCard() {
  const { approvalPolicy: policy } = useTenantSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      mode: policy.mode,
      managerApproval: policy.managerApproval,
      allowDelegation: policy.allowDelegation,
      staleReminders: policy.staleReminders,
      autoApproveBelow: policy.autoApproveBelow?.toString() ?? '',
      secondSignatureAbove: policy.secondSignatureAbove?.toString() ?? '',
      staleDays: String(policy.staleDays),
    });
  }, [policy]);

  if (!draft) return null;
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const amount = (v: string) => (v.trim() === '' ? null : Number(v));
  const digits = (v: string) => v.replace(/[^\d]/g, '');

  async function save() {
    if (!draft) return;
    const staleDays = Number(draft.staleDays);
    if (!Number.isInteger(staleDays) || staleDays < 1 || staleDays > 90) {
      toast.error('Los días para recordar deben estar entre 1 y 90.');
      return;
    }
    setSaving(true);
    try {
      await updateSettings({
        approvalPolicy: {
          mode: draft.mode,
          managerApproval: draft.managerApproval,
          allowDelegation: draft.allowDelegation,
          staleReminders: draft.staleReminders,
          autoApproveBelow: amount(draft.autoApproveBelow),
          secondSignatureAbove: amount(draft.secondSignatureAbove),
          staleDays,
        },
      });
      toast.success('Política de aprobación guardada. Aplica a las rendiciones nuevas.');
    } catch (err) {
      if (!(err instanceof PinCancelled)) toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const cur = tenant.locale.baseCurrency;
  const input = 'w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus-ring';
  const check = 'h-4 w-4 rounded border-zinc-300 text-brand-600 focus-ring';
  const levels = draft.mode === 'levels';

  return (
    <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-zinc-100">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
          <GitBranch className="h-4 w-4 text-brand-600" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-800">Política de aprobación</h2>
          <p className="text-sm text-zinc-500">Quién aprueba cada rendición. Los cambios aplican a las rendiciones que se creen desde ahora.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Modo de aprobación">
          {(
            [
              ['single', 'Simple', 'Un administrador o aprobador decide en un paso (como hoy).'],
              ['levels', 'Por niveles', 'Primero el responsable de quien rinde, luego finanzas.'],
            ] as const
          ).map(([value, label, help]) => (
            <label key={value} className={`cursor-pointer rounded-xl p-3 ring-1 ${draft.mode === value ? 'bg-brand-50 ring-brand-300' : 'ring-zinc-200 hover:bg-zinc-50'}`}>
              <input type="radio" name="approval-mode" value={value} checked={draft.mode === value} onChange={() => set({ mode: value })} className="sr-only" />
              <span className="block text-sm font-semibold text-zinc-800">{label}</span>
              <span className="block text-xs text-zinc-500">{help}</span>
            </label>
          ))}
        </div>

        <div className={`space-y-2 ${levels ? '' : 'opacity-60'}`}>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" className={check} disabled={!levels} checked={draft.managerApproval} onChange={(e) => set({ managerApproval: e.target.checked })} />
            Requiere aprobación del responsable (se asigna en Usuarios)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" className={check} disabled={!levels} checked={draft.allowDelegation} onChange={(e) => set({ allowDelegation: e.target.checked })} />
            Permitir que un responsable delegue sus aprobaciones temporalmente
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Segunda firma de finanzas desde ({cur})</span>
            <input inputMode="numeric" disabled={!levels} value={draft.secondSignatureAbove} onChange={(e) => set({ secondSignatureAbove: digits(e.target.value) })} placeholder="Vacío = nunca" className={input} />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Aprobar automáticamente bajo ({cur})</span>
          <input inputMode="numeric" value={draft.autoApproveBelow} onChange={(e) => set({ autoApproveBelow: digits(e.target.value) })} placeholder="Vacío = nunca" className={input} />
          <span className="mt-1 block text-xs text-zinc-500">Queda registrado en el historial como aprobación automática.</span>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem] sm:items-end">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" className={check} checked={draft.staleReminders} onChange={(e) => set({ staleReminders: e.target.checked })} />
            Recordar a los aprobadores las rendiciones pendientes (días hábiles, 8:00)
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Después de (días)</span>
            <input inputMode="numeric" value={draft.staleDays} onChange={(e) => set({ staleDays: digits(e.target.value) })} className={input} />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-ring disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Guardar política
          </button>
        </div>
      </div>
    </section>
  );
}
