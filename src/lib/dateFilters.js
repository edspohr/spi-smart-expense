// Shared date-range helpers for dashboard period filters.
// Extracted from DashboardFilters.jsx to satisfy react-refresh's
// "only export components" rule — same pattern as Phase 1's constants.js.

export const PERIOD_OPTIONS = [
  { value: 'last30',      label: 'Últimos 30 días' },
  { value: 'thisMonth',   label: 'Este mes' },
  { value: 'lastMonth',   label: 'Mes anterior' },
  { value: 'last3Months', label: 'Últimos 3 meses' },
  { value: 'thisYear',    label: 'Este año' },
  { value: 'all',         label: 'Todo el historial' },
];

// Returns { start, end } Date range for a given period, or null for 'all'.
export function getPeriodRange(period) {
  const now = new Date();
  const end = now;
  let start;
  switch (period) {
    case 'last30':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'thisMonth':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'lastMonth': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end: lastEnd };
    }
    case 'last3Months':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'thisYear':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'all':
    default:
      return null;
  }
  return { start, end };
}
