import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Mail, Search, Trash2, UserPlus, ExternalLink } from 'lucide-react';
import Layout from '../components/Layout';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/useAuth';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '../lib/roles';
import {
  authErrorMessage,
  deleteUser,
  inviteUser,
  listUsers,
  sendPasswordSetupEmail,
  updateUser,
  type ManagedUser,
  type UserPatch,
} from '../lib/userAdmin';
import type { Role } from '../types/models';

type Filter = 'all' | 'active' | 'pending' | 'inactive';

const INVITE_ROLES: Role[] = ['professional', 'assistant', 'admin'];

function statusOf(u: ManagedUser): Exclude<Filter, 'all'> {
  if (!u.active) return 'inactive';
  if (u.hasAuthAccount && !u.lastSignInAt) return 'pending';
  return 'active';
}

const STATUS_BADGE: Record<Exclude<Filter, 'all'>, { label: string; className: string }> = {
  active: { label: 'Activo', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  pending: { label: 'Invitación pendiente', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  inactive: { label: 'Desactivado', className: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
};

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function AdminUsers() {
  const { currentUser } = useAuth() as unknown as { currentUser: { uid: string } | null };
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: '', displayName: '', role: 'professional' as Role, managerUid: '' });
  const [inviting, setInviting] = useState(false);
  const [toDelete, setToDelete] = useState<ManagedUser | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await listUsers());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const managers = useMemo(
    () => users.filter((u) => u.active && u.role !== 'professional').sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [users],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => filter === 'all' || statusOf(u) === filter)
      .filter((u) => !q || u.displayName.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users, search, filter]);

  const counts = useMemo(() => {
    const c = { all: users.length, active: 0, pending: 0, inactive: 0 };
    users.forEach((u) => c[statusOf(u)]++);
    return c;
  }, [users]);

  async function applyPatch(user: ManagedUser, patch: UserPatch, success: string) {
    setBusyUid(user.uid);
    try {
      await updateUser(user.uid, patch);
      setUsers((prev) => prev.map((u) => (u.uid === user.uid ? { ...u, ...patch } : u)));
      toast.success(success);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyUid(null);
    }
  }

  // Called from the form submit (Enter key) and from the dialog's confirm button.
  async function handleInvite(e?: FormEvent) {
    e?.preventDefault();
    if (inviting) return;
    setInviting(true);
    try {
      await inviteUser({ ...invite, managerUid: invite.managerUid || null });
      toast.success(`Invitación enviada a ${invite.email}. Recibirá un correo para crear su contraseña.`);
      setInvite({ email: '', displayName: '', role: 'professional', managerUid: '' });
      setInviteOpen(false);
      await load();
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setInviting(false);
    }
  }

  async function handleResend(user: ManagedUser) {
    if (!user.email) return;
    setBusyUid(user.uid);
    try {
      await sendPasswordSetupEmail(user.email);
      toast.success(`Correo enviado a ${user.email}.`);
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setBusyUid(null);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    setBusyUid(target.uid);
    try {
      await deleteUser(target.uid);
      setUsers((prev) => prev.filter((u) => u.uid !== target.uid));
      toast.success('Usuario eliminado.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyUid(null);
    }
  }

  const inputClass = 'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-ring';

  return (
    <Layout title="Usuarios">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o correo"
              className={`${inputClass} pl-9`}
              aria-label="Buscar usuarios"
            />
          </div>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-soft hover:bg-brand-700 focus-ring"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Invitar usuario
          </button>
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por estado">
          {(['all', 'active', 'pending', 'inactive'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition focus-ring ${
                filter === f ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50'
              }`}
            >
              {f === 'all' ? 'Todos' : STATUS_BADGE[f].label} ({counts[f]})
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-zinc-100">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando usuarios…
            </div>
          ) : visible.length === 0 ? (
            <p className="p-12 text-center text-sm text-zinc-500">No hay usuarios que coincidan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3">Rol</th>
                    <th className="px-4 py-3">Responsable</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Último ingreso</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {visible.map((u) => {
                    const isSelf = u.uid === currentUser?.uid;
                    const status = statusOf(u);
                    const busy = busyUid === u.uid;
                    return (
                      <tr key={u.uid} className={!u.active ? 'bg-zinc-50/60' : undefined}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-800">
                            {u.displayName || '—'} {isSelf && <span className="text-xs font-normal text-zinc-400">(tú)</span>}
                          </div>
                          <div className="text-xs text-zinc-500">{u.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={u.role}
                            disabled={busy || isSelf}
                            onChange={(e) => applyPatch(u, { role: e.target.value as Role }, 'Rol actualizado.')}
                            className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm focus-ring disabled:opacity-60"
                            aria-label={`Rol de ${u.displayName}`}
                            title={isSelf ? 'No puedes cambiar tu propio rol' : undefined}
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={u.managerUid ?? ''}
                            disabled={busy}
                            onChange={(e) => applyPatch(u, { managerUid: e.target.value || null }, 'Responsable actualizado.')}
                            className="max-w-[12rem] rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm focus-ring disabled:opacity-60"
                            aria-label={`Responsable de ${u.displayName}`}
                          >
                            <option value="">Sin responsable</option>
                            {managers
                              .filter((m) => m.uid !== u.uid)
                              .map((m) => (
                                <option key={m.uid} value={m.uid}>
                                  {m.displayName}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_BADGE[status].className}`}>
                            {STATUS_BADGE[status].label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-500">{formatDate(u.lastSignInAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {busy && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" aria-label="Guardando" />}
                            <label className="mr-2 inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
                              <input
                                type="checkbox"
                                checked={u.active}
                                disabled={busy || isSelf}
                                onChange={(e) =>
                                  applyPatch(u, { active: e.target.checked }, e.target.checked ? 'Usuario activado.' : 'Usuario desactivado; su sesión se cerrará.')
                                }
                                className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus-ring"
                              />
                              Activo
                            </label>
                            <button
                              type="button"
                              onClick={() => handleResend(u)}
                              disabled={busy || !u.email}
                              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 focus-ring disabled:opacity-40"
                              title={status === 'pending' ? 'Reenviar invitación' : 'Enviar correo para restablecer contraseña'}
                              aria-label={status === 'pending' ? `Reenviar invitación a ${u.displayName}` : `Restablecer contraseña de ${u.displayName}`}
                            >
                              <Mail className="h-4 w-4" />
                            </button>
                            <Link
                              to={`/admin/users/${u.uid}`}
                              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 focus-ring"
                              title="Ver detalle, saldo y permisos"
                              aria-label={`Ver detalle de ${u.displayName}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => setToDelete(u)}
                              disabled={busy || isSelf}
                              className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 focus-ring disabled:opacity-40"
                              title="Eliminar (solo sin rendiciones)"
                              aria-label={`Eliminar a ${u.displayName}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={inviteOpen}
        title="Invitar usuario"
        description="Se crea la cuenta y la persona recibe un correo para definir su contraseña."
        confirmLabel={inviting ? 'Enviando…' : 'Enviar invitación'}
        confirmDisabled={inviting || !invite.email || invite.displayName.trim().length < 2}
        onClose={() => setInviteOpen(false)}
        onConfirm={handleInvite}
      >
        <form onSubmit={handleInvite} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Nombre completo</span>
            <input
              required
              value={invite.displayName}
              onChange={(e) => setInvite({ ...invite, displayName: e.target.value })}
              className={inputClass}
              placeholder="Ej: Ana Pérez"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Correo</span>
            <input
              required
              type="email"
              value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              className={inputClass}
              placeholder="ana@empresa.com"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Rol</span>
              <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })} className={inputClass}>
                {INVITE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Responsable</span>
              <select value={invite.managerUid} onChange={(e) => setInvite({ ...invite, managerUid: e.target.value })} className={inputClass}>
                <option value="">Sin responsable</option>
                {managers.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            Para crear otro superadministrador, invítalo con otro rol y luego promuévelo desde la lista.
          </p>
        </form>
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={!!toDelete}
        title="Eliminar usuario"
        description={`Se eliminará la cuenta de ${toDelete?.displayName ?? ''}. Solo es posible si no tiene rendiciones ni asignaciones; en ese caso, desactívalo.`}
        confirmLabel="Eliminar"
        confirmTone="danger"
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
      >
        {null}
      </ConfirmDialog>
    </Layout>
  );
}
