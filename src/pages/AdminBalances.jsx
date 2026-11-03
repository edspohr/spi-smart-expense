import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { formatCurrency } from '../utils/format';
import { Wallet, ArrowRight, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import TableSkeleton from '../components/TableSkeleton';
import EmptyState from '../components/EmptyState';

export default function AdminBalances() {
  const [professionals, setProfessionals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPros();
  }, []);

  async function fetchPros() {
      try {
          const q = query(collection(db, "users"), where("role", "in", ["professional", "admin"]));
          const snapshot = await getDocs(q);
          const data = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
          setProfessionals(data);
      } catch (e) {
          console.error("Error fetching professionals:", e);
      } finally {
          setLoading(false);
      }
  }

  const statusBadge = (balance) => (balance || 0) < 0 ? (
      <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap">Por Rendir (Fondos)</span>
  ) : (balance || 0) > 0 ? (
      <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap">Saldo a Favor</span>
  ) : (
      <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap">Saludable (0)</span>
  );

  if (loading) return <Layout title="Balances de Profesionales"><TableSkeleton rows={5} cols={4} /></Layout>;

  return (
    <Layout title="Balances de Profesionales">
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-6 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-2 justify-between items-center">
            <h3 className="font-bold text-gray-700">Estado de Cuentas Corrientes</h3>
            <Link to="/admin/projects" className="text-sm text-brand-600 hover:text-brand-800 flex items-center py-2">
                Ir a Cargar Saldos <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
        </div>

        {/* Phones: one row per person, name and balance side by side */}
        <ul className="md:hidden divide-y divide-gray-100">
            {professionals.map(u => (
                <li key={u.id}>
                    <Link to={`/admin/users/${u.id}`} className="flex items-center gap-3 p-4 hover:bg-gray-50">
                        <div className="w-9 h-9 shrink-0 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold text-xs">
                            {u.displayName?.substring(0,2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-800 truncate">{u.displayName} {u.code ? `[${u.code}]` : ''}</p>
                            <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className={`font-mono font-semibold ${u.balance < 0 ? 'text-red-500' : 'text-green-600'}`}>{formatCurrency(u.balance || 0)}</p>
                            <div className="mt-1">{statusBadge(u.balance)}</div>
                        </div>
                    </Link>
                </li>
            ))}
            {professionals.length === 0 && (
                <li><EmptyState icon={Users} title="Sin profesionales" description="No hay profesionales registrados en el sistema." /></li>
            )}
        </ul>

        <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
                <thead>
                    <tr className="bg-white border-b">
                        <th className="px-6 py-4 font-medium text-gray-500">Usuario</th>
                        <th className="px-6 py-4 font-medium text-gray-500">Saldo Disponible (Presupuesto)</th>
                        <th className="px-6 py-4 font-medium text-gray-500">Estado</th>
                    </tr>
                </thead>
                <tbody>
                    {professionals.map(u => (
                        <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium text-gray-800 flex items-center">
                                <div className="w-8 h-8 shrink-0 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center mr-3 font-bold text-xs">
                                    {u.displayName?.substring(0,2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <Link to={`/admin/users/${u.id}`} className="hover:text-brand-600 hover:underline font-bold">
                                        {u.displayName} {u.code ? `[${u.code}]` : ''}
                                    </Link>
                                    <p className="text-gray-400 font-normal text-xs truncate">{u.email}</p>
                                </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                    <Wallet className="w-4 h-4 text-gray-400 mr-2" />
                                    <span className={`font-mono font-semibold ${u.balance < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                        {formatCurrency(u.balance || 0)}
                                    </span>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                {statusBadge(u.balance)}
                            </td>
                        </tr>
                    ))}
                    {professionals.length === 0 && (
                        <tr>
                            <td colSpan="3" className="px-6 py-0">
                                <EmptyState
                                    icon={Users}
                                    title="Sin profesionales"
                                    description="No hay profesionales registrados en el sistema."
                                />
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </Layout>
  );
}
