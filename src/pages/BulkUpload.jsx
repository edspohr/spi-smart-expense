import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/useAuth';
import { parseExpenseDocuments } from '../lib/gemini';
import { db, uploadReceiptImage } from '../lib/firebase';
import {
  collection, getDocs, query, where,
  doc, increment, writeBatch,
} from 'firebase/firestore';
import {
  Upload, Loader2, X, CheckCircle, AlertTriangle,
  Zap, ArrowRight, RefreshCw,
} from 'lucide-react';
import { compressImage } from '../utils/imageUtils';
import { sortProjects } from '../utils/sort';
import { CATEGORIES_COMMON } from '../lib/constants';
import { toast } from 'sonner';

const MAX_FILES = 25;
const UPLOAD_CONCURRENCY = 4;
const FIRESTORE_BATCH_SIZE = 20;

function findBulkDuplicate(item, existingExpenses) {
  if (item.invoiceNumber) {
    const inv = item.invoiceNumber.toLowerCase().trim();
    if (existingExpenses.some(e => e.invoiceNumber && e.invoiceNumber.toLowerCase().trim() === inv)) {
      return `Factura ${item.invoiceNumber} ya registrada`;
    }
  }
  if (item.amount && item.date && item.merchant) {
    const norm = (item.merchant || '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (existingExpenses.some(e =>
      Number(e.amount) === Number(item.amount) &&
      e.date === item.date &&
      (e.merchant || '').toLowerCase().trim().replace(/\s+/g, ' ') === norm
    )) {
      return 'Mismo monto, fecha y comercio ya registrados';
    }
  }
  return null;
}

function mkItem(file, preview) {
  return {
    id: crypto.randomUUID(),
    file,
    preview,
    status: 'queued',      // queued | analyzing | ready | error
    errorMsg: null,
    dupeWarning: null,
    merchant: '',
    date: '',
    time: '',
    amount: '',
    currency: 'COP',
    invoiceNumber: '',
    taxId: '',
    category: '',
    paymentMethod: '',
    cardLast4: '',
    cardBrand: '',
    description: '',
    eventName: '',
    projectId: '',
    submitStatus: 'idle',  // idle | uploading | done | error
    submitError: null,
  };
}

const inp = 'border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400 w-full';
const sel = 'border border-gray-200 rounded px-1 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400 w-full bg-white';

function extractFields(data) {
  return {
    merchant:      data?.merchant       || '',
    date:          data?.date           || '',
    time:          data?.time           || '',
    amount:        data?.amount != null  ? String(data.amount) : '',
    currency:      data?.currency       || 'COP',
    invoiceNumber: data?.invoiceNumber  || '',
    taxId:         data?.taxId          || '',
    category:      data?.category       || '',
    paymentMethod: data?.paymentMethod  || '',
    cardLast4:     data?.cardLast4      || '',
    cardBrand:     data?.cardBrand      || '',
    description:   data?.description    || '',
  };
}

export default function BulkUpload() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const itemsRef = useRef([]);

  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState('drop'); // drop | analyzing | review | submitting | done
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [existingEvents, setExistingEvents] = useState([]);
  const [globalEvent, setGlobalEvent] = useState('');
  const [globalProject, setGlobalProject] = useState('');
  const [submitProgress, setSubmitProgress] = useState({ done: 0, total: 0 });

  // Keep ref in sync so cleanup effect doesn't stale-close over items
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Revoke all blob URLs on unmount
  useEffect(() => () => {
    itemsRef.current.forEach(i => URL.revokeObjectURL(i.preview));
  }, []);

  // Load projects and existing events on mount
  useEffect(() => {
    async function load() {
      try {
        const pSnap = await getDocs(
          query(collection(db, 'projects'), where('status', '!=', 'deleted'))
        );
        setProjects(
          sortProjects(
            pSnap.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(p => !p.name.toLowerCase().includes('test'))
          )
        );
        const eSnap = await getDocs(collection(db, 'expenses'));
        const evts = new Set();
        eSnap.docs.forEach(d => { const ev = d.data().eventName; if (ev) evts.add(ev); });
        setExistingEvents([...evts].sort());
      } catch (err) {
        console.error('BulkUpload: failed to load reference data', err);
      }
    }
    load();
  }, []);

  // ─── State helpers ──────────────────────────────────────────────────────────

  const setItem = useCallback((id, fields) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...fields } : i));
  }, []);

  const removeItem = useCallback((id) => {
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter(i => i.id !== id);
    });
  }, []);

  // ─── File ingestion ─────────────────────────────────────────────────────────

  const addFiles = useCallback(async (fileList) => {
    const imgs = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (imgs.length === 0) { toast.error('Solo se aceptan imágenes (JPG, PNG, WEBP, HEIC).'); return; }

    const available = MAX_FILES - itemsRef.current.length;
    const toAdd = imgs.slice(0, available);
    if (toAdd.length < imgs.length) {
      toast.warning(`Máximo ${MAX_FILES} archivos. Se agregaron ${toAdd.length} de ${imgs.length}.`);
    }

    const newItems = await Promise.all(toAdd.map(async (file) => {
      let processed = file;
      try { processed = await compressImage(file); } catch { /* keep original if compression fails */ }
      return mkItem(processed, URL.createObjectURL(processed));
    }));

    setItems(prev => [...prev, ...newItems]);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  // ─── OCR ────────────────────────────────────────────────────────────────────

  const runOCR = async (item) => {
    setItem(item.id, { status: 'analyzing', errorMsg: null });
    try {
      const data = await parseExpenseDocuments(item.file, null, CATEGORIES_COMMON);
      setItem(item.id, { status: 'ready', ...extractFields(data) });
    } catch (err) {
      setItem(item.id, { status: 'error', errorMsg: err.message || 'Error de IA' });
    }
  };

  const handleAnalyzeAll = async () => {
    const snapshot = items; // capture at call time
    setPhase('analyzing');
    for (const item of snapshot) {
      if (item.status !== 'queued') continue;
      await runOCR(item);
    }
    // After OCR, flag potential duplicates against this user's existing expenses
    try {
      const expSnap = await getDocs(
        query(collection(db, 'expenses'), where('userId', '==', currentUser.uid))
      );
      const existing = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(prev => prev.map(item => ({
        ...item,
        dupeWarning: findBulkDuplicate(item, existing),
      })));
    } catch { /* non-fatal */ }

    setPhase('review');
  };

  const retryOCR = (item) => runOCR(item);

  // ─── Global apply ───────────────────────────────────────────────────────────

  const applyGlobalEvent = () => {
    const val = globalEvent.trim().toUpperCase();
    if (!val) return;
    setItems(prev => prev.map(i => ({ ...i, eventName: val })));
    toast.success(`Evento aplicado a ${items.length} fila(s).`);
  };

  const applyGlobalProject = () => {
    if (!globalProject) return;
    setItems(prev => prev.map(i => ({ ...i, projectId: globalProject })));
    toast.success('Proyecto aplicado a todas las filas.');
  };

  // ─── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const snapshot = items;

    const invalid = snapshot.filter(i => !i.merchant || !i.date || !i.amount);
    if (invalid.length > 0) {
      toast.error(`${invalid.length} fila(s) con campos obligatorios vacíos: Comercio, Fecha y Monto.`);
      return;
    }

    setPhase('submitting');
    setSubmitProgress({ done: 0, total: snapshot.length });

    // Step 1: Upload images in parallel chunks
    const uploadedItems = [];
    for (let i = 0; i < snapshot.length; i += UPLOAD_CONCURRENCY) {
      const chunk = snapshot.slice(i, i + UPLOAD_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(item =>
          uploadReceiptImage(item.file, currentUser.uid).then(url => ({ item, receiptUrl: url }))
        )
      );
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          uploadedItems.push(r.value);
          setItem(chunk[idx].id, { submitStatus: 'done' });
        } else {
          setItem(chunk[idx].id, { submitStatus: 'error', submitError: r.reason?.message });
        }
        setSubmitProgress(prev => ({ ...prev, done: prev.done + 1 }));
      });
    }

    if (uploadedItems.length === 0) {
      toast.error('No se pudo subir ninguna imagen. Verifique su conexión.');
      setPhase('review');
      return;
    }

    // Step 2: Firestore batch writes
    for (let i = 0; i < uploadedItems.length; i += FIRESTORE_BATCH_SIZE) {
      const chunk = uploadedItems.slice(i, i + FIRESTORE_BATCH_SIZE);
      const batch = writeBatch(db);
      for (const { item, receiptUrl } of chunk) {
        const projectObj = projects.find(p => p.id === item.projectId);
        const expRef = doc(collection(db, 'expenses'));
        batch.set(expRef, {
          userId:        currentUser.uid,
          userName:      currentUser.displayName,
          projectId:     item.projectId     || null,
          projectName:   projectObj?.name   || 'Sin proyecto asignado',
          eventName:     (item.eventName || '').toUpperCase(),
          category:      item.category      || null,
          date:          item.date,
          time:          item.time          || null,
          merchant:      item.merchant,
          taxId:         item.taxId         || null,
          invoiceNumber: item.invoiceNumber  || null,
          city:          null,
          address:       null,
          phone:         null,
          paymentMethod: item.paymentMethod  || null,
          cardBrand:     item.cardBrand      || null,
          cardCompany:   null,
          description:   item.description   || null,
          amount:        Number(item.amount),
          currency:      item.currency      || 'COP',
          cardLast4:     item.cardLast4      || null,
          receiptUrl,
          voucherUrl:    null,
          status:        'pending',
          createdAt:     new Date().toISOString(),
          isCompanyExpense: false,
          splitGroupId:  null,
          trm:           null,
          amountCOP:     null,
          trmSource:     null,
          bulkUpload:    true,
        });
        const userRef = doc(db, 'users', currentUser.uid);
        batch.set(userRef, { balance: increment(Number(item.amount)) }, { merge: true });
      }
      await batch.commit();
    }

    const errorCount = snapshot.length - uploadedItems.length;
    setPhase('done');
    if (errorCount === 0) {
      toast.success(`${uploadedItems.length} rendición(es) enviadas exitosamente.`);
    } else {
      toast.warning(`${uploadedItems.length} enviadas, ${errorCount} con error de subida.`);
    }
  };

  // ─── Derived state ──────────────────────────────────────────────────────────

  const analyzedCount  = items.filter(i => i.status === 'ready').length;
  const errorCount     = items.filter(i => i.status === 'error').length;
  const analyzingNow   = items.filter(i => i.status === 'analyzing').length;
  const submittedCount = items.filter(i => i.submitStatus === 'done').length;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout title="Carga Masiva de Facturas">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Done ──────────────────────────────────────────────────────────── */}
        {phase === 'done' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">¡Carga completada!</h2>
            <p className="text-gray-500 mb-6">
              {submittedCount} rendición(es) enviadas para aprobación.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setItems([]); setPhase('drop'); setGlobalEvent(''); setGlobalProject(''); }}
                className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                Nueva carga
              </button>
              <button
                onClick={() => navigate('/dashboard/expenses')}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Ver mis rendiciones
              </button>
            </div>
          </div>
        )}

        {/* ── Drop zone (empty state) ────────────────────────────────────────── */}
        {phase === 'drop' && items.length === 0 && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Zona para arrastrar archivos"
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-16 text-center transition cursor-pointer select-none ${
              isDragging
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 hover:border-blue-300 bg-white'
            }`}
          >
            <Upload className="w-12 h-12 text-gray-300 mx-auto mb-4" aria-hidden="true" />
            <h2 className="text-lg font-bold text-gray-700 mb-1">Arrastra tus facturas aquí</h2>
            <p className="text-sm text-gray-400 mb-6">
              o haz clic para seleccionar — máximo {MAX_FILES} imágenes por lote
            </p>
            <span className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 transition inline-block">
              Seleccionar Imágenes
            </span>
          </div>
        )}

        {/* ── Files loaded (all non-done phases) ────────────────────────────── */}
        {phase !== 'done' && items.length > 0 && (
          <>
            {/* Controls bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">

                <div className="flex items-center gap-3 flex-wrap">
                  {(phase === 'drop' || phase === 'review') && items.length < MAX_FILES && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 text-sm border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition"
                    >
                      <Upload className="w-4 h-4 text-gray-500" aria-hidden="true" />
                      Agregar más ({items.length}/{MAX_FILES})
                    </button>
                  )}

                  <div className="flex items-center gap-2 text-xs font-medium">
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                      {items.length} archivos
                    </span>
                    {analyzedCount > 0 && (
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">
                        {analyzedCount} extraídos
                      </span>
                    )}
                    {errorCount > 0 && (
                      <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full">
                        {errorCount} con error
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {phase === 'drop' && (
                    <button
                      onClick={handleAnalyzeAll}
                      className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-black transition"
                    >
                      <Zap className="w-4 h-4" aria-hidden="true" />
                      Analizar con IA
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}

                  {phase === 'review' && (
                    <button
                      onClick={handleSubmit}
                      className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
                    >
                      <CheckCircle className="w-4 h-4" aria-hidden="true" />
                      Enviar {items.length} rendición{items.length !== 1 ? 'es' : ''}
                    </button>
                  )}

                  {phase === 'submitting' && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" aria-hidden="true" />
                      Subiendo... {submitProgress.done}/{submitProgress.total}
                    </div>
                  )}
                </div>
              </div>

              {/* Global apply controls */}
              {phase === 'review' && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-6">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-gray-500 whitespace-nowrap">
                      Evento para todos:
                    </label>
                    <input
                      type="text"
                      list="bulk-global-events"
                      className="border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400 w-48"
                      placeholder="Ej: FERIA CHICAGO 2026"
                      value={globalEvent}
                      onChange={e => setGlobalEvent(e.target.value.toUpperCase())}
                    />
                    <button
                      onClick={applyGlobalEvent}
                      className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
                    >
                      Aplicar
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-gray-500 whitespace-nowrap">
                      Proyecto para todos:
                    </label>
                    <select
                      className="border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400 w-48 bg-white"
                      value={globalProject}
                      onChange={e => setGlobalProject(e.target.value)}
                    >
                      <option value="">-- Sin Asignar --</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.code ? `[${p.code}] ` : ''}{p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={applyGlobalProject}
                      className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Analyzing progress banner */}
            {phase === 'analyzing' && analyzingNow > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600 shrink-0" aria-hidden="true" />
                <p className="text-sm text-blue-700 font-medium">
                  Extrayendo datos con IA... ({analyzedCount + errorCount} / {items.length} procesados)
                </p>
              </div>
            )}

            {/* Submit progress bar */}
            {phase === 'submitting' && submitProgress.total > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-3">
                  Subiendo imágenes y guardando rendiciones...
                </p>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${(submitProgress.done / submitProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2 text-right">
                  {submitProgress.done} / {submitProgress.total}
                </p>
              </div>
            )}

            {/* OCR error notice */}
            {phase === 'review' && errorCount > 0 && (
              <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-yellow-800">
                  <strong>{errorCount} imagen(es)</strong> no pudieron ser analizadas por IA.
                  Puedes completar los campos manualmente o usar el botón{' '}
                  <RefreshCw className="w-3 h-3 inline" /> para reintentar, o eliminar esas filas.
                </p>
              </div>
            )}

            {/* Review table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <datalist id="bulk-events-datalist">
                {existingEvents.map((ev, i) => <option key={i} value={ev} />)}
              </datalist>
              <datalist id="bulk-global-events">
                {existingEvents.map((ev, i) => <option key={i} value={ev} />)}
              </datalist>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[1100px]">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-gray-400 font-medium w-8 text-center">#</th>
                      <th className="px-3 py-3 text-gray-400 font-medium w-12"></th>
                      <th className="px-3 py-3 text-gray-600 font-semibold min-w-[160px]">Comercio *</th>
                      <th className="px-3 py-3 text-gray-600 font-semibold min-w-[130px]">Fecha *</th>
                      <th className="px-3 py-3 text-gray-600 font-semibold min-w-[145px]">Monto * / Moneda</th>
                      <th className="px-3 py-3 text-gray-600 font-semibold min-w-[110px]">No. Factura</th>
                      <th className="px-3 py-3 text-gray-600 font-semibold min-w-[145px]">Categoría</th>
                      <th className="px-3 py-3 text-gray-600 font-semibold min-w-[155px]">Evento</th>
                      <th className="px-3 py-3 text-gray-600 font-semibold min-w-[165px]">Proyecto</th>
                      <th className="px-3 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map((item, idx) => {
                      const isDisabled = phase === 'analyzing' || phase === 'submitting';
                      const rowBg =
                        item.submitStatus === 'done'  ? 'bg-green-50/40'  :
                        item.submitStatus === 'error' ? 'bg-red-50/40'    :
                        item.status === 'error'       ? 'bg-red-50/20'    :
                        item.dupeWarning              ? 'bg-yellow-50/40' : '';

                      return (
                        <tr key={item.id} className={`hover:bg-gray-50/50 transition-colors ${rowBg}`}>

                          {/* Status / row number */}
                          <td className="px-3 py-2 text-center">
                            {item.status === 'analyzing' && (
                              <Loader2 className="w-4 h-4 animate-spin text-blue-500 mx-auto" aria-label="Analizando" />
                            )}
                            {item.status === 'ready' && item.submitStatus === 'idle' && !item.dupeWarning && (
                              <CheckCircle className="w-4 h-4 text-green-500 mx-auto" aria-label="Listo" />
                            )}
                            {item.status === 'ready' && item.submitStatus === 'idle' && item.dupeWarning && (
                              <AlertTriangle
                                className="w-4 h-4 text-yellow-500 mx-auto"
                                aria-label={item.dupeWarning}
                                title={item.dupeWarning}
                              />
                            )}
                            {item.status === 'error' && (
                              <div className="flex items-center justify-center gap-0.5">
                                <AlertTriangle
                                  className="w-4 h-4 text-red-400"
                                  aria-label={item.errorMsg || 'Error de IA'}
                                  title={item.errorMsg}
                                />
                                {phase === 'review' && (
                                  <button
                                    onClick={() => retryOCR(item)}
                                    title="Reintentar OCR"
                                    className="text-blue-400 hover:text-blue-600 transition"
                                  >
                                    <RefreshCw className="w-3 h-3" aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            )}
                            {item.status === 'queued' && (
                              <span className="text-gray-300 text-[11px]">{idx + 1}</span>
                            )}
                            {item.submitStatus === 'uploading' && (
                              <Loader2 className="w-4 h-4 animate-spin text-blue-500 mx-auto" />
                            )}
                            {item.submitStatus === 'done' && (
                              <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                            )}
                          </td>

                          {/* Thumbnail */}
                          <td className="px-3 py-2">
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 shrink-0">
                              <img
                                src={item.preview}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </td>

                          {/* Merchant */}
                          <td className="px-3 py-2">
                            <input
                              className={inp}
                              value={item.merchant}
                              onChange={e => setItem(item.id, { merchant: e.target.value })}
                              placeholder="Comercio"
                              disabled={isDisabled}
                            />
                          </td>

                          {/* Date */}
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              className={inp}
                              value={item.date}
                              onChange={e => setItem(item.id, { date: e.target.value })}
                              disabled={isDisabled}
                            />
                          </td>

                          {/* Amount + Currency */}
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <input
                                type="number"
                                inputMode="decimal"
                                className={`${inp} w-20`}
                                placeholder="0"
                                value={item.amount}
                                onChange={e => setItem(item.id, { amount: e.target.value })}
                                disabled={isDisabled}
                              />
                              <select
                                className={`${sel} w-16`}
                                value={item.currency}
                                onChange={e => setItem(item.id, { currency: e.target.value })}
                                disabled={isDisabled}
                              >
                                <option value="COP">COP</option>
                                <option value="USD">USD</option>
                              </select>
                            </div>
                          </td>

                          {/* Invoice Number */}
                          <td className="px-3 py-2">
                            <input
                              className={inp}
                              value={item.invoiceNumber}
                              onChange={e => setItem(item.id, { invoiceNumber: e.target.value })}
                              placeholder="No. factura"
                              disabled={isDisabled}
                            />
                          </td>

                          {/* Category */}
                          <td className="px-3 py-2">
                            <select
                              className={sel}
                              value={item.category}
                              onChange={e => setItem(item.id, { category: e.target.value })}
                              disabled={isDisabled}
                            >
                              <option value="">Categoría...</option>
                              {CATEGORIES_COMMON.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </td>

                          {/* Event */}
                          <td className="px-3 py-2">
                            <input
                              className={inp}
                              list="bulk-events-datalist"
                              value={item.eventName}
                              onChange={e => setItem(item.id, { eventName: e.target.value.toUpperCase() })}
                              placeholder="Evento"
                              disabled={isDisabled}
                            />
                          </td>

                          {/* Project */}
                          <td className="px-3 py-2">
                            <select
                              className={sel}
                              value={item.projectId}
                              onChange={e => setItem(item.id, { projectId: e.target.value })}
                              disabled={isDisabled}
                            >
                              <option value="">-- Sin Asignar --</option>
                              {projects.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.code ? `[${p.code}] ` : ''}{p.name}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Remove */}
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              disabled={isDisabled}
                              title="Eliminar fila"
                              className="p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                              <X className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Single hidden file input shared by all pickers */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
        aria-hidden="true"
      />
    </Layout>
  );
}
