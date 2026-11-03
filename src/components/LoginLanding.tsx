import { useEffect, type ReactNode } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  FileCheck2,
  MessageCircle,
  PieChart,
  ShieldCheck,
  Smartphone,
  Sparkles,
  WifiOff,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { tenant, type TenantLanding, type TenantPoweredBy } from '../lib/tenant';
import { track } from '../lib/analytics';
import DemoRoles from './landing/DemoRoles';
import OfflineExplainer from './landing/OfflineExplainer';
import ModelSection from './landing/ModelSection';

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  workflow: Workflow,
  offline: WifiOff,
  phone: Smartphone,
  budget: PieChart,
  security: ShieldCheck,
  fiscal: FileCheck2,
  accounting: BookOpenCheck,
};

interface Props {
  landing: TenantLanding;
  poweredBy?: TenantPoweredBy;
  /** The login card. */
  children: ReactNode;
}

const PILL_PRIMARY =
  'inline-flex items-center gap-2 rounded-full bg-[#0097B2] px-5 py-2.5 text-sm font-semibold text-[#0B0B0F] transition hover:bg-[#00B5D6]';
const PILL_SECONDARY =
  'inline-flex items-center gap-2 rounded-full border border-chrome-line px-5 py-2.5 text-sm font-semibold text-chrome-strong transition hover:border-chrome-accent';

function CtaRow({ cta }: { cta: NonNullable<TenantLanding['cta']> }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href={cta.primary.url}
        onClick={() => track('cta_click', { type: 'proposal' })}
        target="_blank"
        rel="noopener noreferrer"
        className={PILL_PRIMARY}
      >
        {cta.primary.label} <ArrowRight className="h-4 w-4" aria-hidden />
      </a>
      {cta.demoLabel ? (
        <a href="#demo" onClick={() => track('cta_click', { type: 'demo' })} className={PILL_SECONDARY}>
          {cta.demoLabel} <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      ) : null}
      {cta.secondary ? (
        <a
          href={cta.secondary.url}
          onClick={() => track('cta_click', { type: 'whatsapp' })}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-2 py-2.5 text-sm font-semibold text-chrome-muted underline-offset-2 hover:underline"
        >
          <MessageCircle className="h-4 w-4" aria-hidden /> {cta.secondary.label}
        </a>
      ) : null}
    </div>
  );
}

// Commercial landing around the login card, for tenants that declare
// `landing` in tenants/<id>.json (the Expense Buddy demo). Mobile order:
// short hero → login → features, so people who only want to sign in never
// have to scroll; on desktop the pitch sits left and the card right. As an
// installed PWA (display-mode: standalone) only the card shows.
export default function LoginLanding({ landing, poweredBy, children }: Props) {
  useEffect(() => track('landing_view'), []);

  return (
    <div className="min-h-screen bg-chrome-bg text-chrome-strong lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,1fr)]">
      {/* Hero */}
      <header className="relative px-6 pt-8 pb-4 sm:px-10 sm:pt-10 sm:pb-6 lg:col-start-1 lg:row-start-1 lg:px-16 lg:pt-14 standalone:hidden">
        <div className="flex items-center gap-3">
          <img src={tenant.branding.icon || tenant.branding.logo} alt="" className="h-10 w-10 rounded-xl" />
          <span className="text-lg font-semibold tracking-tight">{tenant.branding.productName}</span>
        </div>
        <p className="mt-7 sm:mt-10 inline-flex items-center gap-2 rounded-full bg-chrome-card px-3 py-1 text-xs font-semibold uppercase tracking-wider text-chrome-accent ring-1 ring-chrome-line">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> {landing.eyebrow}
        </p>
        <h1 className="mt-4 sm:mt-5 max-w-xl text-[2rem] sm:text-4xl font-bold leading-[1.05] tracking-tight lg:text-5xl">{landing.headline}</h1>
        <p className="mt-4 sm:mt-5 max-w-xl text-base leading-relaxed text-chrome-muted sm:text-lg">{landing.subheadline}</p>
        {landing.cta ? (
          <div className="mt-6">
            <CtaRow cta={landing.cta} />
          </div>
        ) : null}
        {landing.highlights?.length ? (
          <ul className="mt-6 hidden max-w-xl flex-wrap sm:flex gap-x-5 gap-y-2 text-sm text-chrome-fg">
            {landing.highlights.map((h) => (
              <li key={h} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-chrome-accent" aria-hidden /> {h}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {/* Login */}
      <section
        aria-label="Iniciar sesión"
        className="flex items-start justify-center bg-chrome-card px-4 lg:flex-col lg:items-center lg:justify-start py-6 sm:px-10 sm:py-8 standalone:min-h-screen standalone:items-center lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-screen lg:items-start lg:self-start lg:overflow-y-auto lg:border-l lg:border-chrome-line"
      >
        <div className="w-full max-w-md lg:my-auto lg:py-8">
          {children}
          {landing.demo ? (
            <div id="demo" className="scroll-mt-4 standalone:hidden">
              <DemoRoles demo={landing.demo} />
            </div>
          ) : null}
        </div>
      </section>

      {/* Features, CTA, powered by */}
      <div className="px-6 pb-12 pt-6 sm:px-10 lg:col-start-1 lg:row-start-2 lg:px-16 lg:pt-0 standalone:hidden">
        <ul className="mt-4 grid max-w-3xl gap-x-8 gap-y-7 sm:grid-cols-2">
          {landing.features.map((f) => {
            const Icon = ICONS[f.icon] ?? Sparkles;
            return (
              <li key={f.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chrome-card text-chrome-accent ring-1 ring-chrome-line">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 className="font-semibold tracking-tight">{f.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-chrome-muted">{f.text}</p>
                </div>
              </li>
            );
          })}
        </ul>

        {landing.model ? <ModelSection model={landing.model} /> : null}

        {landing.offline ? <OfflineExplainer offline={landing.offline} /> : null}

        {landing.cta ? (
          <div className="mt-12 max-w-3xl rounded-2xl bg-chrome-card p-6 ring-1 ring-chrome-line sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">{landing.cta.title}</h2>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-chrome-muted">{landing.cta.text}</p>
            <CtaRow cta={landing.cta} />
          </div>
        ) : null}

        {poweredBy && landing.footer ? (
          <footer className="mt-10 max-w-3xl border-t border-chrome-line pt-6 text-sm text-chrome-muted">
            <a
              href={poweredBy.url}
              onClick={() => track('cta_click', { type: 'powered_by' })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 font-semibold text-chrome-strong hover:underline underline-offset-2"
            >
              <img src={poweredBy.logo} alt="" className="h-8 w-8 rounded-full bg-white object-contain" />
              {poweredBy.name} · {landing.footer.siteLabel}
            </a>
            <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              <a href={`mailto:${landing.footer.email}`} className="hover:underline underline-offset-2">
                {landing.footer.email}
              </a>
              <a
                href={landing.footer.whatsappUrl}
                onClick={() => track('cta_click', { type: 'whatsapp' })}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline underline-offset-2"
              >
                WhatsApp {landing.footer.whatsappLabel}
              </a>
              <a
                href={landing.footer.privacyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline underline-offset-2"
              >
                Privacidad
              </a>
            </p>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
