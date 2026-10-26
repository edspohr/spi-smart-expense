import { useEffect, useState } from 'react';
import { CloudOff, Loader2, Mountain, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/useAuth';
import { useTenantSettings } from '../context/SettingsContext';
import { useOnline } from '../lib/useOnline';
import { enginesCached, getFieldReady, prepareForField, type FieldReadyStatus } from '../lib/fieldReady';
import { isSimulatingOffline, setSimulateOffline } from '../lib/connectivity';
import { isSuperadmin } from '../lib/roles';
import { tenant } from '../lib/tenant';

function ago(iso: string | null): string {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

// "Listo para terreno" (Ola 8): status of the offline kit and the button to
// prepare it; plus "Simular sin señal" for demos (demo tenant, superadmins).
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

  if (!offline.localReader || !currentUser) return null;

  const ready = Boolean(status.readyAt && status.engines && (cached ?? true));
  const canSimulate = Boolean(tenant.landing?.demo) || isSuperadmin(userRole);

  const prepare = async () => {
    try {
      const next = await prepareForField(currentUser.uid, setStep);
      setStatus(next);
      toast.success(next.engines ? 'Listo para terreno: puedes rendir sin señal.' : 'Se guardaron tus datos, pero el lector no se pudo descargar. Intenta de nuevo con buena señal.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo preparar el modo terreno.');
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

  return (
    <section aria-labelledby="field-ready-title" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ready ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
          <Mountain className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="field-ready-title" className="font-semibold text-gray-900">
            {ready ? 'Listo para terreno' : 'Prepara la app para terreno'}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {ready
              ? `Puedes rendir sin señal: la app lee la boleta en el teléfono. Actualizado ${ago(status.readyAt)}.`
              : 'Descarga ahora, con buena señal, lo necesario para rendir y leer boletas sin conexión (unos 7 MB, una sola vez).'}
          </p>
          {ready && (
            <p className="mt-1 text-xs text-gray-500">
              {status.projects} centros de costo · {status.dictionary} comercios conocidos
            </p>
          )}
          {step && (
            <p className="mt-2 inline-flex items-center gap-2 text-xs text-gray-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {step}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={prepare}
          disabled={!online || step !== null}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 focus-ring"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {ready ? 'Actualizar' : 'Preparar para terreno'}
        </button>
        {canSimulate && (
          <button
            type="button"
            onClick={toggleSimulation}
            aria-pressed={simulated}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 focus-ring ${simulated ? 'bg-zinc-900 text-white ring-zinc-900' : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'}`}
          >
            <CloudOff className="h-4 w-4" aria-hidden="true" />
            {simulated ? 'Volver a tener señal' : 'Simular sin señal'}
          </button>
        )}
      </div>
      {!online && !simulated && <p className="mt-2 text-xs text-gray-500">Sin conexión: podrás actualizar cuando vuelva la señal.</p>}
    </section>
  );
}
