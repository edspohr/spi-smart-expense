import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import Layout from '../components/Layout';
import { useTenantSettings } from '../context/SettingsContext';
import { useAuth } from '../context/useAuth';
import { PinCancelled } from '../lib/pin';
import { BASE_CURRENCY } from '../lib/country';
import { formatCurrency } from '../utils/format';
import { buildJournals, ISSUE_LABELS, WARNING_LABELS, type AccountingExpense, type Journal, type JournalIssue, type JournalWarning, type ProjectRef } from '../../functions/src/accounting.logic';
import { CONNECTORS, type ConnectorId } from '../../functions/src/accounting.connectors';
import { downloadFiles, listExportRuns, loadApprovedExpenses, loadProjects, loadRunFiles, runAccountingExport, type ExportRun } from '../lib/accountingExport';

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inputClass = 'mt-1 w-full rounded-lg border border-zinc-200 p-2 text-sm';
const PREVIEW_ROWS = 50;

function countBy<T extends string>(journals: Journal[], key: 'issues' | 'warnings'): [T, number][] {
  const counts = new Map<T, number>();
  for (const j of journals) for (const k of j[key] as T[]) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()];
}

// Ola 11 (ADR 0018): "Exportar a contabilidad". Preview with the same
// builder as the server; the export goes through buildAccountingExport.
export default function AdminAccounting() {
  const { accounting } = useTenantSettings();
  const { userRole } = useAuth() as unknown as { userRole: string };
  const today = new Date();
  const [from, setFrom] = useState(localDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(localDate(today));
  const [connector, setConnector] = useState<ConnectorId>('generic-csv');
  const [projectId, setProjectId] = useState('');
  const [includeExported, setIncludeExported] = useState(false);
  const [expenses, setExpenses] = useState<AccountingExpense[] | null>(null);
  const [projects, setProjects] = useState<Record<string, ProjectRef & { label: string }>>({});
  const [runs, setRuns] = useState<ExportRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const refreshRuns = useCallback(() => {
    listExportRuns().then(setRuns).catch((err) => console.warn('[accounting] runs', err));
  }, []);

  useEffect(() => {
    loadProjects().then(setProjects).catch((err) => console.warn('[accounting] projects', err));
    refreshRuns();
  }, [refreshRuns]);

  useEffect(() => {
    if (!from || !to || from > to) return;
    let cancelled = false;
    setLoading(true);
    loadApprovedExpenses(from, to)
      .then((list) => { if (!cancelled) setExpenses(list); })
      .catch((err) => { if (!cancelled) toast.error(`No se pudieron leer las rendiciones: ${(err as Error).message}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  const batch = useMemo(() => {
    if (!expenses) return null;
    const selected = expenses
      .filter((e) => !projectId || e.projectId === projectId)
      .filter((e) => includeExported || !e.accountingExport);
    return buildJournals(selected, accounting, { baseCurrency: BASE_CURRENCY, projects });
  }, [expenses, projectId, includeExported, accounting, projects]);

  const issues = batch ? countBy<JournalIssue>(batch.blocked, 'issues') : [];
  const warnings = batch ? countBy<JournalWarning>(batch.ready, 'warnings') : [];
  const alreadyExported = expenses?.filter((e) => e.accountingExport && (!projectId || e.projectId === projectId)).length ?? 0;
  const canExport = !!batch && batch.ready.length > 0 && batch.blocked.length === 0 && !exporting;

  async function exportNow() {
    setExporting(true);
    try {
      const res = await runAccountingExport({ connector, from, to, includeExported, projectIds: projectId ? [projectId] : [] });
      downloadFiles(res.files);
      toast.success(`Exportadas ${res.count} rendiciones (${formatCurrency(res.total, res.currency)}).`);
      setExpenses(await loadApprovedExpenses(from, to));
      refreshRuns();
    } catch (err) {
      if (!(err instanceof PinCancelled)) toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  async function downloadRun(run: ExportRun) {
    try {
      const files = await loadRunFiles(run);
      if (!files.length) toast.error('Este archivo era demasiado grande para guardarlo; vuelve a exportar con "incluir ya exportadas".');
      else downloadFiles(files);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const c = CONNECTORS[connector];

  return (
    <Layout title="Exportar a contabilidad">
      <div className="space-y-6">
        <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-zinc-100">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm text-zinc-700">
              Desde
              <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-sm text-zinc-700">
              Hasta
              <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="text-sm text-zinc-700">
              Centro de costo
              <select className={inputClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(projects).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-700">
              Formato
              <select className={inputClass} value={connector} onChange={(e) => setConnector(e.target.value as ConnectorId)}>
                {Object.values(CONNECTORS).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={includeExported} onChange={(e) => setIncludeExported(e.target.checked)} />
            Incluir rendiciones ya exportadas{alreadyExported > 0 && ` (${alreadyExported} en el período)`}
          </label>
          <p className="mt-3 text-sm text-zinc-500">{c.description}</p>
          {c.assumptions.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-medium">Formato por confirmar con la importación del cliente:</p>
              <ul className="mt-1 list-disc pl-4">{c.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-zinc-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-zinc-900">Vista previa</h2>
              {loading || !batch ? (
                <p className="mt-1 flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Leyendo rendiciones aprobadas…</p>
              ) : (
                <p className="mt-1 text-sm text-zinc-600">
                  {batch.ready.length} listas · {batch.blocked.length} con problemas · Debe {formatCurrency(batch.totals.debit, BASE_CURRENCY)} · Haber {formatCurrency(batch.totals.credit, BASE_CURRENCY)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={exportNow}
              disabled={!canExport}
              className="inline-flex items-center gap-2 rounded-lg bg-cta-600 px-4 py-2 text-sm font-medium text-cta-fg hover:bg-cta-700 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
              Exportar {batch?.ready.length ?? 0} rendiciones
            </button>
          </div>

          {issues.length > 0 && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> No se puede exportar hasta resolver:</p>
              <ul className="mt-1 list-disc pl-5">
                {issues.map(([k, n]) => <li key={k}>{ISSUE_LABELS[k]}: {n}</li>)}
              </ul>
              {userRole === 'superadmin' && (
                <Link to="/admin/settings" className="mt-2 inline-block underline">Completar el mapeo en Ajustes</Link>
              )}
            </div>
          )}
          {warnings.length > 0 && (
            <ul className="mt-3 space-y-0.5 text-xs text-amber-700">
              {warnings.map(([k, n]) => <li key={k}>{WARNING_LABELS[k]}: {n}</li>)}
            </ul>
          )}

          {batch && batch.journals.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Cuenta</th>
                    <th className="py-2 pr-3 text-right">Debe</th>
                    <th className="py-2 pr-3 text-right">Haber</th>
                    <th className="py-2 pr-3">C. costo</th>
                    <th className="py-2 pr-3">Glosa</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.journals.slice(0, PREVIEW_ROWS).map((j) => (
                    j.issues.length > 0 ? (
                      <tr key={j.expenseId} className="border-t border-zinc-100 text-red-700">
                        <td className="py-1.5 pr-3">{j.date}</td>
                        <td className="py-1.5 pr-3" colSpan={5}>{j.memo} — {j.issues.map((i) => ISSUE_LABELS[i]).join(', ')}</td>
                      </tr>
                    ) : j.lines.map((l, n) => (
                      <tr key={`${j.expenseId}-${n}`} className={n === 0 ? 'border-t border-zinc-100' : ''}>
                        <td className="py-1.5 pr-3 text-zinc-500">{n === 0 ? j.date : ''}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs">{l.account}</td>
                        <td className="py-1.5 pr-3 text-right">{l.debit ? formatCurrency(l.debit, j.currency) : ''}</td>
                        <td className="py-1.5 pr-3 text-right">{l.credit ? formatCurrency(l.credit, j.currency) : ''}</td>
                        <td className="py-1.5 pr-3">{l.costCentre ?? ''}</td>
                        <td className="py-1.5 pr-3 text-zinc-600">{n === 0 ? l.memo : ''}</td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
              {batch.journals.length > PREVIEW_ROWS && (
                <p className="mt-2 text-xs text-zinc-500">Se muestran {PREVIEW_ROWS} de {batch.journals.length} rendiciones; el archivo las incluye todas.</p>
              )}
            </div>
          )}
          {batch && batch.journals.length === 0 && !loading && (
            <p className="mt-4 text-sm text-zinc-500">No hay rendiciones aprobadas por exportar en el período.</p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-zinc-100">
          <h2 className="font-semibold text-zinc-900">Exportaciones anteriores</h2>
          {runs.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Todavía no hay exportaciones.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100">
              {runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
                    {new Date(r.createdAt).toLocaleString()} · {r.createdByName} · {CONNECTORS[r.connector]?.label ?? r.connector}
                    {' · '}{r.filters.from} a {r.filters.to} · {r.count} rendiciones · {formatCurrency(r.totalBase, r.currency)}
                    {r.reExported > 0 && <span className="text-amber-700">({r.reExported} reexportadas)</span>}
                  </span>
                  <button type="button" onClick={() => downloadRun(r)} className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                    <Download className="h-4 w-4" aria-hidden="true" /> Descargar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
}
