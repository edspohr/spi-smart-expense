import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../utils/format';

function formatYAxis(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-800 mb-1 capitalize">{label}</p>
      {payload.map(entry => (
        <p key={entry.dataKey} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: entry.color }} aria-hidden="true" />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-mono font-semibold text-slate-900 tabular-nums">
            {formatCurrency(entry.value, 'COP')}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function LineChartMonthly({ data, hasEnoughData = true }) {
  return (
    <div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#94a3b8"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={12}
              tickFormatter={formatYAxis}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(v) => <span className="text-slate-600">{v}</span>}
            />
            <Line
              type="monotone"
              dataKey="rendido"
              name="Rendido"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3, fill: '#3b82f6' }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="aprobado"
              name="Aprobado"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ r: 3, fill: '#22c55e' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!hasEnoughData && (
        <p className="text-xs text-slate-400 text-center mt-2">
          Histórico limitado — más data pronto.
        </p>
      )}
    </div>
  );
}
