import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/useAuth';
import { parseReceiptImage } from '../lib/gemini';
import { db, uploadReceiptImage } from '../lib/firebase';
import { collection, getDocs, query, where, doc, increment, writeBatch } from 'firebase/firestore';
import { Upload, Loader2, Camera, X, FileText, Plus, CheckCircle } from 'lucide-react';
import { formatCurrency } from '../utils/format'; // Validation aid/display
import { useNavigate } from 'react-router-dom';
import { compressImage } from '../utils/imageUtils';
import { sortProjects } from '../utils/sort';
import { toast } from 'sonner';

const CATEGORIES_COMMON = [
  "Alimentación",
  "Snacks",
  "Combustible", 
  "Traslados", 
  "Materiales", 
  "Otros"
];

const CATEGORIES_ADMIN = [
  "Pasajes Aéreo",
  "Arriendo de Autos",
  "Arriendo de Equipamiento"
];

export default function ExpenseForm() {
  const { currentUser, userRole } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [processingAi, setProcessingAi] = useState(false);
  const [projects, setProjects] = useState([]);
  
  const [step, setStep] = useState('upload'); // 'upload' | 'review'
  
  // Admin "On Behalf Of" State
  const [expenseMode, setExpenseMode] = useState('me'); // 'me', 'project', 'other'
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');

  const [formData, setFormData] = useState({
    projectId: '',
    date: '',
    merchant: '',
    description: '',
    category: '',
    amount: '',
    receiptImage: null
  });
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
      async function fetchData() {
          // Fetch Projects
          const q = query(collection(db, "projects"), where("status", "!=", "deleted"));
          const snapshot = await getDocs(q);
          const data = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
          setProjects(sortProjects(data));

          // Fetch Users (If Admin)
          if (userRole === 'admin') {
              const uQuery = query(collection(db, "users"), where("role", "==", "professional"));
              const uSnap = await getDocs(uQuery);
              const uData = uSnap.docs.map(d => ({id: d.id, ...d.data()}));
              setUsers(uData);
          }
      }
      if (userRole !== null) { // Wait for role to be known
          fetchData();
      }
  }, [userRole]);

  const handleFileChange = async (e) => {
    const originalFile = e.target.files[0];
    if (!originalFile) return;

    setStep('review');

    // AI Processing & Compression
    try {
      setProcessingAi(true);
      
      // 1. Compress Image (if it's an image)
      const compressedFile = await compressImage(originalFile);

      // 2. Set Preview & Data with Compressed File
      const url = URL.createObjectURL(compressedFile);
      setPreviewUrl(url);
      setFormData(prev => ({ ...prev, receiptImage: compressedFile }));

      // 3. Determine available categories based on role
      let availableCats = [...CATEGORIES_COMMON];
      if (userRole === 'admin') {
          availableCats = [...availableCats, ...CATEGORIES_ADMIN];
      }

      // 4. AI Analysis (using compressed file)
      const data = await parseReceiptImage(compressedFile, availableCats);
      if (data) {
        setFormData(prev => ({
          ...prev,
          date: data.date || prev.date,
          merchant: data.merchant || prev.merchant,
          amount: data.amount || prev.amount,
          description: data.description || prev.description,
          category: data.category || prev.category,
        }));
      }
    } catch (err) {
      console.error("Processing Error:", err);
      toast.error("No se pudo extraer información automática del recibo.");
      // Fallback: If compression fails
      if (!formData.receiptImage) {
           setFormData(prev => ({ ...prev, receiptImage: originalFile }));
           setPreviewUrl(URL.createObjectURL(originalFile));
      }
    } finally {
      setProcessingAi(false);
    }
  };

  // Split Logic
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitRows, setSplitRows] = useState([{ projectId: '', amount: '' }]);

  // ... (Existing useEffects)

  const handleCancel = () => {
      setStep('upload');
      setFormData({
        projectId: '',
        date: '',
        merchant: '',
        description: '',
        category: '',
        amount: '',
        receiptImage: null
      });
      setPreviewUrl(null);
      setIsSplitMode(false);
      setSplitRows([{ projectId: '', amount: '' }]);
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

    // Common Validation
    const totalAmount = Number(formData.amount);
    if (isNaN(totalAmount) || totalAmount === 0) {
        toast.error("Ingrese un monto válido (puede ser negativo para devoluciones/correcciones).");
        return;
    }

    if (isSplitMode) {
        const sumSplits = splitRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
        if (Math.abs(sumSplits - totalAmount) > 1) { // 1 peso tolerance
            toast.error(`La suma de la distribución (${sumSplits}) no coincide con el total (${totalAmount}). Diferencia: ${totalAmount - sumSplits}`);
            return;
        }
        if (splitRows.some(r => !r.projectId)) {
            toast.error("Seleccione centro de costo para todas las filas.");
            return;
        }
    } else {
        if (!formData.projectId) {
            toast.error("Por favor selecciona un centro de costo.");
            return;
        }
    }
        


    // ---------------------------------------------------------
    // VALIDATIONS
    // ---------------------------------------------------------

    // 1. Date Restriction (Max 60 days old)
    const MAX_DAYS_OLD = 60;
    // Standardize: create date to midnight local (YYYY-MM-DD + T00...)
    const expenseDate = new Date(formData.date + 'T00:00:00'); 
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Calculate difference in days
    const diffTime = Math.abs(today - expenseDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (expenseDate < today && diffDays > MAX_DAYS_OLD) {
        toast.error(`La fecha del gasto no puede tener más de ${MAX_DAYS_OLD} días de antigüedad.`);
        return;
    }

    // 2. Duplicity Check



    // ---------------------------------------------------------

    try {
        setLoading(true);
        
        let imageUrl = '';
        // 1. Upload Image
        if (formData.receiptImage) {
            imageUrl = await uploadReceiptImage(formData.receiptImage, currentUser.uid);
        }

        // Prepare Common Data
        let targetUid = currentUser.uid;
        let targetName = currentUser.displayName;
        let isProjectExpense = false;

        // Determine Logic based on Mode
        if (userRole === 'admin') {


            if (expenseMode === 'project') {
                targetUid = 'company_expense';
                targetName = 'Gasto Empresa';
                isProjectExpense = true;
            } else if (expenseMode === 'other') {
                if (!selectedUserId) { alert("Seleccione un profesional."); setLoading(false); return; }
                const selUser = users.find(u => u.id === selectedUserId);
                targetUid = selUser.id;
                targetName = selUser.displayName;
            }
        }

        // All expenses start as pending, even for admins (Cross-check requirement)
        const initialStatus = 'pending';

        const splitGroupId = isSplitMode ? crypto.randomUUID() : null;
        
        // Define items to save
        let itemsToSave = [];
        if (isSplitMode) {
            itemsToSave = splitRows.map(row => ({
                projectId: row.projectId,
                amount: Number(row.amount)
            }));
        } else {
             itemsToSave = [{
                 projectId: formData.projectId,
                 amount: totalAmount
             }];
        }

        // START BATCH
        const batch = writeBatch(db);

        for (const item of itemsToSave) {
            const projectObj = projects.find(p => p.id === item.projectId);
            const expenseRef = doc(collection(db, "expenses")); // Auto ID

            // 1. Create Expense
            batch.set(expenseRef, {
                userId: targetUid,
                userName: targetName,
                projectId: item.projectId,
                projectName: projectObj?.name || 'Unknown',
                category: formData.category,
                date: formData.date,
                merchant: formData.merchant,
                description: formData.description + (isSplitMode ? ' [Distribución]' : ''),
                amount: item.amount,
                currency: formData.currency || 'COP',
                imageUrl: imageUrl,
                status: initialStatus,
                createdAt: new Date().toISOString(),
                isCompanyExpense: isProjectExpense,
                splitGroupId: splitGroupId // Link them
            });

            // 2. Update Project Total (Only if approved immediately, kept for consistency)
            if (initialStatus === 'approved') {
                 const projectRef = doc(db, "projects", item.projectId);
                 batch.update(projectRef, {
                     expenses: increment(item.amount)
                 });
            }

            // 3. Update User Balance (Credit) only if personal/other expense
            if (!isProjectExpense) {
                const userRef = doc(db, "users", targetUid);
                batch.set(userRef, {
                    balance: increment(item.amount)
                }, { merge: true });
            }
        }

        await batch.commit();
        // END BATCH

        toast.success(initialStatus === 'approved' ? "Gasto registrado y aprobado." : "Rendición enviada exitosamente.");
        navigate('/dashboard');

    } catch (e) {
        console.error("Error submitting expense:", e);
        toast.error("Error al enviar la rendición: " + e.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <Layout title="Nueva Rendición">
      <div className="max-w-6xl mx-auto">
        
        {/* Step 1: Upload or Manual */}
        {step === 'upload' && (
            <div className="max-w-xl mx-auto mt-8 animate-fadeIn">
                 <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/50 overflow-hidden border border-zinc-100">
                     <div className="p-8 pb-0 text-center">
                        <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-brand-600">
                             <Upload className="w-8 h-8" />
                        </div>
                        <h2 className="text-2xl font-bold text-zinc-800 mb-2">Sube tu Recibo</h2>
                        <p className="text-zinc-500 text-sm">Escanea con la cámara o selecciona un archivo (Imagen/PDF) para autocompletar.</p>
                     </div>

                     <div className="p-8">
                        <div className="relative group cursor-pointer">
                            <div className="absolute -inset-1 bg-gradient-to-r from-brand-500 to-indigo-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                            <div className="relative bg-white border-2 border-dashed border-zinc-200 rounded-xl p-10 flex flex-col items-center justify-center hover:bg-zinc-50/50 transition duration-300 h-64">
                                <input 
                                    type="file" 
                                    accept="image/*,application/pdf" 
                                    onChange={handleFileChange} 
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                />
                                <div className="bg-zinc-100 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
                                    <Camera className="w-8 h-8 text-zinc-400 group-hover:text-brand-500 transition-colors" />
                                </div>
                                <span className="font-semibold text-zinc-700 group-hover:text-brand-600 transition-colors">Seleccionar Archivo</span>
                                <span className="text-xs text-zinc-400 mt-1">JPG, PNG, PDF (Máx 5MB)</span>
                            </div>
                        </div>

                        <div className="mt-8 flex items-center">
                            <div className="flex-1 h-px bg-zinc-200"></div>
                            <span className="px-4 text-xs font-semibold text-zinc-400 uppercase tracking-widest">Opción Manual</span>
                            <div className="flex-1 h-px bg-zinc-200"></div>
                        </div>

                        <button 
                            onClick={() => setStep('review')}
                            className="block w-full mt-6 bg-zinc-50 border border-zinc-200 text-zinc-600 font-semibold py-3.5 px-4 rounded-xl hover:bg-zinc-100 hover:text-zinc-900 transition flex items-center justify-center"
                        >
                            <FileText className="w-4 h-4 mr-2" />
                            Ingresar sin Comprobante
                        </button>
                     </div>
                 </div>
            </div>
        )}

        {/* Step 2: Review & Edit (Split Layout) */}
        {step === 'review' && (
            <form onSubmit={handleSubmit} className="animate-fadeIn">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    
                    {/* Left Column: Preview (Sticky) */}
                    <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
                        <div className="bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl shadow-zinc-900/20 border border-zinc-800 relative group">
                            <div className="h-[60vh] lg:h-[calc(100vh-12rem)] flex items-center justify-center bg-zinc-950/50 backdrop-blur-3xl relative">
                                {previewUrl ? (
                                    formData.receiptImage?.type === 'application/pdf' ? (
                                        <div className="text-center text-zinc-400 p-8">
                                            <FileText className="w-20 h-20 mx-auto mb-4 text-red-500 opacity-80" />
                                            <p className="font-medium text-sm text-zinc-300">{formData.receiptImage.name}</p>
                                        </div>
                                    ) : (
                                        <img src={previewUrl} alt="Receipt Preview" className="max-w-full max-h-full object-contain shadow-lg" />
                                    )
                                ) : (
                                    <div className="text-center text-zinc-500 p-8">
                                        <FileText className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                        <p className="text-sm">Sin comprobante adjunto</p>
                                    </div>
                                )}
                                
                                {processingAi && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm text-white z-20">
                                         <Loader2 className="w-10 h-10 animate-spin mb-3 text-brand-400" />
                                         <span className="font-medium text-lg tracking-tight">Analizando Recibo...</span>
                                         <span className="text-xs text-zinc-400 mt-1">Extrayendo fecha, monto y comercio</span>
                                    </div>
                                )}
                            </div>

                             {/* Helper Actions for Preview */}
                             <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button type="button" onClick={() => window.open(previewUrl)} className="bg-black/50 text-white p-2 rounded-full hover:bg-black/80 backdrop-blur-md">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z"></path></svg>
                                </button>
                             </div>
                        </div>
                        
                        <button 
                            type="button"
                            onClick={handleCancel}
                            className="w-full py-3 rounded-xl border border-zinc-200 text-zinc-500 font-medium hover:bg-zinc-100 transition flex items-center justify-center text-sm"
                        >
                            <X className="w-4 h-4 mr-2" /> Cancelar y Volver
                        </button>
                    </div>

                    {/* Right Column: Form Fields */}
                    <div className="lg:col-span-7 space-y-6 pb-20">
                        
                        {/* Header Mobile Only */}
                        <div className="lg:hidden mb-4">
                            <h2 className="text-xl font-bold text-zinc-800">Detalles del Gasto</h2>
                        </div>

                        {/* Card: Main Info (Amount & Currency) */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
                             <div className="grid grid-cols-12 gap-4">
                                <div className="col-span-4">
                                     <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Moneda</label>
                                     <select
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-3 font-semibold text-zinc-700 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
                                        value={formData.currency || 'COP'}
                                        onChange={e => setFormData({...formData, currency: e.target.value})}
                                     >
                                        <option value="COP">COP ($)</option>
                                        <option value="USD">USD (u$s)</option>
                                     </select>
                                </div>
                                <div className="col-span-8">
                                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Monto Total</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-lg">
                                            {formData.currency === 'USD' ? '$' : '$'}
                                        </span>
                                        <input 
                                            type="number" 
                                            required
                                            placeholder="0"
                                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-10 pr-4 py-3 text-2xl font-bold text-zinc-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition placeholder:text-zinc-300"
                                            value={formData.amount}
                                            onChange={e => setFormData({...formData, amount: e.target.value})}
                                            step={formData.currency === 'USD' ? "0.01" : "1"}
                                        />
                                    </div>
                                </div>
                             </div>
                        </div>

                        {/* Card: Context (Who, Where, When) */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 space-y-5">
                            
                            {/* ADMIN Mode Selector */}
                            {userRole === 'admin' && (
                                <div className="p-4 bg-brand-50/50 rounded-xl border border-brand-100">
                                    <label className="block text-xs font-bold text-brand-600 uppercase tracking-wider mb-3">Asignación del Gasto</label>
                                    <div className="flex flex-wrap gap-3">
                                        {[
                                            { id: 'me', label: 'Mí mismo' },
                                            { id: 'project', label: 'Empresa / Centro de Costo' },
                                            { id: 'other', label: 'Otro(a)' }
                                        ].map(opt => (
                                            <label key={opt.id} className={`
                                                flex items-center px-3 py-2 rounded-lg cursor-pointer text-sm font-medium transition border
                                                ${expenseMode === opt.id 
                                                    ? 'bg-white border-brand-200 text-brand-700 shadow-sm ring-1 ring-brand-200' 
                                                    : 'border-transparent text-zinc-500 hover:bg-white hover:text-zinc-700'}
                                            `}>
                                                <input 
                                                    type="radio" 
                                                    name="expenseMode" 
                                                    value={opt.id}
                                                    checked={expenseMode === opt.id}
                                                    onChange={() => setExpenseMode(opt.id)}
                                                    className="sr-only"
                                                />
                                                <span className={`w-2 h-2 rounded-full mr-2 ${expenseMode === opt.id ? 'bg-brand-500' : 'bg-zinc-300'}`}></span>
                                                {opt.label}
                                            </label>
                                        ))}
                                    </div>
                                    
                                     {expenseMode === 'other' && (
                                        <div className="mt-3 animate-fadeIn">
                                            <select 
                                                className="w-full border border-brand-200 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-brand-500/20 outline-none"
                                                value={selectedUserId}
                                                onChange={e => setSelectedUserId(e.target.value)}
                                                required
                                            >
                                                <option value="">Seleccionar Profesional...</option>
                                                {users.map(u => (
                                                    <option key={u.id} value={u.id}>{u.displayName}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                             <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                 <div className="md:col-span-2">
                                     <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Comercio / Proveedor</label>
                                     <input 
                                         type="text" 
                                         className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-base text-zinc-800 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
                                         value={formData.merchant}
                                         onChange={e => setFormData({...formData, merchant: e.target.value})}
                                         placeholder="Ej: Restaurant El Paso"
                                     />
                                 </div>

                                 <div>
                                     <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Fecha</label>
                                     <input 
                                         type="date" 
                                         required
                                         className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-base text-zinc-800 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
                                         value={formData.date}
                                         onChange={e => setFormData({...formData, date: e.target.value})}
                                     />
                                 </div>

                                 <div>
                                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Categoría</label>
                                      <select 
                                          required
                                          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-base text-zinc-800 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
                                          value={formData.category}
                                          onChange={e => setFormData({...formData, category: e.target.value})}
                                      >
                                          <option value="">Seleccionar...</option>
                                          {CATEGORIES_COMMON.map(c => (
                                              <option key={c} value={c}>{c}</option>
                                          ))}
                                          {userRole === 'admin' && (
                                              <optgroup label="Solo Admin">
                                                  {CATEGORIES_ADMIN.map(c => (
                                                      <option key={c} value={c}>{c}</option>
                                                  ))}
                                              </optgroup>
                                          )}
                                      </select>
                                 </div>
                             </div>
                        </div>

                        {/* Card: Cost Center & Description */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 space-y-5">
                             <div>
                                <div className="flex justify-between items-center mb-2">
                                     <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">Centro de Costo *</label>
                                     {userRole === 'admin' && (
                                        <label className="inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={isSplitMode}
                                                onChange={e => setIsSplitMode(e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className="relative w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                                            <span className="ms-2 text-xs font-bold text-brand-600">Multi-Centro</span>
                                        </label>
                                     )}
                                </div>
                                
                                {!isSplitMode ? (
                                    <select 
                                        required
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-base text-zinc-800 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
                                        value={formData.projectId}
                                        onChange={e => setFormData({...formData, projectId: e.target.value})}
                                    >
                                        <option value="">Selecciona un centro de costo...</option>
                                        {projects.map(p => {
                                            if (p.status === 'deleted') return null;
                                            return <option key={p.id} value={p.id}>{p.code ? `[${p.code}] ` : ''}{p.name}</option>
                                        })}
                                    </select>
                                ) : (
                                    <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                                        <div className="mb-3 flex justify-between items-center bg-white p-3 rounded-lg border border-zinc-100 shadow-sm">
                                            <span className="text-xs font-bold text-zinc-500 uppercase">Monto a Distribuir</span>
                                            <span className="font-mono font-bold text-zinc-800">{formatCurrency(formData.amount || 0)}</span>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            {splitRows.map((row, idx) => (
                                                <div key={idx} className="flex gap-2 items-center">
                                                    <select 
                                                        required
                                                        className="flex-grow border border-zinc-200 rounded-lg p-2 text-sm focus:border-brand-500 outline-none"
                                                        value={row.projectId}
                                                        onChange={e => handleSplitChange(idx, 'projectId', e.target.value)}
                                                    >
                                                        <option value="">Centro de Costo...</option>
                                                        {projects.map(p => (
                                                        <option key={p.id} value={p.id}>{p.code ? `[${p.code}] ` : ''}{p.name}</option>
                                                        ))}
                                                    </select>
                                                    <input 
                                                        type="number"
                                                        placeholder="0"
                                                        className="w-24 border border-zinc-200 rounded-lg p-2 text-sm focus:border-brand-500 outline-none"
                                                        value={row.amount}
                                                        onChange={e => handleSplitChange(idx, 'amount', e.target.value)}
                                                        required
                                                    />
                                                    {splitRows.length > 1 && (
                                                        <button type="button" onClick={() => handleRemoveSplitRow(idx)} className="text-zinc-400 hover:text-red-500 p-1">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        
                                        <div className="mt-3 flex justify-between items-center">
                                            <button type="button" onClick={handleAddSplitRow} className="text-xs text-brand-600 font-bold hover:underline flex items-center bg-white px-2 py-1 rounded border border-zinc-200 shadow-sm">
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

                             <div>
                                 <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Descripción</label>
                                 <textarea 
                                     className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-base text-zinc-800 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition resize-none"
                                     rows="3"
                                     value={formData.description}
                                     onChange={e => setFormData({...formData, description: e.target.value})}
                                     placeholder="Detalle o justificación del gasto..."
                                 ></textarea>
                             </div>
                        </div>

                        {/* Submit Button Area */}
                         <button 
                            type="submit"
                            disabled={loading || processingAi}
                            className="w-full bg-zinc-900 text-white font-bold py-4 px-6 rounded-xl hover:bg-zinc-800 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:scale-100 shadow-lg shadow-zinc-900/10 text-lg flex justify-center items-center group relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                            {loading ? (
                                <>
                                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                                     Procesando...
                                </>
                            ) : (
                                <span className="relative z-10 flex items-center">Confirmar y Enviar Rendición <CheckCircle className="w-5 h-5 ml-2" /></span>
                            )}
                        </button>

                    </div>
                </div>
            </form>
        )}
      </div>
    </Layout>
  );
}
