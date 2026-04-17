import { Skeleton } from './Skeleton';

// Varied widths so skeleton rows look like real data loading.
const CELL_WIDTHS = ['w-24', 'w-32', 'w-40', 'w-28', 'w-20', 'w-36', 'w-16'];

export default function TableSkeleton({ rows = 5, cols = 5, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden ${className}`}>
      <table className="w-full" aria-hidden="true">
        <thead>
          <tr className="bg-gray-50 border-b">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <Skeleton className={`h-3 ${CELL_WIDTHS[i % CELL_WIDTHS.length]}`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-4 py-4">
                  <Skeleton className={`h-4 ${CELL_WIDTHS[(r + c) % CELL_WIDTHS.length]}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
