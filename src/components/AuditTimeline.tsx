import { CheckCircle2, Circle, GitBranch, RotateCcw, Sparkles, XCircle, Pencil } from 'lucide-react';

export interface MovementEntry {
  id: string;
  action?: string;
  field?: string;
  from?: unknown;
  to?: unknown;
  byName?: string;
  comment?: string | null;
  override?: boolean;
  at: string;
}

const ACTION_META: Record<string, { label: string; icon: typeof Circle; className: string }> = {
  approved: { label: 'Aprobó', icon: CheckCircle2, className: 'text-emerald-600' },
  step_approved: { label: 'Aprobó un paso', icon: CheckCircle2, className: 'text-emerald-500' },
  auto_approved: { label: 'Aprobación automática', icon: Sparkles, className: 'text-emerald-600' },
  rejected: { label: 'Rechazó', icon: XCircle, className: 'text-red-600' },
  reopened: { label: 'Reabrió', icon: RotateCcw, className: 'text-amber-600' },
  flow_started: { label: 'Flujo de aprobación', icon: GitBranch, className: 'text-brand-600' },
};

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

// Chronological audit trail of an expense: server-written review events
// (with actor and comment) and field edits logged by EditExpenseModal.
export default function AuditTimeline({ movements }: { movements: MovementEntry[] }) {
  if (movements.length === 0) return <p className="text-xs italic text-zinc-400">Sin movimientos registrados.</p>;

  const visible = movements.filter((m) => !(m.action === 'rejected' && m.field === 'rejectionReason'));
  const reasonOf = (m: MovementEntry) =>
    m.action === 'rejected' ? movements.find((x) => x.field === 'rejectionReason' && x.at === m.at)?.to : undefined;

  return (
    <ol className="relative space-y-3 border-l border-zinc-200 pl-5">
      {visible.map((m) => {
        const meta = (m.action && ACTION_META[m.action]) || { label: `Editó ${m.field ?? ''}`, icon: Pencil, className: 'text-zinc-500' };
        const Icon = meta.icon;
        const date = new Date(m.at);
        const reason = reasonOf(m);
        return (
          <li key={m.id} className="relative">
            <span className="absolute -left-[27px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white">
              <Icon className={`h-4 w-4 ${meta.className}`} aria-hidden="true" />
            </span>
            <p className="text-sm text-zinc-800">
              <span className="font-semibold">{meta.label}</span>
              {m.byName && <span className="text-zinc-500"> · {m.byName}</span>}
              {m.override && <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">como administrador</span>}
            </p>
            {!m.action || m.action === 'flow_started' ? (
              <p className="text-xs text-zinc-500">
                {m.action === 'flow_started' ? show(m.to) : <>{show(m.from)} → {show(m.to)}</>}
              </p>
            ) : null}
            {reason !== undefined && <p className="text-xs text-red-600">Motivo: {show(reason)}</p>}
            {m.comment && <p className="mt-0.5 rounded-lg bg-zinc-50 px-2 py-1 text-xs text-zinc-600">“{m.comment}”</p>}
            <time className="text-[11px] text-zinc-400" dateTime={m.at}>
              {date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}{' '}
              {date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
