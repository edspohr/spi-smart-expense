import { Link } from 'react-router-dom';
import { CloudOff, UploadCloud } from 'lucide-react';
import { useOnline } from '../lib/useOnline';
import { useOfflineQueue } from '../lib/offlineQueue';

// Header pill: offline state and/or expenses waiting to be sent.
export default function ConnectionStatus() {
  const online = useOnline();
  const queued = useOfflineQueue().length;
  if (online && queued === 0) return null;

  return (
    <Link
      to="/dashboard/mi-espacio"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold focus-ring ${
        online ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-zinc-800 text-white'
      }`}
      title={queued > 0 ? 'Rendiciones guardadas en este dispositivo' : 'Sin conexión'}
    >
      {online ? <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" /> : <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />}
      {!online && 'Sin conexión'}
      {!online && queued > 0 && ' · '}
      {queued > 0 && `${queued} sin enviar`}
    </Link>
  );
}
