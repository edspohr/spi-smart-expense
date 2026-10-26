import { useMemo, useRef } from 'react';
import { Calculator } from 'lucide-react';
import { estimateSavings, type SavingsInput } from '../../lib/savings';
import { track } from '../../lib/analytics';
import { BASE_CURRENCY } from '../../lib/country';

const FIELDS: { key: keyof SavingsInput; label: string; suffix?: string; step: number }[] = [
  { key: 'people', label: 'Personas que rinden gastos', step: 1 },
  { key: 'reportsPerPerson', label: 'Rendiciones por persona al mes', step: 1 },
  { key: 'minutesToday', label: 'Minutos por rendición hoy', suffix: 'min', step: 1 },
  { key: 'minutesWithApp', label: 'Minutos con Expense Buddy', suffix: 'min', step: 1 },
  { key: 'hourlyCost', label: 'Costo de una hora de trabajo', suffix: BASE_CURRENCY, step: 1000 },
];

interface Props {
  value: SavingsInput;
  onChange: (v: SavingsInput) => void;
}

const money = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: BASE_CURRENCY, maximumFractionDigits: 0 }).format(n);
const hours = (n: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n);

// Savings estimate with the visitor's own assumptions (defaults come from
// tenants/<id>.json landing.calculator and are labelled as editable).
export default function SavingsCalculator({ value, onChange }: Props) {
  const tracked = useRef(false);
  const result = useMemo(() => estimateSavings(value), [value]);

  const set = (key: keyof SavingsInput, raw: string) => {
    onChange({ ...value, [key]: raw === '' ? 0 : Number(raw) });
    if (!tracked.current) {
      tracked.current = true;
      track('calculator_use');
    }
  };

  return (
    <section aria-labelledby="calc-title" className="mt-12 max-w-3xl rounded-2xl border border-chrome-line p-6 sm:p-8">
      <div className="flex items-center gap-2 text-chrome-accent">
        <Calculator className="h-5 w-5" aria-hidden />
        <h2 id="calc-title" className="text-xl font-semibold tracking-tight text-chrome-strong">¿Cuánto tiempo recuperaría tu equipo?</h2>
      </div>
      <p className="mt-2 text-sm text-chrome-muted">Ajusta los supuestos a tu realidad. Los valores iniciales son solo un ejemplo.</p>

      <div className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="text-xs font-medium text-chrome-muted">{f.label}</span>
            <div className="mt-1 flex items-center rounded-lg border border-chrome-line bg-chrome-card focus-within:border-chrome-accent focus-within:ring-2 focus-within:ring-brand-500/30">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={f.step}
                value={value[f.key] || ''}
                onChange={(e) => set(f.key, e.target.value)}
                className="w-full rounded-lg border-0 bg-transparent px-3 py-2 text-sm text-chrome-strong focus:outline-none focus:ring-0"
              />
              {f.suffix ? <span className="pr-3 text-xs text-chrome-subtle">{f.suffix}</span> : null}
            </div>
          </label>
        ))}
      </div>

      <div className="mt-6 grid gap-4 rounded-xl bg-chrome-card p-5 ring-1 ring-chrome-line [grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))]">
        <div>
          <p className="text-xs font-medium text-chrome-accent">Horas al mes</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-chrome-strong">{hours(result.hoursPerMonth)} h</p>
        </div>
        <div>
          <p className="text-xs font-medium text-chrome-accent">Ahorro mensual</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-chrome-strong">{money(result.costPerMonth)}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-chrome-accent">Ahorro anual</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-chrome-strong">{money(result.costPerYear)}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-chrome-subtle">
        Estimación según tus supuestos ({hours(result.reportsPerMonth)} rendiciones al mes). No incluye el tiempo de aprobación ni de cuadratura de finanzas.
      </p>
    </section>
  );
}
