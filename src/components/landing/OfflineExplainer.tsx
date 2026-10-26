import { CheckCircle2, CloudOff, Save, ShieldCheck, UploadCloud } from 'lucide-react';
import type { TenantLanding } from '../../lib/tenant';

const STEP_ICONS = [CloudOff, Save, UploadCloud, ShieldCheck];

// "How it works without signal", told from the user's side. The pill and
// toast below copy the exact texts the app shows (ConnectionStatus,
// ExpenseForm, offlineSync), so the landing never promises something else.
export default function OfflineExplainer({ offline }: { offline: NonNullable<TenantLanding['offline']> }) {
  return (
    <section aria-labelledby="offline-title" className="mt-14 max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-wider text-chrome-accent">{offline.eyebrow}</p>
      <h2 id="offline-title" className="mt-2 text-2xl font-bold tracking-tight text-chrome-strong">
        {offline.title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-chrome-muted">{offline.intro}</p>

      {/* What the user actually sees on the phone. */}
      <div className="mt-6 flex flex-wrap items-center gap-3" aria-hidden>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/10">
          <CloudOff className="h-3.5 w-3.5" /> Sin conexión · 1 sin enviar
        </span>
        <span className="text-chrome-subtle">→</span>
        <span className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Se envió 1 rendición guardada sin conexión.
        </span>
      </div>

      <ol className="mt-8 space-y-6">
        {offline.steps.map((s, i) => {
          const Icon = STEP_ICONS[i] ?? CheckCircle2;
          return (
            <li key={s.title} className="relative flex gap-4">
              {i < offline.steps.length - 1 ? (
                <span className="absolute left-5 top-11 h-[calc(100%-1rem)] w-px bg-chrome-line" aria-hidden />
              ) : null}
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chrome-card text-chrome-accent ring-1 ring-chrome-line">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="pt-1.5">
                <h3 className="font-semibold tracking-tight text-chrome-strong">
                  <span className="mr-2 text-chrome-subtle">{i + 1}.</span>
                  {s.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-chrome-muted">{s.text}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {offline.note ? <p className="mt-6 text-xs leading-relaxed text-chrome-subtle">{offline.note}</p> : null}
    </section>
  );
}
