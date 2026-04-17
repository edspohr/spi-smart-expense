import { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/useAuth';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { formatCurrency } from '../utils/format';
import { Trash2, AlertCircle, Eye, Pencil, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import ExpenseDetailsModal from '../components/ExpenseDetailsModal';
import EditExpenseModal from '../components/EditExpenseModal';
import TableSkeleton from '../components/TableSkeleton';
import EmptyState from '../components/EmptyState';

export default function UserExpenses() {
  const { currentUser } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [editExpense, setEditExpense] = useState(null);

  useEffect(() => {
    async function fetchExpenses() {
        if (!currentUser) return;
        try {
            const q = query(
                collection(db, "expenses"), 
                where("userId", "==", currentUser.uid)
            );
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Manual sort as workaround for missing index
            data.sort((a,b) => new Date(b.date) - new Date(a.date));
            setExpenses(data);
        } catch (error) {
            console.error("Error fetching expenses:", error);
        } finally {
            setLoading(false);
        }
    }
    fetchExpenses();
  }, [currentUser]);

  const snapshotRef = useRef(null);

  const handleDelete = async (expense) => {
      if (!confirm("¿Eliminar esta rendición pendiente? El saldo será descontado de tu cuenta.")) return;

      // Optimistic: snapshot current list, remove immediately, rollback on failure.
      snapshotRef.current = expenses;
      setExpenses(prev => prev.filter(e => e.id !== expense.id));

      try {
          await deleteDoc(doc(db, "expenses", expense.id));

          if (!expense.isCompanyExpense) {
               const userRef = doc(db, "users", currentUser.uid);
               await updateDoc(userRef, { balance: increment(-expense.amount) });
          }

          snapshotRef.current = null;
          toast.success("Rendición eliminada.");
      } catch (error) {
          console.error("Error deleting expense:", error);
          // Rollback
          if (snapshotRef.current) setExpenses(snapshotRef.current);
          snapshotRef.current = null;
          toast.error("Error al eliminar. Se restauró la rendición.");
      }
  };

  if (loading) return <Layout title="Mis Rendiciones"><TableSkeleton rows={5} cols={6} /></Layout>;

  if (expenses.length === 0) {
    return (
      <Layout title="Mis Rendiciones Históricas">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100">
          <EmptyState
            icon={Receipt}
            title="Aún no tienes rendiciones"
            description="Cuando rindas tu primer gasto aparecerá aquí."
            action={{ label: 'Rendir un gasto', href: '/dashboard/new-expense' }}
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Mis Rendiciones Históricas">
       <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
         <table className="w-full text-left">
            <thead>
                <tr className="bg-gray-50 border-b">
                     <th className="px-6 py-3 font-medium text-gray-500">Fecha</th>
                     <th className="px-6 py-3 font-medium text-gray-500">Proyecto</th>
                     <th className="px-6 py-3 font-medium text-gray-500">Empresa</th>
                     <th className="px-6 py-3 font-medium text-gray-500">Monto</th>
                     <th className="px-6 py-3 font-medium text-gray-500">Estado</th>
                     <th className="px-6 py-3 font-medium text-gray-500">Acciones</th>
                </tr>
            </thead>
            <tbody>
                {expenses.map(e => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-6 py-4 text-gray-600">{e.date}</td>
                        <td className="px-6 py-4 text-gray-800 font-medium">{e.projectName || 'Sin Proyecto'}</td>
                        <td className="px-6 py-4 text-gray-500 text-sm">{e.cardCompany || '-'}</td>
                        <td className="px-6 py-4 font-medium">{formatCurrency(e.amount)}</td>
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold 
                                    ${e.status === 'approved' ? 'bg-green-100 text-green-800' : 
                                      e.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                    {e.status === 'approved' ? 'Aprobado' : e.status === 'pending' ? 'Pendiente' : 'Rechazado'}
                                </span>
                                {e.status === 'rejected' && e.rejectionReason && (
                                    <div className="group relative">
                                        <AlertCircle className="w-4 h-4 text-red-500 cursor-help" />
                                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-48 bg-gray-800 text-white text-xs rounded p-2 z-10 shadow-lg">
                                            {e.rejectionReason}
                                            <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-gray-800"></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </td>
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setSelectedExpense(e)}
                                    className="p-2 text-gray-400 hover:text-blue-600 transition rounded-full hover:bg-blue-50 focus-ring"
                                    title="Ver detalles"
                                    aria-label="Ver detalles"
                                >
                                    <Eye className="w-5 h-5" aria-hidden="true" />
                                </button>
                                {e.status === 'pending' && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setEditExpense(e)}
                                            className="p-2 text-gray-400 hover:text-amber-600 transition rounded-full hover:bg-amber-50 focus-ring"
                                            title="Editar Rendición"
                                            aria-label="Editar rendición"
                                        >
                                            <Pencil className="w-5 h-5" aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(e)}
                                            className="p-2 text-gray-400 hover:text-red-500 transition rounded-full hover:bg-red-50 focus-ring"
                                            title="Eliminar Rendición"
                                            aria-label="Eliminar rendición"
                                        >
                                            <Trash2 className="w-5 h-5" aria-hidden="true" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
       </div>
      <ExpenseDetailsModal
        isOpen={!!selectedExpense}
        onClose={() => setSelectedExpense(null)}
        expense={selectedExpense}
      />
      {editExpense && (
        <EditExpenseModal
          isOpen={true}
          onClose={() => setEditExpense(null)}
          expense={editExpense}
          onSave={(updated) => {
            setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e));
            setEditExpense(null);
          }}
        />
      )}
    </Layout>
  );
}
