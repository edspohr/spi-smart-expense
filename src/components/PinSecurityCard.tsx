import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { useTenantSettings } from '../context/SettingsContext';
import { RESPONSIBILITY_TEXT, setOwnPin } from '../lib/pin';

// "Seguridad" card in Mi Espacio: create or change the personal PIN. Hidden
// while the tenant has the PIN off and the person never created one, so the
// feature is invisible until a superadmin enables it.
export default function PinSecurityCard() {
  const { profile } = useAuth() as unknown as { profile: { hasPin?: boolean; pinDisabled?: boolean; pinSetAt?: string } | null };
  const { security } = useTenantSettings();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasPin = profile?.hasPin === true;
  if (!security.pinEnabled && !hasPin) return null;

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);
  const valid = /^\d{4}$/.test(pin) && pin === confirm && accepted;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await setOwnPin(pin);
      toast.success(hasPin ? 'PIN actualizado.' : 'PIN creado.');
      setPin('');
      setConfirm('');
      setAccepted(false);
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const status = profile?.pinDisabled
    ? { text: 'Desactivado por intentos fallidos: crea uno nuevo.', className: 'text-red-600' }
    : hasPin
      ? { text: `Activo${profile?.pinSetAt ? ` desde el ${new Date(profile.pinSetAt).toLocaleDateString('es-CO')}` : ''}.`, className: 'text-emerald-700' }
      : { text: 'Aún no tienes PIN. Lo necesitarás para aprobar, eliminar o exportar.', className: 'text-amber-700' };

  const inputClass = 'w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-center text-xl tracking-[0.5em] font-semibold focus-ring';

  return (
    <section id="seguridad" className="rounded-2xl bg-white p-5 shadow-soft border border-slate-100">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
            {hasPin ? <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden="true" /> : <KeyRound className="h-4 w-4 text-brand-600" aria-hidden="true" />}
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-800">Seguridad</h2>
            <p className={`text-sm ${status.className}`}>PIN de 4 dígitos: {status.text}</p>
          </div>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-ring"
          >
            {hasPin && !profile?.pinDisabled ? 'Cambiar PIN' : 'Crear PIN'}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Nuevo PIN</span>
              <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(digits(e.target.value))} className={inputClass} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Repetir</span>
              <input type="password" inputMode="numeric" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} className={inputClass} />
            </label>
          </div>
          {confirm.length === 4 && pin !== confirm && <p className="text-sm text-red-600">Los PIN no coinciden.</p>}
          <p className="text-xs text-zinc-500">No uses números repetidos (1111), correlativos (1234) ni años.</p>
          <label className="flex items-start gap-2 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-brand-600 focus-ring" />
            <span>{RESPONSIBILITY_TEXT}</span>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 focus-ring">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!valid || saving}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 focus-ring disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Guardar PIN
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
