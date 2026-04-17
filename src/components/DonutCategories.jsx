import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../utils/format';

// Palette aligned with stat-card pastels; distinct enough for donut segments.
const COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#f97316', // orange
  '#ef4444', // red
  '#14b8a6', // teal
  '#eab308', // yellow
  '#6366f1', // indigo
  '#64748b', // slate (for "Otras")
];

function CustomTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-800">{item.name}</p>
      <p className="font-mono text-slate-900 tabular-nums">{formatCurrency(item.value, 'COP')}</p>
    </div>
  );
}

export default function DonutCategories({ data, totalLabel = 'Total' }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const isEmpty = total === 0;

  // When empty, render a single grey ring segment so the widget still shows.
  const pieData = isEmpty ? [{ name: 'Sin datos', value: 1 }] : data;

  return (
    <div className="flex flex-col md:flex-row items-center gap-6">
      <div className="relative w-56 h-56 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={85}
              dataKey="value"
              stroke="#fff"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={!isEmpty}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={isEmpty ? '#e2e8f0' : COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            {!isEmpty && <Tooltip content={<CustomTooltip />} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          {isEmpty ? (
            <span className="text-sm text-slate-400 font-medium">Sin datos</span>
          ) : (
            <>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                {totalLabel}
              </span>
              <span className="text-xl font-bold text-slate-900 tabular-nums">
                {formatCurrency(total, 'COP')}
              </span>
            </>
          )}
        </div>
      </div>

      {!isEmpty && (
        <ul className="flex-1 w-full space-y-1.5 text-sm">
          {data.map((d, i) => {
            const pct = total > 0 ? (d.value / total) * 100 : 0;
            return (
              <li key={d.name} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: COLORS[i % COLORS.length] }}
                  aria-hidden="true"
                />
                <span className="flex-1 text-slate-600 truncate" title={d.name}>{d.name}</span>
                <span className="text-xs text-slate-400 tabular-nums">{pct.toFixed(0)}%</span>
                <span className="font-mono text-xs text-slate-700 tabular-nums">
                  {formatCurrency(d.value, 'COP')}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
