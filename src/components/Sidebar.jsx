import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { 
  PieChart, LayoutDashboard, FolderOpen, CheckCircle, 
  FileText, UserCircle, Receipt, LogOut, Wallet 
} from 'lucide-react';

export default function Sidebar({ isOpen, setIsOpen }) {
  const { userRole, logout, currentUser } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;
  
  const linkClass = (path) => `
    flex items-center py-2.5 px-4 rounded-full transition-all duration-200 font-medium text-sm mb-1
    ${isActive(path) 
        ? 'bg-white shadow-sm ring-1 ring-zinc-200 text-brand-600' 
        : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}
  `;

  const groupTitleClass = "px-4 text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2 mt-6";

  return (
    <div className={`
      bg-white/80 backdrop-blur-xl border-r border-zinc-200/50 w-72 space-y-6 py-6 px-4 absolute inset-y-0 left-0 transform 
      ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
      md:relative md:translate-x-0 transition duration-300 ease-in-out z-30 shadow-2xl md:shadow-none
    `}>
      <div className="flex items-center justify-center px-2 mb-8 mt-2">
        <div className="flex items-center space-x-3">
             <div className="bg-brand-600 p-2 rounded-xl shadow-lg shadow-brand-500/30">
                <img src="/logo.png" alt="Logo" className="h-6 w-auto invert brightness-0" />
            </div>
            <span className="font-bold text-lg text-zinc-800 tracking-tight">Smart Expense</span>
        </div>
      </div>

      <div className="px-4 mb-6">
        <div className="bg-zinc-50 border border-zinc-200/60 rounded-2xl p-4 flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-indigo-600 rounded-full flex items-center justify-center text-white shadow-md text-sm">
                {currentUser?.displayName?.charAt(0) || 'U'}
            </div>
            <div className="overflow-hidden">
                <p className="text-sm font-semibold text-zinc-800 truncate">{currentUser?.displayName || 'Usuario'}</p>
                 <p className="text-xs text-zinc-500 truncate">
                    {userRole === 'admin' ? 'Administrador' : 'Usuario'}
                </p>
            </div>
        </div>
      </div>

      <nav className="space-y-0.5">
        {userRole === 'admin' && (
            <>
                <p className={groupTitleClass}>Gestión</p>
                
                <Link to="/admin" className={linkClass('/admin')} onClick={() => setIsOpen(false)}>
                <LayoutDashboard className={`w-4 h-4 mr-3 ${isActive('/admin') ? 'text-brand-500' : 'text-zinc-400'}`} />
                Dashboard
                </Link>
                <Link to="/admin/projects" className={linkClass('/admin/projects')} onClick={() => setIsOpen(false)} style={{display: 'none'}}>
                <FolderOpen className={`w-4 h-4 mr-3 ${isActive('/admin/projects') ? 'text-brand-500' : 'text-zinc-400'}`} />
                Centros de Costo
                </Link>
                <Link to="/admin/approvals" className={linkClass('/admin/approvals')} onClick={() => setIsOpen(false)}>
                <CheckCircle className={`w-4 h-4 mr-3 ${isActive('/admin/approvals') ? 'text-brand-500' : 'text-zinc-400'}`} />
                Aprobaciones
                </Link>
                <Link to="/admin/balances" className={linkClass('/admin/balances')} onClick={() => setIsOpen(false)}>
                <Wallet className={`w-4 h-4 mr-3 ${isActive('/admin/balances') ? 'text-brand-500' : 'text-zinc-400'}`} />
                Finanzas
                </Link>
            </>
        )}

        <p className={groupTitleClass}>Mi Espacio</p>
        <Link to="/dashboard" className={linkClass('/dashboard')} onClick={() => setIsOpen(false)}>
            <UserCircle className={`w-4 h-4 mr-3 ${isActive('/dashboard') ? 'text-brand-500' : 'text-zinc-400'}`} />
            Mi Resumen
        </Link>
        <Link to="/dashboard/expenses" className={linkClass('/dashboard/expenses')} onClick={() => setIsOpen(false)}>
            <Receipt className={`w-4 h-4 mr-3 ${isActive('/dashboard/expenses') ? 'text-brand-500' : 'text-zinc-400'}`} />
            Mis Rendiciones
        </Link>

        
        <div className="mt-8 pt-6 border-t border-zinc-100">
            <button onClick={logout} className="w-full flex items-center py-2.5 px-4 rounded-full text-zinc-500 hover:bg-red-50 hover:text-red-600 transition duration-200 group">
                <LogOut className="w-4 h-4 mr-3 group-hover:rotate-180 transition-transform duration-300" />
                <span className="font-medium text-sm">Cerrar Sesión</span>
            </button>
        </div>
      </nav>
    </div>
  );
}
