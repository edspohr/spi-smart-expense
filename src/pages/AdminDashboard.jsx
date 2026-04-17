import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import StatCardLarge from '../components/StatCardLarge';
import ProjectCard from '../components/ProjectCard';
import AnomalyRow from '../components/AnomalyRow';
import TeamTable from '../components/TeamTable';
import EmptyState from '../components/EmptyState';
import ExpenseDetailsModal from '../components/ExpenseDetailsModal';
import DashboardFilters from '../components/DashboardFilters';
import { getPeriodRange } from '../lib/dateFilters';
import LineChartMonthly from '../components/LineChartMonthly';
import DonutCategories from '../components/DonutCategories';
import CollapsibleSection from '../components/CollapsibleSection';
import { Skeleton } from '../components/Skeleton';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { formatCurrency } from '../utils/format';
import { TrendingUp, CheckCircle, Activity, Folder, Clock, FolderOpen, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

// ── Constants ───────────────────────────────────────────────────────────────

const FILTERS_STORAGE = 'spi_dashboard_filters_v1';
const ANOMALIES_STORAGE = 'spi_dashboard_anomalies_open_v1';
const DEFAULT_FILTERS = { clientName: '', projectId: '', period: 'last30' };

const TOP_PROJECTS = 5;
const ANOMALY_ACTIVITY_DAYS = 30;
const OUTLIER_MIN_SAMPLES = 5;
const OUTLIER_MULTIPLIER = 3;
const LINE_CHART_MONTHS = 6;

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function copEquivalent(exp) {
  const c = exp.currency || 'COP';
  if (c === 'USD') return Number(exp.amountCOP) || null;
  if (c === 'CLP') return null;
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

function isInPeriod(dateStr, period) {
  const d = parseDate(dateStr);
  if (!d) return false;
  const range = getPeriodRange(period);
  if (!range) return true;
  return d >= range.start && d <= range.end;
}

function applyFilters(expenses, filters, projectsMap) {
  return expenses.filter(e => {
    if (filters.clientName) {
      const client = e.projectId ? (projectsMap[e.projectId]?.client || '') : '';
      if (client !== filters.clientName) return false;
    }
    if (filters.projectId && e.projectId !== filters.projectId) return false;
    if (filters.period && !isInPeriod(e.date, filters.period)) return false;
    return true;
  });
}

function sumByCurrency(list) {
  const totals = {};
  list.forEach(e => {
    const c = e.currency || 'COP';
    totals[c] = (totals[c] || 0) + (Number(e.amount) || 0);
  });
  return totals;
}

function sumCopEquivalent(list) {
  let total = 0;
  list.forEach(e => {
    const cop = copEquivalent(e);
    if (cop !== null) total += cop;
  });
  return total;
}

function renderStack(byCurrency) {
  const order = ['COP', 'USD', 'CLP'];
  const keys = [
    ...order.filter(c => byCurrency[c] !== undefined),
    ...Object.keys(byCurrency).filter(c => !order.includes(c)),
  ];
  if (keys.length === 0) {
    return <span className="text-3xl font-bold text-slate-900">{formatCurrency(0)}</span>;
  }
  return (
    <div className="flex flex-col leading-tight">
      {keys.map((c, i) => (
        <span key={c} className={i === 0
          ? 'text-3xl font-bold text-slate-900'
          : 'text-sm font-semibold text-slate-400 mt-1'}>
          {formatCurrency(byCurrency[c], c)}
          <span className="text-xs font-normal ml-1 text-slate-400">{c}</span>
        </span>
      ))}
    </div>
  );
}

function BlockHeader({ eyebrow, title, subtitle }) {
  return (
    <div className="mb-5">
      {eyebrow && (
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{eyebrow}</p>
      )}
      <div className="flex items-end justify-between">
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Derivations ─────────────────────────────────────────────────────────────

function buildLineChartData(expenses) {
  const now = new Date();
  const buckets = [];
  const keyMap = new Map();
  for (let i = LINE_CHART_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
    const bucket = { key, label, rendido: 0, aprobado: 0 };
    buckets.push(bucket);
    keyMap.set(key, bucket);
  }
  expenses.forEach(e => {
    if (e.status === 'rejected') return;
    const d = parseDate(e.date);
    if (!d) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const b = keyMap.get(key);
    if (!b) return;
    const cop = copEquivalent(e);
    if (cop === null) return;
    b.rendido += cop;
    if (e.status === 'approved') b.aprobado += cop;
  });
  return buckets;
}

function buildDonutData(filteredExpenses) {
  const byCat = new Map();
  filteredExpenses.forEach(e => {
    if (e.status === 'rejected') return;
    const cop = copEquivalent(e);
    if (cop === null) return;
    const cat = e.category || 'Otros (sin categoría)';
    byCat.set(cat, (byCat.get(cat) || 0) + cop);
  });
  const entries = [...byCat.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  if (entries.length <= 8) return entries;
  const top = entries.slice(0, 7);
  const restSum = entries.slice(7).reduce((s, e) => s + e.value, 0);
  return [...top, { name: 'Otras', value: restSum }];
}

function buildRankedGroups(filteredExpenses) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const groups = new Map();
  filteredExpenses.forEach(e => {
    if (e.status === 'rejected') return;
    const d = parseDate(e.date);
    if (!d || d < cutoff || d > now) return;
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
  return [...groups.values()]
    .filter(g => g.copTotal > 0)
    .sort((a, b) => {
      if (b.copTotal !== a.copTotal) return b.copTotal - a.copTotal;
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
      if (g.eventName) href = `/admin/reports?eventName=${encodeURIComponent(g.eventName)}`;
      else if (g.projectId) href = `/admin/projects/${g.projectId}`;
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
}

// Team rows intentionally ignore the period filter — the team table is a
// historical activity record, not a period-filtered snapshot. "Últimos 30 días"
// column is always a rolling 30-day window regardless of filter.period.
function buildTeamRows(clientProjectFilteredExpenses, users) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const userIndex = new Map(users.map(u => [u.id, u]));
  const agg = new Map();
  clientProjectFilteredExpenses.forEach(e => {
    if (e.status === 'rejected') return;
    if (!e.userId || !userIndex.has(e.userId)) return;
    if (!agg.has(e.userId)) agg.set(e.userId, {
      id: e.userId,
      count: 0,
      last30ByCurrency: {},
      lastActivityDate: null,
    });
    const row = agg.get(e.userId);
    row.count += 1;
    const d = parseDate(e.date);
    if (d && d >= thirtyDaysAgo && d <= now) {
      const c = e.currency || 'COP';
      row.last30ByCurrency[c] = (row.last30ByCurrency[c] || 0) + (Number(e.amount) || 0);
    }
    if (e.date && (!row.lastActivityDate || e.date > row.lastActivityDate)) {
      row.lastActivityDate = e.date;
    }
  });
  return [...agg.values()]
    .map(r => {
      const u = userIndex.get(r.id);
      return { ...r, displayName: u?.displayName || u?.email || 'Usuario', email: u?.email || '' };
    })
    .sort((a, b) => (b.lastActivityDate || '').localeCompare(a.lastActivityDate || ''));
}

function buildAnomalies(expenses) {
  const anomalies = [];
  const now = new Date();
  const activityCutoff = new Date(now.getTime() - ANOMALY_ACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  const nonRejected = expenses.filter(e => e.status !== 'rejected');

  // 1: missing receipt + voucher
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

  // 2: USD without TRM
  nonRejected.forEach(e => {
    if (e.currency !== 'USD' || e.trm) return;
    anomalies.push({
      id: `trm-${e.id}`,
      type: 'trm-missing',
      priority: 2,
      date: e.date,
      description: `${e.userName || 'Usuario'} — ${formatCurrency(Number(e.amount) || 0, 'USD')} USD — ${e.date || 'sin fecha'}`,
      expense: e,
    });
  });

  // 3: duplicates
  const dupeGroups = new Map();
  nonRejected.forEach(e => {
    if (!e.userId || !e.date || !e.amount) return;
    const key = `${e.userId}|${Number(e.amount)}|${e.date}|${normalizeMerchant(e.merchant)}`;
    if (!dupeGroups.has(key)) dupeGroups.set(key, []);
    dupeGroups.get(key).push(e);
  });
  dupeGroups.forEach(list => {
    if (list.length < 2) return;
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

  // 4: outliers per (category, currency), 30d window, min 5 samples
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
    const m = median(list.map(e => Number(e.amount) || 0));
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

  anomalies.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (b.date || '').localeCompare(a.date || '');
  });
  return anomalies;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailsExpense, setDetailsExpense] = useState(null);
  const [filters, setFilters] = useState(() => {
    try {
      const raw = localStorage.getItem(FILTERS_STORAGE);
      if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return DEFAULT_FILTERS;
  });
  const navigate = useNavigate();

  // Persist filters
  useEffect(() => {
    try { localStorage.setItem(FILTERS_STORAGE, JSON.stringify(filters)); } catch { /* ignore */ }
  }, [filters]);

  async function fetchAll() {
    const [usersSnap, expensesSnap, projectsSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('role', 'in', ['professional', 'admin', 'assistant']))),
      getDocs(collection(db, 'expenses')),
      getDocs(collection(db, 'projects')),
    ]);
    setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setExpenses(expensesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setProjects(projectsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => {
    async function init() {
      try { await fetchAll(); }
      catch (e) { console.error('Error loading dashboard:', e); }
      finally { setLoading(false); }
    }
    init();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchAll();
      toast.success('Actualizado');
    } catch (e) {
      console.error('Error refreshing:', e);
      toast.error('Error al actualizar');
    } finally {
      setRefreshing(false);
    }
  };

  const projectsMap = useMemo(() => {
    const m = {};
    projects.forEach(p => { m[p.id] = p; });
    return m;
  }, [projects]);

  const filteredExpenses = useMemo(
    () => applyFilters(expenses, filters, projectsMap),
    [expenses, filters, projectsMap]
  );

  // Team table ignores period filter (FIX 1) — client+project only.
  const teamFilteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (filters.clientName) {
        const client = e.projectId ? (projectsMap[e.projectId]?.client || '') : '';
        if (client !== filters.clientName) return false;
      }
      if (filters.projectId && e.projectId !== filters.projectId) return false;
      return true;
    });
  }, [expenses, filters.clientName, filters.projectId, projectsMap]);

  const stats = useMemo(() => {
    const nonRejected = filteredExpenses.filter(e => e.status !== 'rejected');
    const approved = filteredExpenses.filter(e => e.status === 'approved');
    const pending = filteredExpenses.filter(e => e.status === 'pending');

    const rendidoByCurrency = sumByCurrency(nonRejected);
    const aprobadoByCurrency = sumByCurrency(approved);
    const pendingByCurrency = sumByCurrency(pending);

    const rendidoCOP = sumCopEquivalent(nonRejected);
    const aprobadoCOP = sumCopEquivalent(approved);
    const pendingCOP = sumCopEquivalent(pending);
    // "— aprobado" when denominator is 0 (misleading to show "0% aprobado").
    const approvedPctLabel = rendidoCOP > 0
      ? `${Math.round((aprobadoCOP / rendidoCOP) * 100)}% aprobado`
      : '— aprobado';

    // Promedio por gasto: COP-equivalent mean
    const copEligible = nonRejected
      .map(e => copEquivalent(e))
      .filter(v => v !== null);
    const avgCOP = copEligible.length > 0
      ? copEligible.reduce((s, v) => s + v, 0) / copEligible.length
      : 0;

    // Proyectos activos: unique projectId count; eventos: unique eventName count
    const projectIds = new Set();
    const eventNames = new Set();
    nonRejected.forEach(e => {
      if (e.projectId) projectIds.add(e.projectId);
      if (e.eventName) eventNames.add(e.eventName);
    });

    return {
      rendidoByCurrency,
      aprobadoByCurrency,
      pendingByCurrency,
      approvedPctLabel,
      pendingCOP,
      avgCOP,
      expenseCount: nonRejected.length,
      projectCount: projectIds.size,
      eventCount: eventNames.size,
      pendingCount: pending.length,
    };
  }, [filteredExpenses]);

  const lineChartData = useMemo(() => buildLineChartData(expenses), [expenses]);
  const lineChartHasEnough = useMemo(
    () => lineChartData.reduce((s, b) => s + b.rendido + b.aprobado, 0) > 0,
    [lineChartData]
  );

  const donutData = useMemo(() => buildDonutData(filteredExpenses), [filteredExpenses]);
  const rankedGroups = useMemo(() => buildRankedGroups(filteredExpenses), [filteredExpenses]);
  const teamRows = useMemo(() => buildTeamRows(teamFilteredExpenses, users), [teamFilteredExpenses, users]);
  const anomalies = useMemo(() => buildAnomalies(expenses), [expenses]);

  if (loading) {
    return (
      <Layout title="Dashboard">
        <div className="h-20 rounded-2xl bg-white border border-slate-100 mb-6 flex items-center px-4 gap-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-28 ml-auto" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 h-44">
              <Skeleton className="h-12 w-12 rounded-2xl mb-5" />
              <Skeleton className="h-3 w-24 mb-3" />
              <Skeleton className="h-8 w-32" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-12">
          <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-slate-100 h-80">
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-6 w-48 mb-6" />
            <Skeleton className="h-[220px] w-full" />
          </div>
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 h-80">
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-6 w-40 mb-6" />
            <Skeleton className="h-[220px] w-full" />
          </div>
        </div>
      </Layout>
    );
  }

  // Values for stat cards
  const rendidoValue = renderStack(stats.rendidoByCurrency);
  const aprobadoValue = renderStack(stats.aprobadoByCurrency);
  const promedioValue = <p className="text-3xl font-bold text-slate-900 leading-tight">{formatCurrency(Math.round(stats.avgCOP), 'COP')}</p>;
  const proyectosValue = <p className="text-3xl font-bold text-slate-900 leading-tight">{stats.projectCount}</p>;
  const pendingValue = <p className="text-3xl font-bold text-slate-900 leading-tight">{stats.pendingCount}</p>;

  return (
    <Layout title="Dashboard">
      <DashboardFilters
        filters={filters}
        onChange={setFilters}
        projects={projects}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {/* ─── Stat cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
        <StatCardLarge
          label="Total rendido"
          icon={TrendingUp}
          iconBgClass="bg-blue-50"
          iconColorClass="text-blue-600"
          value={rendidoValue}
          subtitle={stats.approvedPctLabel}
        />
        <StatCardLarge
          label="Aprobado"
          icon={CheckCircle}
          iconBgClass="bg-green-50"
          iconColorClass="text-green-600"
          value={aprobadoValue}
          subtitle={`${formatCurrency(stats.pendingCOP, 'COP')} pendiente por aprobar`}
        />
        <StatCardLarge
          label="Promedio por gasto"
          icon={Activity}
          iconBgClass="bg-purple-50"
          iconColorClass="text-purple-600"
          value={promedioValue}
          subtitle={`${stats.expenseCount} gasto${stats.expenseCount === 1 ? '' : 's'} registrado${stats.expenseCount === 1 ? '' : 's'}`}
        />
        <StatCardLarge
          label="Proyectos activos"
          icon={Folder}
          iconBgClass="bg-orange-50"
          iconColorClass="text-orange-600"
          value={proyectosValue}
          subtitle={`${stats.eventCount} evento${stats.eventCount === 1 ? '' : 's'}`}
        />
        <StatCardLarge
          label="Gastos por revisar"
          icon={Clock}
          iconBgClass="bg-red-50"
          iconColorClass="text-red-600"
          value={pendingValue}
          subtitle={`${formatCurrency(stats.pendingCOP, 'COP')} por aprobar`}
          onClick={() => navigate('/admin/approvals')}
          ariaLabel="Ver gastos por revisar"
        />
      </div>

      {/* ─── Chart row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-12">
        <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-slate-100">
          <BlockHeader
            eyebrow="Tendencia"
            title="Rendición mensual"
            subtitle="Últimos 6 meses"
          />
          <LineChartMonthly data={lineChartData} hasEnoughData={lineChartHasEnough} />
        </div>
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100">
          <BlockHeader eyebrow="Distribución" title="Gastos por categoría" />
          <DonutCategories data={donutData} totalLabel="Total" />
        </div>
      </div>

      {/* ─── Hero: Proyectos y eventos ─────────────────────────────────── */}
      <section className="mb-12">
        <BlockHeader eyebrow="Hero" title="Proyectos y eventos activos" />
        {rankedGroups.length < 3 ? (
          <div className="bg-white rounded-2xl border border-slate-100">
            <EmptyState
              icon={FolderOpen}
              title="Sin actividad suficiente en el período"
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

      {/* ─── Equipo ────────────────────────────────────────────────────── */}
      <section className="mb-12">
        <BlockHeader eyebrow="Equipo" title="Actividad por persona" />
        {teamRows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100">
            <EmptyState
              icon={FolderOpen}
              title="Sin actividad del equipo"
              description="Cuando alguien rinda un gasto aparecerá aquí."
              small
            />
          </div>
        ) : (
          <TeamTable rows={teamRows} />
        )}
      </section>

      {/* ─── Anomalías (collapsed) ─────────────────────────────────────── */}
      <div className="mb-8">
        <CollapsibleSection
          eyebrow="Revisión"
          title="Anomalías"
          count={anomalies.length}
          storageKey={ANOMALIES_STORAGE}
          defaultOpen={false}
        >
          {anomalies.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Sin anomalías detectadas"
              description="No hay rendiciones sin comprobante, duplicados, TRM faltantes ni montos atípicos."
              small
            />
          ) : (
            <div className="p-2 divide-y divide-slate-100">
              {anomalies.map(a => (
                <AnomalyRow
                  key={a.id}
                  type={a.type}
                  description={a.description}
                  onClick={() => setDetailsExpense(a.expense)}
                />
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>

      <ExpenseDetailsModal
        isOpen={!!detailsExpense}
        onClose={() => setDetailsExpense(null)}
        expense={detailsExpense}
      />
    </Layout>
  );
}
