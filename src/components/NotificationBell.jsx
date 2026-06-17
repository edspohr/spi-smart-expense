import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { subscribeNotifications, markRead } from '../lib/notifications';

const TYPE_COLORS = {
  rejection:    'bg-red-50 border-red-100',
  status_change: 'bg-green-50 border-green-100',
  assignment:   'bg-blue-50 border-blue-100',
};

const PREVIEW_LIMIT = 8;

export default function NotificationBell() {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = subscribeNotifications(currentUser.uid, setNotifications);
    return unsub;
  }, [currentUser?.uid]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unread = notifications.filter(n => !n.read).length;
  const preview = notifications.slice(0, PREVIEW_LIMIT);

  const handleRowClick = async (n) => {
    if (!n.read) await markRead(n.id);
    setOpen(false);
    if (n.expenseId) {
      navigate('/dashboard/mi-espacio');
    }
  };

  if (!currentUser) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Notificaciones${unread > 0 ? `, ${unread} sin leer` : ''}`}
        className="relative p-2 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-full transition focus-ring"
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-glass border border-zinc-200/60 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
            <span className="text-sm font-bold text-zinc-800">Notificaciones</span>
            {unread > 0 && (
              <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">
                {unread} sin leer
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100">
            {preview.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-8 italic">Sin notificaciones.</p>
            ) : (
              preview.map(n => {
                const colorClass = TYPE_COLORS[n.type] || 'bg-zinc-50 border-zinc-100';
                const date = new Date(n.createdAt);
                const dateStr = date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
                const timeStr = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleRowClick(n)}
                    className={`w-full text-left px-4 py-3 hover:brightness-95 transition border-l-2 ${colorClass} ${n.read ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-xs font-bold ${n.read ? 'text-zinc-500' : 'text-zinc-800'}`}>{n.title}</span>
                      <span className="text-[10px] text-zinc-400 whitespace-nowrap">{dateStr} {timeStr}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.body}</p>
                    {!n.read && <span className="inline-block mt-1 w-1.5 h-1.5 rounded-full bg-brand-500" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-zinc-100 text-center">
            <Link
              to="/dashboard/mi-espacio"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-brand-600 hover:text-brand-800 transition"
            >
              Ver todas →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
