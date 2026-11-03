import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useTenantSettings } from '../context/SettingsContext';
import { updateSettings } from '../lib/userAdmin';
import { PinCancelled } from '../lib/pin';
import type { TedVerificationMode } from '../lib/tenantSettings';

const MODES: { value: TedVerificationMode; label: string }[] = [
  { value: 'off', label: 'Desactivada' },
  { value: 'advisory', label: 'Informativa: muestra el resultado y permite enviar' },
  { value: 'required', label: 'Obligatoria: bloquea un timbre que no verifica' },
];

// Superadmin card (Ola 10), shown only to Chilean tenants.
export default function FiscalCard() {
  const { fiscal } = useTenantSettings();
  const [saving, setSaving] = useState(false);

  const save = async (tedVerification: TedVerificationMode) => {
    setSaving(true);
    try {
      await updateSettings({ fiscal: { tedVerification } });
      toast.success('Verificación del timbre actualizada.');
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
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold text-zinc-900">Verificación del timbre SII</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Comprueba las firmas del timbre electrónico de cada boleta, incluso sin conexión. No consulta al SII ni el Registro de Compras.
          </p>
        </div>
      </div>
      <select
        aria-label="Modo de verificación del timbre"
        className="mt-4 w-full rounded-lg border border-zinc-200 p-2 text-sm"
        value={fiscal.tedVerification}
        disabled={saving}
        onChange={(e) => save(e.target.value as TedVerificationMode)}
      >
        {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
    </section>
  );
}
