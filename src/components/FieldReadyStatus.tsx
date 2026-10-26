import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Mountain, Plane } from 'lucide-react';
import { useTenantSettings } from '../context/SettingsContext';
import { enginesCached, getFieldReady, isFieldReadyStale } from '../lib/fieldReady';
import { ago, fieldReadyCopy as copy } from '../lib/fieldReadyCopy';

// One line on Mi Resumen (Ola 8): whether the phone is ready to submit with
// no signal, linking to the full card in Mi Espacio. Hidden unless the
// tenant turned the offline reader on.
export default function FieldReadyStatus() {
  const { offline } = useTenantSettings();
  const [status] = useState(() => getFieldReady());
  const [cached, setCached] = useState<boolean | null>(null);

  useEffect(() => {
    if (offline.localReader) void enginesCached().then(setCached);
  }, [offline.localReader]);

  if (!offline.localReader) return null;
  const ready = Boolean(status.readyAt && status.engines && cached !== false);
  const Icon = copy.icon === 'plane' ? Plane : Mountain;

  return ready ? (
    <Link
      to="/dashboard/mi-espacio#listo-sin-senal"
      className="mb-6 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <strong>{copy.readyTitle}</strong> · actualizado {ago(status.readyAt)}
        {isFieldReadyStale(status) ? ' · conviene actualizar con wifi' : ''}
      </span>
    </Link>
  ) : (
    <Link
      to="/dashboard/mi-espacio#listo-sin-senal"
      className="mb-6 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{copy.homeNudge} <span className="font-semibold underline">{copy.prepareButton}</span></span>
    </Link>
  );
}
