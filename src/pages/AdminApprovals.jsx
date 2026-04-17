import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Layout from '../components/Layout';
import DataGridHeader from '../components/DataGridHeader';
import BulkActionBar from '../components/BulkActionBar';
import ConfirmDialog from '../components/ConfirmDialog';
import KeyboardShortcutsModal from '../components/KeyboardShortcutsModal';
import RejectionModal from '../components/RejectionModal';
import ExpenseDetailsModal from '../components/ExpenseDetailsModal';
import EditExpenseModal from '../components/EditExpenseModal';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, increment, writeBatch, orderBy, limit } from 'firebase/firestore';
import { formatCurrency } from '../utils/format';
import {
  CheckCircle, XCircle, Download, FileText, Eye, Pencil,
  Filter, Keyboard, AlertCircle, ChevronDown, ChevronUp, Search, X as XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion as Motion } from 'framer-motion';
import { CARD_BRAND_LABELS, CARD_BRANDS, CARD_COMPANIES, CURRENCIES } from '../lib/constants';
import TableSkeleton from '../components/TableSkeleton';
import EmptyState from '../components/EmptyState';

const STORAGE_KEY = 'spi_approvals_filters_v1';
const DEFAULT_FILTERS = {
  startDate: '', endDate: '', user: '', cardCompany: '',
  cardBrand: '', currency: '', minAmount: '', maxAmount: '', search: '',
};
const DEFAULT_SORT = {
  pending: { key: 'date', dir: 'desc' },
  history: { key: 'date', dir: 'desc' },
};
const BULK_CHUNK_SIZE = 20;
const ERROR_HIGHLIGHT_MS = 10000;

const CSV_HEADERS = [
  "Fecha","Hora","Usuario","Código Proyecto","Proyecto","Evento","Proveedor","NIT",
  "No. Factura","Dirección","Ciudad","Teléfono","Forma Pago","Tarjeta Last4","Empresa Tarjeta",
  "Marca Tarjeta","Descripción","Categoría","Monto","Moneda","TRM","Equivalente COP",
  "Fuente TRM","Estado","Motivo Rechazo",
];

function expenseToCsvRow(e, projectMap) {
  let project = null;
  if (e.projectId && projectMap[e.projectId]) project = projectMap[e.projectId];
  else if (e.projectName && projectMap[e.projectName.toLowerCase()]) project = projectMap[e.projectName.toLowerCase()];
  return [
    e.date || "",
    e.time || "",
    e.userName || "",
    project?.code || "",
    e.projectName || "",
    e.eventName || "",
    `"${(e.merchant || "").replace(/"/g, '""')}"`,
    e.taxId || "",
    e.invoiceNumber || "",
    `"${(e.address || "").replace(/"/g, '""')}"`,
    e.city || "",
    e.phone || "",
    e.paymentMethod || "",
    e.cardLast4 || "",
    e.cardCompany || "",
    e.cardBrand ? (CARD_BRAND_LABELS[e.cardBrand] || e.cardBrand) : "",
    `"${(e.description || "").replace(/"/g, '""')}"`,
    e.category || "",
    e.amount || 0,
    e.currency || "COP",
    e.trm || "",
    e.amountCOP || "",
    e.trmSource || "",
    e.status === 'approved' ? 'Aprobado' : e.status === 'rejected' ? 'Rechazado' : 'Pendiente',
    `"${(e.rejectionReason || "").replace(/"/g, '""')}"`
  ];
}

function downloadCsv(headers, rows, filename) {
  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseIsoDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatTotalsLine(byCurrency) {
  const order = ['COP', 'USD', 'CLP'];
  const keys = [
    ...order.filter(c => byCurrency[c] !== undefined),
    ...Object.keys(byCurrency).filter(c => !order.includes(c)),
  ];
  if (keys.length === 0) return '—';
  return keys.map(c => `${formatCurrency(byCurrency[c], c)} ${c}`).join(' + ');
}

export default function AdminApprovals() {
  // Data
  const [pendingExpenses, setPendingExpenses] = useState([]);
  const [historyExpenses, setHistoryExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('pending');

  // Legacy modals
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [selectedExpenseToReject, setSelectedExpenseToReject] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedExpenseForDetails, setSelectedExpenseForDetails] = useState(null);
  const [editExpense, setEditExpense] = useState(null);

  // Date range for historical CSV export (preserved from original)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Filters + sort (persisted)
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Selection + focus
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [errorMap, setErrorMap] = useState(() => new Map());

  // New modals
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Desktop-only keyboard shortcuts
  const [isKeyboardDevice, setIsKeyboardDevice] = useState(true);

  // Load filters/sort from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.filters) setFilters(f => ({ ...f, ...parsed.filters }));
      if (parsed.sort) setSort(s => ({
        pending: { ...s.pending, ...(parsed.sort.pending || {}) },
        history: { ...s.history, ...(parsed.sort.history || {}) },
      }));
    } catch {
      // Ignore malformed cache
    }
  }, []);

  // Persist filters/sort
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ filters, sort }));
    } catch {
      // Ignore quota errors
    }
  }, [filters, sort]);

  // Detect pointer:fine (desktop with a precise pointer)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: fine)');
    setIsKeyboardDevice(mq.matches);
    const handler = (e) => setIsKeyboardDevice(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Fetch data
  const fetchPending = async () => {
    try {
      setLoading(true);
      const [pSnap, hSnap] = await Promise.all([
        getDocs(query(collection(db, "expenses"), where("status", "==", "pending"))),
        getDocs(query(
          collection(db, "expenses"),
          where("status", "in", ["approved", "rejected"]),
          orderBy("date", "desc"),
          limit(50)
        )),
      ]);
      setPendingExpenses(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setHistoryExpenses(hSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Error fetching pending:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPending(); }, []);

  const rawList = viewMode === 'pending' ? pendingExpenses : historyExpenses;

  const distinctUsers = useMemo(() => {
    const set = new Set();
    rawList.forEach(e => { if (e.userName) set.add(e.userName); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawList]);

  const filteredList = useMemo(() => {
    return rawList.filter(e => {
      if (filters.startDate) {
        const s = new Date(filters.startDate); s.setHours(0, 0, 0, 0);
        const d = parseIsoDate(e.date);
        if (!d || d < s) return false;
      }
      if (filters.endDate) {
        const ed = new Date(filters.endDate); ed.setHours(23, 59, 59, 999);
        const d = parseIsoDate(e.date);
        if (!d || d > ed) return false;
      }
      if (filters.user && e.userName !== filters.user) return false;
      if (filters.cardCompany && e.cardCompany !== filters.cardCompany) return false;
      if (filters.cardBrand && e.cardBrand !== filters.cardBrand) return false;
      if (filters.currency && (e.currency || 'COP') !== filters.currency) return false;
      const amt = Number(e.amount) || 0;
      if (filters.minAmount !== '' && amt < Number(filters.minAmount)) return false;
      if (filters.maxAmount !== '' && amt > Number(filters.maxAmount)) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = `${e.merchant || ''} ${e.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rawList, filters]);

  const sortedList = useMemo(() => {
    const cfg = sort[viewMode] || DEFAULT_SORT[viewMode];
    if (!cfg?.key) return filteredList;
    const { key, dir } = cfg;
    const mult = dir === 'asc' ? 1 : -1;
    const copy = [...filteredList];
    copy.sort((a, b) => {
      if (key === 'amount') {
        return ((Number(a.amount) || 0) - (Number(b.amount) || 0)) * mult;
      }
      const va = (a[key] || '').toString().toLowerCase();
      const vb = (b[key] || '').toString().toLowerCase();
      return va.localeCompare(vb) * mult;
    });
    return copy;
  }, [filteredList, sort, viewMode]);

  const visibleExpenses = sortedList;

  // Trim selection to visible (decision #2)
  const visibleIdsKey = visibleExpenses.map(e => e.id).join('|');
  useEffect(() => {
    const visibleIds = new Set(visibleExpenses.map(e => e.id));
    setSelectedIds(prev => {
      let changed = false;
      const next = new Set();
      prev.forEach(id => { if (visibleIds.has(id)) next.add(id); else changed = true; });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdsKey]);

  // Clamp focus to visible list
  useEffect(() => {
    if (focusedIndex >= visibleExpenses.length) setFocusedIndex(-1);
  }, [visibleExpenses.length, focusedIndex]);

  const selectedList = useMemo(
    () => visibleExpenses.filter(e => selectedIds.has(e.id)),
    [visibleExpenses, selectedIds]
  );

  const selectedSummary = useMemo(() => {
    const byCurrency = {};
    selectedList.forEach(e => {
      const c = e.currency || 'COP';
      byCurrency[c] = (byCurrency[c] || 0) + (Number(e.amount) || 0);
    });
    return { count: selectedList.length, byCurrency };
  }, [selectedList]);

  const activeFilterCount = useMemo(() => {
    return Object.keys(DEFAULT_FILTERS).reduce((acc, k) => (
      filters[k] !== DEFAULT_FILTERS[k] ? acc + 1 : acc
    ), 0);
  }, [filters]);

  const rowRefs = useRef({});

  // Snapshot ref for keyboard handler
  const stateRef = useRef();
  stateRef.current = {
    visibleExpenses, focusedIndex, viewMode, selectedIds,
    rejectionModalOpen, detailsModalOpen, editExpense: !!editExpense,
    shortcutsOpen, approveConfirmOpen, bulkRejectOpen, bulkBusy,
  };

  // Selection helpers
  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds(prev => {
      const allSelected = visibleExpenses.length > 0 && visibleExpenses.every(e => prev.has(e.id));
      if (allSelected) return new Set();
      const next = new Set(prev);
      visibleExpenses.forEach(e => next.add(e.id));
      return next;
    });
  }, [visibleExpenses]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const updateFilter = (key, value) => setFilters(f => ({ ...f, [key]: value }));

  const handleSortChange = useCallback((next) => {
    setSort(s => ({ ...s, [viewMode]: next }));
  }, [viewMode]);

  const handleTabChange = (mode) => {
    if (mode === viewMode) return;
    setViewMode(mode);
    setSelectedIds(new Set());
    setFocusedIndex(-1);
  };

  // Single approve
  const handleApprove = async (expense) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "expenses", expense.id), { status: "approved" });
      if (expense.projectId) {
        batch.update(doc(db, "projects", expense.projectId), {
          expenses: increment(Number(expense.amount) || 0),
        });
      }
      await batch.commit();
      toast.success("Gasto aprobado.");
      setPendingExpenses(prev => prev.filter(e => e.id !== expense.id));
      setHistoryExpenses(prev => [{ ...expense, status: 'approved' }, ...prev]);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(expense.id); return n; });
    } catch (error) {
      console.error("Error approving:", error);
      toast.error("Error al aprobar");
    }
  };

  // Single reject
  const openRejectionModal = (expense) => {
    setSelectedExpenseToReject(expense);
    setRejectionModalOpen(true);
  };

  const handleConfirmRejection = async (expense, reason) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "expenses", expense.id), {
        status: "rejected",
        rejectionReason: reason,
      });
      await batch.commit();
      if (expense.userId && !expense.isCompanyExpense) {
        await updateDoc(doc(db, "users", expense.userId), {
          balance: increment(-(Number(expense.amount) || 0)),
        });
      }
      toast.success("Gasto rechazado y saldo devuelto.");
      setRejectionModalOpen(false);
      setSelectedExpenseToReject(null);
      setPendingExpenses(prev => prev.filter(e => e.id !== expense.id));
      setHistoryExpenses(prev => [
        { ...expense, status: 'rejected', rejectionReason: reason }, ...prev,
      ]);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(expense.id); return n; });
    } catch (e) {
      console.error("Error rejecting:", e);
      toast.error("Error al rechazar");
    }
  };

  // Bulk approve
  const openApproveConfirm = () => {
    if (selectedList.length === 0 || viewMode !== 'pending') return;
    setApproveConfirmOpen(true);
  };

  const doBulkApprove = async () => {
    const toProcess = [...selectedList];
    if (toProcess.length === 0) return;
    setApproveConfirmOpen(false);
    setBulkBusy(true);
    const toastId = toast.loading(`Aprobando 0 de ${toProcess.length}...`);

    const successes = [];
    const errors = new Map();
    let processed = 0;

    for (const c of chunk(toProcess, BULK_CHUNK_SIZE)) {
      const results = await Promise.allSettled(c.map(async (exp) => {
        const batch = writeBatch(db);
        batch.update(doc(db, "expenses", exp.id), { status: "approved" });
        if (exp.projectId) {
          batch.update(doc(db, "projects", exp.projectId), {
            expenses: increment(Number(exp.amount) || 0),
          });
        }
        await batch.commit();
        return exp;
      }));
      results.forEach((r, i) => {
        processed++;
        if (r.status === 'fulfilled') successes.push(c[i]);
        else errors.set(c[i].id, r.reason?.message || 'Error');
      });
      toast.loading(`Aprobando ${processed} de ${toProcess.length}...`, { id: toastId });
    }

    const successIds = new Set(successes.map(e => e.id));
    setPendingExpenses(prev => prev.filter(e => !successIds.has(e.id)));
    setHistoryExpenses(prev => [
      ...successes.map(e => ({ ...e, status: 'approved' })),
      ...prev,
    ]);
    setSelectedIds(new Set([...errors.keys()]));
    setErrorMap(errors);
    if (errors.size > 0) {
      setTimeout(() => setErrorMap(new Map()), ERROR_HIGHLIGHT_MS);
    }

    toast.dismiss(toastId);
    if (errors.size === 0) {
      toast.success(`${successes.length} rendiciones aprobadas.`);
    } else {
      toast.error(
        `Aprobadas ${successes.length} de ${toProcess.length}. Fallaron ${errors.size} — quedan seleccionadas.`
      );
    }
    setBulkBusy(false);
  };

  // Bulk reject
  const openBulkReject = () => {
    if (selectedList.length === 0 || viewMode !== 'pending') return;
    setBulkRejectReason('');
    setBulkRejectOpen(true);
  };

  const doBulkReject = async () => {
    const reason = bulkRejectReason.trim();
    if (!reason) { toast.error("Ingresa un motivo."); return; }
    const toProcess = [...selectedList];
    if (toProcess.length === 0) return;
    setBulkRejectOpen(false);
    setBulkBusy(true);
    const toastId = toast.loading(`Rechazando 0 de ${toProcess.length}...`);

    const successes = [];
    const errors = new Map();
    let processed = 0;

    for (const c of chunk(toProcess, BULK_CHUNK_SIZE)) {
      const results = await Promise.allSettled(c.map(async (exp) => {
        const batch = writeBatch(db);
        batch.update(doc(db, "expenses", exp.id), {
          status: "rejected",
          rejectionReason: reason,
        });
        if (exp.userId && !exp.isCompanyExpense) {
          batch.update(doc(db, "users", exp.userId), {
            balance: increment(-(Number(exp.amount) || 0)),
          });
        }
        await batch.commit();
        return exp;
      }));
      results.forEach((r, i) => {
        processed++;
        if (r.status === 'fulfilled') successes.push(c[i]);
        else errors.set(c[i].id, r.reason?.message || 'Error');
      });
      toast.loading(`Rechazando ${processed} de ${toProcess.length}...`, { id: toastId });
    }

    const successIds = new Set(successes.map(e => e.id));
    setPendingExpenses(prev => prev.filter(e => !successIds.has(e.id)));
    setHistoryExpenses(prev => [
      ...successes.map(e => ({ ...e, status: 'rejected', rejectionReason: reason })),
      ...prev,
    ]);
    setSelectedIds(new Set([...errors.keys()]));
    setErrorMap(errors);
    if (errors.size > 0) setTimeout(() => setErrorMap(new Map()), ERROR_HIGHLIGHT_MS);

    toast.dismiss(toastId);
    if (errors.size === 0) {
      toast.success(`${successes.length} rendiciones rechazadas.`);
    } else {
      toast.error(
        `Rechazadas ${successes.length} de ${toProcess.length}. Fallaron ${errors.size} — quedan seleccionadas.`
      );
    }
    setBulkRejectReason('');
    setBulkBusy(false);
  };

  // Historical export (preserved)
  const handleExportCSV = async () => {
    try {
      const q = query(collection(db, "expenses"), orderBy("date", "desc"));
      const snapshot = await getDocs(q);
      let expenses = snapshot.docs.map(d => d.data());

      if (startDate && endDate) {
        const s = new Date(startDate); s.setHours(0, 0, 0, 0);
        const ed = new Date(endDate); ed.setHours(23, 59, 59, 999);
        expenses = expenses.filter(e => {
          const d = new Date(e.date);
          return d >= s && d <= ed;
        });
      }
      if (expenses.length === 0) {
        toast.error("No hay registros en el rango de fechas seleccionado.");
        return;
      }
      const pSnap = await getDocs(collection(db, "projects"));
      const projectMap = {};
      pSnap.docs.forEach(d => {
        const data = d.data();
        projectMap[d.id] = data;
        if (data.name) projectMap[data.name.toLowerCase()] = data;
      });
      const rows = expenses.map(e => expenseToCsvRow(e, projectMap));
      downloadCsv(CSV_HEADERS, rows,
        `rendiciones_etfa_${startDate || 'inicio'}_alu_${endDate || 'fin'}.csv`);
    } catch (e) {
      console.error("Error exporting CSV:", e);
      toast.error("Error al exportar los datos.");
    }
  };

  const handleExportSelectionCSV = async () => {
    if (selectedList.length === 0) return;
    try {
      const pSnap = await getDocs(collection(db, "projects"));
      const projectMap = {};
      pSnap.docs.forEach(d => {
        const data = d.data();
        projectMap[d.id] = data;
        if (data.name) projectMap[data.name.toLowerCase()] = data;
      });
      const rows = selectedList.map(e => expenseToCsvRow(e, projectMap));
      downloadCsv(CSV_HEADERS, rows,
        `rendiciones_seleccion_${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`${selectedList.length} filas exportadas.`);
    } catch (e) {
      console.error("Error exporting selection:", e);
      toast.error("Error al exportar la selección.");
    }
  };

  const handleViewReceipt = (url) => {
    if (!url) { toast.error("No hay comprobante adjunto."); return; }
    window.open(url, '_blank');
  };

  // Auto-scroll focused row into view
  useEffect(() => {
    if (focusedIndex < 0) return;
    const id = visibleExpenses[focusedIndex]?.id;
    if (!id) return;
    const el = rowRefs.current[id];
    if (el?.scrollIntoView) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex, visibleExpenses]);

  // Keyboard shortcuts (desktop only)
  useEffect(() => {
    if (!isKeyboardDevice) return;
    const onKey = (e) => {
      const s = stateRef.current;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
      if (s.rejectionModalOpen || s.detailsModalOpen || s.editExpense || s.shortcutsOpen ||
          s.approveConfirmOpen || s.bulkRejectOpen || s.bulkBusy) return;

      const visible = s.visibleExpenses;
      const current = s.focusedIndex >= 0 ? visible[s.focusedIndex] : null;

      // Normalize so Caps Lock doesn't change which shortcut fires.
      // Shift is detected via e.shiftKey, never via letter case.
      if (e.key === 'Escape') {
        setSelectedIds(new Set()); setFocusedIndex(-1); e.preventDefault(); return;
      }
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        setShortcutsOpen(true); e.preventDefault(); return;
      }

      if (e.key.length !== 1) return;
      const key = e.key.toLowerCase();

      if (key === 'a' && e.shiftKey) {
        if (s.selectedIds.size > 0 && s.viewMode === 'pending') {
          setApproveConfirmOpen(true);
        }
        e.preventDefault(); return;
      }
      if (key === 'a' && !e.shiftKey) {
        if (current && s.viewMode === 'pending') handleApprove(current);
        e.preventDefault(); return;
      }
      if (key === 'j') {
        setFocusedIndex(i => Math.min(visible.length - 1, (i < 0 ? 0 : i + 1)));
        e.preventDefault(); return;
      }
      if (key === 'k') {
        setFocusedIndex(i => Math.max(0, (i < 0 ? 0 : i - 1)));
        e.preventDefault(); return;
      }
      if (key === 'x') {
        if (current) toggleSelect(current.id);
        e.preventDefault(); return;
      }
      if (key === 'r') {
        if (current && s.viewMode === 'pending') openRejectionModal(current);
        e.preventDefault(); return;
      }
      if (key === 'e') {
        if (current && s.viewMode === 'pending') setEditExpense(current);
        e.preventDefault(); return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isKeyboardDevice, toggleSelect]);

  // Indeterminate state for header checkbox
  const headerCheckboxRef = useRef(null);
  useEffect(() => {
    if (!headerCheckboxRef.current) return;
    const selectedCountVisible = visibleExpenses.filter(e => selectedIds.has(e.id)).length;
    const indeterminate = selectedCountVisible > 0 && selectedCountVisible < visibleExpenses.length;
    headerCheckboxRef.current.indeterminate = indeterminate;
  }, [visibleExpenses, selectedIds]);

  if (loading) return <Layout title="Aprobaciones"><TableSkeleton rows={6} cols={7} /></Layout>;

  const currentSort = sort[viewMode] || DEFAULT_SORT[viewMode];
  const allVisibleSelected = visibleExpenses.length > 0 && visibleExpenses.every(e => selectedIds.has(e.id));
  const filtersApplied = activeFilterCount > 0;
  const bulkMode = viewMode === 'pending' ? 'full' : 'export-only';

  return (
    <Layout title="Aprobaciones Pendientes">
      {/* Top-right export / shortcuts bar */}
      <div className="flex flex-col md:flex-row justify-end items-end gap-4 mb-4">
        {isKeyboardDevice && (
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className="self-end md:self-auto inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition"
            title="Atajos de teclado"
            aria-label="Ver atajos de teclado"
          >
            <Keyboard className="w-4 h-4" aria-hidden="true" />
            Atajos (?)
          </button>
        )}
        <div className="flex gap-2 items-end">
          <div>
            <label className="block text-xs text-gray-500 font-bold mb-1" htmlFor="export-start">Desde</label>
            <input
              id="export-start"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border border-gray-300 rounded p-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 font-bold mb-1" htmlFor="export-end">Hasta</label>
            <input
              id="export-end"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border border-gray-300 rounded p-2 text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleExportCSV}
          className="bg-gray-800 text-white px-4 py-2 rounded flex items-center hover:bg-gray-700 transition"
        >
          <Download className="w-4 h-4 mr-2" aria-hidden="true" />
          Exportar Histórico (CSV)
        </button>
      </div>

      {/* Filters card */}
      <div className="bg-white rounded-2xl shadow-soft border border-slate-100 mb-4 overflow-hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset transition"
          aria-expanded={filtersOpen}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Filter className="w-4 h-4" aria-hidden="true" />
            Filtros
            {filtersApplied && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[11px] font-bold text-white bg-brand-600 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </span>
          {filtersOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {filtersOpen && (
          <div className="px-5 pb-5 pt-1 border-t border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="f-start">Desde</label>
                <input id="f-start" type="date" value={filters.startDate}
                  onChange={e => updateFilter('startDate', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="f-end">Hasta</label>
                <input id="f-end" type="date" value={filters.endDate}
                  onChange={e => updateFilter('endDate', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="f-user">Usuario</label>
                <select id="f-user" value={filters.user}
                  onChange={e => updateFilter('user', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none">
                  <option value="">Todos</option>
                  {distinctUsers.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="f-company">Empresa Tarjeta</label>
                <select id="f-company" value={filters.cardCompany}
                  onChange={e => updateFilter('cardCompany', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none">
                  <option value="">Todas</option>
                  {CARD_COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="f-brand">Marca Tarjeta</label>
                <select id="f-brand" value={filters.cardBrand}
                  onChange={e => updateFilter('cardBrand', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none">
                  <option value="">Todas</option>
                  {CARD_BRANDS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="f-currency">Moneda</label>
                <select id="f-currency" value={filters.currency}
                  onChange={e => updateFilter('currency', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none">
                  <option value="">Todas</option>
                  {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="f-min">Monto mín.</label>
                <input id="f-min" type="number" value={filters.minAmount}
                  onChange={e => updateFilter('minAmount', e.target.value)}
                  placeholder="0"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="f-max">Monto máx.</label>
                <input id="f-max" type="number" value={filters.maxAmount}
                  onChange={e => updateFilter('maxAmount', e.target.value)}
                  placeholder="∞"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
              </div>
              <div className="md:col-span-2 lg:col-span-4">
                <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="f-search">Búsqueda (proveedor o descripción)</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                  <input id="f-search" type="text" value={filters.search}
                    onChange={e => updateFilter('search', e.target.value)}
                    placeholder="Ej: Hotel, Uber, almuerzo..."
                    className="w-full border border-slate-300 rounded-lg pl-9 pr-3 p-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={resetFilters}
                disabled={!filtersApplied}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded-lg hover:bg-slate-100 transition"
              >
                <XIcon className="w-3.5 h-3.5" aria-hidden="true" />
                Limpiar filtros
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b">
          <button
            type="button"
            onClick={() => handleTabChange('pending')}
            className={`px-6 py-3 font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset ${viewMode === 'pending' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Pendientes ({pendingExpenses.length})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('history')}
            className={`px-6 py-3 font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset ${viewMode === 'history' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Historial de Revisiones ({historyExpenses.length})
          </button>
        </div>

        {visibleExpenses.length === 0 ? (
          filtersApplied ? (
            <EmptyState
              icon={Filter}
              title="Ningún resultado con los filtros aplicados"
              action={{ label: 'Limpiar filtros', onClick: resetFilters }}
            />
          ) : viewMode === 'pending' ? (
            <EmptyState
              icon={CheckCircle}
              title="Todo al día"
              description="No hay rendiciones pendientes de revisión."
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="Sin historial"
              description="No hay rendiciones aprobadas o rechazadas aún."
            />
          )
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      aria-label="Seleccionar todas las filas visibles"
                    />
                  </th>
                  <DataGridHeader label="Fecha" sortable sortKey="date" sortState={currentSort} onSortChange={handleSortChange} />
                  <DataGridHeader label="Usuario" sortable sortKey="userName" sortState={currentSort} onSortChange={handleSortChange} />
                  <DataGridHeader label="Proyecto" sortable sortKey="projectName" sortState={currentSort} onSortChange={handleSortChange} />
                  <DataGridHeader label="Empresa" sortable sortKey="cardCompany" sortState={currentSort} onSortChange={handleSortChange} />
                  <DataGridHeader label="Monto" sortable sortKey="amount" sortState={currentSort} onSortChange={handleSortChange} align="right" />
                  {viewMode === 'history' && <DataGridHeader label="Estado" />}
                  <DataGridHeader label="Acciones" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleExpenses.map((e, index) => {
                  const isSelected = selectedIds.has(e.id);
                  const isFocused = index === focusedIndex;
                  const hasError = errorMap.has(e.id);
                  const rowBase = 'transition-colors';
                  const rowBg = isSelected ? 'bg-brand-50/50' : 'hover:bg-gray-50';
                  const rowRing = isFocused ? 'ring-2 ring-brand-500 ring-inset' : '';
                  return (
                    <Motion.tr
                      key={e.id}
                      ref={el => { if (el) rowRefs.current[e.id] = el; else delete rowRefs.current[e.id]; }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(index, 10) * 0.03 }}
                      className={`${rowBase} ${rowBg} ${rowRing}`}
                    >
                      <td className="px-4 py-4 align-top">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(e.id)}
                            className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            aria-label={`Seleccionar rendición de ${e.userName || 'usuario'}`}
                          />
                          {hasError && (
                            <span title={errorMap.get(e.id)} aria-label="Error en esta fila">
                              <AlertCircle className="w-4 h-4 text-red-500" aria-hidden="true" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600 align-top">{e.date}</td>
                      <td className="px-4 py-4 font-medium text-gray-800 align-top">{e.userName || 'N/A'}</td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col">
                          <span className="text-gray-600 text-sm font-medium">{e.projectName || 'N/A'}</span>
                          {e.description && <span className="text-xs text-gray-400 truncate max-w-xs">{e.description}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500 align-top">{e.cardCompany || '-'}</td>
                      <td className="px-4 py-4 font-semibold text-right align-top whitespace-nowrap">
                        {formatCurrency(Number(e.amount) || 0, e.currency || 'COP')}
                        {e.currency && e.currency !== 'COP' && <span className="text-xs font-normal text-slate-400 ml-1">{e.currency}</span>}
                      </td>
                      {viewMode === 'history' && (
                        <td className="px-4 py-4 align-top">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${e.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {e.status === 'approved' ? 'Aprobado' : 'Rechazado'}
                          </span>
                          {e.rejectionReason && <p className="text-xs text-red-500 mt-1 italic max-w-xs">"{e.rejectionReason}"</p>}
                        </td>
                      )}
                      <td className="px-4 py-4 align-top">
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => { setSelectedExpenseForDetails(e); setDetailsModalOpen(true); }}
                            className="text-gray-600 hover:text-gray-900 p-1.5 hover:bg-gray-100 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition"
                            title="Ver detalles"
                            aria-label="Ver detalles"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleViewReceipt(e.receiptUrl || e.imageUrl)}
                            className="text-blue-600 hover:text-blue-800 p-1.5 hover:bg-blue-50 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition"
                            title="Ver comprobante"
                            aria-label="Ver comprobante"
                          >
                            <FileText className="w-5 h-5" />
                          </button>
                          {viewMode === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditExpense(e)}
                                className="text-amber-500 hover:text-amber-700 p-1.5 hover:bg-amber-50 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 transition"
                                title="Editar"
                                aria-label="Editar rendición"
                              >
                                <Pencil className="w-5 h-5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApprove(e)}
                                className="text-green-600 hover:text-green-800 p-1.5 hover:bg-green-50 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition"
                                title="Aprobar"
                                aria-label="Aprobar"
                              >
                                <CheckCircle className="w-5 h-5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openRejectionModal(e)}
                                className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 transition"
                                title="Rechazar"
                                aria-label="Rechazar"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </Motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        mode={bulkMode}
        disabled={bulkBusy}
        onBulkApprove={openApproveConfirm}
        onBulkReject={openBulkReject}
        onExportSelection={handleExportSelectionCSV}
        onClear={clearSelection}
      />

      {/* Legacy single-row modals (preserved) */}
      <RejectionModal
        isOpen={rejectionModalOpen}
        onClose={() => setRejectionModalOpen(false)}
        onConfirm={handleConfirmRejection}
        expense={selectedExpenseToReject}
      />
      <ExpenseDetailsModal
        isOpen={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        expense={selectedExpenseForDetails}
      />
      {editExpense && (
        <EditExpenseModal
          isOpen={true}
          onClose={() => setEditExpense(null)}
          expense={editExpense}
          onSave={(updated) => {
            setPendingExpenses(prev => prev.map(e => e.id === updated.id ? updated : e));
            setEditExpense(null);
          }}
        />
      )}

      {/* Bulk approve confirm */}
      <ConfirmDialog
        isOpen={approveConfirmOpen}
        onClose={() => setApproveConfirmOpen(false)}
        onConfirm={doBulkApprove}
        confirmTone="primary"
        title="Confirmar aprobación en lote"
        description={
          `Vas a aprobar ${selectedSummary.count} ${selectedSummary.count === 1 ? 'rendición' : 'rendiciones'} por un total de ${formatTotalsLine(selectedSummary.byCurrency)}.\n\n¿Confirmar?`
        }
        confirmLabel={`Aprobar ${selectedSummary.count}`}
      />

      {/* Bulk reject confirm (with reason textarea) */}
      <ConfirmDialog
        isOpen={bulkRejectOpen}
        onClose={() => { setBulkRejectOpen(false); setBulkRejectReason(''); }}
        onConfirm={doBulkReject}
        confirmTone="danger"
        title="Rechazar en lote"
        description={
          `Vas a rechazar ${selectedSummary.count} ${selectedSummary.count === 1 ? 'rendición' : 'rendiciones'} por un total de ${formatTotalsLine(selectedSummary.byCurrency)}. El mismo motivo se aplicará a todas.`
        }
        confirmLabel={`Rechazar ${selectedSummary.count}`}
        confirmDisabled={!bulkRejectReason.trim()}
      >
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="bulk-reject-reason">
            Motivo del rechazo *
          </label>
          <textarea
            id="bulk-reject-reason"
            rows={3}
            value={bulkRejectReason}
            onChange={(e) => setBulkRejectReason(e.target.value)}
            placeholder="Ej: Falta comprobante, gasto duplicado..."
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-red-500 focus:border-red-500 outline-none"
          />
        </div>
      </ConfirmDialog>

      {/* Shortcuts */}
      <KeyboardShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </Layout>
  );
}
