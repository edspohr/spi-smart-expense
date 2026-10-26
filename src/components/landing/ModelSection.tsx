import { Check, Handshake, Minus, Palette, Server, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { TenantLanding } from '../../lib/tenant';

const ICONS: Record<string, LucideIcon> = {
  process: SlidersHorizontal,
  environment: Server,
  brand: Palette,
  partner: Handshake,
};

// "Not another subscription SaaS": the implementation model is the main
// differentiator against per-user self-service platforms (we don't compete
// on price). Copy lives in tenants/<id>.json → landing.model.
export default function ModelSection({ model }: { model: NonNullable<TenantLanding['model']> }) {
  return (
    <section aria-labelledby="model-title" className="mt-14 max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-wider text-chrome-accent">{model.eyebrow}</p>
      <h2 id="model-title" className="mt-2 text-2xl font-bold tracking-tight text-chrome-strong sm:text-3xl">
        {model.title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-chrome-muted sm:text-base">{model.intro}</p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {model.pillars.map((p) => {
          const Icon = ICONS[p.icon] ?? Check;
          return (
            <li key={p.title} className="rounded-2xl bg-chrome-card p-5 ring-1 ring-chrome-line">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-chrome-bg text-chrome-accent ring-1 ring-chrome-line">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <h3 className="mt-3 font-semibold tracking-tight text-chrome-strong">{p.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-chrome-muted">{p.text}</p>
            </li>
          );
        })}
      </ul>

      {model.comparison ? (
        <div className="mt-8 overflow-hidden rounded-2xl ring-1 ring-chrome-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{model.comparison.caption}</caption>
            <thead>
              <tr className="bg-chrome-card">
                <th scope="col" className="w-1/2 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-chrome-subtle">
                  {model.comparison.left}
                </th>
                <th scope="col" className="w-1/2 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-chrome-accent">
                  {model.comparison.right}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-chrome-line">
              {model.comparison.rows.map(([a, b]) => (
                <tr key={b} className="align-top">
                  <td className="px-4 py-3 text-chrome-muted">
                    <span className="flex gap-2">
                      <Minus className="mt-0.5 h-4 w-4 shrink-0 text-chrome-subtle" aria-hidden /> {a}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-chrome-fg">
                    <span className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-chrome-accent" aria-hidden /> {b}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
