import { useState } from 'react';
import { toast } from 'sonner';
import { CloudOff, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { removeQueued, useOfflineQueue } from '../lib/offlineQueue';
import { syncNow } from '../lib/offlineSync';
import { useOnline } from '../lib/useOnline';

// Mi Espacio: expenses saved without signal, waiting to be sent.
export default function OfflineQueueCard() {
  const queue = useOfflineQueue();
  const online = useOnline();
  const [syncing, setSyncing] = useState(false);

  if (queue.length === 0) return null;

  async function retry() {
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
    }
  }

  async function discard(id: string, label: string) {
    if (!window.confirm(`¿Descartar "${label}"? La rendición y sus fotos se borrarán de este dispositivo.`)) return;
    await removeQueued(id);
    toast.success('Rendición descartada.');
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CloudOff className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-amber-900">
              {queue.length === 1 ? '1 rendición sin enviar' : `${queue.length} rendiciones sin enviar`}
            </h2>
            <p className="text-xs text-amber-800">
              {online ? 'Se enviarán automáticamente en unos segundos.' : 'Sin conexión. Se enviarán solas cuando vuelva la señal.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={retry}
          disabled={!online || syncing}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 focus-ring disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          Enviar ahora
        </button>
      </div>
      <ul className="mt-3 divide-y divide-amber-200/70">
        {queue.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-amber-900">{item.label}</p>
              <p className="text-xs text-amber-700">
                Guardada {new Date(item.createdAt).toLocaleString('es-CO')}
                {item.lastError && ` · último intento: ${item.lastError}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => discard(item.id, item.label)}
              className="rounded-lg p-2 text-amber-700 hover:bg-amber-100 focus-ring"
              aria-label={`Descartar ${item.label}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
