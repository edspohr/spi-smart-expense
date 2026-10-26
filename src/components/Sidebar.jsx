import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import {
  PieChart, LayoutDashboard, FolderOpen, CheckCircle,
  FileText, UserCircle, Receipt, LogOut, Wallet, Download, Layers, GitCompare, Bell, Users, Settings, ClipboardCheck
} from 'lucide-react';
import InstallButton from './InstallButton';
import { useTenantSettings } from '../context/SettingsContext';
import { useMyPendingApprovals } from '../lib/myApprovals';
import { ROLE_LABELS, isAdminRole, isSuperadmin } from '../lib/roles';
import { tenant } from '../lib/tenant';

export default function Sidebar({ isOpen, setIsOpen }) {
  const { userRole, logout, currentUser } = useAuth();
  const location = useLocation();
  const { modules, approvalPolicy } = useTenantSettings();
  const { items: myPending } = useMyPendingApprovals(approvalPolicy.mode === 'levels' ? currentUser?.uid : null);

  const isActive = (path) => location.pathname === path;

  const linkClass = (path) => `
    flex items-center py-2.5 px-4 rounded-full transition-all duration-200 font-medium text-sm mb-1 focus-ring
    ${isActive(path)
        ? 'bg-chrome-active shadow-sm ring-1 ring-chrome-line text-chrome-accent'
        : 'text-chrome-muted hover:bg-chrome-hover hover:text-chrome-strong'}
  `;

  const ariaCurrent = (path) => (isActive(path) ? 'page' : undefined);

  const groupTitleClass = "px-4 text-[11px] font-bold text-chrome-subtle uppercase tracking-wider mb-2 mt-6";

  return (
    <div className={`
      app-sidebar bg-white/80 backdrop-blur-xl border-r border-zinc-200/50 w-72 space-y-6 py-6 px-4 absolute inset-y-0 left-0 transform 
      ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
      md:relative md:translate-x-0 transition duration-300 ease-in-out z-30 shadow-2xl md:shadow-none
    `}>
      <div className="flex items-center justify-center px-2 mb-8 mt-2">
        <div className="flex items-center space-x-3">
            {tenant.branding.icon ? (
              // A full-colour square icon is shown as is.
              <img src={tenant.branding.icon} alt="" className="h-10 w-10 rounded-xl shadow-lg shadow-brand-500/30" />
            ) : (
              <div className="bg-brand-600 p-2 rounded-xl shadow-lg shadow-brand-500/30">
                <img src={tenant.branding.logo} alt="" className="h-6 w-auto invert brightness-0" />
              </div>
            )}
            <span className="font-bold text-lg text-chrome-fg tracking-tight">{tenant.branding.productName}</span>
        </div>
      </div>

      <div className="px-4 mb-6">
        <div className="bg-chrome-card border border-chrome-line/60 rounded-2xl p-4 flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-indigo-600 rounded-full flex items-center justify-center text-white shadow-md text-sm">
                {currentUser?.displayName?.charAt(0) || 'U'}
            </div>
            <div className="overflow-hidden">
                <p className="text-sm font-semibold text-chrome-fg truncate">{currentUser?.displayName || 'Usuario'}</p>
                 <p className="text-xs text-chrome-muted truncate">
                    {ROLE_LABELS[userRole] ?? 'Usuario'}
                </p>
            </div>
        </div>
      </div>

      <nav className="space-y-0.5">
        {isAdminRole(userRole) && (
            <>
                <p className={groupTitleClass}>Gestión</p>
                
                <Link to="/admin" className={linkClass('/admin')} aria-current={ariaCurrent('/admin')} onClick={() => setIsOpen(false)}>
                <LayoutDashboard className={`w-4 h-4 mr-3 ${isActive('/admin') ? 'text-brand-500' : 'text-chrome-subtle'}`} aria-hidden="true" />
                Dashboard
                </Link>
                <Link to="/admin/projects" className={linkClass('/admin/projects')} aria-current={ariaCurrent('/admin/projects')} onClick={() => setIsOpen(false)} style={{display: 'none'}}>
                <FolderOpen className={`w-4 h-4 mr-3 ${isActive('/admin/projects') ? 'text-brand-500' : 'text-chrome-subtle'}`} aria-hidden="true" />
                Centros de Costo
                </Link>
                <Link to="/admin/approvals" className={linkClass('/admin/approvals')} aria-current={ariaCurrent('/admin/approvals')} onClick={() => setIsOpen(false)}>
                <CheckCircle className={`w-4 h-4 mr-3 ${isActive('/admin/approvals') ? 'text-brand-500' : 'text-chrome-subtle'}`} aria-hidden="true" />
                Aprobaciones
                </Link>
                {modules.balances && (
                <Link to="/admin/balances" className={linkClass('/admin/balances')} aria-current={ariaCurrent('/admin/balances')} onClick={() => setIsOpen(false)}>
                <Wallet className={`w-4 h-4 mr-3 ${isActive('/admin/balances') ? 'text-brand-500' : 'text-chrome-subtle'}`} aria-hidden="true" />
                Finanzas
                </Link>
                )}
                {modules.reports && (
                <Link to="/admin/reports" className={linkClass('/admin/reports')} aria-current={ariaCurrent('/admin/reports')} onClick={() => setIsOpen(false)}>
                <Download className={`w-4 h-4 mr-3 ${isActive('/admin/reports') ? 'text-brand-500' : 'text-chrome-subtle'}`} aria-hidden="true" />
                Reportes
                </Link>
                )}
                {modules.reconciliation && (
                <Link to="/admin/reconciliation" className={linkClass('/admin/reconciliation')} aria-current={ariaCurrent('/admin/reconciliation')} onClick={() => setIsOpen(false)}>
                <GitCompare className={`w-4 h-4 mr-3 ${isActive('/admin/reconciliation') ? 'text-brand-500' : 'text-chrome-subtle'}`} aria-hidden="true" />
                Conciliación
                </Link>
                )}
            </>
        )}

        {isSuperadmin(userRole) && (
            <>
                <p className={groupTitleClass}>Configuración</p>
                <Link to="/admin/users" className={linkClass('/admin/users')} aria-current={ariaCurrent('/admin/users')} onClick={() => setIsOpen(false)}>
                <Users className={`w-4 h-4 mr-3 ${isActive('/admin/users') ? 'text-brand-500' : 'text-chrome-subtle'}`} aria-hidden="true" />
                Usuarios
                </Link>
                <Link to="/admin/settings" className={linkClass('/admin/settings')} aria-current={ariaCurrent('/admin/settings')} onClick={() => setIsOpen(false)}>
                <Settings className={`w-4 h-4 mr-3 ${isActive('/admin/settings') ? 'text-brand-500' : 'text-chrome-subtle'}`} aria-hidden="true" />
                Ajustes
                </Link>
            </>
        )}

        <p className={groupTitleClass}>Mi Espacio</p>
        <Link to="/dashboard" className={linkClass('/dashboard')} aria-current={ariaCurrent('/dashboard')} onClick={() => setIsOpen(false)}>
            <UserCircle className={`w-4 h-4 mr-3 ${isActive('/dashboard') ? 'text-brand-500' : 'text-chrome-subtle'}`} aria-hidden="true" />
            Mi Resumen
        </Link>
        {approvalPolicy.mode === 'levels' && myPending.length > 0 && (
        <Link to="/dashboard/approvals" className={linkClass('/dashboard/approvals')} aria-current={ariaCurrent('/dashboard/approvals')} onClick={() => setIsOpen(false)}>
            <ClipboardCheck className={`w-4 h-4 mr-3 ${isActive('/dashboard/approvals') ? 'text-brand-500' : 'text-chrome-subtle'}`} aria-hidden="true" />
            Mis aprobaciones
            <span className="ml-auto rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">{myPending.length}</span>
        </Link>
        )}
        <Link to="/dashboard/expenses" className={linkClass('/dashboard/expenses')} aria-current={ariaCurrent('/dashboard/expenses')} onClick={() => setIsOpen(false)}>
            <Receipt className={`w-4 h-4 mr-3 ${isActive('/dashboard/expenses') ? 'text-brand-500' : 'text-chrome-subtle'}`} aria-hidden="true" />
            Mis Rendiciones
        </Link>
        {modules.bulkUpload && (
        <Link to="/dashboard/bulk-upload" className={linkClass('/dashboard/bulk-upload')} aria-current={ariaCurrent('/dashboard/bulk-upload')} onClick={() => setIsOpen(false)}>
            <Layers className={`w-4 h-4 mr-3 ${isActive('/dashboard/bulk-upload') ? 'text-brand-500' : 'text-chrome-subtle'}`} aria-hidden="true" />
            Carga Masiva
        </Link>
        )}
        <Link to="/dashboard/mi-espacio" className={linkClass('/dashboard/mi-espacio')} aria-current={ariaCurrent('/dashboard/mi-espacio')} onClick={() => setIsOpen(false)}>
            <Bell className={`w-4 h-4 mr-3 ${isActive('/dashboard/mi-espacio') ? 'text-brand-500' : 'text-chrome-subtle'}`} aria-hidden="true" />
            Notificaciones
        </Link>


        <div className="mt-8 pt-6 border-t border-chrome-hover space-y-1">
            <InstallButton variant="menu" />
            <button type="button" onClick={logout} className="w-full flex items-center py-2.5 px-4 rounded-full text-chrome-muted hover:bg-red-50 hover:text-red-600 transition duration-200 group focus-ring">
                <LogOut className="w-4 h-4 mr-3 group-hover:rotate-180 transition-transform duration-300" aria-hidden="true" />
                <span className="font-medium text-sm">Cerrar Sesión</span>
            </button>
        </div>
      </nav>
    </div>
  );
}
