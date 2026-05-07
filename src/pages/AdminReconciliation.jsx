import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Layout from '../components/Layout';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { formatCurrency } from '../utils/format';
import { Upload, CheckCircle2, AlertTriangle, XCircle, HelpCircle, Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

// ── Match statuses ────────────────────────────────────────────────────────────
const STATUS = {
  GREEN:   'green',   // exact match
  YELLOW:  'yellow',  // partial match (same amount+date, merchant differs)
  RED:     'red',     // no match in Smart Expense
  MISSING: 'missing', // Smart Expense entry not in bank statement
};

const STATUS_META = {
  [STATUS.GREEN]:   { label: 'Coincidencia exacta',   bg: 'bg-green-50',  text: 'text-green-800',  border: 'border-green-200',  Icon: CheckCircle2 },
  [STATUS.YELLOW]:  { label: 'Coincidencia parcial',  bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200', Icon: AlertTriangle },
  [STATUS.RED]:     { label: 'Sin coincidencia',       bg: 'bg-red-50',    text: 'text-red-800',    border: 'border-red-200',    Icon: XCircle },
  [STATUS.MISSING]: { label: 'No en extracto',        bg: 'bg-slate-50',  text: 'text-slate-600',  border: 'border-slate-200',  Icon: HelpCircle },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeDate(raw) {
  if (!raw) return null;
  // Handle Excel serial number
  if (typeof raw === 'number') {
    const date = XLSX.SSF.parse_date_code(raw);
    if (!date) return null;
    const y = date.y, m = String(date.m).padStart(2, '0'), d = String(date.d).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  // YYYY-MM-DD (already ISO)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  return null;
}

function normalizeAmount(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Math.abs(raw);
  const s = String(raw).replace(/[^\d.,-]/g, '');
  const parsed = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(parsed) ? null : Math.abs(parsed);
}

function normalizeMerchant(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function merchantSimilarity(a, b) {
  const na = normalizeMerchant(a), nb = normalizeMerchant(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const wordsA = new Set(na.split(' ').filter(Boolean));
  const wordsB = new Set(nb.split(' ').filter(Boolean));
  let common = 0;
  wordsA.forEach(w => { if (wordsB.has(w)) common++; });
  return common / Math.max(wordsA.size, wordsB.size);
}

function matchBankRow(bankRow, expenses) {
  const { date, amount, merchant } = bankRow;
  if (!date || amount == null) return { status: STATUS.RED, matched: null };

  // Try by invoice number first
  if (bankRow.reference) {
    const byInvoice = expenses.find(e => e.invoiceNumber && e.invoiceNumber.trim() === String(bankRow.reference).trim());
    if (byInvoice) return { status: STATUS.GREEN, matched: byInvoice };
  }

  const amtTolerance = Math.max(1, amount * 0.001); // 0.1% tolerance
  const candidates = expenses.filter(e => {
    const ea = normalizeAmount(e.amount);
    return e.date === date && ea != null && Math.abs(ea - amount) <= amtTolerance;
  });

  if (candidates.length === 0) return { status: STATUS.RED, matched: null };

  const best = candidates.reduce((best, e) => {
    const sim = merchantSimilarity(merchant, e.merchant);
    return sim > best.sim ? { e, sim } : best;
  }, { e: candidates[0], sim: -1 });

  const status = best.sim >= 0.5 ? STATUS.GREEN : STATUS.YELLOW;
  return { status, matched: best.e };
}

// ── Column detector ───────────────────────────────────────────────────────────
function autoDetectColumns(headers) {
  const h = headers.map(h => String(h || '').toLowerCase());
  const find = (...terms) => h.findIndex(col => terms.some(t => col.includes(t)));

  return {
    date:      find('fecha', 'date', 'fec'),
    amount:    find('valor', 'monto', 'importe', 'debito', 'credito', 'amount', 'debit', 'credit'),
    merchant:  find('descripcion', 'description', 'comercio', 'merchant', 'concepto', 'detalle'),
    reference: find('referencia', 'reference', 'factura', 'invoice', 'nro', 'num'),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminReconciliation() {
  const [step, setStep] = useState('upload');   // upload | map | results
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [colMap, setColMap] = useState({ date: -1, amount: -1, merchant: -1, reference: -1 });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (aoa.length < 2) { toast.error('El archivo no tiene datos suficientes.'); return; }
        const hdrs = aoa[0].map(String);
        const rows = aoa.slice(1).filter(r => r.some(c => c !== ''));
        setHeaders(hdrs);
        setRawRows(rows);
        setColMap(autoDetectColumns(hdrs));
        setStep('map');
      } catch {
        toast.error('No se pudo leer el archivo. Verifica que sea CSV o Excel.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (ev) => {
    ev.preventDefault();
    const file = ev.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleReconcile = async () => {
    const { date: dc, amount: ac } = colMap;
    if (dc < 0 || ac < 0) { toast.error('Debes mapear al menos Fecha y Monto.'); return; }

    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'expenses'), where('status', 'in', ['pending', 'approved'])));
      const allExpenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const bankRows = rawRows.map((row, i) => ({
        _rowIndex: i,
        date:      normalizeDate(row[dc]),
        amount:    normalizeAmount(row[ac]),
        merchant:  colMap.merchant >= 0 ? String(row[colMap.merchant] || '') : '',
        reference: colMap.reference >= 0 ? String(row[colMap.reference] || '') : '',
        _raw: row,
      })).filter(r => r.date && r.amount != null);

      const matchedExpenseIds = new Set();
      const bankResults = bankRows.map(br => {
        const { status, matched } = matchBankRow(br, allExpenses);
        if (matched) matchedExpenseIds.add(matched.id);
        return { type: 'bank', bankRow: br, status, matched };
      });

      const missingResults = allExpenses
        .filter(e => !matchedExpenseIds.has(e.id))
        .map(e => ({ type: 'expense', expense: e, status: STATUS.MISSING, matched: null }));

      setResults([...bankResults, ...missingResults]);
      setStep('results');
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar datos de Firebase.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() =>
    filterStatus === 'all' ? results : results.filter(r => r.status === filterStatus),
    [results, filterStatus]
  );

  const counts = useMemo(() => {
    const c = { [STATUS.GREEN]: 0, [STATUS.YELLOW]: 0, [STATUS.RED]: 0, [STATUS.MISSING]: 0 };
    results.forEach(r => { if (c[r.status] !== undefined) c[r.status]++; });
    return c;
  }, [results]);

  const handleExport = () => {
    const rows = results.map(r => {
      const m = STATUS_META[r.status];
      if (r.type === 'bank') {
        return [
          r.bankRow.date, r.bankRow.amount, r.bankRow.merchant, r.bankRow.reference,
          m.label,
          r.matched?.userName || '', r.matched?.projectName || '', r.matched?.invoiceNumber || '',
        ];
      }
      return [
        r.expense.date, r.expense.amount, r.expense.merchant, r.expense.invoiceNumber || '',
        m.label,
        r.expense.userName || '', r.expense.projectName || '', '',
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([
      ['Fecha Extracto', 'Monto Extracto', 'Comercio Extracto', 'Referencia', 'Estado', 'Usuario SPI', 'Proyecto SPI', 'No. Factura'],
      ...rows,
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conciliación');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'conciliacion.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout title="Conciliación Bancaria">
      {step === 'upload' && (
        <div className="max-w-xl mx-auto mt-8">
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-brand-300 rounded-2xl p-12 text-center hover:border-brand-500 transition-colors cursor-pointer bg-brand-50/30"
            onClick={() => document.getElementById('recon-file').click()}
          >
            <FileSpreadsheet className="w-12 h-12 text-brand-400 mx-auto mb-4" />
            <p className="text-lg font-semibold text-gray-700 mb-1">Sube tu extracto bancario</p>
            <p className="text-sm text-gray-500 mb-4">CSV o Excel (.csv, .xls, .xlsx)</p>
            <span className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Elegir archivo</span>
            <input id="recon-file" type="file" accept=".csv,.xls,.xlsx" className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          </div>
          <div className="mt-6 bg-white border border-gray-100 rounded-xl p-5 text-sm text-gray-600 space-y-1 shadow-soft">
            <p className="font-semibold text-gray-700 mb-2">Formato esperado</p>
            <p>El archivo debe tener columnas de <strong>Fecha</strong>, <strong>Monto</strong> y opcionalmente <strong>Comercio</strong> y <strong>Referencia/No. Factura</strong>.</p>
            <p>Se detectan automáticamente. Podrás ajustar el mapeo en el siguiente paso.</p>
          </div>
        </div>
      )}

      {step === 'map' && (
        <div className="max-w-lg mx-auto mt-8 bg-white rounded-2xl shadow-soft border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-1">Mapeo de columnas</h2>
          <p className="text-sm text-gray-500 mb-5">
            Se detectaron <strong>{rawRows.length}</strong> filas. Verifica que las columnas sean correctas.
          </p>
          {[
            { key: 'date',      label: 'Fecha *', required: true },
            { key: 'amount',    label: 'Monto *', required: true },
            { key: 'merchant',  label: 'Comercio / Descripción', required: false },
            { key: 'reference', label: 'Referencia / No. Factura', required: false },
          ].map(({ key, label }) => (
            <div key={key} className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
              <select
                value={colMap[key]}
                onChange={e => setColMap(m => ({ ...m, [key]: Number(e.target.value) }))}
                className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value={-1}>(ninguna)</option>
                {headers.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
              </select>
            </div>
          ))}
          <div className="flex gap-3 mt-6">
            <button type="button" onClick={() => setStep('upload')}
              className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              Volver
            </button>
            <button type="button" onClick={handleReconcile} disabled={loading}
              className="flex-1 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-60 transition flex items-center justify-center gap-2">
              {loading ? 'Procesando…' : 'Conciliar'}
            </button>
          </div>
        </div>
      )}

      {step === 'results' && (
        <div className="space-y-4">
          {/* Summary pills */}
          <div className="flex flex-wrap gap-3">
            {[
              { key: 'all', label: 'Todos', count: results.length, bg: 'bg-white border-gray-200 text-gray-700' },
              { key: STATUS.GREEN,   ...STATUS_META[STATUS.GREEN],   count: counts[STATUS.GREEN] },
              { key: STATUS.YELLOW,  ...STATUS_META[STATUS.YELLOW],  count: counts[STATUS.YELLOW] },
              { key: STATUS.RED,     ...STATUS_META[STATUS.RED],     count: counts[STATUS.RED] },
              { key: STATUS.MISSING, ...STATUS_META[STATUS.MISSING], count: counts[STATUS.MISSING] },
            ].map(({ key, label, count, bg, text, border }) => (
              <button key={key} type="button"
                onClick={() => setFilterStatus(key)}
                className={`px-4 py-2 rounded-full text-sm font-semibold border transition
                  ${filterStatus === key ? 'ring-2 ring-offset-1 ring-brand-500' : ''}
                  ${bg || ''} ${text || ''} ${border ? `border-${border.replace('border-', '')}` : 'border-gray-200'}`}>
                {label} <span className="ml-1 opacity-70">({count})</span>
              </button>
            ))}
            <button type="button" onClick={handleExport}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              <Download className="w-4 h-4" /> Exportar
            </button>
            <button type="button" onClick={() => { setStep('upload'); setResults([]); }}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              <Upload className="w-4 h-4" /> Nuevo archivo
            </button>
          </div>

          {/* Results table */}
          <div className="bg-white rounded-2xl shadow-soft border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-500">Estado</th>
                    <th className="px-4 py-3 font-semibold text-gray-500">Fecha Extracto</th>
                    <th className="px-4 py-3 font-semibold text-gray-500">Monto Extracto</th>
                    <th className="px-4 py-3 font-semibold text-gray-500">Comercio Extracto</th>
                    <th className="px-4 py-3 font-semibold text-gray-500">Coincidencia SPI</th>
                    <th className="px-4 py-3 font-semibold text-gray-500">Usuario</th>
                    <th className="px-4 py-3 font-semibold text-gray-500">Proyecto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r, i) => {
                    const meta = STATUS_META[r.status];
                    const { Icon } = meta;
                    const isMissing = r.type === 'expense';
                    const expense = isMissing ? r.expense : r.matched;
                    return (
                      <tr key={i} className={`${meta.bg} hover:brightness-[0.98] transition`}>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.bg} ${meta.text} ${meta.border}`}>
                            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {isMissing ? r.expense.date : r.bankRow.date}
                        </td>
                        <td className="px-4 py-3 font-mono font-medium whitespace-nowrap">
                          {isMissing
                            ? formatCurrency(Number(r.expense.amount) || 0, r.expense.currency || 'COP')
                            : formatCurrency(r.bankRow.amount, 'COP')}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">
                          {isMissing ? (r.expense.merchant || '—') : (r.bankRow.merchant || '—')}
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                          {expense?.merchant || (isMissing ? r.expense.merchant : '—')}
                          {expense?.invoiceNumber && (
                            <span className="ml-1 text-xs text-gray-400">#{expense.invoiceNumber}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{expense?.userName || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">{expense?.projectName || '—'}</td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-gray-400">Sin resultados para este filtro.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
