import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, type Firestore } from 'firebase/firestore';
import { ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../lib/firebase';
import { useTenantSettings } from '../context/SettingsContext';
import { updateSettings } from '../lib/userAdmin';
import { PinCancelled } from '../lib/pin';
import { computeOcrStats, FIELD_LABELS, STAT_FIELDS, type OcrEvalRecord } from '../lib/ocrStats';

const pct = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)}%`);

// Superadmin card (Ola 8): switches for the on-device reader and the
// accuracy panel built from anonymous ocrEval records.
export default function OfflineReaderCard() {
  const settings = useTenantSettings();
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<OcrEvalRecord[] | null>(null);

  useEffect(() => {
    if (!settings.offline.localReader || !db) return;
    getDocs(query(collection(db as Firestore, 'ocrEval'), orderBy('createdAt', 'desc'), limit(500)))
      .then((snap) => setRecords(snap.docs.map((d) => d.data() as OcrEvalRecord)))
      .catch(() => setRecords([]));
  }, [settings.offline.localReader]);

  const stats = useMemo(() => (records ? computeOcrStats(records) : null), [records]);

  const save = async (patch: Parameters<typeof updateSettings>[0], ok: string) => {
    setSaving(true);
    try {
      await updateSettings(patch);
      toast.success(ok);
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
          <ScanLine className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold text-zinc-900">Lectura sin conexión</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            La app lee la boleta en el teléfono, sin IA en la nube: exacto con timbre electrónico o QR DIAN, aproximado en boletas de papel. Al volver la señal, la IA verifica la lectura.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={settings.offline.localReader}
            disabled={saving}
            onChange={(e) => save({ offline: { localReader: e.target.checked } }, e.target.checked ? 'Lectura sin conexión activada.' : 'Lectura sin conexión desactivada.')}
          />
          <span>
            <span className="block text-sm font-medium text-zinc-800">Activar lectura sin conexión y "Listo para terreno"</span>
            <span className="block text-xs text-zinc-500">Cada persona ve en Mi Espacio el botón para preparar su teléfono (unos 7 MB, una vez).</span>
          </span>
        </label>
        <label className={`flex items-start gap-3 ${settings.offline.localReader ? '' : 'opacity-50'}`}>
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={settings.ai.localFirst}
            disabled={saving || !settings.offline.localReader}
            onChange={(e) => save({ ai: { localFirst: e.target.checked } }, e.target.checked ? 'Lectura local primero activada.' : 'Lectura local primero desactivada.')}
          />
          <span>
            <span className="block text-sm font-medium text-zinc-800">Leer en el teléfono también con señal</span>
            <span className="block text-xs text-zinc-500">Si la lectura local es confiable no se llama a la IA (más rápido y más barato); si no, se usa la IA como siempre.</span>
          </span>
        </label>
      </div>

      {settings.offline.localReader && (
        <div className="mt-6 border-t border-zinc-100 pt-5">
          <h3 className="text-sm font-semibold text-zinc-800">Precisión del lector</h3>
          {!stats || stats.reads === 0 ? (
            <p className="mt-1 text-sm text-zinc-500">Aún no hay rendiciones leídas en el teléfono. Cada lectura se compara con lo que la persona confirmó.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-zinc-500">
                Últimas {stats.reads} lecturas · {stats.byEngine.barcode ?? 0} por código, {stats.byEngine.ocr ?? 0} por texto
                {stats.medianMs !== null ? ` · tiempo típico ${(stats.medianMs / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} s` : ''}
                {stats.aiMismatches ? ` · ${stats.aiMismatches} con diferencia según la IA` : ''}
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500">
                      <th scope="col" className="py-1 pr-3 font-medium">Campo</th>
                      <th scope="col" className="py-1 pr-3 font-medium">Total</th>
                      <th scope="col" className="py-1 pr-3 font-medium">Con código</th>
                      <th scope="col" className="py-1 font-medium">Por texto (OCR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAT_FIELDS.map((f) => (
                      <tr key={f} className="border-t border-zinc-100">
                        <td className="py-1.5 pr-3 text-zinc-700">{FIELD_LABELS[f]}</td>
                        <td className="py-1.5 pr-3 font-semibold text-zinc-900">{pct(stats.fields[f]!.rate)} <span className="text-xs font-normal text-zinc-400">({stats.fields[f]!.total})</span></td>
                        <td className="py-1.5 pr-3 text-zinc-700">{pct(stats.fieldsByEngine.barcode?.[f]?.rate ?? null)}</td>
                        <td className="py-1.5 text-zinc-700">{pct(stats.fieldsByEngine.ocr?.[f]?.rate ?? null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-zinc-400">Acierto = el valor leído en el teléfono coincide con el que la persona envió. Sin imágenes ni datos personales.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
