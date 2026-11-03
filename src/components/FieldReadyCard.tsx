import { useEffect, useState } from 'react';
import { CheckCircle2, CloudOff, Loader2, Mountain, Plane, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/useAuth';
import { useTenantSettings } from '../context/SettingsContext';
import { useOnline } from '../lib/useOnline';
import { enginesCached, getFieldReady, prepareForField, type FieldReadyStatus } from '../lib/fieldReady';
import { isSimulatingOffline, setSimulateOffline } from '../lib/connectivity';
import { isSuperadmin } from '../lib/roles';
import ReaderNotice from './ReaderNotice';
import { tenant } from '../lib/tenant';
import { isStandalone } from '../lib/install';
import { ago, fieldReadyCopy as copy } from '../lib/fieldReadyCopy';

// Offline mode (Ola 8) in Mi Espacio: one quiet line. The installed app
// prepares the kit by itself (Layout.jsx), so this only shows the state and
// lets the person force a check; plus "Simular sin señal" for demos (demo
// tenant, superadmins).
export default function FieldReadyCard() {
  const { currentUser, userRole } = useAuth() as unknown as { currentUser: { uid: string } | null; userRole: string | null };
  const { offline } = useTenantSettings();
  const online = useOnline();
  const [status, setStatus] = useState<FieldReadyStatus>(() => getFieldReady());
  const [cached, setCached] = useState<boolean | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(isSimulatingOffline());

  useEffect(() => {
    void enginesCached().then(setCached);
  }, [status.readyAt]);

  if ((!offline.localReader && !offline.shadowRead) || !currentUser) return null;

  // Measuring only (shadow mode without the offline reader): just the notice.
  if (!offline.localReader) {
    return (
      <section aria-label="Lectura de boletas" className="rounded-2xl border border-gray-100 bg-white px-5 py-3 shadow-sm">
        <ReaderNotice />
      </section>
    );
  }

  const ready = Boolean(status.readyAt && status.engines && (cached ?? true));
  const canSimulate = Boolean(tenant.landing?.demo) || isSuperadmin(userRole);
  const Icon = ready ? CheckCircle2 : copy.icon === 'plane' ? Plane : Mountain;

  const verify = async () => {
    try {
      const next = await prepareForField(currentUser.uid, setStep);
      setStatus(next);
      toast.success(next.engines ? copy.readyToast : 'Se guardaron tus datos, pero el lector no se pudo descargar. Intenta de nuevo con buena señal.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo preparar la app para rendir sin señal.');
    } finally {
      setStep(null);
    }
  };

  const toggleSimulation = async () => {
    const next = !simulated;
    await setSimulateOffline(next);
    setSimulated(next);
    toast(next ? 'Sin señal simulada: la app se comporta como en una faena sin cobertura.' : 'Señal restablecida: las rendiciones guardadas se enviarán solas.');
  };

  const line = step
    ? step
    : ready
      ? `${copy.readyTitle} · actualizado ${ago(status.readyAt)}`
      : isStandalone() ? copy.pendingInstalled : copy.pendingBrowser;

  return (
    <section id="listo-sin-senal" aria-labelledby="field-ready-title" className="rounded-2xl border border-gray-100 bg-white px-5 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Icon className={`h-4 w-4 shrink-0 ${ready ? 'text-emerald-600' : 'text-gray-400'}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="field-ready-title" className="text-sm font-medium text-gray-900">Modo sin conexión</h2>
          <p className="text-xs text-gray-500" title={ready ? copy.readyBody : undefined}>
            {step && <Loader2 className="mr-1 inline h-3 w-3 animate-spin align-[-2px]" aria-hidden="true" />}
            {line}
          </p>
        </div>
        <button
          type="button"
          onClick={verify}
          disabled={!online || step !== null}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50 focus-ring"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {ready ? 'Verificar ahora' : 'Preparar ahora'}
        </button>
        {canSimulate && (
          <button
            type="button"
            onClick={toggleSimulation}
            aria-pressed={simulated}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 focus-ring ${simulated ? 'bg-zinc-900 text-white ring-zinc-900' : 'text-gray-600 ring-gray-200 hover:bg-gray-50'}`}
          >
            <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
            {simulated ? 'Volver a tener señal' : 'Simular sin señal'}
          </button>
        )}
      </div>
      <ReaderNotice />
    </section>
  );
}
