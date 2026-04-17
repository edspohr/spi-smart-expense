import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function CollapsibleSection({
  eyebrow,
  title,
  count,
  storageKey,
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return defaultOpen;
      return raw === '1';
    } catch {
      return defaultOpen;
    }
  });

  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, open ? '1' : '0'); } catch { /* ignore */ }
  }, [storageKey, open]);

  return (
    <section className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-slate-50 focus-ring transition"
      >
        <div>
          {eyebrow && (
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{eyebrow}</p>
          )}
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            {title}
            {typeof count === 'number' && (
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-2 text-[11px] font-bold text-slate-600 bg-slate-100 rounded-full">
                {count}
              </span>
            )}
          </h2>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-slate-400" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className="border-t border-slate-100">
          {children}
        </div>
      )}
    </section>
  );
}
