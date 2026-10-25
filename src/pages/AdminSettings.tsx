import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, LayoutGrid, Loader2, Sparkles } from 'lucide-react';
import Layout from '../components/Layout';
import { useTenantSettings } from '../context/SettingsContext';
import { MODULE_LABELS, type ModuleKey, type TenantSettings } from '../lib/tenantSettings';
import { updateSettings } from '../lib/userAdmin';
import { tenant } from '../lib/tenant';

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

export default function AdminSettings() {
  const settings = useTenantSettings();
  const [saving, setSaving] = useState<string | null>(null);
  const [limits, setLimits] = useState({ user: '', tenant: '' });

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
      toast.error((err as Error).message);
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

        <Card icon={KeyRound} title="PIN de seguridad" description="PIN de 4 dígitos para autorizar acciones sensibles (aprobar, borrar, exportar, cambiar permisos).">
          <div className="flex items-center justify-between gap-4 rounded-xl bg-zinc-50 p-4">
            <div>
              <p className="text-sm font-medium text-zinc-800">Exigir PIN en acciones sensibles</p>
              <p className="text-xs text-zinc-500">Cada usuario definirá su PIN la primera vez que se le pida. Disponible desde la próxima actualización.</p>
            </div>
            <Toggle
              label="Exigir PIN"
              checked={settings.security.pinEnabled}
              disabled={saving === 'pin'}
              onChange={(v) => save('pin', { security: { pinEnabled: v } }, v ? 'PIN activado.' : 'PIN desactivado.')}
            />
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

        <p className="text-xs text-zinc-400">
          La política de aprobación por montos y jerarquía se configurará aquí en una próxima actualización.
        </p>
      </div>
    </Layout>
  );
}
