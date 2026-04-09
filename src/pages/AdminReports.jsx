import { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { formatCurrency } from '../utils/format';
import { Download, Search, FileSpreadsheet, Loader2, Filter, ImageDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { toast } from 'sonner';

const STATUS_LABELS = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
};

// Column headers for CSV (23 columns)
const CSV_HEADERS = [
  'Fecha', 'Hora', 'Persona', 'Empresa Tarjeta', 'Tarjeta Last4', 'Evento',
  'Proyecto', 'Código Proyecto', 'Comercio', 'NIT', 'No. Factura', 'Dirección', 'Ciudad',
  'Categoría', 'Forma Pago', 'Descripción', 'Monto', 'Moneda',
  'TRM', 'Equivalente COP', 'Fuente TRM', 'Estado', 'Motivo Rechazo',
];

// Excel adds one extra column (24 total)
const XLSX_HEADERS = [...CSV_HEADERS, 'Diferencia TRM'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeCSV(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function expenseToRow(e, forExcel = false, projectsMap = {}) {
  const base = [
    e.date || '',
    e.time || '',
    e.userName || '',
    e.cardCompany || '',
    e.cardLast4 || '',
    e.eventName || '',
    e.projectName || '',
    (e.projectId && projectsMap[e.projectId]) || '',  // Código Proyecto
    e.merchant || '',
    e.taxId || '',
    e.invoiceNumber || '',
    e.address || '',
    e.city || '',
    e.category || '',
    e.paymentMethod || '',
    e.description || '',
    e.amount ?? '',
    e.currency || 'COP',
    e.trm || '',
    e.amountCOP || '',
    e.trmSource || '',                                 // Fuente TRM
    STATUS_LABELS[e.status] || e.status || '',
    e.rejectionReason || '',
  ];
  if (forExcel) {
    let diff = '';
    if (e.currency === 'USD' && e.trm && e.amountCOP) {
      diff = e.amountCOP - Math.round(Number(e.amount) * Number(e.trm));
    }
    base.push(diff);
  }
  return base;
}

/** Strip accents and special chars, replace spaces with underscores. */
function sanitize(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Detect file extension from a URL. Defaults to .jpg. */
function extFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.(jpg|jpeg|png|gif|webp|pdf|heic|bmp)(\?|$)/i);
    return m ? `.${m[1].toLowerCase()}` : '.jpg';
  } catch {
    return '.jpg';
  }
}

/**
 * Build a unique filename for an image file.
 * Convention: FC-{invoice}-{merchant}-{code}-{project}_{type}.{ext}
 */
function buildImageFilename(expense, type, ext, projectsMap, usedNames) {
  const inv  = sanitize(expense.invoiceNumber || 'SN');
  const merch = sanitize(expense.merchant || 'Desconocido').substring(0, 30);
  const code = sanitize(
    (expense.projectId && projectsMap[expense.projectId]) || 'XX'
  );
  const proj = sanitize(expense.projectName || 'SinProyecto').substring(0, 30);

  const base = `FC-${inv}-${merch}-${code}-${proj}_${type}`.substring(0, 100);

  let candidate = `${base}${ext}`;
  let counter = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}_${counter}${ext}`;
    counter++;
  }
  usedNames.add(candidate);
  return candidate;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AdminReports() {
  const [filters, setFilters] = useState({
    cardCompany: '',
    cardLast4: '',
    eventName: '',
    userId: '',
    startDate: '',
    endDate: '',
    status: '',
    currency: '',
  });
  const [users, setUsers] = useState([]);
  const [existingEvents, setExistingEvents] = useState([]);
  const [projectsMap, setProjectsMap] = useState({}); // projectId → code
  const [results, setResults] = useState(null);        // null = not searched yet
  const [searching, setSearching] = useState(false);

  // Zip progress state
  const [zipProgress, setZipProgress] = useState({
    active: false,
    current: 0,
    total: 0,
    phase: 'downloading', // 'downloading' | 'zipping' | 'done'
    message: '',
  });
  const cancelRef = useRef(false);

  // Load filter metadata and projects map on mount
  useEffect(() => {
    async function loadMeta() {
      try {
        // Users for Persona dropdown
        const uSnap = await getDocs(
          query(collection(db, 'users'), where('role', 'in', ['professional', 'admin', 'assistant']))
        );
        setUsers(
          uSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
        );

        // Unique events from expenses for datalist
        const eSnap = await getDocs(collection(db, 'expenses'));
        const events = new Set();
        eSnap.docs.forEach(d => { const evt = d.data().eventName; if (evt) events.add(evt); });
        setExistingEvents(Array.from(events).sort());

        // Project code map (projectId → code)
        const pSnap = await getDocs(collection(db, 'projects'));
        const map = {};
        pSnap.docs.forEach(d => { const data = d.data(); if (data.code) map[d.id] = data.code; });
        setProjectsMap(map);
      } catch (err) {
        console.error('Error cargando metadatos de filtros:', err);
      }
    }
    loadMeta();
  }, []);

  const setFilter = (key) => (e) => setFilters(prev => ({ ...prev, [key]: e.target.value }));

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearch = async () => {
    const noFilters = Object.values(filters).every(v => !v);
    if (noFilters) {
      const ok = window.confirm(
        'No hay filtros activos. Esto cargará TODOS los gastos y puede tardar. ¿Continuar?'
      );
      if (!ok) return;
    }

    setSearching(true);
    try {
      const snap = await getDocs(collection(db, 'expenses'));
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (filters.cardCompany) data = data.filter(e => e.cardCompany === filters.cardCompany);
      if (filters.cardLast4)   data = data.filter(e => e.cardLast4 === filters.cardLast4);
      if (filters.eventName)   data = data.filter(e => (e.eventName || '').toLowerCase().includes(filters.eventName.toLowerCase()));
      if (filters.userId)      data = data.filter(e => e.userId === filters.userId);
      if (filters.status)      data = data.filter(e => e.status === filters.status);
      if (filters.currency)    data = data.filter(e => e.currency === filters.currency);
      if (filters.startDate) {
        const start = new Date(filters.startDate); start.setHours(0, 0, 0, 0);
        data = data.filter(e => e.date && new Date(e.date) >= start);
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate); end.setHours(23, 59, 59, 999);
        data = data.filter(e => e.date && new Date(e.date) <= end);
      }

      data.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setResults(data);
    } catch (err) {
      console.error('Error al buscar gastos:', err);
      toast.error('Error al obtener los gastos.');
    } finally {
      setSearching(false);
    }
  };

  // ── CSV / Excel ───────────────────────────────────────────────────────────

  const buildFilename = (ext) => {
    const parts = ['gastos_tarjeta'];
    if (filters.cardCompany) parts.push(filters.cardCompany.replace(/\s+/g, '_'));
    if (filters.startDate)   parts.push(filters.startDate);
    if (filters.endDate)     parts.push('al', filters.endDate);
    return `${parts.join('_')}.${ext}`;
  };

  const handleDownloadCSV = () => {
    if (!results?.length) { toast.error('No hay datos para exportar.'); return; }
    const rows = results.map(e => expenseToRow(e, false, projectsMap).map(escapeCSV));
    const csv = [CSV_HEADERS.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = buildFilename('csv'); a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadExcel = () => {
    if (!results?.length) { toast.error('No hay datos para exportar.'); return; }

    const dataRows = results.map(e => expenseToRow(e, true, projectsMap));
    const allData = [XLSX_HEADERS, ...dataRows];

    ['COP', 'USD'].forEach(cur => {
      const subset = results.filter(e => e.currency === cur && e.status !== 'rejected');
      if (subset.length === 0) return;
      const total = subset.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const summaryRow = Array(XLSX_HEADERS.length).fill('');
      summaryRow[0] = `TOTAL ${cur}`;
      summaryRow[16] = total;  // Monto is now at index 16 (shifted by Código Proyecto)
      summaryRow[17] = cur;    // Moneda is now at index 17
      allData.push(summaryRow);
    });

    const ws = XLSX.utils.aoa_to_sheet(allData);
    ws['!cols'] = XLSX_HEADERS.map((h, i) => {
      const maxLen = Math.max(h.length, ...dataRows.map(r => String(r[i] ?? '').length));
      return { wch: Math.min(maxLen + 2, 50) };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos por Tarjeta');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = buildFilename('xlsx'); a.click();
    URL.revokeObjectURL(url);
  };

  // ── Image ZIP ─────────────────────────────────────────────────────────────

  const handleDownloadImages = async () => {
    const withImages = (results || []).filter(e => e.receiptUrl || e.voucherUrl);
    if (withImages.length === 0) {
      toast.error('Ningún gasto en los resultados tiene imágenes adjuntas.');
      return;
    }

    // Count individual files (receipt + voucher are separate)
    const totalFiles = withImages.reduce(
      (s, e) => s + (e.receiptUrl ? 1 : 0) + (e.voucherUrl ? 1 : 0), 0
    );

    if (totalFiles > 100) {
      const ok = window.confirm(
        `Hay ${totalFiles} imágenes para descargar. Esto puede tardar varios minutos. ¿Continuar?`
      );
      if (!ok) return;
    }

    cancelRef.current = false;
    setZipProgress({ active: true, current: 0, total: totalFiles, phase: 'downloading', message: 'Iniciando...' });

    const zip = new JSZip();
    const usedNames = new Set();
    let downloaded = 0;
    let skipped = 0;

    for (const expense of withImages) {
      if (cancelRef.current) break;

      const tasks = [];
      if (expense.receiptUrl) tasks.push({ url: expense.receiptUrl, type: 'recibo' });
      if (expense.voucherUrl) tasks.push({ url: expense.voucherUrl, type: 'voucher' });

      for (const task of tasks) {
        if (cancelRef.current) break;

        const fileNum = downloaded + skipped + 1;
        setZipProgress(prev => ({
          ...prev,
          current: fileNum,
          message: `Descargando imagen ${fileNum} de ${totalFiles}...`,
        }));

        try {
          const response = await fetch(task.url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const ext = extFromUrl(task.url) || (blob.type.includes('pdf') ? '.pdf' : '.jpg');
          const filename = buildImageFilename(expense, task.type, ext, projectsMap, usedNames);
          zip.file(filename, blob);
          downloaded++;
        } catch (err) {
          console.warn(`[ZIP] Saltado gasto ${expense.id} (${task.type}):`, err.message);
          skipped++;
        }
      }
    }

    if (cancelRef.current) {
      setZipProgress({ active: false, current: 0, total: 0, phase: 'downloading', message: '' });
      toast.info('Descarga cancelada.');
      return;
    }

    if (downloaded === 0) {
      toast.error('No se pudo descargar ninguna imagen. Verifique los permisos de Firebase Storage.');
      setZipProgress({ active: false, current: 0, total: 0, phase: 'downloading', message: '' });
      return;
    }

    setZipProgress(prev => ({ ...prev, phase: 'zipping', message: 'Generando archivo ZIP...' }));

    try {
      const content = await zip.generateAsync(
        { type: 'blob' },
        ({ percent }) => {
          setZipProgress(prev => ({
            ...prev,
            message: `Comprimiendo... ${Math.round(percent)}%`,
          }));
        }
      );

      const today = new Date().toISOString().slice(0, 10);
      const parts = ['recibos'];
      if (filters.cardCompany) parts.push(filters.cardCompany.replace(/\s+/g, '_'));
      if (filters.startDate)   parts.push(filters.startDate);
      if (filters.endDate)     parts.push('al', filters.endDate);
      parts.push(today);
      const zipFilename = `${parts.join('_')}.zip`;

      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url; a.download = zipFilename; a.click();
      URL.revokeObjectURL(url);

      setZipProgress(prev => ({
        ...prev,
        phase: 'done',
        message: `Descarga completa — ${downloaded} imagen${downloaded !== 1 ? 'es' : ''}.`,
      }));

      if (skipped > 0) {
        toast.warning(`Se descargaron ${downloaded} de ${totalFiles} imágenes. ${skipped} no pudieron ser descargadas.`);
      } else {
        toast.success(`${downloaded} imagen${downloaded !== 1 ? 'es descargadas' : ' descargada'} exitosamente.`);
      }

      setTimeout(() => {
        setZipProgress({ active: false, current: 0, total: 0, phase: 'downloading', message: '' });
      }, 3000);
    } catch (err) {
      console.error('[ZIP] Error generando ZIP:', err);
      toast.error('Error al generar el archivo ZIP.');
      setZipProgress({ active: false, current: 0, total: 0, phase: 'downloading', message: '' });
    }
  };

  const cancelZip = () => {
    cancelRef.current = true;
    setZipProgress({ active: false, current: 0, total: 0, phase: 'downloading', message: '' });
    toast.info('Descarga cancelada.');
  };

  // ── Totals ────────────────────────────────────────────────────────────────

  const totals = {};
  let usdCOPEquiv = 0;
  if (results) {
    results.forEach(e => {
      const cur = e.currency || 'COP';
      if (!totals[cur]) totals[cur] = { total: 0, count: 0 };
      totals[cur].total += Number(e.amount) || 0;
      totals[cur].count += 1;
      if (cur === 'USD' && e.amountCOP) usdCOPEquiv += Number(e.amountCOP);
    });
  }

  const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout title="Reportes y Descargas">

      {/* ZIP Progress Modal */}
      {zipProgress.active && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <ImageDown className="w-5 h-5 text-purple-600" />
              Descargando Imágenes
            </h3>

            {zipProgress.phase === 'downloading' && (
              <>
                <p className="text-sm text-gray-600 mb-3">{zipProgress.message}</p>
                <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2">
                  <div
                    className="bg-purple-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${zipProgress.total > 0 ? (zipProgress.current / zipProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 text-right">{zipProgress.current} / {zipProgress.total}</p>
              </>
            )}

            {zipProgress.phase === 'zipping' && (
              <div className="flex items-center gap-3 py-2">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600 shrink-0" />
                <p className="text-sm text-gray-600">{zipProgress.message}</p>
              </div>
            )}

            {zipProgress.phase === 'done' && (
              <div className="flex items-center gap-3 py-2">
                <span className="text-green-500 text-lg">✓</span>
                <p className="text-sm text-green-700 font-medium">{zipProgress.message}</p>
              </div>
            )}

            {zipProgress.phase !== 'done' && (
              <button
                onClick={cancelZip}
                className="mt-4 w-full text-sm text-gray-400 hover:text-red-500 transition py-1"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Filtros</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Empresa Tarjeta</label>
            <select className={inputClass} value={filters.cardCompany} onChange={setFilter('cardCompany')}>
              <option value="">Todas</option>
              <option value="SPI Americas">SPI Americas</option>
              <option value="SPI Advisors">SPI Advisors</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Últimos 4 dígitos tarjeta</label>
            <input
              type="text"
              maxLength={4}
              className={inputClass}
              placeholder="Ej: 1234"
              value={filters.cardLast4}
              onChange={setFilter('cardLast4')}
            />
          </div>

          <div>
            <label className={labelClass}>Evento</label>
            <input
              type="text"
              list="reports-events-datalist"
              className={inputClass}
              placeholder="Buscar evento..."
              value={filters.eventName}
              onChange={setFilter('eventName')}
            />
            <datalist id="reports-events-datalist">
              {existingEvents.map((evt, i) => <option key={i} value={evt} />)}
            </datalist>
          </div>

          <div>
            <label className={labelClass}>Persona</label>
            <select className={inputClass} value={filters.userId} onChange={setFilter('userId')}>
              <option value="">Todas</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.displayName || u.email}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Fecha Desde</label>
            <input type="date" className={inputClass} value={filters.startDate} onChange={setFilter('startDate')} />
          </div>

          <div>
            <label className={labelClass}>Fecha Hasta</label>
            <input type="date" className={inputClass} value={filters.endDate} onChange={setFilter('endDate')} />
          </div>

          <div>
            <label className={labelClass}>Estado</label>
            <select className={inputClass} value={filters.status} onChange={setFilter('status')}>
              <option value="">Todos</option>
              <option value="approved">Aprobado</option>
              <option value="pending">Pendiente</option>
              <option value="rejected">Rechazado</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Moneda</label>
            <select className={inputClass} value={filters.currency} onChange={setFilter('currency')}>
              <option value="">Todas</option>
              <option value="COP">COP</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleSearch}
            disabled={searching}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition font-medium text-sm disabled:opacity-50"
          >
            {searching
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Search className="w-4 h-4" />}
            {searching ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </div>

      {/* Results */}
      {results !== null && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-center">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Gastos Encontrados</p>
              <p className="text-3xl font-extrabold text-gray-800">{results.length}</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-center">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Totales</p>
              <div className="flex flex-col mt-1">
                {['COP', 'USD'].filter(c => totals[c]).map((c, i) => (
                  <span
                    key={c}
                    className={i === 0 ? 'text-xl font-bold text-blue-600' : 'text-sm font-semibold text-gray-400 mt-0.5'}
                  >
                    {formatCurrency(totals[c].total, c)}
                    <span className="text-xs font-normal ml-1">{c}</span>
                  </span>
                ))}
                {Object.keys(totals).length === 0 && (
                  <span className="text-xl font-bold text-gray-400">—</span>
                )}
              </div>
            </div>

            {usdCOPEquiv > 0 ? (
              <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-100 p-5 flex flex-col justify-center">
                <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Equiv. COP (USD)</p>
                <p className="text-xl font-bold text-blue-700">{formatCurrency(usdCOPEquiv)}</p>
                <p className="text-xs text-blue-400 mt-0.5">Según TRM capturada al registro</p>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-center">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Equiv. COP (USD)</p>
                <p className="text-sm text-gray-400 italic">Sin gastos USD con TRM</p>
              </div>
            )}
          </div>

          {/* Download Buttons */}
          {results.length > 0 && (() => {
            const hasImages = results.some(e => e.receiptUrl || e.voucherUrl);
            return (
              <div className="flex gap-3 mb-6 justify-end flex-wrap">
                <button
                  onClick={handleDownloadCSV}
                  className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  Descargar CSV
                </button>
                <button
                  onClick={handleDownloadExcel}
                  className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Descargar Excel
                </button>
                <button
                  onClick={handleDownloadImages}
                  disabled={!hasImages || zipProgress.active}
                  title={!hasImages ? 'Ningún gasto tiene imágenes adjuntas' : 'Descargar recibos como ZIP'}
                  className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ImageDown className="w-4 h-4" />
                  Descargar Imágenes (ZIP)
                </button>
              </div>
            );
          })()}

          {/* Results Table */}
          {results.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
              <p className="text-gray-400 text-lg">No se encontraron gastos con los filtros aplicados.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white border-b z-10">
                    <tr>
                      <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Fecha</th>
                      <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Persona</th>
                      <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Empresa</th>
                      <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Tarjeta</th>
                      <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Evento</th>
                      <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Comercio</th>
                      <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Categoría</th>
                      <th className="px-4 py-3 font-medium text-gray-500 text-right whitespace-nowrap">Monto</th>
                      <th className="px-4 py-3 font-medium text-gray-500 text-right whitespace-nowrap">TRM</th>
                      <th className="px-4 py-3 font-medium text-gray-500 text-right whitespace-nowrap">Equiv COP</th>
                      <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {results.map(e => (
                      <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{e.date}</td>
                        <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">{e.userName || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{e.cardCompany || '—'}</td>
                        <td className="px-4 py-3 font-mono text-gray-600 whitespace-nowrap">
                          {e.cardLast4 ? `**** ${e.cardLast4}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[130px] truncate">{e.eventName || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-[150px] truncate">{e.merchant || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{e.category || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                          {formatCurrency(e.amount, e.currency)}
                          {e.currency && e.currency !== 'COP' && (
                            <span className="text-xs text-gray-400 ml-1">{e.currency}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 text-xs whitespace-nowrap">
                          {e.trm ? formatCurrency(e.trm, 'COP') : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {e.amountCOP ? formatCurrency(e.amountCOP) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold
                            ${e.status === 'approved' ? 'bg-green-100 text-green-700' :
                              e.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'}`}>
                            {STATUS_LABELS[e.status] || e.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
