import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import KpiCard from '../components/KpiCard';
import ProjectCard from '../components/ProjectCard';
import AnomalyRow from '../components/AnomalyRow';
import TeamTable from '../components/TeamTable';
import EmptyState from '../components/EmptyState';
import ExpenseDetailsModal from '../components/ExpenseDetailsModal';
import { Skeleton } from '../components/Skeleton';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { formatCurrency } from '../utils/format';
import { Clock, CheckCircle, Wallet, FolderOpen, CheckCircle2 } from 'lucide-react';

const TOP_PROJECTS = 5;
const ANOMALIES_VISIBLE_DEFAULT = 10;
const OUTLIER_MIN_SAMPLES = 5;
const OUTLIER_MULTIPLIER = 3;
const ACTIVITY_DAYS = 30;

// ── Helpers ─────────────────────────────────────────────────────────────────

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function parseDate(s) { if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d; }

function copEquivalent(exp) {
  const c = exp.currency || 'COP';
  if (c === 'USD') return Number(exp.amountCOP) || null;
  if (c === 'CLP') return null; // CLP excluded — no FX capture
  return Number(exp.amount) || 0;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function normalizeMerchant(m) {
  return (m || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function renderTotals(byCurrency, emphasisClass, mutedClass) {
  const order = ['COP', 'USD', 'CLP'];
  const keys = [
    ...order.filter(c => byCurrency[c] !== undefined),
    ...Object.keys(byCurrency).filter(c => !order.includes(c)),
  ];
  if (keys.length === 0) return <p className={emphasisClass}>{formatCurrency(0)}</p>;
  return (
    <div className="flex flex-col leading-tight">
      {keys.map((c, i) => (
        <span key={c} className={i === 0 ? emphasisClass : mutedClass}>
          {formatCurrency(byCurrency[c], c)}
          <span className="text-xs font-normal ml-1 text-slate-400">{c}</span>
        </span>
      ))}
    </div>
  );
}

function BlockHeader({ eyebrow, title, action }) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{eyebrow}</p>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      </div>
      {action}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailsExpense, setDetailsExpense] = useState(null);
  const [anomaliesExpanded, setAnomaliesExpanded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        const [usersSnap, expensesSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('role', 'in', ['professional', 'admin', 'assistant']))),
          getDocs(collection(db, 'expenses')),
        ]);
        setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setExpenses(expensesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('Error loading dashboard:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const derived = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const activityCutoff = new Date(now.getTime() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000);

    const nonRejected = expenses.filter(e => e.status !== 'rejected');
    const pending = expenses.filter(e => e.status === 'pending');
    const approvedOrPending = expenses.filter(e => e.status === 'approved' || e.status === 'pending');

    // ── Block 1 KPIs ────────────────────────────────────────────────────────
    const pendingByCurrency = {};
    pending.forEach(e => {
      const c = e.currency || 'COP';
      pendingByCurrency[c] = (pendingByCurrency[c] || 0) + (Number(e.amount) || 0);
    });

    const thisMonthByCurrency = {};
    approvedOrPending.forEach(e => {
      const d = parseDate(e.date);
      if (!d || d < monthStart || d > now) return;
      const c = e.currency || 'COP';
      thisMonthByCurrency[c] = (thisMonthByCurrency[c] || 0) + (Number(e.amount) || 0);
    });

    // users.balance is single-currency COP. Multi-currency balance tracking
    // would require per-currency fields on the user doc (future work if expanded).
    const toReimburseCOP = users.reduce((acc, u) => {
      const b = Number(u.balance) || 0;
      return b < 0 ? acc + Math.abs(b) : acc;
    }, 0);

    // ── Block 2 Top Projects/Events ────────────────────────────────────────
    const groups = new Map();
    nonRejected.forEach(e => {
      const d = parseDate(e.date);
      if (!d || d < activityCutoff || d > now) return;
      const key = e.eventName || (e.projectId ? `project:${e.projectId}` : 'unassigned');
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          eventName: e.eventName || null,
          projectId: e.projectId || null,
          projectName: e.projectName || null,
          totalByCurrency: {},
          copTotal: 0,
          categoryAmounts: {},
          lastDate: null,
          rawAmountTotal: 0,
        });
      }
      const g = groups.get(key);
      const c = e.currency || 'COP';
      const amt = Number(e.amount) || 0;
      g.totalByCurrency[c] = (g.totalByCurrency[c] || 0) + amt;
      const cop = copEquivalent(e);
      if (cop !== null) g.copTotal += cop;
      const cat = e.category || 'Otros (sin categoría)';
      g.categoryAmounts[cat] = (g.categoryAmounts[cat] || 0) + amt;
      g.rawAmountTotal += amt;
      if (!g.lastDate || d > g.lastDate) g.lastDate = d;
    });

    // Skip groups with zero COP equivalent (e.g., CLP-only projects)
    const rankedGroups = [...groups.values()]
      .filter(g => g.copTotal > 0)
      .sort((a, b) => {
        if (b.copTotal !== a.copTotal) return b.copTotal - a.copTotal;
        // Stable tiebreaker: most recent activity first
        return (b.lastDate?.getTime() || 0) - (a.lastDate?.getTime() || 0);
      })
      .slice(0, TOP_PROJECTS)
      .map(g => {
        const categories = Object.entries(g.categoryAmounts)
          .map(([name, amount]) => ({
            name,
            amount,
            pct: g.rawAmountTotal > 0 ? (amount / g.rawAmountTotal) * 100 : 0,
          }))
          .sort((a, b) => b.pct - a.pct);
        const title = g.eventName || g.projectName || 'Sin asignar';
        const subtitle = g.eventName && g.projectName && g.eventName !== g.projectName ? g.projectName : null;
        let href = null;
        if (g.eventName) {
          href = `/admin/reports?eventName=${encodeURIComponent(g.eventName)}`;
        } else if (g.projectId) {
          href = `/admin/projects/${g.projectId}`;
        }
        return {
          key: g.key,
          title,
          subtitle,
          totalByCurrency: g.totalByCurrency,
          categories,
          lastActivityDate: g.lastDate ? g.lastDate.toISOString().slice(0, 10) : null,
          href,
        };
      });

    // ── Block 3 Anomalies ──────────────────────────────────────────────────
    const anomalies = [];

    // Priority 1: missing receipt and voucher
    nonRejected.forEach(e => {
      if (e.status !== 'pending' && e.status !== 'approved') return;
      if (!e.receiptUrl && !e.voucherUrl && !e.imageUrl) {
        anomalies.push({
          id: `miss-${e.id}`,
          type: 'missing-receipt',
          priority: 1,
          date: e.date,
          description: `${e.userName || 'Usuario'} — ${formatCurrency(Number(e.amount) || 0, e.currency || 'COP')} ${e.currency || 'COP'} — ${e.date || 'sin fecha'}`,
          expense: e,
        });
      }
    });

    // Priority 2: USD without TRM
    nonRejected.forEach(e => {
      if (e.currency !== 'USD') return;
      if (e.trm) return;
      anomalies.push({
        id: `trm-${e.id}`,
        type: 'trm-missing',
        priority: 2,
        date: e.date,
        description: `${e.userName || 'Usuario'} — ${formatCurrency(Number(e.amount) || 0, 'USD')} USD — ${e.date || 'sin fecha'}`,
        expense: e,
      });
    });

    // Priority 3: duplicates (same userId + amount + date + normalized merchant)
    const dupeGroups = new Map();
    nonRejected.forEach(e => {
      if (!e.userId || !e.date || !e.amount) return;
      const key = `${e.userId}|${Number(e.amount)}|${e.date}|${normalizeMerchant(e.merchant)}`;
      if (!dupeGroups.has(key)) dupeGroups.set(key, []);
      dupeGroups.get(key).push(e);
    });
    dupeGroups.forEach((list) => {
      if (list.length < 2) return;
      // Emit one anomaly per group, pointing at the newest expense.
      // Show count prefix only when >=3 (a pair is implicitly duplicate; >=3 is worse).
      const sorted = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const head = sorted[0];
      const countPrefix = list.length >= 3 ? `${list.length} ocurrencias — ` : '';
      anomalies.push({
        id: `dup-${head.id}`,
        type: 'duplicate',
        priority: 3,
        date: head.date,
        description: `${countPrefix}${head.userName || 'Usuario'} — ${formatCurrency(Number(head.amount) || 0, head.currency || 'COP')} ${head.currency || 'COP'} — ${head.date}`,
        expense: head,
      });
    });

    // Priority 4: outliers (>3× median for (category, currency), min 5 samples, 30d window).
    // Bucketing by currency prevents cross-currency comparisons (a $100 USD expense
    // being flagged against a COP-dominated category median). CLP excluded entirely —
    // same convention as the rest of the dashboard.
    const catCurrencyBuckets = new Map();
    nonRejected.forEach(e => {
      const d = parseDate(e.date);
      if (!d || d < activityCutoff || d > now) return;
      const cur = e.currency || 'COP';
      if (cur === 'CLP') return;
      const cat = e.category || 'Otros (sin categoría)';
      const key = `${cat}|${cur}`;
      if (!catCurrencyBuckets.has(key)) catCurrencyBuckets.set(key, { cat, cur, list: [] });
      catCurrencyBuckets.get(key).list.push(e);
    });
    catCurrencyBuckets.forEach(({ cat, cur, list }) => {
      if (list.length < OUTLIER_MIN_SAMPLES) return;
      const amounts = list.map(e => Number(e.amount) || 0);
      const m = median(amounts);
      if (m <= 0) return;
      list.forEach(e => {
        const amt = Number(e.amount) || 0;
        if (amt > OUTLIER_MULTIPLIER * m) {
          anomalies.push({
            id: `out-${e.id}`,
            type: 'outlier',
            priority: 4,
            date: e.date,
            description: `${e.userName || 'Usuario'} — ${formatCurrency(amt, cur)} ${cur} en ${cat} (mediana ${formatCurrency(m, cur)})`,
            expense: e,
          });
        }
      });
    });

    // Sort by priority asc, then date desc (newest first)
    anomalies.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (b.date || '').localeCompare(a.date || '');
    });

    // ── Block 4 Team ───────────────────────────────────────────────────────
    const userIndex = new Map(users.map(u => [u.id, u]));
    const teamAgg = new Map();
    expenses.forEach(e => {
      if (e.status === 'rejected') return;
      if (!e.userId) return;
      if (!userIndex.has(e.userId)) return;
      if (!teamAgg.has(e.userId)) teamAgg.set(e.userId, {
        id: e.userId,
        count: 0,
        thisMonthByCurrency: {},
        lastActivityDate: null,
      });
      const agg = teamAgg.get(e.userId);
      agg.count += 1;
      const d = parseDate(e.date);
      if (d && d >= monthStart && d <= now) {
        const c = e.currency || 'COP';
        agg.thisMonthByCurrency[c] = (agg.thisMonthByCurrency[c] || 0) + (Number(e.amount) || 0);
      }
      if (e.date && (!agg.lastActivityDate || e.date > agg.lastActivityDate)) {
        agg.lastActivityDate = e.date;
      }
    });
    const teamRows = [...teamAgg.values()]
      .map(agg => {
        const u = userIndex.get(agg.id);
        return {
          ...agg,
          displayName: u?.displayName || u?.email || 'Usuario',
          email: u?.email || '',
        };
      })
      .sort((a, b) => (b.lastActivityDate || '').localeCompare(a.lastActivityDate || ''));

    return {
      pendingCount: pending.length,
      pendingByCurrency,
      thisMonthByCurrency,
      toReimburseCOP,
      rankedGroups,
      anomalies,
      teamRows,
    };
  }, [users, expenses]);

  if (loading) {
    return (
      <Layout title="Dashboard">
        {/* KPI strip skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-100 h-28 flex flex-col justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-28" />
            </div>
          ))}
        </div>
        {/* Projects grid skeleton */}
        <div className="mb-12">
          <Skeleton className="h-3 w-16 mb-2" />
          <Skeleton className="h-7 w-72 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-white p-5 rounded-2xl border border-slate-100 h-48">
                <Skeleton className="h-5 w-3/4 mb-4" />
                <Skeleton className="h-9 w-40 mb-5" />
                <Skeleton className="h-2 w-full rounded-full mb-2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        </div>
        {/* Anomalies skeleton */}
        <div className="mb-12">
          <Skeleton className="h-3 w-16 mb-2" />
          <Skeleton className="h-7 w-40 mb-6" />
          <div className="bg-white rounded-2xl border border-slate-100 p-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="h-4 w-4 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Team table skeleton */}
        <div>
          <Skeleton className="h-3 w-16 mb-2" />
          <Skeleton className="h-7 w-28 mb-6" />
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center py-3 gap-6">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-10 ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  const {
    pendingCount,
    pendingByCurrency,
    thisMonthByCurrency,
    toReimburseCOP,
    rankedGroups,
    anomalies,
    teamRows,
  } = derived;

  // ── Block 1 KPI values ────────────────────────────────────────────────────
  const pendingValue = pendingCount === 0
    ? <p className="text-3xl font-bold text-slate-900">0</p>
    : (
      <div>
        <p className="text-3xl font-bold text-slate-900 leading-tight">{pendingCount}</p>
        <div className="mt-1">
          {renderTotals(pendingByCurrency, 'text-xs font-semibold text-slate-500', 'text-[11px] font-semibold text-slate-400')}
        </div>
      </div>
    );

  const approvedMonthValue = renderTotals(
    thisMonthByCurrency,
    'text-3xl font-bold text-slate-900',
    'text-sm font-semibold text-slate-400 mt-1',
  );

  const toReimburseValue = (
    <div>
      <p className="text-3xl font-bold text-slate-900 leading-tight">{formatCurrency(toReimburseCOP, 'COP')}</p>
      <p className="text-[11px] text-slate-400 mt-1">COP (solo saldos en rojo)</p>
    </div>
  );

  // ── Anomalies visible slice ───────────────────────────────────────────────
  const anomaliesVisible = anomaliesExpanded ? anomalies : anomalies.slice(0, ANOMALIES_VISIBLE_DEFAULT);
  const anomaliesOverflow = Math.max(0, anomalies.length - ANOMALIES_VISIBLE_DEFAULT);

  return (
    <Layout title="Dashboard">
      {/* ─── Block 1: KPI strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <KpiCard
          label="Pendiente aprobar"
          value={pendingValue}
          tone="neutral"
          icon={Clock}
          onClick={() => navigate('/admin/approvals')}
          ariaLabel="Ver rendiciones pendientes"
        />
        <KpiCard
          label="Aprobado este mes"
          value={approvedMonthValue}
          tone="neutral"
          icon={CheckCircle}
        />
        <KpiCard
          label="Saldos por rendir"
          value={toReimburseValue}
          tone="neutral"
          icon={Wallet}
          onClick={() => navigate('/admin/balances')}
          ariaLabel="Ver balances"
        />
      </div>

      {/* ─── Block 2: Projects & Events (hero) ──────────────────────────── */}
      <section className="mb-12">
        <BlockHeader eyebrow="Hero" title="Proyectos y eventos activos" />
        {rankedGroups.length < 3 ? (
          <div className="bg-white rounded-2xl border border-slate-100">
            <EmptyState
              icon={FolderOpen}
              title="Sin actividad en los últimos 30 días"
              description={rankedGroups.length === 0
                ? 'Cuando haya gastos recientes aparecerán aquí los eventos y proyectos con mayor movimiento.'
                : 'Hay muy poca actividad; los rankings aparecen cuando hay al menos 3 grupos con movimiento.'}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {rankedGroups.map(g => (
              <ProjectCard
                key={g.key}
                title={g.title}
                subtitle={g.subtitle}
                totalByCurrency={g.totalByCurrency}
                categories={g.categories}
                lastActivityDate={g.lastActivityDate}
                href={g.href}
              />
            ))}
          </div>
        )}
      </section>

      {/* ─── Block 3: Anomalies ─────────────────────────────────────────── */}
      <section className="mb-12">
        <BlockHeader eyebrow="Revisión" title="Anomalías" />
        <div className="bg-white rounded-2xl border border-slate-100">
          {anomalies.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Sin anomalías detectadas"
              description="No hay rendiciones sin comprobante, duplicados, TRM faltantes ni montos atípicos."
              small
            />
          ) : (
            <>
              <div className="p-2 divide-y divide-slate-100">
                {anomaliesVisible.map(a => (
                  <AnomalyRow
                    key={a.id}
                    type={a.type}
                    description={a.description}
                    onClick={() => setDetailsExpense(a.expense)}
                  />
                ))}
              </div>
              {anomaliesOverflow > 0 && (
                <div className="px-5 py-3 border-t border-slate-100 text-center">
                  <button
                    type="button"
                    onClick={() => setAnomaliesExpanded(x => !x)}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 focus-ring rounded px-2 py-1"
                  >
                    {anomaliesExpanded ? 'Mostrar solo 10' : `Ver todas (${anomalies.length})`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ─── Block 4: Team ──────────────────────────────────────────────── */}
      <section>
        <BlockHeader eyebrow="Equipo" title="Actividad por persona" />
        {teamRows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100">
            <EmptyState
              icon={FolderOpen}
              title="Sin actividad del equipo"
              description="Cuando alguien rinda un gasto, aparecerá aquí."
              small
            />
          </div>
        ) : (
          <TeamTable rows={teamRows} />
        )}
      </section>

      {/* Expense details modal (anomaly rows trigger this) */}
      <ExpenseDetailsModal
        isOpen={!!detailsExpense}
        onClose={() => setDetailsExpense(null)}
        expense={detailsExpense}
      />
    </Layout>
  );
}
