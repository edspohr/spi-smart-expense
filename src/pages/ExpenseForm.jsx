import { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/useAuth';
import { parseExpenseDocuments, checkGeminiHealth } from '../lib/gemini';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { Upload, Loader2, Camera, X, FileText, Plus, CheckCircle, CreditCard, Calendar, MousePointer2 } from 'lucide-react';
import { formatCurrency } from '../utils/format'; 
import { useNavigate } from 'react-router-dom';
import { compressImage } from '../utils/imageUtils';
import { sortProjects } from '../utils/sort';
import { fetchRate, calculateCOPEquivalent } from '../lib/exchangeRate';
import { BASE_CURRENCY, baseEquivalentFields, country, needsRate } from '../lib/country';

const NEEDS_RATE = needsRate;
import { CATEGORIES_COMMON, PAYMENT_METHODS, CARD_BRANDS, CARD_COMPANIES, CURRENCIES } from '../lib/constants';
import { toast } from 'sonner';
import { logger } from '../lib/logger';
import { isAdminRole } from '../lib/roles';
import { enqueueSubmission, isNetworkError } from '../lib/offlineQueue';
import { flushNewSubmission } from '../lib/offlineSync';
import { isOnline } from '../lib/connectivity';
import { useTenantSettings } from '../context/SettingsContext';
import ReadConfidence from '../components/ReadConfidence';

/**
 * Checks a set of existing expenses for a potential duplicate of the given formData.
 * Returns { match, method } if a duplicate is found, otherwise null.
 * Primary key: invoiceNumber. Fallback: amount + date + merchant (normalized).
 */
function findPotentialDuplicate(formData, existingExpenses) {
  if (formData.invoiceNumber) {
    const inv = formData.invoiceNumber.toLowerCase().trim();
    const match = existingExpenses.find(
      e => e.invoiceNumber && e.invoiceNumber.toLowerCase().trim() === inv
    );
    if (match) return { match, method: 'invoice' };
  }
  if (formData.amount && formData.date && formData.merchant) {
    const norm = (formData.merchant || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const match = existingExpenses.find(
      e =>
        Number(e.amount) === Number(formData.amount) &&
        e.date === formData.date &&
        (e.merchant || '').toLowerCase().trim().replace(/\s+/g, ' ') === norm
    );
    if (match) return { match, method: 'amountDateMerchant' };
  }
  return null;
}

function DropzoneSlot({
  title, hint, loadedLabel,
  LoadedIcon, EmptyIcon, emptyIconColor,
  preview, fileName, isCompressing, isTouch,
  onPickCamera, onPickFile,
  cameraInputRef, fileInputRef, onFileSelect,
}) {
  return (
    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center relative hover:bg-slate-100 transition min-h-[16rem]">
      {isCompressing && (
        <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center" aria-live="polite">
          <Loader2 className="w-6 h-6 text-brand-600 animate-spin" aria-hidden="true" />
          <span className="text-xs text-slate-600 font-semibold mt-2">Procesando...</span>
        </div>
      )}

      {preview ? (
        <div className="flex flex-col items-center text-center">
          <LoadedIcon className="w-12 h-12 text-green-500 mb-2" aria-hidden="true" />
          <span className="text-green-600 font-medium">{loadedLabel}</span>
          {fileName && <p className="text-xs text-slate-400 mt-1 break-all max-w-full">{fileName}</p>}
        </div>
      ) : (
        <>
          <div className="bg-white p-3 rounded-full shadow-sm mb-4">
            <EmptyIcon className={`w-6 h-6 ${emptyIconColor}`} aria-hidden="true" />
          </div>
          <span className="font-semibold text-slate-700">{title}</span>
          <span className="text-xs text-slate-400 mt-1">{hint}</span>
        </>
      )}

      {/* Picker buttons — always visible so user can replace after upload */}
      <div className={`mt-4 w-full flex gap-2 ${preview ? 'justify-center' : 'justify-center'}`}>
        {isTouch ? (
          <>
            <button
              type="button"
              onClick={onPickCamera}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-brand-600 text-white px-3 py-2 rounded-lg hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 transition"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              Tomar Foto
            </button>
            <button
              type="button"
              onClick={onPickFile}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 transition"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              Elegir Archivo
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onPickFile}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 transition"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            {preview ? 'Cambiar archivo' : 'Subir archivo'}
          </button>
        )}
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileSelect}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={onFileSelect}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

export default function ExpenseForm() {
  const { currentUser, userRole } = useAuth();
  const { offline: offlineSettings, ai: aiSettings } = useTenantSettings();
  // On-device read of the receipt (Ola 8): per-field confidence for the
  // review badges and what was read, sent with the expense for verification.
  const [localRead, setLocalRead] = useState(null);
  // Shadow read (Ola 8b): the device reads the same photo in the background
  // while Gemini fills the form; never shown, only measured server-side.
  const shadowRef = useRef(null);
  const shadowSeq = useRef(0);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [processingAi, setProcessingAi] = useState(false);
  const [projects, setProjects] = useState([]);
  const [existingEvents, setExistingEvents] = useState([]);
  
  const [step, setStep] = useState('upload'); // 'upload' | 'review'
  
  // Admin "On Behalf Of" State
  const [expenseMode, setExpenseMode] = useState('me'); // 'me', 'project', 'other'
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');

  // Split Logic
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitRows, setSplitRows] = useState([{ projectId: '', amount: '' }]);

  // Manual Entry State
  const [isManual, setIsManual] = useState(false);

  // Duplicate detection state
  const [duplicateWarning, setDuplicateWarning] = useState(null); // null | { match, method }
  const duplicateAcknowledged = useRef(false);
  const reviewFormRef = useRef(null);

  // TRM State (foreign→COP exchange rate for USD and EUR)
  const [trmState, setTrmState] = useState({ trm: null, source: null, fetchedAt: null, loading: false });

  // Probe Gemini API on mount; warn the user if it's down so they can capture manually.
  useEffect(() => {
    let cancelled = false;
    if (!isOnline()) return undefined; // no signal: the local reader (or manual entry) takes over
    checkGeminiHealth().then(res => {
      if (!cancelled && !res.ok) {
        toast.warning('El servicio de IA no responde. Puedes seguir e ingresar el gasto manualmente.');
      }
    });
    return () => { cancelled = true; };
  }, []);

  const [files, setFiles] = useState({ receipt: null, voucher: null });
  const [previews, setPreviews] = useState({ receipt: null, voucher: null });
  const [compressing, setCompressing] = useState({ receipt: false, voucher: false });
  const [isTouch, setIsTouch] = useState(false);

  const inputRefs = {
    receipt: { camera: useRef(null), file: useRef(null) },
    voucher: { camera: useRef(null), file: useRef(null) },
  };

  // Detect touch-first devices so we can surface camera capture.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    setIsTouch(mq.matches);
    const handler = (e) => setIsTouch(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [formData, setFormData] = useState({
    projectId: '',
    eventName: '',
    date: '',
    time: '',
    merchant: '',
    taxId: '',
    invoiceNumber: '',
    city: '',
    address: '',
    phone: '',
    description: '',
    category: '',
    amount: '',
    currency: BASE_CURRENCY,
    paymentMethod: '',
    cardLast4: '',
    cardCompany: '',
    cardBrand: ''
  });

  useEffect(() => {
      async function fetchData() {
          // Fetch Projects
          const q = query(collection(db, "projects"), where("status", "!=", "deleted"));
          const snapshot = await getDocs(q);
          const data = snapshot.docs.map(d => ({id: d.id, ...d.data()}))
              .filter(p => !p.name.toLowerCase().includes('test'));
          setProjects(sortProjects(data));

          // Event-name suggestions. Rules only let admins list the whole
          // collection; everyone else can read their own expenses.
          try {
              const qExp = isAdminRole(userRole)
                  ? query(collection(db, "expenses"))
                  : query(collection(db, "expenses"), where("userId", "==", currentUser.uid));
              const snapExp = await getDocs(qExp);
              const events = new Set();
              snapExp.docs.forEach(d => {
                  const evt = d.data().eventName;
                  if (evt) events.add(evt);
              });
              setExistingEvents(Array.from(events).sort());
          } catch (err) {
              logger.warn('[ExpenseForm] event suggestions unavailable', err);
          }

          // Fetch Users (If Admin or Assistant)
          if (isAdminRole(userRole) || userRole === 'assistant') {
              const uQuery = query(collection(db, "users"), where("role", "in", ["professional", "admin", "assistant"]));
              const uSnap = await getDocs(uQuery);
              const uData = uSnap.docs.map(d => ({id: d.id, ...d.data()}));
              setUsers(uData);
          }
      }
      if (userRole !== null && currentUser) {
          fetchData();
      }
  }, [userRole, currentUser]);

  // Fetch conversion rate automatically for USD or EUR when date is set and user is on review step
  useEffect(() => {
    if (!NEEDS_RATE(formData.currency) || !formData.date || step !== 'review') {
      setTrmState({ trm: null, source: null, fetchedAt: null, loading: false });
      return;
    }
    let cancelled = false;
    setTrmState(prev => ({ ...prev, loading: true }));
    fetchRate(formData.currency, formData.date).then(result => {
      if (!cancelled) setTrmState({ trm: result.rate, source: result.source, fetchedAt: result.fetchedAt, loading: false });
    });
    return () => { cancelled = true; };
  }, [formData.currency, formData.date, step]);

  const handleFileSelect = async (type, e) => {
    const file = e.target.files[0];
    // Clearing value lets the same file be picked again later if needed.
    e.target.value = '';
    if (!file) return;
    await processFile(type, file);
  };

  // A photo shared from the gallery (Web Share Target) arrives via the
  // service worker in Cache Storage; load it as the receipt.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('shared') || typeof caches === 'undefined') return;
    (async () => {
      try {
        const cache = await caches.open('shared-files');
        const res = await cache.match('/shared/receipt');
        if (!res) return;
        const blob = await res.blob();
        const name = decodeURIComponent(res.headers.get('x-filename') || 'compartido.jpg');
        await cache.delete('/shared/receipt');
        await processFile('receipt', new File([blob], name, { type: blob.type }));
        toast.success('Foto recibida. Revisa y envía la rendición.', { id: 'shared-photo' });
      } catch (err) {
        console.error('Error loading shared file:', err);
      } finally {
        window.history.replaceState(null, '', '/dashboard/new-expense');
      }
    })();
  }, []);

  const processFile = async (type, file) => {
    setCompressing(prev => ({ ...prev, [type]: true }));
    try {
        let processedFile = file;
        if (file.type.startsWith('image/')) {
            processedFile = await compressImage(file);
        }

        const url = URL.createObjectURL(processedFile);

        setFiles(prev => ({ ...prev, [type]: processedFile }));
        setPreviews(prev => ({ ...prev, [type]: url }));

    } catch (err) {
        console.error("Error processing file:", err);
        toast.error("Error al procesar el archivo.");
    } finally {
        setCompressing(prev => ({ ...prev, [type]: false }));
    }
  };

  const openPicker = (type, source) => {
    const ref = inputRefs[type]?.[source];
    if (ref?.current) {
      ref.current.value = '';
      ref.current.click();
    }
  };

  // What is stored on the expense about a device read (compared server-side).
  const readPayload = (result, mode, version) => ({
      mode,
      engine: result.barcode ? `barcode:${result.barcode.kind}` : 'ocr',
      docType: result.barcode?.docType ?? null,
      offline: mode === 'offline',
      durationMs: result.durationMs,
      readerVersion: version,
      values: Object.fromEntries(Object.entries(result.fields).map(([k, f]) => [k, f.value])),
      confidence: Object.fromEntries(Object.entries(result.fields).map(([k, f]) => [k, f.confidence])),
      ...(result.amountCandidates ? { amountCandidates: result.amountCandidates } : {}),
  });

  // Skip the shadow read where it would cost the person data or battery.
  const shadowAllowed = () => {
      const c = navigator.connection;
      return isOnline() && !c?.saveData && !['slow-2g', '2g'].includes(c?.effectiveType);
  };

  const aiReadOf = (data) => ({
      model: data._model ?? null,
      values: Object.fromEntries(['amount', 'date', 'taxId', 'invoiceNumber', 'merchant', 'category', 'currency']
          .filter((k) => data[k] !== undefined && data[k] !== null && data[k] !== '')
          .map((k) => [k, data[k]])),
  });

  const startShadowRead = (file, aiRead) => {
      const seq = ++shadowSeq.current;
      void (async () => {
          try {
              const { readReceiptLocally, READER_VERSION } = await import('../lib/localReader');
              const result = await readReceiptLocally(file, { categories: CATEGORIES_COMMON });
              if (seq === shadowSeq.current) shadowRef.current = { localRead: readPayload(result, 'shadow', READER_VERSION), aiRead };
          } catch (err) {
              console.warn('[shadowRead]', err);
          }
      })();
  };

  // Reads the receipt on the device (no network) and pre-fills the form.
  const runLocalRead = async (offline) => {
      const { readReceiptLocally, toFormPatch, READER_VERSION } = await import('../lib/localReader');
      const result = await readReceiptLocally(files.receipt, { categories: CATEGORIES_COMMON });
      const { patch, confidence } = toFormPatch(result);
      setFormData(prev => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(patch)) {
              if (value && key in prev) next[key] = value;
          }
          return next;
      });
      setLocalRead({
          confidence,
          barcode: result.barcode ? { kind: result.barcode.kind, docLabel: result.barcode.docLabel } : null,
          complete: result.complete,
          offline,
          payload: readPayload(result, offline ? 'offline' : 'local-first', READER_VERSION),
      });
      return result;
  };

  const localReadToast = (result, offline) => {
      const secs = (result.durationMs / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 });
      const how = result.barcode ? `del ${result.barcode.kind === 'dian' ? 'QR DIAN' : 'timbre electrónico'}` : 'en el teléfono';
      if (result.complete) toast.success(`Boleta leída ${how}${offline ? ' sin conexión' : ''} en ${secs} s. Revisa los campos marcados.`);
      else toast.warning(`Leímos parte de la boleta ${how}. Completa los campos que faltan.`);
  };

  const highConfidence = (r) => r.complete && r.fields.amount?.confidence === 'high' && r.fields.date?.confidence !== 'low';

  const handleAnalyze = async () => {
      if (!files.receipt) {
          toast.error("Debes subir al menos el Recibo/Factura.");
          return;
      }

      setProcessingAi(true);
      setLocalRead(null);
      shadowRef.current = null;
      shadowSeq.current += 1;
      let unconfident = null;
      const online = isOnline();
      try {
          // Without signal (or "local first" with a confident read) the
          // device reads the receipt; otherwise Gemini does, as before.
          if (offlineSettings.localReader && (!online || aiSettings.localFirst)) {
              const result = await runLocalRead(!online);
              if (!online || highConfidence(result)) {
                  localReadToast(result, !online);
                  setStep('review');
                  return;
              }
              // Not confident enough: Gemini fills the form and this read is
              // kept as a shadow measurement.
              unconfident = (await import('../lib/localReader')).READER_VERSION;
              shadowRef.current = { localRead: readPayload(result, 'shadow', unconfident) };
              setLocalRead(null);
          }
          if (!online) {
              toast.info('Sin conexión: ingresa los datos y la rendición se enviará sola al recuperar señal.');
              setStep('review');
              return;
          }

          const data = await parseExpenseDocuments(files.receipt, files.voucher, CATEGORIES_COMMON);
          
          if (data) {
             setFormData(prev => ({
                 ...prev,
                 date: data.date || prev.date,
                 time: data.time || prev.time,
                 merchant: data.merchant || prev.merchant,
                 taxId: data.taxId || prev.taxId,
                 invoiceNumber: data.invoiceNumber || prev.invoiceNumber,
                 city: data.city || prev.city,
                 address: data.address || prev.address,
                 phone: data.phone || prev.phone,
                 amount: data.amount || prev.amount,
                 description: data.description || prev.description,
                 category: data.category || prev.category,
                 currency: data.currency || prev.currency,
                 paymentMethod: data.paymentMethod || prev.paymentMethod,
                 cardLast4: data.cardLast4 || prev.cardLast4,
                 cardBrand: data.cardBrand || prev.cardBrand
             }));
             if (unconfident && shadowRef.current) shadowRef.current.aiRead = aiReadOf(data);
             else if (offlineSettings.shadowRead && shadowAllowed()) startShadowRead(files.receipt, aiReadOf(data));
             toast.success("Información extraída con éxito.");
             setStep('review');
          }
      } catch (e) {
          // The network dropped mid-request: fall back to the device.
          if (offlineSettings.localReader && isNetworkError(e)) {
              try {
                  const result = await runLocalRead(true);
                  localReadToast(result, true);
                  setStep('review');
                  return;
              } catch (localErr) {
                  console.error(localErr);
              }
          }
          console.error(e);
          toast.error("Error al analizar documentos: " + e.message);
      } finally {
          setProcessingAi(false);
      }
  };

  const handleCancel = () => {
      setStep('upload');
      setFiles({ receipt: null, voucher: null });
      setPreviews({ receipt: null, voucher: null });
      setFormData({
        projectId: '', eventName: '', date: '', time: '', merchant: '', taxId: '', invoiceNumber: '', city: '', address: '', phone: '', description: '', category: '', amount: '', currency: BASE_CURRENCY, paymentMethod: '', cardLast4: '', cardCompany: '', cardBrand: ''
      });
      setIsSplitMode(false);
      setSplitRows([{ projectId: '', amount: '' }]);
      setIsManual(false);
      setLocalRead(null);
      shadowRef.current = null;
      shadowSeq.current += 1;
  };

  const handleAddSplitRow = () => {
      setSplitRows([...splitRows, { projectId: '', amount: '' }]);
  };

  const handleRemoveSplitRow = (index) => {
      const newRows = [...splitRows];
      newRows.splice(index, 1);
      setSplitRows(newRows);
  };

  const handleSplitChange = (index, field, value) => {
      const newRows = [...splitRows];
      newRows[index][field] = value;
      setSplitRows(newRows);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser || loading) return;

    // Validation
    if (!isManual && !files.receipt) { toast.error("Falta el comprobante (Recibo)."); return; }
    // Voucher is now optional
    // if (!files.voucher) { toast.error("Falta el Voucher de pago (Requerido)."); return; }
    // if (!files.voucher) { toast.error("Falta el Voucher de pago (Requerido)."); return; }
    // Event is now optional
    // if (!formData.eventName) { toast.error("El nombre del evento es obligatorio."); return; }
    
    const totalAmount = Number(formData.amount);
    if (isNaN(totalAmount) || totalAmount === 0) {
        toast.error("Ingrese un monto válido.");
        return;
    }

    if (isSplitMode) {
        const sumSplits = splitRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
        if (Math.abs(sumSplits - totalAmount) > 1) { // 1 peso/unit tolerance
            toast.error(`La suma de la distribución (${sumSplits}) no coincide con el total (${totalAmount}). Diferencia: ${totalAmount - sumSplits}`);
            return;
        }
        // Cost Center is now optional
        // if (splitRows.some(r => !r.projectId)) {
        //    toast.error("Seleccione centro de costo para todas las filas.");
        //    return;
        // }
    }

    // Soft stop: check for duplicate invoices (skipped when user explicitly acknowledged)
    if (!duplicateAcknowledged.current && isOnline()) {
      try {
        const expSnap = await getDocs(
          query(collection(db, 'expenses'), where('userId', '==', currentUser.uid))
        );
        const userExps = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const dupResult = findPotentialDuplicate(formData, userExps);
        if (dupResult) {
          setDuplicateWarning(dupResult);
          return;
        }
      } catch { /* non-fatal — if check fails, proceed to submit */ }
    }
    duplicateAcknowledged.current = false;

    setLoading(true);

    let targetUid = currentUser.uid;
    let targetName = currentUser.displayName;
    let isProjectExpense = false;

    if (isAdminRole(userRole) || userRole === 'assistant') {
        if (expenseMode === 'project' && isAdminRole(userRole)) {
            targetUid = 'company_expense';
            targetName = 'Gasto Empresa';
            isProjectExpense = true;
        } else if (expenseMode === 'other') {
            if (!selectedUserId) { toast.error("Seleccione un usuario."); setLoading(false); return; }
            const selUser = users.find(u => u.id === selectedUserId);
            targetUid = selUser.id;
            targetName = selUser.displayName;
        }
    }

    const splitGroupId = isSplitMode ? crypto.randomUUID() : null;
    const itemsToSave = isSplitMode
        ? splitRows.map(row => ({ projectId: row.projectId, amount: Number(row.amount) }))
        : [{ projectId: formData.projectId || null, amount: totalAmount }];

    // Final documents with pre-generated ids: the same payload is written now
    // or later from the offline queue, so a retry never duplicates anything.
    const createdAt = new Date().toISOString();
    // Device read for the server-side comparison (Ola 8/8b). Only for a single
    // expense: split parts carry partial amounts and would read as errors.
    const shadow = shadowRef.current?.aiRead ? shadowRef.current : null;
    const readFields = isSplitMode ? {}
        : localRead ? { localRead: localRead.payload }
        : shadow ? { localRead: shadow.localRead, aiRead: shadow.aiRead }
        : {};
    const docs = itemsToSave.map(item => {
        const projectObj = projects.find(p => p.id === item.projectId);
        return {
            id: doc(collection(db, "expenses")).id,
            data: {
                userId: targetUid,
                userName: targetName,
                projectId: item.projectId,
                projectName: projectObj?.name || 'Sin proyecto asignado',
                eventName: formData.eventName.toUpperCase(),
                category: formData.category,
                date: formData.date,
                time: formData.time || null,
                merchant: formData.merchant,
                taxId: formData.taxId || null,
                invoiceNumber: formData.invoiceNumber || null,
                city: formData.city || null,
                address: formData.address || null,
                phone: formData.phone || null,
                paymentMethod: formData.paymentMethod || null,
                cardBrand: formData.cardBrand || null,
                cardCompany: formData.cardCompany || null,
                description: formData.description + (isSplitMode ? ' [Distribución]' : ''),
                amount: item.amount,
                currency: formData.currency || BASE_CURRENCY,
                cardLast4: formData.cardLast4 || null,
                receiptUrl: null,
                voucherUrl: null,
                status: 'pending',
                createdAt,
                isCompanyExpense: isProjectExpense,
                splitGroupId,
                trm: NEEDS_RATE(formData.currency) ? (trmState.trm || null) : null,
                ...baseEquivalentFields(formData.currency || BASE_CURRENCY, NEEDS_RATE(formData.currency) ? calculateCOPEquivalent(item.amount, trmState.trm) : null),
                trmSource: NEEDS_RATE(formData.currency) ? (trmState.source || null) : null,
                ...readFields,
            },
        };
    });

    const saveOffline = async () => {
        const asQueued = (file) => file ? { name: file.name || 'comprobante.jpg', type: file.type || 'image/jpeg', blob: file, url: null } : undefined;
        await enqueueSubmission({
            id: crypto.randomUUID(),
            uid: currentUser.uid,
            label: `${formData.merchant || 'Sin comercio'} · ${formatCurrency(totalAmount, formData.currency || BASE_CURRENCY)}`,
            createdAt,
            files: { receipt: asQueued(files.receipt), voucher: asQueued(files.voucher) },
            docs,
        });
        toast.success("Sin conexión: la rendición quedó guardada y se enviará sola al recuperar señal.");
        navigate('/dashboard');
    };

    try {
        if (!isOnline()) {
            await saveOffline();
            return;
        }
        await flushNewSubmission(docs, files, currentUser.uid);
        toast.success("Rendición enviada exitosamente.");
        navigate('/dashboard');
    } catch (e) {
        if (isNetworkError(e)) {
            try {
                await saveOffline();
            } catch (queueErr) {
                console.error("Error queueing expense offline:", queueErr);
                toast.error("No se pudo guardar sin conexión: " + queueErr.message);
            }
            return;
        }
        console.error("Error submitting expense:", e);
        toast.error("Error al enviar la rendición: " + e.message);
    } finally {
        setLoading(false);
    }
  };

  const stepsClass = (isActive) => `w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isActive ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400'}`;

  return (
    <Layout title="Nueva Rendición">
      <div className="max-w-5xl mx-auto">
        
        {/* Progress */}
        <div className="flex justify-between items-center mb-8">
            <div className="flex gap-4">
                <div className="flex items-center gap-2">
                    <div className={stepsClass(step === 'upload')}>1</div>
                    <span className={step === 'upload' ? 'text-gray-900 font-medium' : 'text-gray-400'}>Documentos</span>
                </div>
                <div className="w-12 h-px bg-gray-200 self-center"></div>
                <div className="flex items-center gap-2">
                    <div className={stepsClass(step === 'review')}>2</div>
                    <span className={step === 'review' ? 'text-gray-900 font-medium' : 'text-gray-400'}>Detalles</span>
                </div>
            </div>
            
            {step === 'upload' && (
                <button 
                    onClick={() => { setIsManual(true); setStep('review'); }}
                    className="text-sm font-bold text-brand-600 hover:bg-brand-50 px-4 py-2 rounded-lg transition"
                >
                    Ingresar Manualmente &rarr;
                </button>
            )}
        </div>

        {/* Step 1: Upload */}
        {step === 'upload' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-fadeIn">
                 <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">Sube tus Comprobantes</h2>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     
                     {/* Receipt Upload */}
                     <DropzoneSlot
                         type="receipt"
                         title="1. Factura / Recibo"
                         hint="(Obligatorio)"
                         loadedLabel="Recibo Cargado"
                         LoadedIcon={FileText}
                         EmptyIcon={Upload}
                         emptyIconColor="text-brand-500"
                         preview={previews.receipt}
                         fileName={files.receipt?.name}
                         isCompressing={compressing.receipt}
                         isTouch={isTouch}
                         onPickCamera={() => openPicker('receipt', 'camera')}
                         onPickFile={() => openPicker('receipt', 'file')}
                         cameraInputRef={inputRefs.receipt.camera}
                         fileInputRef={inputRefs.receipt.file}
                         onFileSelect={(e) => handleFileSelect('receipt', e)}
                     />

                     {/* Voucher Upload */}
                     <DropzoneSlot
                         type="voucher"
                         title="2. Voucher Pago"
                         hint="(Opcional)"
                         loadedLabel="Voucher Cargado"
                         LoadedIcon={CreditCard}
                         EmptyIcon={CreditCard}
                         emptyIconColor="text-purple-500"
                         preview={previews.voucher}
                         fileName={files.voucher?.name}
                         isCompressing={compressing.voucher}
                         isTouch={isTouch}
                         onPickCamera={() => openPicker('voucher', 'camera')}
                         onPickFile={() => openPicker('voucher', 'file')}
                         cameraInputRef={inputRefs.voucher.camera}
                         fileInputRef={inputRefs.voucher.file}
                         onFileSelect={(e) => handleFileSelect('voucher', e)}
                     />
                 </div>

                 <div className="mt-8 flex justify-center">
                     <button 
                        onClick={handleAnalyze}
                        disabled={!files.receipt || processingAi}
                        className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-black transition flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {processingAi ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <MousePointer2 className="w-5 h-5 mr-2" />}
                        {processingAi ? 'Analizando...' : 'Analizar Documentos'}
                     </button>
                 </div>
                 
                 <p className="text-center text-xs text-gray-400 mt-4">
                     Nuestra IA extraerá los datos automáticamente. Puedes subir solo el recibo si no tienes voucher.
                 </p>
            </div>
        )}

        {/* Step 2: Review */}
        {step === 'review' && localRead && (
            <div role="status" className={`mb-6 flex items-start gap-3 rounded-xl px-4 py-3 text-sm ring-1 ${localRead.complete ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-amber-50 text-amber-900 ring-amber-200'}`}>
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p>
                    <strong>{localRead.barcode ? `Leído del ${localRead.barcode.kind === 'dian' ? 'QR DIAN' : 'timbre electrónico'}` : 'Leído en el teléfono'}{localRead.offline ? ', sin conexión' : ''}.</strong>{' '}
                    {localRead.barcode?.docLabel ? `${localRead.barcode.docLabel}. ` : ''}
                    {localRead.complete
                        ? 'Revisa los campos marcados antes de enviar.'
                        : 'No pudimos leer todo: completa el monto y la fecha si faltan.'}
                    {localRead.offline ? ' Al volver la señal, la IA verificará la lectura.' : ''}
                </p>
            </div>
        )}
        {step === 'review' && (
            <form ref={reviewFormRef} onSubmit={handleSubmit} className="animate-fadeIn grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                {/* Left: Previews */}
                <div className="lg:col-span-1 space-y-4">
                    {/* Mobile thumbnail strip */}
                    <div className="md:hidden flex gap-3 items-start">
                        {[
                            { key: 'receipt', label: 'Recibo', preview: previews.receipt, file: files.receipt },
                            { key: 'voucher', label: 'Voucher', preview: previews.voucher, file: files.voucher },
                        ].map(slot => (
                            <div key={slot.key} className="flex flex-col items-center">
                                <div className="w-24 h-24 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
                                    {slot.preview ? (
                                        slot.file?.type === 'application/pdf'
                                            ? <FileText className="w-8 h-8 text-slate-400" aria-hidden="true" />
                                            : <img src={slot.preview} className="w-full h-full object-cover" alt={`Vista previa ${slot.label.toLowerCase()}`} />
                                    ) : (
                                        <span className="text-[10px] text-slate-400 italic px-2 text-center">Sin {slot.label}</span>
                                    )}
                                </div>
                                <span className="text-xs text-slate-500 mt-1">{slot.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Desktop preview cards */}
                    <div className="hidden md:block bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                        <h4 className="text-sm font-bold text-gray-500 mb-2 uppercase">Recibo</h4>
                        {previews.receipt ? (
                            files.receipt?.type === 'application/pdf'
                            ? <div className="h-32 bg-gray-50 flex items-center justify-center rounded"><FileText className="text-gray-400"/></div>
                            : <img src={previews.receipt} className="rounded-lg w-full max-h-64 object-contain" alt="Vista previa del recibo" />
                        ) : (
                            <div className="h-32 bg-gray-50 flex items-center justify-center rounded text-xs text-gray-400 italic border border-dashed border-gray-200">
                                Sin Recibo
                            </div>
                        )}
                    </div>
                    <div className="hidden md:block bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                        <h4 className="text-sm font-bold text-gray-500 mb-2 uppercase">Voucher</h4>
                        {previews.voucher ? (
                            files.voucher?.type === 'application/pdf'
                            ? <div className="h-32 bg-gray-50 flex items-center justify-center rounded"><FileText className="text-gray-400"/></div>
                            : <img src={previews.voucher} className="rounded-lg w-full max-h-64 object-contain" alt="Vista previa del voucher" />
                        ) : (
                            <div className="h-32 bg-gray-50 flex items-center justify-center rounded text-xs text-gray-400 italic border border-dashed border-gray-200">
                                Sin Voucher
                            </div>
                        )}
                    </div>
                    <button type="button" onClick={handleCancel} className="w-full min-h-[44px] py-2 text-red-500 text-sm hover:bg-red-50 rounded-lg">
                        Cancelar / Cambiar Archivos
                    </button>
                    
                    {/* Admin/Assistant Mode Selector (Moved Here for Layout) */}
                     {(isAdminRole(userRole) || userRole === 'assistant') && (
                        <div className="p-4 bg-brand-50 rounded-xl border border-brand-100 shadow-sm">
                            <label className="block text-xs font-bold text-brand-800 uppercase tracking-wider mb-3">Asignación del Gasto</label>

                            <div className="space-y-2">
                                {[
                                    { id: 'me', label: 'Mí mismo' },
                                    ...(isAdminRole(userRole) ? [{ id: 'project', label: 'Empresa / Centro de Costo' }] : []),
                                    { id: 'other', label: 'Otro(a)' }
                                ].map(opt => (
                                    <label key={opt.id} className={`
                                        flex items-center px-3 py-2 rounded-lg cursor-pointer text-sm font-medium transition border w-full
                                        ${expenseMode === opt.id 
                                            ? 'bg-white border-blue-300 text-brand-700 shadow-sm ring-1 ring-blue-300' 
                                            : 'border-transparent text-gray-500 hover:bg-white hover:text-gray-700'}
                                    `}>
                                        <input 
                                            type="radio" 
                                            name="expenseMode" 
                                            value={opt.id}
                                            checked={expenseMode === opt.id}
                                            onChange={() => setExpenseMode(opt.id)}
                                            className="sr-only"
                                        />
                                        <span className={`w-2 h-2 rounded-full mr-2 ${expenseMode === opt.id ? 'bg-brand-500' : 'bg-gray-300'}`}></span>
                                        {opt.label}
                                    </label>
                                ))}
                            </div>
                            
                                {expenseMode === 'other' && (
                                <div className="mt-3 animate-fadeIn">
                                    <select 
                                        className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                        value={selectedUserId}
                                        onChange={e => setSelectedUserId(e.target.value)}
                                        required
                                    >
                                        <option value="">Seleccionar Usuario...</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>{u.displayName}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right: Form */}
                <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                    
                    {/* Cost Center (Hidden as per requirement) */}
                    <div className="hidden">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Evento *</label>
                            <input 
                                type="text" 
                                list="events-list"
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500 uppercase"
                                placeholder="Ej: FERIA CHICAGO 2026"
                                value={formData.eventName}
                                onChange={e => setFormData({...formData, eventName: e.target.value.toUpperCase()})}
                            />
                            <datalist id="events-list">
                                {existingEvents.map((evt, i) => <option key={i} value={evt} />)}
                            </datalist>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-medium text-gray-700">Centro de Costo <span className="text-gray-400 font-normal">(Opcional)</span></label>
                                {isAdminRole(userRole) && (
                                    <label className="inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={isSplitMode}
                                            onChange={e => setIsSplitMode(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                                        <span className="ms-2 text-xs font-bold text-brand-600">Multi</span>
                                    </label>
                                )}
                            </div>
                            
                            {!isSplitMode ? (
                                <select 
                                    className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500"
                                    value={formData.projectId}
                                    onChange={e => setFormData({...formData, projectId: e.target.value})}
                                >
                                    <option value="">-- Sin Asignar --</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.code ? `[${p.code}] ` : ''}{p.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                    <div className="mb-3 flex justify-between items-center bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                        <span className="text-xs font-bold text-gray-500 uppercase">Monto a Distribuir</span>
                                        <span className="font-mono font-bold text-gray-800">{formatCurrency(formData.amount || 0)}</span>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        {splitRows.map((row, idx) => (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <select 
                                                    className="flex-grow border border-gray-200 rounded-lg p-2 text-sm focus:border-brand-500 outline-none"
                                                    value={row.projectId}
                                                    onChange={e => handleSplitChange(idx, 'projectId', e.target.value)}
                                                >
                                                    <option value="">Centro...</option>
                                                    {projects.map(p => (
                                                    <option key={p.id} value={p.id}>{p.code ? `[${p.code}] ` : ''}{p.name}</option>
                                                    ))}
                                                </select>
                                                <input 
                                                    type="number"
                                                    placeholder="0"
                                                    className="w-24 border border-gray-200 rounded-lg p-2 text-sm focus:border-brand-500 outline-none"
                                                    value={row.amount}
                                                    onChange={e => handleSplitChange(idx, 'amount', e.target.value)}
                                                    required
                                                />
                                                {splitRows.length > 1 && (
                                                    <button type="button" onClick={() => handleRemoveSplitRow(idx)} className="text-gray-400 hover:text-red-500 p-1">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <div className="mt-3 flex justify-between items-center">
                                        <button type="button" onClick={handleAddSplitRow} className="text-xs text-brand-600 font-bold hover:underline flex items-center bg-white px-2 py-1 rounded border border-gray-200 shadow-sm">
                                            <Plus className="w-3 h-3 mr-1" /> Agregar Línea
                                        </button>
                                        
                                        {(() => {
                                            const sum = splitRows.reduce((a,r) => a + (Number(r.amount)||0), 0);
                                            const diff = (Number(formData.amount)||0) - sum;
                                            return (
                                                <span className={`text-xs font-bold ${Math.abs(diff) > 1 ? 'text-red-500' : 'text-green-600'}`}>
                                                    {Math.abs(diff) > 1 ? `Faltan: ${formatCurrency(diff)}` : 'Ok'}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Event Field (Moved out of hidden block) */}
                    <div>
                         <label htmlFor="ef-eventName" className="block text-sm font-medium text-gray-700 mb-1">Evento *</label>
                         <input
                             id="ef-eventName"
                             type="text"
                             list="events-list"
                             className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500 uppercase"
                             placeholder="Ej: FERIA CHICAGO 2026"
                             value={formData.eventName}
                             onChange={e => setFormData({...formData, eventName: e.target.value.toUpperCase()})}
                         />
                         <datalist id="events-list">
                             {existingEvents.map((evt, i) => <option key={i} value={evt} />)}
                         </datalist>
                    </div>

                    {/* Supplier & Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div>
                            <label htmlFor="ef-merchant" className="block text-sm font-medium text-gray-700 mb-1">Comercio / Proveedor<ReadConfidence field="merchant" read={localRead} /></label>
                            <input
                                id="ef-merchant"
                                type="text"
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500"
                                value={formData.merchant}
                                onChange={e => setFormData({...formData, merchant: e.target.value})}
                                placeholder="Ej: Restaurante El Buen Sabor"
                            />
                        </div>
                        <div>
                            <label htmlFor="ef-taxId" className="block text-sm font-medium text-gray-700 mb-1">{country.taxIdLabel} / Identificación Fiscal<ReadConfidence field="taxId" read={localRead} /></label>
                            <input
                                id="ef-taxId"
                                type="text"
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500"
                                value={formData.taxId}
                                onChange={e => setFormData({...formData, taxId: e.target.value})}
                                onBlur={() => {
                                    const check = formData.taxId ? country.validateTaxId(formData.taxId) : null;
                                    if (check?.formatted) setFormData(prev => ({ ...prev, taxId: check.formatted }));
                                }}
                                placeholder={country.taxIdPlaceholder}
                                aria-describedby="ef-taxId-hint"
                            />
                            {formData.taxId && !country.validateTaxId(formData.taxId).valid && (
                                <p id="ef-taxId-hint" className="mt-1 text-xs text-amber-700">El {country.taxIdLabel} no parece válido. Revísalo (puedes enviarlo igual).</p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div>
                            <label htmlFor="ef-address" className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                            <input
                                id="ef-address"
                                type="text"
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500"
                                value={formData.address}
                                onChange={e => setFormData({...formData, address: e.target.value})}
                                placeholder="Ej: Calle 123 # 45-67"
                            />
                        </div>
                        <div>
                            <label htmlFor="ef-city" className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                            <input
                                id="ef-city"
                                type="text"
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500"
                                value={formData.city}
                                onChange={e => setFormData({...formData, city: e.target.value})}
                                placeholder={country.cityPlaceholder}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label htmlFor="ef-phone" className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                            <input
                                id="ef-phone"
                                type="text"
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500"
                                value={formData.phone}
                                onChange={e => setFormData({...formData, phone: e.target.value})}
                                placeholder={country.phonePlaceholder}
                            />
                        </div>
                        <div>
                            <label htmlFor="ef-date" className="block text-sm font-medium text-gray-700 mb-1">Fecha Factura<ReadConfidence field="date" read={localRead} /></label>
                            <input
                                id="ef-date"
                                type="date"
                                required
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500"
                                value={formData.date}
                                onChange={e => setFormData({...formData, date: e.target.value})}
                            />
                        </div>
                        <div>
                            <label htmlFor="ef-time" className="block text-sm font-medium text-gray-700 mb-1">Hora<ReadConfidence field="time" read={localRead} /></label>
                            <input
                                id="ef-time"
                                type="time"
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500"
                                value={formData.time}
                                onChange={e => setFormData({...formData, time: e.target.value})}
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="ef-invoiceNumber" className="block text-sm font-medium text-gray-700 mb-1">No. Factura<ReadConfidence field="invoiceNumber" read={localRead} /></label>
                        <input
                            id="ef-invoiceNumber"
                            type="text"
                            className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500"
                            value={formData.invoiceNumber}
                            onChange={e => setFormData({...formData, invoiceNumber: e.target.value})}
                            placeholder="Ej: A-123456"
                        />
                    </div>

                    {/* Clasificación y Pago */}
                    {(() => {
                        const isCardPayment = formData.paymentMethod === 'Credit Card' || formData.paymentMethod === 'Debit Card';
                        return (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                     <label htmlFor="ef-paymentMethod" className="block text-sm font-medium text-gray-700 mb-1">Forma de Pago<ReadConfidence field="paymentMethod" read={localRead} /></label>
                                     <select
                                         id="ef-paymentMethod"
                                         className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500"
                                         value={formData.paymentMethod}
                                         onChange={e => setFormData({...formData, paymentMethod: e.target.value})}
                                     >
                                         <option value="">Seleccionar...</option>
                                         {PAYMENT_METHODS.map(pm => (
                                             <option key={pm.value} value={pm.value}>{pm.label}</option>
                                         ))}
                                     </select>
                                </div>
                                <div>
                                     <label htmlFor="ef-cardBrand" className={`block text-sm font-medium mb-1 ${isCardPayment ? 'text-gray-700' : 'text-gray-400'}`}>Marca Tarjeta</label>
                                     <select
                                         id="ef-cardBrand"
                                         disabled={!isCardPayment}
                                         className={`w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500 ${isCardPayment ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'}`}
                                         value={formData.cardBrand}
                                         onChange={e => setFormData({...formData, cardBrand: e.target.value})}
                                     >
                                         <option value="">Seleccionar...</option>
                                         {CARD_BRANDS.map(cb => (
                                             <option key={cb.value} value={cb.value}>{cb.label}</option>
                                         ))}
                                     </select>
                                </div>
                                <div>
                                     <label htmlFor="ef-cardCompany" className="block text-sm font-medium text-gray-700 mb-1">Empresa Tarjeta</label>
                                     <select
                                         id="ef-cardCompany"
                                         className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500"
                                         value={formData.cardCompany}
                                         onChange={e => setFormData({...formData, cardCompany: e.target.value})}
                                     >
                                         <option value="">Seleccionar...</option>
                                         {CARD_COMPANIES.map(cc => (
                                             <option key={cc.value} value={cc.value}>{cc.label}</option>
                                         ))}
                                     </select>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Amount & Currency */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-1">
                             <label htmlFor="ef-currency" className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
                             <select
                                 id="ef-currency"
                                 className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500"
                                 value={formData.currency}
                                 onChange={e => setFormData({...formData, currency: e.target.value})}
                             >
                                 {CURRENCIES.map(c => (
                                     <option key={c.value} value={c.value}>{c.label}</option>
                                 ))}
                             </select>
                        </div>
                        <div className="md:col-span-2">
                             <label htmlFor="ef-amount" className="block text-sm font-medium text-gray-700 mb-1">Monto Total<ReadConfidence field="amount" read={localRead} /></label>
                             <input
                                 id="ef-amount"
                                 type="number"
                                 inputMode="decimal"
                                 required
                                 className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500 font-mono text-base md:text-lg font-bold min-h-[44px]"
                                 value={formData.amount}
                                 onChange={e => setFormData({...formData, amount: e.target.value})}
                             />
                        </div>
                    </div>

                    {/* TRM Info Box (USD and EUR expenses) */}
                    {NEEDS_RATE(formData.currency) && (
                      <div className={`p-4 rounded-xl border text-sm ${trmState.trm ? 'bg-brand-50 border-brand-100' : trmState.loading ? 'bg-brand-50 border-brand-100' : 'bg-yellow-50 border-yellow-200'}`}>
                        {trmState.loading ? (
                          <div className="flex items-center gap-2 text-brand-700">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Obteniendo tasa de cambio...</span>
                          </div>
                        ) : trmState.trm ? (
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-0.5">
                              <p className="text-brand-800 font-medium">
                                Tasa {formData.currency}→COP: <span className="font-mono">{formatCurrency(trmState.trm, 'COP')}</span> <span className="text-brand-600">COP/{formData.currency}</span>
                              </p>
                              {formData.amount > 0 && (
                                <p className="text-brand-700">
                                  Equivalente: <span className="font-mono font-bold">{formatCurrency(calculateCOPEquivalent(formData.amount, trmState.trm), BASE_CURRENCY)}</span> {BASE_CURRENCY}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setTrmState(prev => ({ ...prev, loading: true }));
                                fetchRate(formData.currency, formData.date).then(r => setTrmState({ trm: r.rate, source: r.source, fetchedAt: r.fetchedAt, loading: false }));
                              }}
                              className="text-xs text-brand-600 font-bold hover:underline whitespace-nowrap"
                            >
                              Actualizar tasa
                            </button>
                          </div>
                        ) : (
                          <p className="text-yellow-800">⚠️ No se pudo obtener la tasa de cambio. El gasto se guardará sin conversión.</p>
                        )}
                      </div>
                    )}

                    {/* AI Extracted Details */}
                    <div className="bg-brand-50 p-4 rounded-xl border border-brand-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                             <label htmlFor="ef-category" className="block text-xs font-bold text-brand-800 uppercase mb-1">Categoría Sugerida<ReadConfidence field="category" read={localRead} /></label>
                             <select
                                 id="ef-category"
                                 required
                                 className="w-full border border-blue-200 rounded p-2 text-sm bg-white"
                                 value={formData.category}
                                 onChange={e => setFormData({...formData, category: e.target.value})}
                             >
                                 <option value="">Seleccionar...</option>
                                 {CATEGORIES_COMMON.map(c => <option key={c} value={c}>{c}</option>)}
                             </select>
                        </div>
                        <div>
                             <label htmlFor="ef-cardLast4" className="block text-xs font-bold text-brand-800 uppercase mb-1">
                               Tarjeta (Últimos 4){formData.cardBrand === 'amex' && <span className="font-normal normal-case ml-1">(opcional)</span>}
                             </label>
                             <input
                                 id="ef-cardLast4"
                                 type="text"
                                 className="w-full border border-blue-200 rounded p-2 text-sm bg-white"
                                 placeholder="**** 1234"
                                 maxLength={4}
                                 value={formData.cardLast4}
                                 onChange={e => setFormData({...formData, cardLast4: e.target.value})}
                             />
                             {formData.cardBrand === 'amex' && (
                               <p className="text-xs text-brand-600 mt-1">Amex consolida en un único extracto; el número es opcional.</p>
                             )}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="ef-description" className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                        <textarea
                            id="ef-description"
                            className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-500 resize-none h-24"
                            placeholder="Detalle del gasto..."
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                        />
                    </div>

                    {/* Desktop submit (md and up) */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="hidden md:flex w-full bg-brand-600 text-white font-bold py-4 rounded-xl hover:bg-brand-700 transition items-center justify-center text-lg shadow-lg hover:shadow-xl transform active:scale-[0.99] min-h-[44px]"
                    >
                        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Confirmar Rendición <CheckCircle className="w-6 h-6 ml-2" /></>}
                    </button>

                </div>

                {/* Mobile sticky submit (below md) */}
                <div
                    className="md:hidden sticky bottom-0 z-30 -mx-6 -mb-6 bg-white border-t border-slate-200 px-4 pt-3 shadow-[0_-4px_20px_-2px_rgba(0,0,0,0.1)] lg:col-span-3"
                    style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
                >
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-brand-600 text-white font-bold py-3 rounded-xl hover:bg-brand-700 transition flex items-center justify-center text-base shadow-lg active:scale-[0.99] min-h-[44px]"
                    >
                        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Confirmar Rendición <CheckCircle className="w-5 h-5 ml-2" /></>}
                    </button>
                </div>
            </form>
        )}

      </div>

      {/* Duplicate invoice soft-stop dialog */}
      <ConfirmDialog
        isOpen={!!duplicateWarning}
        title="Posible duplicado detectado"
        description={
          duplicateWarning?.method === 'invoice'
            ? `Ya existe una rendición con el mismo número de factura "${formData.invoiceNumber}". Podría ser un duplicado.`
            : 'Ya existe una rendición con el mismo monto, fecha y comercio. Podría ser un duplicado.'
        }
        confirmLabel="Continuar de todas formas"
        confirmTone="primary"
        onConfirm={() => {
          duplicateAcknowledged.current = true;
          setDuplicateWarning(null);
          reviewFormRef.current?.requestSubmit();
        }}
        onClose={() => setDuplicateWarning(null)}
      >
        {duplicateWarning?.match && (
          <div className="mt-1 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 space-y-1">
            <p className="font-semibold text-xs uppercase tracking-wide text-yellow-600 mb-1">Gasto existente similar:</p>
            <p>
              {duplicateWarning.match.date} &mdash; {duplicateWarning.match.merchant} &mdash;{' '}
              {formatCurrency(Number(duplicateWarning.match.amount), duplicateWarning.match.currency || BASE_CURRENCY)}
              {' '}({duplicateWarning.match.status === 'approved' ? 'Aprobado' : duplicateWarning.match.status === 'pending' ? 'Pendiente' : 'Rechazado'})
            </p>
          </div>
        )}
      </ConfirmDialog>
    </Layout>
  );
}
