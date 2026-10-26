import { useState } from 'react';
import { Network } from 'lucide-react';
import { toast } from 'sonner';
import { useTenantSettings } from '../context/SettingsContext';
import { updateSettings } from '../lib/userAdmin';
import { callFunction } from '../lib/functions';
import { PinCancelled } from '../lib/pin';
import {
  DERIVED_NEVER,
  DERIVED_SENT,
  DERIVED_TERMS_PROVISIONAL,
  DERIVED_TERMS_TEXT,
  DERIVED_TERMS_TITLE,
  DERIVED_TERMS_VERSION,
} from '../lib/learningTerms';

interface Preview {
  contribution: { issuers: unknown[]; stats: unknown[] };
  destination: 'hub' | 'outbox';
  consent: { ok: boolean; reason?: string };
  lastExportDay: string | null;
  lastResult: { at: string; status: string; destination?: string; issuers?: number; days?: number; reason?: string } | null;
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const RESULT: Record<string, string> = { sent: 'enviado', empty: 'sin datos nuevos', skipped: 'no enviado', error: 'error' };

// Superadmin consent for the cross-client layer of the learning reader
// (Ola 8c, ADR 0016). Text and version: src/lib/learningTerms.ts.
export default function LearningConsentCard() {
  const { learning } = useTenantSettings();
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const outdated = learning.shareDerived && learning.termsVersion !== DERIVED_TERMS_VERSION;

  const save = async (share: boolean) => {
    setSaving(true);
    try {
      await updateSettings({ learning: { shareDerived: share, termsVersion: DERIVED_TERMS_VERSION } });
      toast.success(share ? 'Aporte a la mejora del lector activado.' : 'Aporte a la mejora del lector desactivado.');
    } catch (err) {
      if (!(err instanceof PinCancelled)) toast.error(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const loadPreview = async () => {
    setLoadingPreview(true);
    try {
      setPreview(await callFunction<Record<string, never>, Preview>('previewDerivedData', {}));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cargar el detalle.');
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-zinc-100">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Network className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold text-zinc-900">
            {DERIVED_TERMS_TITLE}
            {DERIVED_TERMS_PROVISIONAL && (
              <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 align-middle text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">Versión provisional</span>
            )}
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            El lector mejora con lo que aprende de toda la red de clientes. Si lo activas, tu empresa también aporta: solo datos técnicos de las boletas, nunca tus datos de negocio. Recibes las mejoras igual aunque no lo actives.
          </p>
        </div>
      </div>

      <blockquote className="mt-4 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700 ring-1 ring-zinc-100">{DERIVED_TERMS_TEXT}</blockquote>

      <label className="mt-4 flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={learning.shareDerived && !outdated} disabled={saving} onChange={(e) => save(e.target.checked)} />
        <span className="text-sm font-medium text-zinc-800">Acepto y activo el aporte de datos derivados</span>
      </label>
      <p className="mt-1 text-xs text-zinc-500">
        {learning.shareDerived && !outdated
          ? `Activado por ${learning.acceptedByName ?? '—'} el ${date(learning.acceptedAt)} (texto ${learning.termsVersion}).`
          : 'Desactivado: nada sale de tu ambiente.'}
      </p>
      {outdated && (
        <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          El texto cambió desde que se aceptó ({learning.termsVersion} → {DERIVED_TERMS_VERSION}). El envío está detenido hasta que vuelvas a aceptarlo.
        </p>
      )}

      <div className="mt-5 border-t border-zinc-100 pt-4">
        <button type="button" onClick={loadPreview} disabled={loadingPreview} className="text-sm font-semibold text-brand-700 hover:underline disabled:opacity-50">
          {loadingPreview ? 'Cargando…' : preview ? 'Actualizar qué se envía' : 'Ver qué se envía'}
        </button>
        {preview && (
          <div className="mt-3 space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Se envía</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-zinc-700">
                  {DERIVED_SENT.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Nunca se envía</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-zinc-700">
                  {DERIVED_NEVER.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
            </div>
            <p className="text-zinc-700">
              Próximo envío: <strong>{plural(preview.contribution.issuers.length, 'emisor', 'emisores')}</strong> y <strong>{plural(preview.contribution.stats.length, 'día', 'días')}</strong> de contadores
              {' · '}
              {preview.destination === 'hub' ? 'destino: proyecto central de Growth Buddies' : 'aún no hay proyecto central: se guarda solo en tu ambiente'}
              {!preview.consent.ok ? ` · no se enviará (${preview.consent.reason})` : ''}.
            </p>
            {preview.lastResult && (
              <p className="text-xs text-zinc-500">
                Último proceso: {date(preview.lastResult.at)} · {RESULT[preview.lastResult.status] ?? preview.lastResult.status}
                {preview.lastResult.reason ? ` (${preview.lastResult.reason})` : ''}
              </p>
            )}
            <details>
              <summary className="cursor-pointer text-xs text-zinc-500">Ver el envío exacto (JSON)</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-zinc-900 p-3 text-[11px] leading-relaxed text-zinc-100">{JSON.stringify(preview.contribution, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
