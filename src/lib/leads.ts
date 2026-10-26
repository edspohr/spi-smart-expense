import { tenant, type TenantLeads } from './tenant';
import { useEmulators } from './firebase';

// Leads from the public landing go straight into the Growth Buddies CRM
// (Firestore `leads` in the growth-buddies project), the same collection the
// growthbuddies.cl forms use: its rules allow anonymous creates, a trigger
// emails the team and the day 1/3/7 follow-up picks the content from
// `interest`. With the emulators the write goes to the local emulator.

export interface LeadInput {
  name: string;
  email: string;
  company: string;
  teamSize: string;
  phone?: string;
  message?: string;
  calculator?: Record<string, number>;
}

function utm(): Record<string, string | null> {
  const q = new URLSearchParams(window.location.search);
  return {
    utm_source: q.get('utm_source') ?? 'expense-buddy',
    utm_medium: q.get('utm_medium') ?? 'app',
    utm_campaign: q.get('utm_campaign') ?? 'demo-landing',
    utm_term: q.get('utm_term'),
    gclid: q.get('gclid'),
  };
}

type Crm = { db: import('firebase/firestore').Firestore; fs: typeof import('firebase/firestore') };
let crm: Promise<Crm> | null = null;

// A second Firebase app for the CRM project, created (and wired to the
// emulator) once per page.
function crmFirestore(cfg: TenantLeads): Promise<Crm> {
  crm ??= Promise.all([import('firebase/app'), import('firebase/firestore')]).then(([{ initializeApp }, fs]) => {
    const db = fs.getFirestore(initializeApp(cfg.firebase, 'landing-leads'));
    if (useEmulators) fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    return { db, fs };
  });
  return crm;
}

export async function submitLead(input: LeadInput): Promise<void> {
  const cfg = tenant.leads;
  if (!cfg) throw new Error('Este ambiente no recibe solicitudes.');
  const { db, fs } = await crmFirestore(cfg);
  await fs.addDoc(fs.collection(db, cfg.collection), {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    company: input.company.trim(),
    team_size: input.teamSize,
    phone: input.phone?.trim() || null,
    message: input.message?.trim() || null,
    interest: cfg.interest,
    source: cfg.source,
    partial: false,
    calculator: input.calculator ?? null,
    device: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
    landing_page: window.location.href,
    referrer: document.referrer || 'direct',
    timestamp: fs.serverTimestamp(),
    ...utm(),
  });
}
