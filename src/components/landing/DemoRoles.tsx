import { useState } from 'react';
import { ArrowRight, BarChart3, HardHat, Loader2, UserCheck, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { startDemo } from '../../lib/demoSignIn';
import type { TenantLanding } from '../../lib/tenant';

const ICON: Record<string, LucideIcon> = { worker: HardHat, manager: UserCheck, finance: BarChart3 };

// "Try it without signing up": one button per role, under the login card.
export default function DemoRoles({ demo }: { demo: NonNullable<TenantLanding['demo']> }) {
  const [busy, setBusy] = useState<string | null>(null);

  const go = async (role: string, path: string) => {
    setBusy(role);
    try {
      await startDemo(role, path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo abrir el demo.');
      setBusy(null);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-chrome-line bg-chrome-bg p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-chrome-strong">{demo.title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-chrome-muted">{demo.text}</p>
      <div className="mt-4 grid gap-2">
        {demo.roles.map((r) => {
          const Icon = ICON[r.role] ?? ArrowRight;
          return (
            <button
              key={r.role}
              type="button"
              disabled={busy !== null}
              onClick={() => go(r.role, r.path)}
              className="group flex items-center gap-3 rounded-xl border border-chrome-line px-3 py-2.5 text-left transition hover:border-chrome-accent hover:bg-chrome-hover disabled:opacity-60 focus-ring"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chrome-card text-chrome-accent">
                {busy === r.role ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-chrome-strong">{r.label}</span>
                <span className="block text-xs text-chrome-muted">{r.description}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-chrome-subtle transition group-hover:translate-x-0.5 group-hover:text-chrome-accent" aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
