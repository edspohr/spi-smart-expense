import { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/useAuth';
import { parseExpenseDocuments } from '../lib/gemini';
import { db, uploadReceiptImage } from '../lib/firebase';
import { collection, getDocs, query, where, doc, increment, writeBatch } from 'firebase/firestore';
import { Upload, Loader2, Camera, X, FileText, Plus, CheckCircle, CreditCard, Calendar, MousePointer2 } from 'lucide-react';
import { formatCurrency } from '../utils/format'; 
import { useNavigate } from 'react-router-dom';
import { compressImage } from '../utils/imageUtils';
import { sortProjects } from '../utils/sort';
import { fetchTRM, calculateCOPEquivalent } from '../lib/exchangeRate';
import { CATEGORIES_COMMON, PAYMENT_METHODS, CARD_BRANDS, CARD_COMPANIES, CURRENCIES } from '../lib/constants';
import { toast } from 'sonner';

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

  // TRM State (USD→COP exchange rate)
  const [trmState, setTrmState] = useState({ trm: null, source: null, fetchedAt: null, loading: false });

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
    currency: 'COP',
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

          // Fetch Events (Unique) from Expenses
          const qExp = query(collection(db, "expenses"));
          const snapExp = await getDocs(qExp);
          const events = new Set();
          snapExp.docs.forEach(d => {
              const evt = d.data().eventName;
              if (evt) events.add(evt);
          });
          setExistingEvents(Array.from(events).sort());

          // Fetch Users (If Admin or Assistant)
          if (userRole === 'admin' || userRole === 'assistant') {
              const uQuery = query(collection(db, "users"), where("role", "in", ["professional", "admin", "assistant"]));
              const uSnap = await getDocs(uQuery);
              const uData = uSnap.docs.map(d => ({id: d.id, ...d.data()}));
              setUsers(uData);
          }
      }
      if (userRole !== null) { 
          fetchData();
      }
  }, [userRole]);

  // Fetch TRM automatically when currency is USD, date is set, and user is on review step
  useEffect(() => {
    if (formData.currency !== 'USD' || !formData.date || step !== 'review') {
      setTrmState({ trm: null, source: null, fetchedAt: null, loading: false });
      return;
    }
    let cancelled = false;
    setTrmState(prev => ({ ...prev, loading: true }));
    fetchTRM(formData.date).then(result => {
      if (!cancelled) setTrmState({ ...result, loading: false });
    });
    return () => { cancelled = true; };
  }, [formData.currency, formData.date, step]);

  const handleFileSelect = async (type, e) => {
    const file = e.target.files[0];
    // Clearing value lets the same file be picked again later if needed.
    e.target.value = '';
    if (!file) return;

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

  const handleAnalyze = async () => {
      if (!files.receipt) {
          toast.error("Debes subir al menos el Recibo/Factura.");
          return;
      }

      setProcessingAi(true);
      try {
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
             toast.success("Información extraída con éxito.");
             setStep('review');
          }
      } catch (e) {
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
        projectId: '', eventName: '', date: '', time: '', merchant: '', taxId: '', invoiceNumber: '', city: '', address: '', phone: '', description: '', category: '', amount: '', currency: 'COP', paymentMethod: '', cardLast4: '', cardCompany: '', cardBrand: ''
      });
      setIsSplitMode(false);
      setSplitRows([{ projectId: '', amount: '' }]);
      setIsManual(false);
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

    try {
        setLoading(true);
        
        let receiptUrl = null;
        let voucherUrl = null;

        if (files.receipt) {
             receiptUrl = await uploadReceiptImage(files.receipt, currentUser.uid);
        }
        if (files.voucher) {
             voucherUrl = await uploadReceiptImage(files.voucher, currentUser.uid);
        }

        let targetUid = currentUser.uid;
        let targetName = currentUser.displayName;
        let isProjectExpense = false;

        if (userRole === 'admin' || userRole === 'assistant') {
            if (expenseMode === 'project' && userRole === 'admin') {
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

        const initialStatus = 'pending';
        const splitGroupId = isSplitMode ? crypto.randomUUID() : null;

        let itemsToSave = [];
        if (isSplitMode) {
            itemsToSave = splitRows.map(row => ({
                projectId: row.projectId,
                amount: Number(row.amount)
            }));
        } else {
             itemsToSave = [{
                 projectId: formData.projectId || null,
                 amount: totalAmount
             }];
        }

        const batch = writeBatch(db);

        for (const item of itemsToSave) {
            const projectObj = projects.find(p => p.id === item.projectId);
            const expenseRef = doc(collection(db, "expenses"));

            batch.set(expenseRef, {
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
                currency: formData.currency || 'COP',
                cardLast4: formData.cardLast4 || null,
                
                receiptUrl: receiptUrl,
                voucherUrl: voucherUrl,
                
                status: initialStatus,
                createdAt: new Date().toISOString(),
                isCompanyExpense: isProjectExpense,
                splitGroupId: splitGroupId,
                trm: formData.currency === 'USD' ? (trmState.trm || null) : null,
                amountCOP: formData.currency === 'USD' ? calculateCOPEquivalent(item.amount, trmState.trm) : null,
                trmSource: formData.currency === 'USD' ? (trmState.source || null) : null,
            });

            if (!isProjectExpense) {
                const userRef = doc(db, "users", targetUid);
                // For pending expenses, we typically DO NOT credit balance immediately, 
                // but if the architecture credits upon CLAIM (not approval), then assume yes.
                // However, user usually wants balance = "amount waiting to be reimbursed".
                // If the app credits balance upon submission:
                batch.set(userRef, {
                    balance: increment(item.amount)
                }, { merge: true });
            }
        }

        await batch.commit();

        toast.success("Rendición enviada exitosamente.");
        navigate('/dashboard');

    } catch (e) {
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
                    className="text-sm font-bold text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg transition"
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
                         emptyIconColor="text-blue-500"
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
        {step === 'review' && (
            <form onSubmit={handleSubmit} className="animate-fadeIn grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
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
                     {(userRole === 'admin' || userRole === 'assistant') && (
                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 shadow-sm">
                            <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider mb-3">Asignación del Gasto</label>

                            <div className="space-y-2">
                                {[
                                    { id: 'me', label: 'Mí mismo' },
                                    ...(userRole === 'admin' ? [{ id: 'project', label: 'Empresa / Centro de Costo' }] : []),
                                    { id: 'other', label: 'Otro(a)' }
                                ].map(opt => (
                                    <label key={opt.id} className={`
                                        flex items-center px-3 py-2 rounded-lg cursor-pointer text-sm font-medium transition border w-full
                                        ${expenseMode === opt.id 
                                            ? 'bg-white border-blue-300 text-blue-700 shadow-sm ring-1 ring-blue-300' 
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
                                        <span className={`w-2 h-2 rounded-full mr-2 ${expenseMode === opt.id ? 'bg-blue-500' : 'bg-gray-300'}`}></span>
                                        {opt.label}
                                    </label>
                                ))}
                            </div>
                            
                                {expenseMode === 'other' && (
                                <div className="mt-3 animate-fadeIn">
                                    <select 
                                        className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 hidden">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Evento *</label>
                            <input 
                                type="text" 
                                list="events-list"
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500 uppercase"
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
                                {userRole === 'admin' && (
                                    <label className="inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={isSplitMode}
                                            onChange={e => setIsSplitMode(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                        <span className="ms-2 text-xs font-bold text-blue-600">Multi</span>
                                    </label>
                                )}
                            </div>
                            
                            {!isSplitMode ? (
                                <select 
                                    className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
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
                                                    className="flex-grow border border-gray-200 rounded-lg p-2 text-sm focus:border-blue-500 outline-none"
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
                                                    className="w-24 border border-gray-200 rounded-lg p-2 text-sm focus:border-blue-500 outline-none"
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
                                        <button type="button" onClick={handleAddSplitRow} className="text-xs text-blue-600 font-bold hover:underline flex items-center bg-white px-2 py-1 rounded border border-gray-200 shadow-sm">
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
                             className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500 uppercase"
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
                            <label htmlFor="ef-merchant" className="block text-sm font-medium text-gray-700 mb-1">Comercio / Proveedor</label>
                            <input
                                id="ef-merchant"
                                type="text"
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.merchant}
                                onChange={e => setFormData({...formData, merchant: e.target.value})}
                                placeholder="Ej: Restaurante El Buen Sabor"
                            />
                        </div>
                        <div>
                            <label htmlFor="ef-taxId" className="block text-sm font-medium text-gray-700 mb-1">NIT / Identificación Fiscal</label>
                            <input
                                id="ef-taxId"
                                type="text"
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.taxId}
                                onChange={e => setFormData({...formData, taxId: e.target.value})}
                                placeholder="Ej: 900.123.456-7"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div>
                            <label htmlFor="ef-address" className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                            <input
                                id="ef-address"
                                type="text"
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
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
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.city}
                                onChange={e => setFormData({...formData, city: e.target.value})}
                                placeholder="Ej: Bogotá"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label htmlFor="ef-phone" className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                            <input
                                id="ef-phone"
                                type="text"
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.phone}
                                onChange={e => setFormData({...formData, phone: e.target.value})}
                                placeholder="Ej: 300 123 4567"
                            />
                        </div>
                        <div>
                            <label htmlFor="ef-date" className="block text-sm font-medium text-gray-700 mb-1">Fecha Factura</label>
                            <input
                                id="ef-date"
                                type="date"
                                required
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.date}
                                onChange={e => setFormData({...formData, date: e.target.value})}
                            />
                        </div>
                        <div>
                            <label htmlFor="ef-time" className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                            <input
                                id="ef-time"
                                type="time"
                                className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.time}
                                onChange={e => setFormData({...formData, time: e.target.value})}
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="ef-invoiceNumber" className="block text-sm font-medium text-gray-700 mb-1">No. Factura</label>
                        <input
                            id="ef-invoiceNumber"
                            type="text"
                            className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
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
                                     <label htmlFor="ef-paymentMethod" className="block text-sm font-medium text-gray-700 mb-1">Forma de Pago</label>
                                     <select
                                         id="ef-paymentMethod"
                                         className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
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
                                         className={`w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500 ${isCardPayment ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'}`}
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
                                         className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
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
                                 className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
                                 value={formData.currency}
                                 onChange={e => setFormData({...formData, currency: e.target.value})}
                             >
                                 {CURRENCIES.map(c => (
                                     <option key={c.value} value={c.value}>{c.label}</option>
                                 ))}
                             </select>
                        </div>
                        <div className="md:col-span-2">
                             <label htmlFor="ef-amount" className="block text-sm font-medium text-gray-700 mb-1">Monto Total</label>
                             <input
                                 id="ef-amount"
                                 type="number"
                                 inputMode="decimal"
                                 required
                                 className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-base md:text-lg font-bold min-h-[44px]"
                                 value={formData.amount}
                                 onChange={e => setFormData({...formData, amount: e.target.value})}
                             />
                        </div>
                    </div>

                    {/* TRM Info Box (USD expenses only) */}
                    {formData.currency === 'USD' && (
                      <div className={`p-4 rounded-xl border text-sm ${trmState.trm ? 'bg-blue-50 border-blue-100' : trmState.loading ? 'bg-blue-50 border-blue-100' : 'bg-yellow-50 border-yellow-200'}`}>
                        {trmState.loading ? (
                          <div className="flex items-center gap-2 text-blue-700">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Obteniendo TRM...</span>
                          </div>
                        ) : trmState.trm ? (
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-0.5">
                              <p className="text-blue-800 font-medium">
                                TRM del día: <span className="font-mono">{formatCurrency(trmState.trm, 'COP')}</span> <span className="text-blue-600">COP/USD</span>
                              </p>
                              {formData.amount > 0 && (
                                <p className="text-blue-700">
                                  Equivalente: <span className="font-mono font-bold">{formatCurrency(calculateCOPEquivalent(formData.amount, trmState.trm))}</span> COP
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setTrmState(prev => ({ ...prev, loading: true }));
                                fetchTRM(formData.date).then(r => setTrmState({ ...r, loading: false }));
                              }}
                              className="text-xs text-blue-600 font-bold hover:underline whitespace-nowrap"
                            >
                              Actualizar TRM
                            </button>
                          </div>
                        ) : (
                          <p className="text-yellow-800">⚠️ No se pudo obtener la TRM. El gasto se guardará sin conversión.</p>
                        )}
                      </div>
                    )}

                    {/* AI Extracted Details */}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                             <label htmlFor="ef-category" className="block text-xs font-bold text-blue-800 uppercase mb-1">Categoría Sugerida</label>
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
                             <label htmlFor="ef-cardLast4" className="block text-xs font-bold text-blue-800 uppercase mb-1">Tarjeta (Últimos 4)</label>
                             <input
                                 id="ef-cardLast4"
                                 type="text"
                                 className="w-full border border-blue-200 rounded p-2 text-sm bg-white"
                                 placeholder="**** 1234"
                                 maxLength={4}
                                 value={formData.cardLast4}
                                 onChange={e => setFormData({...formData, cardLast4: e.target.value})}
                             />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="ef-description" className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                        <textarea
                            id="ef-description"
                            className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
                            placeholder="Detalle del gasto..."
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                        />
                    </div>

                    {/* Desktop submit (md and up) */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="hidden md:flex w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition items-center justify-center text-lg shadow-lg hover:shadow-xl transform active:scale-[0.99] min-h-[44px]"
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
                        className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition flex items-center justify-center text-base shadow-lg active:scale-[0.99] min-h-[44px]"
                    >
                        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Confirmar Rendición <CheckCircle className="w-5 h-5 ml-2" /></>}
                    </button>
                </div>
            </form>
        )}

      </div>
    </Layout>
  );
}
