import { RefreshCw } from 'lucide-react';
import { PERIOD_OPTIONS } from '../lib/dateFilters';

export default function DashboardFilters({ filters, onChange, projects, onRefresh, refreshing }) {
  const clientOptions = Array.from(
    new Set(projects.map(p => p.client).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const filteredProjects = filters.clientName
    ? projects.filter(p => p.client === filters.clientName)
    : projects;

  const handleClientChange = (e) => {
    const nextClient = e.target.value;
    const next = { ...filters, clientName: nextClient };
    // Reset project if it doesn't belong to the new client (cascade rule).
    if (nextClient && filters.projectId) {
      const belongs = projects.some(p => p.id === filters.projectId && p.client === nextClient);
      if (!belongs) next.projectId = '';
    }
    onChange(next);
  };

  return (
    <div className="sticky top-0 z-10 bg-white border border-slate-100 rounded-2xl p-4 mb-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1 min-w-[160px]">
          <label htmlFor="df-client" className="block text-xs font-semibold text-slate-500 mb-1">Cliente</label>
          <select
            id="df-client"
            value={filters.clientName}
            onChange={handleClientChange}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white focus-ring"
          >
            <option value="">Todos</option>
            {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label htmlFor="df-project" className="block text-xs font-semibold text-slate-500 mb-1">Proyecto</label>
          <select
            id="df-project"
            value={filters.projectId}
            onChange={e => onChange({ ...filters, projectId: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white focus-ring"
          >
            <option value="">Todos</option>
            {filteredProjects.map(p => (
              <option key={p.id} value={p.id}>
                {p.code ? `[${p.code}] ` : ''}{p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label htmlFor="df-period" className="block text-xs font-semibold text-slate-500 mb-1">Período</label>
          <select
            id="df-period"
            value={filters.period}
            onChange={e => onChange({ ...filters, period: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white focus-ring"
          >
            {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Actualizar datos"
          className="inline-flex items-center justify-center gap-1.5 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-900 disabled:opacity-50 focus-ring transition text-sm font-semibold min-h-[40px]"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {refreshing ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>
    </div>
  );
}
