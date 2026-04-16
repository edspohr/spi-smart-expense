import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import KpiCard from '../components/KpiCard';
import AlertsPanel from '../components/AlertsPanel';
import MiniTrendChart from '../components/MiniTrendChart';
import { Skeleton } from '../components/Skeleton';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { formatCurrency } from '../utils/format';
import { groupByCurrency } from '../utils/currencyHelpers';
import { CheckCircle, Clock, AlertTriangle, Users } from 'lucide-react';

const STALE_DAYS = 14;
const TREND_DAYS = 30;
const OVER_BUDGET_MULTIPLIER = 2;

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfPrevMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}
function endOfPrevMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
}

function parseExpenseCreatedAt(exp) {
  if (!exp.createdAt) return null;
  const d = new Date(exp.createdAt);
  return isNaN(d.getTime()) ? null : d;
}

function parseExpenseDate(exp) {
  if (!exp.date) return null;
  const d = new Date(exp.date);
  return isNaN(d.getTime()) ? null : d;
}

function buildTrendBuckets(expenses, days) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [];
  const map = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const bucket = { date: iso, value: 0 };
    buckets.push(bucket);
    map.set(iso, bucket);
  }
  expenses.forEach(exp => {
    const created = parseExpenseCreatedAt(exp);
    if (!created) return;
    const iso = created.toISOString().slice(0, 10);
    const bucket = map.get(iso);
    if (bucket) bucket.value += 1;
  });
  return buckets;
}

function sumByCurrency(expenses) {
  const totals = {};
  expenses.forEach(exp => {
    const currency = exp.currency || 'COP';
    if (!totals[currency]) totals[currency] = 0;
    totals[currency] += Number(exp.amount) || 0;
  });
  return totals;
}

function renderCurrencyStack(totals, emphasisClass = 'text-3xl font-extrabold text-slate-800', mutedClass = 'text-sm font-semibold text-slate-400 mt-0.5') {
  const order = ['COP', 'USD', 'CLP'];
  const currencies = [
    ...order.filter(c => totals[c]),
    ...Object.keys(totals).filter(c => !order.includes(c)),
  ];
  if (currencies.length === 0) {
    return <p className={emphasisClass}>{formatCurrency(0)}</p>;
  }
  return (
    <div className="flex flex-col leading-tight">
      {currencies.map((c, i) => (
        <span key={c} className={i === 0 ? emphasisClass : mutedClass}>
          {formatCurrency(totals[c], c)}
          <span className="text-xs font-normal ml-1">{c}</span>
        </span>
      ))}
    </div>
  );
}

function formatDeltaPercent(current, previous) {
  if (!previous || previous === 0) {
    if (!current) return null;
    return 'Sin comparable';
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}% vs mes anterior`;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        const [usersSnap, expensesSnap, allocationsSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('role', '==', 'professional'))),
          getDocs(collection(db, 'expenses')),
          getDocs(collection(db, 'allocations')),
        ]);

        setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setExpenses(expensesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setAllocations(allocationsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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
    const prevMonthStart = startOfPrevMonth(now);
    const prevMonthEnd = endOfPrevMonth(now);
    const staleCutoff = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const pending = expenses.filter(e => e.status === 'pending');
    const approvedOrPending = expenses.filter(e => e.status === 'approved' || e.status === 'pending');

    const thisMonthExpenses = approvedOrPending.filter(e => {
      const d = parseExpenseDate(e);
      return d && d >= monthStart && d <= now;
    });
    const lastMonthExpenses = approvedOrPending.filter(e => {
      const d = parseExpenseDate(e);
      return d && d >= prevMonthStart && d <= prevMonthEnd;
    });

    const totalPendingAmount = sumByCurrency(pending);
    const totalApprovedThisMonth = sumByCurrency(thisMonthExpenses);
    const totalApprovedLastMonth = sumByCurrency(lastMonthExpenses);

    const trmGapsList = expenses.filter(e => e.currency === 'USD' && !e.trm && e.status !== 'rejected');
    const trmGaps = trmGapsList.length;

    const staleApprovals = pending
      .map(e => ({ ...e, _createdAt: parseExpenseCreatedAt(e) }))
      .filter(e => e._createdAt && e._createdAt < staleCutoff)
      .sort((a, b) => a._createdAt - b._createdAt);

    // Over-budget calc: sum COP-equivalent rendered in last 30 days per user,
    // compared to 2x total allocations assigned in the same window.
    // NOTE: CLP expenses are intentionally excluded from the rendered total —
    // no FX rate is captured for CLP, and treating CLP as COP would create
    // false positives (~3.5x inflation). Users with only CLP expenses are
    // skipped. Users with zero allocations in the window are also skipped.
    const userAllocated30d = new Map();
    allocations.forEach(a => {
      const d = a.date ? new Date(a.date) : (a.createdAt ? new Date(a.createdAt) : null);
      if (!d || isNaN(d.getTime())) return;
      if (d < thirtyDaysAgo || d > now) return;
      const amt = Number(a.amount) || 0;
      userAllocated30d.set(a.userId, (userAllocated30d.get(a.userId) || 0) + amt);
    });

    const userRendered30d = new Map();
    expenses.forEach(exp => {
      if (exp.status === 'rejected') return;
      if (!exp.userId) return;
      const d = parseExpenseDate(exp);
      if (!d || d < thirtyDaysAgo || d > now) return;
      let copEquivalent = null;
      if (exp.currency === 'USD') {
        copEquivalent = Number(exp.amountCOP) || null;
      } else if (exp.currency === 'CLP') {
        copEquivalent = null;
      } else {
        copEquivalent = Number(exp.amount) || 0;
      }
      if (copEquivalent === null) return;
      userRendered30d.set(exp.userId, (userRendered30d.get(exp.userId) || 0) + copEquivalent);
    });

    const overBudgetUsers = [];
    users.forEach(u => {
      const allocated = userAllocated30d.get(u.id) || 0;
      if (allocated <= 0) return;
      const rendered = userRendered30d.get(u.id) || 0;
      if (rendered > allocated * OVER_BUDGET_MULTIPLIER) {
        overBudgetUsers.push({
          id: u.id,
          name: u.displayName || u.email || 'Usuario',
          rendered,
          allocated,
        });
      }
    });

    const trend30d = buildTrendBuckets(expenses, TREND_DAYS);

    // Primary currency for delta: prefer COP if present, else first available.
    const deltaCurrency = totalApprovedThisMonth.COP !== undefined
      ? 'COP'
      : (Object.keys(totalApprovedThisMonth)[0] || 'COP');
    const deltaString = formatDeltaPercent(
      totalApprovedThisMonth[deltaCurrency] || 0,
      totalApprovedLastMonth[deltaCurrency] || 0
    );

    // expensesByUser for the existing per-person card grid.
    const expensesByUser = {};
    expenses.forEach(exp => {
      if ((exp.status === 'approved' || exp.status === 'pending') && exp.userId) {
        if (!expensesByUser[exp.userId]) expensesByUser[exp.userId] = [];
        expensesByUser[exp.userId].push(exp);
      }
    });
    const mergedUsers = users
      .map(u => ({
        ...u,
        expensesByCurrency: groupByCurrency(expensesByUser[u.id] || []),
      }))
      .sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''));

    return {
      pendingCount: pending.length,
      totalPendingAmount,
      totalApprovedThisMonth,
      deltaString,
      trmGaps,
      staleApprovals,
      overBudgetUsers,
      trend30d,
      mergedUsers,
    };
  }, [users, expenses, allocations]);

  const alerts = useMemo(() => {
    const out = [];
    derived.staleApprovals.forEach(exp => {
      const days = Math.floor((Date.now() - exp._createdAt.getTime()) / (1000 * 60 * 60 * 24));
      out.push({
        id: `stale-${exp.id}`,
        severity: 'danger',
        title: 'Rendición sin revisar',
        description: `${exp.userName || 'Usuario'} — hace ${days} días`,
        href: '/admin/approvals',
      });
    });
    if (derived.trmGaps > 0) {
      out.push({
        id: 'trm-gaps',
        severity: 'warning',
        title: 'Gastos USD sin TRM',
        description: `${derived.trmGaps} gasto${derived.trmGaps === 1 ? '' : 's'} perdieron la captura automática`,
        href: '/admin/reports?currency=USD',
      });
    }
    derived.overBudgetUsers.forEach(u => {
      out.push({
        id: `overbudget-${u.id}`,
        severity: 'warning',
        title: 'Usuario sobre presupuesto',
        description: `${u.name} lleva ${formatCurrency(u.rendered)} rendidos (supera 2× su asignación de 30 días)`,
        href: `/admin/users/${u.id}`,
      });
    });
    return out;
  }, [derived]);

  if (loading) {
    return (
      <Layout title="Dashboard General">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white p-5 rounded-2xl shadow-soft border border-slate-100 h-32 flex flex-col justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl shadow-soft border border-slate-100">
            <Skeleton className="h-4 w-32 mb-4" />
            <Skeleton className="h-[80px] w-full" />
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-soft border border-slate-100">
            <Skeleton className="h-4 w-20 mb-4" />
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-6 w-full" />
          </div>
        </div>
        <div>
          <Skeleton className="h-8 w-48 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white p-6 rounded-2xl shadow-soft h-48">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2 mb-6" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  const {
    pendingCount,
    totalPendingAmount,
    totalApprovedThisMonth,
    deltaString,
    trmGaps,
    trend30d,
    mergedUsers,
  } = derived;

  const pendingTone = pendingCount > 10 ? 'danger' : pendingCount > 0 ? 'warning' : 'neutral';
  const trmTone = trmGaps > 0 ? 'warning' : 'neutral';
  const monthTone = deltaString && deltaString.startsWith('-') ? 'warning' : 'positive';

  const approvedMonthValue = renderCurrencyStack(totalApprovedThisMonth, 'text-2xl font-extrabold text-slate-800', 'text-xs font-semibold text-slate-400 mt-0.5');
  const pendingValue = pendingCount === 0
    ? <p className="text-3xl font-extrabold text-slate-800">0</p>
    : (
      <div>
        <p className="text-3xl font-extrabold text-slate-800 leading-tight">{pendingCount}</p>
        <div className="mt-1 text-[11px] text-slate-500 font-medium">
          {renderCurrencyStack(totalPendingAmount, 'text-xs font-semibold text-slate-500', 'text-xs font-semibold text-slate-400')}
        </div>
      </div>
    );

  return (
    <Layout title="Dashboard General">
      <div className="flex justify-end mb-4">
        <a
          href="/admin/users-seeder"
          className="ml-2 flex items-center text-sm bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700"
        >
          Crear Cuentas (Auth)
        </a>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
        <KpiCard
          label="Aprobado este mes"
          value={approvedMonthValue}
          delta={deltaString}
          tone={monthTone}
          icon={CheckCircle}
        />
        <KpiCard
          label="Rendiciones Pendientes"
          value={pendingValue}
          tone={pendingTone}
          icon={Clock}
          onClick={() => navigate('/admin/approvals')}
          ariaLabel="Ver rendiciones pendientes"
        />
        <KpiCard
          label="Brechas de TRM"
          value={trmGaps}
          delta={trmGaps > 0 ? 'Gastos USD sin tasa capturada' : 'Todas las TRM al día'}
          tone={trmTone}
          icon={AlertTriangle}
          onClick={trmGaps > 0 ? () => navigate('/admin/reports?currency=USD') : undefined}
          ariaLabel={trmGaps > 0 ? 'Ver gastos USD sin TRM' : undefined}
        />
        <KpiCard
          label="Usuarios Activos"
          value={users.length}
          tone="neutral"
          icon={Users}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl shadow-soft border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800">Últimos 30 días</h3>
            <span className="text-[11px] text-slate-400 font-medium">Rendiciones por día</span>
          </div>
          <MiniTrendChart data={trend30d} height={80} />
        </div>
        <AlertsPanel alerts={alerts} maxVisible={5} overflowHref="/admin/approvals" />
      </div>

      <div className="mt-8">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">Resumen por Persona</h2>
          <input
            type="text"
            placeholder="Buscar usuario..."
            className="mt-2 md:mt-0 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-64"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        {mergedUsers.length === 0 ? (
          <p className="text-gray-500">No hay usuarios registrados.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mergedUsers
              .filter(u => {
                if (!searchTerm) return true;
                const lower = searchTerm.toLowerCase();
                return (
                  (u.displayName && u.displayName.toLowerCase().includes(lower)) ||
                  (u.email && u.email.toLowerCase().includes(lower))
                );
              })
              .map(u => {
                const byCurrency = u.expensesByCurrency || {};
                const currencies = ['COP', 'USD', 'CLP'].filter(c => byCurrency[c]);

                return (
                  <Link to={`/admin/users/${u.id}`} key={u.id} className="block transition hover:scale-105 duration-200">
                    <div className="bg-white p-6 rounded-2xl shadow-soft border border-slate-100 flex flex-col justify-between h-full hover:shadow-xl hover:-translate-y-1 transition duration-300">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
                          {u.displayName ? u.displayName.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Rendido</p>
                          {currencies.length === 0 ? (
                            <p className="text-lg font-bold text-slate-700">{formatCurrency(0)}</p>
                          ) : (
                            currencies.map((c, i) => (
                              <p key={c} className={i === 0 ? 'text-lg font-bold text-slate-700' : 'text-sm font-semibold text-slate-400'}>
                                {formatCurrency(byCurrency[c].total, c)}
                                <span className="text-xs font-normal ml-1">{c}</span>
                              </p>
                            ))
                          )}
                        </div>
                      </div>

                      <div>
                        <h3 className="font-bold text-lg text-slate-800 mb-1 leading-tight text-ellipsis overflow-hidden whitespace-nowrap">
                          {u.displayName || 'Sin Nombre'}
                        </h3>
                        <p className="text-sm text-slate-500 font-medium text-ellipsis overflow-hidden whitespace-nowrap">{u.email}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
          </div>
        )}
      </div>
    </Layout>
  );
}
