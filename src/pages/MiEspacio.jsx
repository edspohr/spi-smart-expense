import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import EmptyState from '../components/EmptyState';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { subscribeNotifications, markRead, markAllRead } from '../lib/notifications';

const TYPE_LABELS = {
  rejection:    'Rechazada',
  status_change: 'Aprobada',
  assignment:   'Asignación',
};

const TYPE_COLORS = {
  rejection:    'bg-red-50 border-red-200 text-red-700',
  status_change: 'bg-green-50 border-green-200 text-green-700',
  assignment:   'bg-blue-50 border-blue-200 text-blue-700',
};

export default function MiEspacio() {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = subscribeNotifications(currentUser.uid, setNotifications);
    return unsub;
  }, [currentUser?.uid]);

  const unread = notifications.filter(n => !n.read);
  const read   = notifications.filter(n => n.read);

  const handleMarkAll = async () => {
    setMarking(true);
    await markAllRead(currentUser.uid);
    setMarking(false);
  };

  const renderRow = (n) => {
    const date = new Date(n.createdAt);
    const dateStr = date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
    const badgeClass = TYPE_COLORS[n.type] || 'bg-zinc-50 border-zinc-200 text-zinc-600';
    return (
      <div
        key={n.id}
        className={`flex items-start gap-4 px-5 py-4 border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition cursor-pointer ${n.read ? 'opacity-70' : ''}`}
        onClick={() => { if (!n.read) markRead(n.id); }}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!n.read) markRead(n.id); } }}
        aria-label={n.title}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}>
              {TYPE_LABELS[n.type] || n.type}
            </span>
            <span className="text-xs font-bold text-zinc-800">{n.title}</span>
            {!n.read && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" aria-label="Sin leer" />}
          </div>
          <p className="text-sm text-zinc-600 mt-1">{n.body}</p>
        </div>
        <span className="text-xs text-zinc-400 whitespace-nowrap shrink-0">{dateStr} {timeStr}</span>
      </div>
    );
  };

  return (
    <Layout title="Mi Espacio">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            {unread.length > 0
              ? `${unread.length} notificación(es) sin leer`
              : 'Todo al día'}
          </p>
          {unread.length > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={marking}
              className="flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-800 disabled:opacity-50 transition"
            >
              <CheckCheck className="w-4 h-4" aria-hidden="true" />
              {marking ? 'Marcando…' : 'Marcar todas como leídas'}
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-soft border border-slate-100">
            <EmptyState
              icon={Bell}
              title="Sin notificaciones"
              description="Aquí aparecerán tus avisos de aprobaciones, rechazos y asignaciones."
            />
          </div>
        ) : (
          <>
            {/* Unread section */}
            {unread.length > 0 && (
              <div className="bg-white rounded-2xl shadow-soft border border-slate-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50">
                  <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Sin leer</h2>
                </div>
                {unread.map(renderRow)}
              </div>
            )}

            {/* Read section */}
            {read.length > 0 && (
              <div className="bg-white rounded-2xl shadow-soft border border-slate-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50">
                  <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Leídas</h2>
                </div>
                {read.map(renderRow)}
              </div>
            )}
          </>
        )}

      </div>
    </Layout>
  );
}
