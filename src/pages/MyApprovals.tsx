import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Eye, Inbox, Loader2, XCircle } from 'lucide-react';
import Layout from '../components/Layout';
import ExpenseDetailsModal from '../components/ExpenseDetailsModal';
import { useAuth } from '../context/useAuth';
import { useMyPendingApprovals, type PendingForMe } from '../lib/myApprovals';
import { approveExpense, rejectExpense } from '../lib/expenseActions';
import { PinCancelled } from '../lib/pin';
import { formatCurrency } from '../utils/format';

// Approval queue for managers (any role): expenses of their team waiting
// for them, plus those delegated to them. Finance/admin keep /admin/approvals.
export default function MyApprovals() {
  const { currentUser } = useAuth() as unknown as { currentUser: { uid: string } | null };
  const { items, loading } = useMyPendingApprovals(currentUser?.uid);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState<PendingForMe | null>(null);

  async function approve(e: PendingForMe) {
    setBusy(e.id);
    try {
      const res = await approveExpense(e.id, comments[e.id]);
      toast.success(res.partial ? 'Aprobado. Ahora pasa a revisión de finanzas.' : 'Rendición aprobada.');
    } catch (err) {
      if (!(err instanceof PinCancelled)) toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function reject(e: PendingForMe) {
    if (!reason.trim()) {
      toast.error('Indica el motivo del rechazo.');
      return;
    }
    setBusy(e.id);
    try {
      await rejectExpense(e.id, reason.trim());
      toast.success('Rendición rechazada.');
      setRejecting(null);
      setReason('');
    } catch (err) {
      if (!(err instanceof PinCancelled)) toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const delegatedFor = (e: PendingForMe) => {
    const step = e.approvalFlow?.steps[e.approvalFlow.currentStep];
    return step && step.approverUid !== currentUser?.uid ? step.approverName : null;
  };

  return (
    <Layout title="Mis aprobaciones">
      <div className="max-w-3xl space-y-4">
        <p className="text-sm text-zinc-500">Rendiciones de tu equipo que esperan tu aprobación antes de pasar a finanzas.</p>

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-12 text-center shadow-soft ring-1 ring-zinc-100">
            <Inbox className="h-8 w-8 text-zinc-300" aria-hidden="true" />
            <p className="text-sm font-medium text-zinc-700">No tienes aprobaciones pendientes</p>
            <p className="text-xs text-zinc-500">Te avisaremos cuando alguien de tu equipo rinda un gasto.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((e) => {
              const onBehalf = delegatedFor(e);
              return (
                <li key={e.id} className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-zinc-100">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-800">
                        {e.userName} · {e.merchant || 'Sin comercio'}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {e.date} · {e.category} · {e.projectName}
                      </p>
                      {onBehalf && <p className="mt-1 text-xs font-medium text-amber-700">Delegada por {onBehalf}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-zinc-900">{formatCurrency(e.amount, e.currency)}</p>
                      <button type="button" onClick={() => setDetails(e)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline focus-ring rounded">
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Ver detalle
                      </button>
                    </div>
                  </div>

                  {rejecting === e.id ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={reason}
                        onChange={(ev) => setReason(ev.target.value)}
                        placeholder="Motivo del rechazo (lo verá quien rindió)"
                        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus-ring"
                        rows={2}
                      />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setRejecting(null)} className="rounded-xl px-3 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 focus-ring">
                          Cancelar
                        </button>
                        <button type="button" disabled={busy === e.id} onClick={() => reject(e)} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 focus-ring disabled:opacity-60">
                          Confirmar rechazo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        value={comments[e.id] ?? ''}
                        onChange={(ev) => setComments({ ...comments, [e.id]: ev.target.value })}
                        placeholder="Comentario opcional"
                        className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus-ring"
                        aria-label={`Comentario para la rendición de ${e.userName}`}
                      />
                      <div className="flex gap-2">
                        <button type="button" disabled={busy === e.id} onClick={() => setRejecting(e.id)} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 focus-ring disabled:opacity-60">
                          <XCircle className="h-4 w-4" aria-hidden="true" /> Rechazar
                        </button>
                        <button type="button" disabled={busy === e.id} onClick={() => approve(e)} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 focus-ring disabled:opacity-60">
                          {busy === e.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />} Aprobar
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {details && <ExpenseDetailsModal isOpen expense={details} onClose={() => setDetails(null)} />}
    </Layout>
  );
}
