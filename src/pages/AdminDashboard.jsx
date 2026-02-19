import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { formatCurrency } from '../utils/format';
import { Database, Wallet, UserCircle } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function fetchData() {
        try {
            // 1. Fetch Users (Professionals)
            const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "professional")));
            const usersData = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 2. Fetch All Expenses (to sum up Rendered)
            const expensesSnap = await getDocs(collection(db, "expenses"));
            const expensesDocs = expensesSnap.docs.map(doc => doc.data());

            // 3. Aggregate Data per User
            const expensesByUser = {};
            let pending = 0;

            expensesDocs.forEach(exp => {
                if (exp.status === 'pending') pending++;
                
                // Track user expenses (group by person who renders)
                if ((exp.status === 'approved' || exp.status === 'pending') && exp.userId) {
                    expensesByUser[exp.userId] = (expensesByUser[exp.userId] || 0) + (Number(exp.amount) || 0);
                }
            });

            // 4. Merge into Users
            const finalUsers = usersData.map(u => ({
                ...u,
                expenses: expensesByUser[u.id] || 0
            }));

            // Sort alphabetically
            setUsers(finalUsers.sort((a,b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '')));
            setPendingCount(pending);
        } catch (e) {
            console.error("Error loading dashboard:", e);
        } finally {
            setLoading(false);
        }
    }
    fetchData();
  }, []);

  const totalRendered = users.reduce((acc, u) => acc + (u.expenses || 0), 0);

  if (loading) return (
      <Layout title="Dashboard General">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {[1,2,3].map(i => (
              <div key={i} className="bg-white p-6 rounded-2xl shadow-soft border border-slate-100 h-32 flex flex-col justify-center">
                  <div className="flex gap-4 items-center">
                    <Skeleton className="h-4 w-24 mb-2" />
                  </div>
                  <Skeleton className="h-10 w-16" />
              </div>
          ))}
        </div>
        <div className="mt-8">
            <Skeleton className="h-8 w-48 mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {[1,2,3].map(i => (
                     <div key={i} className="bg-white p-6 rounded-2xl shadow-soft h-48">
                         <Skeleton className="h-6 w-3/4 mb-2" />
                         <Skeleton className="h-4 w-1/2 mb-6" />
                         <Skeleton className="h-2 w-full rounded-full" />
                     </div>
                 ))}
            </div>
        </div>
      </Layout>
  );

  return (
    <Layout title="Dashboard General">
        <div className="flex justify-end mb-4">
            <a 
                href="/admin/users-seeder" 
                className="ml-2 flex items-center text-sm bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700"
            >
                Crear Cuentas (Auth)
            </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-white p-6 rounded-2xl shadow-soft border border-slate-100 flex flex-col justify-center">
                <h3 className="text-slate-500 text-sm font-semibold uppercase tracking-wide">Usuarios Activos</h3>
                <p className="text-3xl font-extrabold text-slate-800 mt-2">{users.length}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-soft border border-slate-100 flex flex-col justify-center">
                <h3 className="text-slate-500 text-sm font-semibold uppercase tracking-wide">Total Rendido Histórico</h3>
                <p className="text-3xl font-extrabold text-blue-600 mt-2">{formatCurrency(totalRendered)}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-soft border border-slate-100 flex flex-col justify-center">
                <h3 className="text-slate-500 text-sm font-semibold uppercase tracking-wide">Rendiciones Pendientes</h3>
                <p className="text-3xl font-extrabold text-orange-500 mt-2">{pendingCount}</p>
            </div>
        </div>

        <div className="mt-8">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-800">Resumen por Persona</h2>
                <input 
                    type="text" 
                    placeholder="Buscar usuario..." 
                    className="mt-2 md:mt-0 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-64"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
            {users.length === 0 ? (
                <p className="text-gray-500">No hay usuarios registrados.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {users.filter(u => {
                        if (!searchTerm) return true;
                        const lower = searchTerm.toLowerCase();
                        return (u.displayName && u.displayName.toLowerCase().includes(lower)) || 
                               (u.email && u.email.toLowerCase().includes(lower));
                    }).map(u => {
                        const expenses = u.expenses || 0;
                        
                        return (
                            <Link to={`/admin/users/${u.id}`} key={u.id} className="block transition hover:scale-105 duration-200">
                            <div className="bg-white p-6 rounded-2xl shadow-soft border border-slate-100 flex flex-col justify-between h-full hover:shadow-xl hover:-translate-y-1 transition duration-300">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
                                        {u.displayName ? u.displayName.charAt(0).toUpperCase() : 'U'}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Rendido</p>
                                        <p className="text-lg font-bold text-slate-700">{formatCurrency(expenses)}</p>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="font-bold text-lg text-slate-800 mb-1 leading-tight text-ellipsis overflow-hidden whitespace-nowrap">
                                        {u.displayName || 'Sin Nombre'}
                                    </h3>
                                    <p className="text-sm text-slate-500 font-medium text-ellipsis overflow-hidden whitespace-nowrap">{u.email}</p>
                                </div>
                            </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    </Layout>
  );
}
