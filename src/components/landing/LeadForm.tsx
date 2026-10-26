import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { submitLead } from '../../lib/leads';
import { track } from '../../lib/analytics';
import type { SavingsInput } from '../../lib/savings';

const SIZES = ['1–10', '11–50', '51–200', 'Más de 200'];
const input = 'mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

// Lead form inside the dark CTA box. Writes to the Growth Buddies CRM
// (src/lib/leads.ts); a hidden honeypot field drops naive bots.
export default function LeadForm({ calculator }: { calculator: SavingsInput }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [name, setName] = useState('');

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get('website')) return; // honeypot
    setState('sending');
    try {
      await submitLead({
        name: String(f.get('name') ?? ''),
        email: String(f.get('email') ?? ''),
        company: String(f.get('company') ?? ''),
        teamSize: String(f.get('teamSize') ?? ''),
        phone: String(f.get('phone') ?? ''),
        message: String(f.get('message') ?? ''),
        calculator: f.get('withCalc') ? { ...calculator } : undefined,
      });
      setName(String(f.get('name') ?? '').split(' ')[0] ?? '');
      track('lead_submit', { team_size: String(f.get('teamSize') ?? '') });
      setState('done');
    } catch {
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-xl bg-zinc-900 p-4 text-sm text-zinc-200">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
        <p>
          ¡Gracias{name ? `, ${name}` : ''}! Recibimos tu solicitud y te escribiremos pronto para coordinar una demo.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-3 sm:grid-cols-2" noValidate={false}>
      <p className="text-sm font-medium text-zinc-200 sm:col-span-2">O déjanos tus datos y te contactamos:</p>
      <label className="text-xs text-zinc-400">
        Nombre
        <input name="name" required autoComplete="name" className={input} />
      </label>
      <label className="text-xs text-zinc-400">
        Correo de trabajo
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      <label className="text-xs text-zinc-400">
        Empresa
        <input name="company" required autoComplete="organization" className={input} />
      </label>
      <label className="text-xs text-zinc-400">
        Personas que rinden gastos
        <select name="teamSize" required defaultValue="" className={input}>
          <option value="" disabled>
            Selecciona
          </option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-zinc-400 sm:col-span-2">
        Teléfono (opcional)
        <input name="phone" type="tel" autoComplete="tel" className={input} />
      </label>
      <label className="text-xs text-zinc-400 sm:col-span-2">
        ¿Algo que debamos saber? (opcional)
        <textarea name="message" rows={2} className={input} />
      </label>
      {/* Honeypot: hidden from people, filled by bots. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
        <input name="withCalc" type="checkbox" defaultChecked className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-brand-500" />
        Adjuntar mi cálculo de ahorro
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={state === 'sending'}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-brand-50 disabled:opacity-60 focus-ring"
        >
          {state === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Quiero que me contacten
        </button>
        {state === 'error' ? <span className="text-xs text-red-300">No se pudo enviar. Intenta de nuevo o escríbenos por WhatsApp.</span> : null}
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500 sm:col-span-2">
        Usamos estos datos solo para contactarte sobre Expense Buddy. Growth Buddies no los comparte con terceros.
      </p>
    </form>
  );
}
