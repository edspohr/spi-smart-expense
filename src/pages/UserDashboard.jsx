import { Fragment, useState, useEffect } from 'react';
import Layout from '../components/Layout';
import FieldReadyStatus from '../components/FieldReadyStatus';
import { useAuth } from '../context/useAuth';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { formatCurrency } from '../utils/format';
import { PlusCircle, Wallet, FileText, ChevronDown, ChevronUp, AlertCircle, ImageIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import ImageLightbox from '../components/ImageLightbox';
import TableSkeleton from '../components/TableSkeleton';
import { BASE_CURRENCY } from '../lib/country';

export default function UserDashboard() {
  const { currentUser } = useAuth();
  const [balance, setBalance] = useState(0);
  const [expenses, setExpenses] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState(null);
  const [lightbox, setLightbox] = useState({ isOpen: false, receiptUrl: null, voucherUrl: null });

  const openLightbox = (e, expense) => {
    e.stopPropagation();
    setLightbox({ isOpen: true, receiptUrl: expense.receiptUrl || expense.imageUrl || null, voucherUrl: expense.voucherUrl || null });
  };
  const closeLightbox = () => setLightbox({ isOpen: false, receiptUrl: null, voucherUrl: null });

  const toggleProject = (pid) => {
      if (expandedProject === pid) setExpandedProject(null);
      else setExpandedProject(pid);
  };

  useEffect(() => {
    async function fetchData() {
        if (!currentUser) return;
        
        try {
            setLoading(true);
            // 1. Get Live Balance
            const userRef = doc(db, "users", currentUser.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                setBalance(userSnap.data().balance || 0);
            }

            // 2. Get Expenses (for this user)
            const qExp = query(collection(db, "expenses"), where("userId", "==", currentUser.uid));
            const expSnap = await getDocs(qExp);
            const expData = expSnap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .sort((a, b) => new Date(b.date) - new Date(a.date));
            setExpenses(expData);

            // 3. Get Allocations (for this user)
            const qAlloc = query(collection(db, "allocations"), where("userId", "==", currentUser.uid));
            const allocSnap = await getDocs(qAlloc);
            const allocData = allocSnap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .sort((a, b) => new Date(b.date) - new Date(a.date));
            setAllocations(allocData);

            // 4. Fetch Projects Map (for correct names/codes)
            const pSnap = await getDocs(collection(db, "projects"));
            const pData = pSnap.docs.map(d => ({id: d.id, ...d.data()}));
            setProjectsList(pData);

        } catch (e) {
            console.error("Error fetching dashboard:", e);
        } finally {
            setLoading(false);
        }
    }
    fetchData();
  }, [currentUser]);

  const usdTotal = expenses
    .filter(e => e.currency === 'USD' && e.status !== 'rejected')
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  if (loading) return <Layout title="Dashboard"><TableSkeleton rows={4} cols={6} /></Layout>;

  // Aggregate Data
  const projectStats = {};

  // Initialize with expenses, grouped by currency
  expenses.forEach(e => {
      if (e.status === 'rejected') return; // Exclude rejected from sums
      const pid = e.projectId || 'unknown';
      if (!projectStats[pid]) projectStats[pid] = { expByCurrency: {}, totalAlloc: 0, name: e.projectName || 'Sin Proyecto' };
      const currency = e.currency || BASE_CURRENCY;
      projectStats[pid].expByCurrency[currency] = (projectStats[pid].expByCurrency[currency] || 0) + (Number(e.amount) || 0);
      if (e.projectName) projectStats[pid].name = e.projectName;
  });

  // Add allocations
  allocations.forEach(a => {
      const pid = a.projectId || 'unknown';
      if (!projectStats[pid]) projectStats[pid] = { expByCurrency: {}, totalAlloc: 0, name: a.projectName || 'Sin Proyecto' };
      projectStats[pid].totalAlloc += (Number(a.amount) || 0);
  });

  const currencyOrder = [BASE_CURRENCY, ...['COP', 'USD', 'EUR', 'CLP'].filter(c => c !== BASE_CURRENCY)];

  // Map to Array with Metadata and per-project figures
  const rows = Object.entries(projectStats).map(([pid, stats]) => {
      const projectMeta = projectsList.find(p => p.id === pid);
      const byCurrency = stats.expByCurrency || {};
      const copTotal = byCurrency[BASE_CURRENCY] || 0;
      return {
          id: pid,
          name: projectMeta ? projectMeta.name : stats.name,
          code: projectMeta ? projectMeta.code : '',
          recurrence: projectMeta ? projectMeta.recurrence : '',
          ...stats,
          isExpanded: expandedProject === pid,
          projectExpenses: expenses.filter(e => e.projectId === pid || (!e.projectId && pid === 'unknown')),
          projectAllocations: allocations.filter(a => a.projectId === pid || (!a.projectId && pid === 'unknown')),
          byCurrency,
          activeCurrencies: currencyOrder.filter(c => byCurrency[c]),
          copSaldo: copTotal - stats.totalAlloc,
          totalExpAll: Object.values(byCurrency).reduce((s, v) => s + v, 0),
          hasUsd: byCurrency['USD'] > 0,
      };
  });

  // Cell renderers shared by the desktop table and the mobile cards.
  const renderRendido = (row) => (
      row.activeCurrencies.length === 0 ? (
          <span className="font-medium text-brand-600">{formatCurrency(0)}</span>
      ) : row.activeCurrencies.map((c, i) => (
          <div key={c} className={i === 0 ? 'font-bold text-brand-600' : 'text-sm text-gray-400'}>
              {formatCurrency(row.byCurrency[c], c)}
              <span className="text-xs font-normal ml-1">{c}</span>
          </div>
      ))
  );

  const renderSaldo = (row) => (
      <>
          <div className={`font-bold ${row.copSaldo >= 0 ? 'text-brand-600' : 'text-red-500'}`}>
              {formatCurrency(row.copSaldo)}
              <span className="text-xs font-normal ml-1">{BASE_CURRENCY}</span>
          </div>
          {row.hasUsd && (
              <div className="text-sm text-gray-400 mt-0.5">
                  {formatCurrency(row.byCurrency['USD'], 'USD')}
                  <span className="text-xs font-normal ml-1">USD</span>
              </div>
          )}
      </>
  );

  const renderEstado = (row) => (
      row.totalAlloc > row.totalExpAll ? (
          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">En Rango</span>
      ) : row.totalExpAll > row.totalAlloc ? (
           <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">⚠️ Excedido</span>
      ) : (
           <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">-</span>
      )
  );

  const renderProjectDetail = (row) => (
      <div className="flex flex-col lg:flex-row gap-8 pl-4 border-l-2 border-brand-100">
           {/* Allocations Detail */}
           <div className="flex-1">
               <h4 className="font-semibold text-gray-600 mb-2 flex items-center text-xs uppercase tracking-wider">
                   <Wallet className="w-4 h-4 mr-2" /> Fondos Asignados
               </h4>
               {row.projectAllocations.length === 0 ? <p className="text-xs text-gray-400 italic">Sin registros</p> : (
                   <div className="bg-white rounded border border-gray-100 overflow-hidden">
                       <table className="w-full text-xs">
                           <tbody>
                               {row.projectAllocations.map(a => (
                                   <tr key={a.id} className="border-b last:border-0">
                                       <td className="px-3 py-2 text-gray-500">{new Date(a.date).toLocaleDateString()}</td>
                                       <td className="px-3 py-2 font-medium text-right text-green-700">{formatCurrency(a.amount)}</td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
               )}
           </div>

           {/* Expenses Detail: scrolls sideways on narrow screens */}
           <div className="flex-[2] min-w-0">
               <h4 className="font-semibold text-gray-600 mb-2 flex items-center text-xs uppercase tracking-wider">
                   <FileText className="w-4 h-4 mr-2" /> Mis Rendiciones
               </h4>
               {row.projectExpenses.length === 0 ? <p className="text-xs text-gray-400 italic">Sin registros</p> : (
                   <div className="bg-white rounded border border-gray-100 overflow-x-auto">
                       <table className="w-full min-w-[28rem] text-xs">
                           <thead className="bg-gray-50">
                               <tr>
                                   <th className="px-3 py-2 text-left">Fecha</th>
                                   <th className="px-3 py-2 text-left">Detalle</th>
                                   <th className="px-3 py-2 text-right">Monto</th>
                                   <th className="px-3 py-2 text-center">Emp.</th>
                                   <th className="px-3 py-2 text-center">Estado</th>
                                   <th className="px-3 py-2 text-center">Doc.</th>
                               </tr>
                           </thead>
                           <tbody>
                               {row.projectExpenses.map(e => (
                                   <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                                       <td className="px-3 py-2 text-gray-500 w-24 whitespace-nowrap">{e.date}</td>
                                       <td className="px-3 py-2">
                                           <p className="font-medium text-gray-700">{e.category}</p>
                                           <p className="text-gray-400 truncate max-w-[150px]">{e.description}</p>
                                       </td>
                                       <td className="px-3 py-2 font-bold text-gray-700 text-right whitespace-nowrap">{formatCurrency(e.amount, e.currency)}</td>
                                       <td className="px-3 py-2 text-center text-[10px] text-gray-500">
                                           {e.cardCompany ? e.cardCompany.split(' ')[1] || e.cardCompany : '-'}
                                       </td>
                                       <td className="px-3 py-2 text-center">
                                           <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold
                                               ${e.status === 'approved' ? 'bg-green-100 text-green-700' :
                                                 e.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                               {e.status === 'approved' ? 'OK' : e.status === 'rejected' ? 'RECH' : 'PEND'}
                                           </span>
                                       </td>
                                       <td className="px-3 py-2 text-center">
                                           {(e.receiptUrl || e.imageUrl || e.voucherUrl) ? (
                                               <button
                                                   type="button"
                                                   onClick={(ev) => openLightbox(ev, e)}
                                                   className="p-2 text-gray-400 hover:text-brand-600 transition rounded hover:bg-brand-50 focus-ring"
                                                   title="Ver comprobante"
                                                   aria-label="Ver comprobante"
                                               >
                                                   <ImageIcon className="w-4 h-4" aria-hidden="true" />
                                               </button>
                                           ) : (
                                               <span className="text-gray-300">—</span>
                                           )}
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
               )}
           </div>
      </div>
  );

  return (
    <Layout title={`Hola, ${currentUser?.displayName?.split(' ')[0] || 'Usuario'}`}>
         <FieldReadyStatus />
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-6 rounded-2xl shadow-lg border border-brand-500 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Wallet className="w-24 h-24" />
                </div>
                <div className="relative z-10">
                    <h3 className="text-brand-100 text-sm font-medium mb-1">Mi Saldo (Presupuesto)</h3>
                    <p className="text-4xl font-bold mb-2">
                        {formatCurrency(balance)}
                    </p>
                    {usdTotal > 0 ? (
                      <p className="text-blue-200 text-xs">
                        Incluye {formatCurrency(usdTotal, 'USD')} USD (saldo en múltiples monedas)
                      </p>
                    ) : (
                      <p className="text-blue-200 text-sm">Saldo disponible para gastos.</p>
                    )}
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
                 <Link to="/dashboard/new-expense" className="w-full bg-cta-600 text-cta-fg px-4 py-4 rounded-xl hover:bg-cta-700 text-lg flex items-center justify-center font-bold transition shadow-md hover:shadow-lg transform active:scale-95">
                    <PlusCircle className="mr-2 w-6 h-6" />
                    Rendir un Gasto
                </Link>
            </div>
        </div>

        {/* Project Summary Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
               <h3 className="font-bold text-gray-700 flex items-center">
                  <FileText className="w-5 h-5 mr-2 text-gray-400" />
                  Mi Resumen por Centro de Costo
               </h3>
            </div>
            
            {/* Phones and tablets: one card per cost centre */}
            <ul className="lg:hidden divide-y divide-gray-100">
               {rows.length === 0 ? (
                   <li className="p-8 text-center text-gray-400 text-sm">No hay actividad registrada.</li>
               ) : rows.map(row => (
                   <li key={row.id}>
                       <button
                           type="button"
                           aria-expanded={row.isExpanded}
                           aria-label={`${row.isExpanded ? 'Contraer' : 'Expandir'} detalles del proyecto ${row.name}`}
                           onClick={() => toggleProject(row.id)}
                           className={`w-full p-4 text-left text-sm flex items-start gap-3 hover:bg-gray-50 transition focus-ring ${row.isExpanded ? 'bg-gray-50' : ''}`}
                       >
                           <div className="min-w-0 flex-1">
                               <div className="flex items-start justify-between gap-3">
                                   <p className="min-w-0 font-semibold text-gray-800">
                                       {row.code ? `[${row.code}] ` : ''}{row.name}
                                   </p>
                                   <div className="text-right whitespace-nowrap">{renderSaldo(row)}</div>
                               </div>
                               <p className="mt-1 text-xs text-gray-500">
                                   {[
                                       row.recurrence,
                                       `Total Asignado ${formatCurrency(row.totalAlloc)}`,
                                       `Total Rendido ${row.activeCurrencies.length === 0 ? formatCurrency(0) : row.activeCurrencies.map(c => `${formatCurrency(row.byCurrency[c], c)} ${c}`).join(' + ')}`,
                                   ].filter(Boolean).join(' · ')}
                               </p>
                               <div className="mt-2">{renderEstado(row)}</div>
                           </div>
                           <span className="mt-0.5 text-gray-400">
                               {row.isExpanded ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
                           </span>
                       </button>
                       {row.isExpanded && <div className="bg-gray-50 px-4 pb-4">{renderProjectDetail(row)}</div>}
                   </li>
               ))}
            </ul>

            <div className="hidden lg:block overflow-x-auto">
               <table className="w-full text-left text-sm">
                   <thead className="bg-white">
                      <tr className="border-b">
                          <th className="px-6 py-3 font-medium text-gray-500">Centro de Costo</th>
                          <th className="hidden xl:table-cell px-6 py-3 font-medium text-gray-500">Recurrencia</th>
                          <th className="px-6 py-3 font-medium text-gray-500 text-right">Total Asignado</th>
                          <th className="px-6 py-3 font-medium text-gray-500 text-right">Total Rendido</th>
                          <th className="px-6 py-3 font-medium text-gray-500 text-right">Saldo</th>
                          <th className="px-6 py-3 font-medium text-gray-500 text-right">Estado</th>
                          <th className="px-6 py-3 font-medium text-gray-500 text-right"></th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100">
                      {rows.length === 0 ? (
                          <tr><td colSpan="7" className="p-8 text-center text-gray-400">No hay actividad registrada.</td></tr>
                      ) : rows.map(row => (
                          <Fragment key={row.id}>
                          <tr tabIndex={0} role="button" aria-expanded={row.isExpanded} aria-label={`${row.isExpanded ? 'Contraer' : 'Expandir'} detalles del proyecto ${row.name}`} className={`hover:bg-gray-50 transition cursor-pointer focus-ring ${row.isExpanded ? 'bg-gray-50' : ''}`} onClick={() => toggleProject(row.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProject(row.id); } }}>
                              <td className="px-6 py-4">
                                  <span className="font-medium text-gray-800">
                                       {row.code ? `[${row.code}] ` : ''}{row.name}
                                  </span>
                              </td>
                              <td className="hidden xl:table-cell px-6 py-4 text-gray-600">
                                  {row.recurrence || '-'}
                              </td>
                              <td className="px-6 py-4 text-right font-medium text-green-600 whitespace-nowrap">
                                  {formatCurrency(row.totalAlloc)}
                              </td>
                              <td className="px-6 py-4 text-right whitespace-nowrap">{renderRendido(row)}</td>
                              <td className="px-6 py-4 text-right whitespace-nowrap">{renderSaldo(row)}</td>
                              <td className="px-6 py-4 text-right">{renderEstado(row)}</td>
                              <td className="px-6 py-4 text-right text-gray-400">
                                   {row.isExpanded ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
                              </td>
                          </tr>
                          {row.isExpanded && (
                              <tr>
                                  <td colSpan="7" className="bg-gray-50 px-6 py-4">{renderProjectDetail(row)}</td>
                              </tr>
                          )}
                          </Fragment>
                      ))}
                   </tbody>
               </table>
            </div>
        </div>

      <ImageLightbox
        isOpen={lightbox.isOpen}
        onClose={closeLightbox}
        receiptUrl={lightbox.receiptUrl}
        voucherUrl={lightbox.voucherUrl}
      />
    </Layout>
  );
}
