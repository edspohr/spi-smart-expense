import { useEffect, useState } from 'react';
import { collection, doc, getDocs, query, updateDoc, where, type Firestore } from 'firebase/firestore';
import { toast } from 'sonner';
import { Loader2, Mail, UserCheck } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/useAuth';
import { useTenantSettings } from '../context/SettingsContext';
import { setDelegation } from '../lib/expenseActions';

interface Profile {
  delegation?: { toUid: string; toName?: string; until: string } | null;
  notificationPrefs?: { email?: boolean };
}

// Mi Espacio: email preference for everyone, and approval delegation for
// people who manage someone (levels policy with delegation enabled).
export default function ApprovalPrefsCard() {
  const { currentUser, profile } = useAuth() as unknown as { currentUser: { uid: string } | null; profile: Profile | null };
  const { approvalPolicy } = useTenantSettings();
  const [team, setTeam] = useState<{ uid: string; name: string }[]>([]);
  const [people, setPeople] = useState<{ uid: string; name: string }[]>([]);
  const [toUid, setToUid] = useState('');
  const [until, setUntil] = useState('');
  const [saving, setSaving] = useState(false);

  const canDelegate = approvalPolicy.mode === 'levels' && approvalPolicy.allowDelegation;

  useEffect(() => {
    if (!canDelegate || !currentUser || !db) return;
    const users = collection(db as Firestore, 'users');
    getDocs(query(users, where('managerUid', '==', currentUser.uid)))
      .then((snap) => setTeam(snap.docs.map((d) => ({ uid: d.id, name: d.data().displayName ?? d.id }))))
      .catch(() => setTeam([]));
    getDocs(users)
      .then((snap) =>
        setPeople(
          snap.docs
            .filter((d) => d.id !== currentUser.uid && d.data().active !== false)
            .map((d) => ({ uid: d.id, name: d.data().displayName ?? d.id }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      )
      .catch(() => setPeople([]));
  }, [canDelegate, currentUser]);

  const delegation = profile?.delegation && profile.delegation.until > new Date().toISOString() ? profile.delegation : null;
  const emailOn = profile?.notificationPrefs?.email !== false;

  async function toggleEmail(value: boolean) {
    if (!currentUser || !db) return;
    try {
      await updateDoc(doc(db as Firestore, 'users', currentUser.uid), { notificationPrefs: { email: value } });
      toast.success(value ? 'Recibirás avisos por correo.' : 'No recibirás avisos por correo.');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function saveDelegation(clear = false) {
    setSaving(true);
    try {
      const res = await setDelegation(clear ? null : toUid, clear ? null : new Date(`${until}T23:59:59`).toISOString());
      toast.success(clear ? 'Delegación terminada.' : `Delegación activa. ${res.updated} rendiciones pendientes reasignadas.`);
      setToUid('');
      setUntil('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="space-y-4 rounded-2xl bg-white p-5 shadow-soft border border-slate-100">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-4 w-4 text-zinc-400" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-zinc-800">Avisos por correo</p>
            <p className="text-xs text-zinc-500">Aprobaciones, rechazos y solicitudes de aprobación (si tu organización los activó).</p>
          </div>
        </div>
        <input type="checkbox" checked={emailOn} onChange={(e) => toggleEmail(e.target.checked)} className="h-5 w-5 rounded border-zinc-300 text-brand-600 focus-ring" aria-label="Recibir avisos por correo" />
      </div>

      {canDelegate && team.length > 0 && (
        <div className="border-t border-zinc-100 pt-4">
          <div className="flex items-start gap-3">
            <UserCheck className="mt-0.5 h-4 w-4 text-zinc-400" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-zinc-800">Delegar mis aprobaciones</p>
              <p className="text-xs text-zinc-500">Apruebas a {team.length} persona(s). Si te ausentas, otra persona puede aprobar por ti hasta una fecha.</p>
            </div>
          </div>
          {delegation ? (
            <div className="mt-3 flex flex-col gap-2 rounded-xl bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-amber-800">
                Delegado a <strong>{delegation.toName || delegation.toUid}</strong> hasta el {new Date(delegation.until).toLocaleDateString('es-CO')}.
              </p>
              <button type="button" disabled={saving} onClick={() => saveDelegation(true)} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100 focus-ring">
                Terminar
              </button>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_10rem_auto]">
              <select value={toUid} onChange={(e) => setToUid(e.target.value)} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm focus-ring" aria-label="Delegar en">
                <option value="">Elige a quién…</option>
                {people.map((p) => (
                  <option key={p.uid} value={p.uid}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm focus-ring" aria-label="Hasta" />
              <button
                type="button"
                disabled={saving || !toUid || !until}
                onClick={() => saveDelegation()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-ring disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Delegar
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
