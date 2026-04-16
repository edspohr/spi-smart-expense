import { useState } from 'react';

function formatDDMM(isoDate) {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

export default function MiniTrendChart({
  data = [],
  height = 80,
  barColor = '#3b82f6',
  todayBarColor = '#1d4ed8',
  emptyLabel = 'Sin actividad reciente',
}) {
  const [hover, setHover] = useState(null);

  const hasActivity = data.some(d => (d.value || 0) > 0);

  if (!data.length || !hasActivity) {
    return (
      <div
        className="w-full flex items-center justify-center text-sm text-slate-400"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value || 0), 1);
  const todayIso = new Date().toISOString().slice(0, 10);
  const barGap = 2;
  const barCount = data.length;

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${barCount} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Tendencia últimos ${barCount} días`}
      >
        {data.map((d, i) => {
          const value = d.value || 0;
          const barHeight = value === 0 ? 1 : Math.max(1, (value / maxValue) * (height - 4));
          const y = height - barHeight;
          const isToday = d.date === todayIso;
          const fill = isToday ? todayBarColor : barColor;
          const opacity = value === 0 ? 0.2 : 1;

          return (
            <rect
              key={d.date}
              x={i + barGap / barCount / 2}
              y={y}
              width={1 - barGap / barCount}
              height={barHeight}
              fill={fill}
              opacity={opacity}
              rx={0.15}
              onMouseEnter={() => setHover({ index: i, date: d.date, value })}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            />
          );
        })}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute -top-9 bg-slate-900 text-white text-[11px] font-mono px-2 py-1 rounded-md shadow-lg whitespace-nowrap"
          style={{
            left: `${((hover.index + 0.5) / barCount) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        >
          {formatDDMM(hover.date)}: {hover.value} gasto{hover.value === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}
