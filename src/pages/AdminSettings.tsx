import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, LayoutGrid, Loader2, Sparkles } from 'lucide-react';
import Layout from '../components/Layout';
import { useTenantSettings } from '../context/SettingsContext';
import { MODULE_LABELS, PIN_ACTION_LABELS, type ModuleKey, type PinAction, type TenantSettings } from '../lib/tenantSettings';
import { useAuth } from '../context/useAuth';
import { PinCancelled, listPinLog, type PinLogEntry } from '../lib/pin';
import { updateSettings } from '../lib/userAdmin';
import { tenant } from '../lib/tenant';
import ApprovalPolicyCard from '../components/ApprovalPolicyCard';
import OfflineReaderCard from '../components/OfflineReaderCard';

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-ring disabled:opacity-50 ${
        checked ? 'bg-brand-600' : 'bg-zinc-300'
      }`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function Card({ icon: Icon, title, description, children }: { icon: typeof KeyRound; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-zinc-100">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
          <Icon className="h-4 w-4 text-brand-600" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-800">{title}</h2>
          <p className="text-sm text-zinc-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

const LOG_ACTION_LABELS: Record<string, string> = {
  approve: 'Aprobar',
  reject: 'Rechazar',
  delete: 'Eliminar rendición',
  export: 'Exportar',
  users: 'Gestión de usuarios',
  settings: 'Ajustes',
  pin_creado: 'Creó su PIN',
  pin_restablecido: 'PIN restablecido',
};

const LOG_REASON_LABELS: Record<string, string> = {
  invalid: 'PIN incorrecto',
  'locked-now': 'Bloqueado (15 min)',
  locked: 'Intento con PIN bloqueado',
  'disabled-now': 'PIN desactivado',
  disabled: 'Intento con PIN desactivado',
};

export default function AdminSettings() {
  const settings = useTenantSettings();
  const { profile } = useAuth() as unknown as { profile: { hasPin?: boolean } | null };
  const ownHasPin = profile?.hasPin === true;
  const [saving, setSaving] = useState<string | null>(null);
  const [limits, setLimits] = useState({ user: '', tenant: '' });
  const [threshold, setThreshold] = useState('');
  const [log, setLog] = useState<PinLogEntry[] | null>(null);

  useEffect(() => {
    setThreshold(settings.security.pinApprovalThreshold?.toString() ?? '');
  }, [settings.security.pinApprovalThreshold]);

  async function loadLog() {
    try {
      setLog(await listPinLog());
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  useEffect(() => {
    setLimits({
      user: settings.ai.dailyLimitUser?.toString() ?? '',
      tenant: settings.ai.dailyLimitTenant?.toString() ?? '',
    });
  }, [settings.ai.dailyLimitUser, settings.ai.dailyLimitTenant]);

  async function save(key: string, patch: Parameters<typeof updateSettings>[0], message: string) {
    setSaving(key);
    try {
      await updateSettings(patch);
      toast.success(message);
    } catch (err) {
      if (!(err instanceof PinCancelled)) toast.error((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  function saveLimits() {
    const parse = (v: string) => (v.trim() === '' ? undefined : Number(v));
    const user = parse(limits.user);
    const tenantLimit = parse(limits.tenant);
    if ([user, tenantLimit].some((n) => n !== undefined && (!Number.isInteger(n) || n < 0))) {
      toast.error('Los límites deben ser números enteros positivos.');
      return;
    }
    save('ai', { ai: { dailyLimitUser: user, dailyLimitTenant: tenantLimit } }, 'Límites de IA actualizados.');
  }

  const modules = Object.keys(MODULE_LABELS) as ModuleKey[];
  const lastUpdate = (s: TenantSettings) =>
    s.updatedAt ? `Última modificación: ${new Date(s.updatedAt).toLocaleString('es-CO')}${s.updatedByName ? ` por ${s.updatedByName}` : ''}` : null;

  return (
    <Layout title="Ajustes">
      <div className="max-w-3xl space-y-6">
        <p className="text-sm text-zinc-500">
          Configuración de {tenant.name}. Los cambios se aplican al instante en todas las sesiones abiertas.
          {lastUpdate(settings) && <span className="block text-xs text-zinc-400 mt-1">{lastUpdate(settings)}</span>}
        </p>

        <Card icon={KeyRound} title="PIN de seguridad" description="PIN personal de 4 dígitos, verificado en el servidor, para autorizar acciones sensibles.">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl bg-zinc-50 p-4">
              <div>
                <p className="text-sm font-medium text-zinc-800">Exigir PIN en acciones sensibles</p>
                <p className="text-xs text-zinc-500">
                  {ownHasPin
                    ? 'Cada persona crea su PIN en Mi Espacio; se le pide al momento de la acción y se recuerda 2 minutos.'
                    : 'Primero crea tu propio PIN en Mi Espacio → Seguridad.'}
                </p>
              </div>
              <Toggle
                label="Exigir PIN"
                checked={settings.security.pinEnabled}
                disabled={saving === 'pin' || (!ownHasPin && !settings.security.pinEnabled)}
                onChange={(v) => save('pin', { security: { pinEnabled: v } }, v ? 'PIN activado para toda la organización.' : 'PIN desactivado.')}
              />
            </div>

            <div className={settings.security.pinEnabled ? '' : 'opacity-60'}>
              <p className="mb-2 text-sm font-medium text-zinc-700">Acciones protegidas</p>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(Object.keys(PIN_ACTION_LABELS) as PinAction[]).map((a) => (
                  <li key={a}>
                    <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
                      <input
                        type="checkbox"
                        checked={settings.security.pinActions[a]}
                        disabled={saving === `action-${a}`}
                        onChange={(e) => save(`action-${a}`, { security: { pinActions: { [a]: e.target.checked } } }, 'Acción protegida actualizada.')}
                        className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus-ring"
                      />
                      {PIN_ACTION_LABELS[a]}
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end ${settings.security.pinEnabled ? '' : 'opacity-60'}`}>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-zinc-700">Pedir PIN al aprobar o rechazar desde (monto en {tenant.locale.baseCurrency})</span>
                <input
                  inputMode="numeric"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="Vacío = todas las rendiciones"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus-ring"
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  save('threshold', { security: { pinApprovalThreshold: threshold === '' ? null : Number(threshold) } }, 'Umbral actualizado.')
                }
                disabled={saving === 'threshold'}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-ring disabled:opacity-60"
              >
                {saving === 'threshold' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Guardar
              </button>
            </div>

            <div>
              <button type="button" onClick={loadLog} className="text-sm font-semibold text-brand-700 hover:underline focus-ring rounded">
                {log === null ? 'Ver registro de uso del PIN' : 'Actualizar registro'}
              </button>
              {log !== null && (
                <div className="mt-3 max-h-72 overflow-auto rounded-xl ring-1 ring-zinc-100">
                  {log.length === 0 ? (
                    <p className="p-4 text-sm text-zinc-500">Sin registros todavía.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-zinc-50 text-left text-zinc-500">
                        <tr>
                          <th className="px-3 py-2">Fecha</th>
                          <th className="px-3 py-2">Persona</th>
                          <th className="px-3 py-2">Acción</th>
                          <th className="px-3 py-2">Resultado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {log.map((entry) => (
                          <tr key={entry.id}>
                            <td className="px-3 py-2 text-zinc-500">{new Date(entry.at).toLocaleString('es-CO')}</td>
                            <td className="px-3 py-2">{entry.userName}</td>
                            <td className="px-3 py-2">{LOG_ACTION_LABELS[entry.action] ?? entry.action}</td>
                            <td className={`px-3 py-2 font-semibold ${entry.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                              {entry.ok ? 'OK' : LOG_REASON_LABELS[entry.reason ?? ''] ?? 'Rechazado'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card icon={LayoutGrid} title="Módulos" description="Oculta del menú y bloquea las secciones que esta organización no usa.">
          <ul className="divide-y divide-zinc-100">
            {modules.map((key) => (
              <li key={key} className="flex items-center justify-between py-3">
                <span className="text-sm text-zinc-700">{MODULE_LABELS[key]}</span>
                <Toggle
                  label={MODULE_LABELS[key]}
                  checked={settings.modules[key]}
                  disabled={saving === `module-${key}`}
                  onChange={(v) =>
                    save(`module-${key}`, { modules: { [key]: v } }, `${MODULE_LABELS[key]} ${v ? 'activado' : 'desactivado'}.`)
                  }
                />
              </li>
            ))}
          </ul>
        </Card>

        <ApprovalPolicyCard />

        <Card icon={Sparkles} title="Lectura de recibos con IA" description="Límite diario de lecturas automáticas. Vacío = valor por defecto del servidor (60 por persona, 1.500 por organización).">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Por persona al día</span>
              <input
                inputMode="numeric"
                value={limits.user}
                onChange={(e) => setLimits({ ...limits, user: e.target.value })}
                placeholder="60"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus-ring"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Organización al día</span>
              <input
                inputMode="numeric"
                value={limits.tenant}
                onChange={(e) => setLimits({ ...limits, tenant: e.target.value })}
                placeholder="1500"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus-ring"
              />
            </label>
            <button
              type="button"
              onClick={saveLimits}
              disabled={saving === 'ai'}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-ring disabled:opacity-60"
            >
              {saving === 'ai' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Guardar
            </button>
          </div>
        </Card>

        <OfflineReaderCard />
      </div>
    </Layout>
  );
}
