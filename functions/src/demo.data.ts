// Demo tenant data: a fictitious Chilean company, "Andes Energía SpA".
// Shared by the nightly reset (demo.ts) and scripts/seed-demo.mjs (which
// imports the compiled lib/demo.data.js). No runtime Firebase imports: the
// caller passes its own Firestore instance, so two Admin SDK copies never mix.
import type { Firestore } from 'firebase-admin/firestore';

export const DEMO_DOMAIN = 'andesenergia.demo';

export interface DemoPerson {
  uid: string;
  name: string;
  email: string;
  role: 'superadmin' | 'admin' | 'assistant' | 'professional';
  title: string;
  manager?: string;
  permissions?: Record<string, boolean>;
}

export const PEOPLE: DemoPerson[] = [
  { uid: 'demo-camila', name: 'Camila Rojas', email: `camila.rojas@${DEMO_DOMAIN}`, role: 'superadmin', title: 'Gerenta de Administración y Finanzas', permissions: { isColombiaApprover: true } },
  { uid: 'demo-rodrigo', name: 'Rodrigo Pizarro', email: `rodrigo.pizarro@${DEMO_DOMAIN}`, role: 'admin', title: 'Contador', permissions: { isColombiaApprover: true } },
  { uid: 'demo-diego', name: 'Diego Muñoz', email: `diego.munoz@${DEMO_DOMAIN}`, role: 'professional', title: 'Jefe de Obra — Parque Solar Atacama' },
  { uid: 'demo-paula', name: 'Paula Herrera', email: `paula.herrera@${DEMO_DOMAIN}`, role: 'professional', title: 'Jefa de Proyecto — Subestaciones' },
  { uid: 'demo-nicolas', name: 'Nicolás Soto', email: `nicolas.soto@${DEMO_DOMAIN}`, role: 'professional', title: 'Supervisor de Terreno', manager: 'demo-diego' },
  { uid: 'demo-matias', name: 'Matías Fuentes', email: `matias.fuentes@${DEMO_DOMAIN}`, role: 'professional', title: 'Técnico Eléctrico', manager: 'demo-diego' },
  { uid: 'demo-javiera', name: 'Javiera Contreras', email: `javiera.contreras@${DEMO_DOMAIN}`, role: 'professional', title: 'Ingeniera de Protecciones', manager: 'demo-paula' },
  { uid: 'demo-ignacio', name: 'Ignacio Vera', email: `ignacio.vera@${DEMO_DOMAIN}`, role: 'assistant', title: 'Asistente de Administración' },
];

/** Accounts removed from the demo; seed and reset delete their profile and Auth user. */
export const RETIRED_UIDS = ['demo-valentina'];

/** One-click demo roles → account. The superadmin is deliberately not offered. */
export const DEMO_ROLES: Record<string, string> = {
  worker: 'demo-nicolas',
  manager: 'demo-diego',
  finance: 'demo-rodrigo',
};

const PROJECTS = [
  { id: 'demo-psa', code: 'PSA-26', name: 'Parque Solar Atacama', client: 'Andes Energía SpA', budget: 18_000_000 },
  { id: 'demo-sela', code: 'SELA-26', name: 'Subestación Los Ángeles', client: 'Andes Energía SpA', budget: 12_000_000 },
  { id: 'demo-ml220', code: 'ML220', name: 'Mantención Línea 220 kV', client: 'Andes Servicios Ltda.', budget: 9_000_000 },
  { id: 'demo-adm', code: 'ADM', name: 'Administración Santiago', client: 'Andes Energía SpA', budget: 4_000_000 },
];

export const DEMO_SETTINGS = {
  security: { pinEnabled: false, pinApprovalThreshold: 500_000 },
  approvalPolicy: {
    mode: 'levels',
    managerApproval: true,
    autoApproveBelow: 10_000,
    secondSignatureAbove: 1_000_000,
    allowDelegation: true,
    staleReminders: false,
    staleDays: 5,
  },
  modules: { bulkUpload: true, reports: true, reconciliation: false, balances: true },
};

type Extra = { description?: string; category?: string; rejectionReason?: string };
// [uid, projectId, daysAgo, category, merchant, taxId, city, amount, status, extra]
type Row = [string, string, number, string, string, string, string, number, 'pending' | 'approved' | 'rejected', Extra?];
const EXPENSES: Row[] = [
  ['demo-nicolas', 'demo-psa', 1, 'COMBUSTIBLE', 'Copec Ruta 5 Norte', '99.520.000-7', 'Copiapó', 68_400, 'pending'],
  ['demo-nicolas', 'demo-psa', 1, 'ALIMENTACIÓN', 'Restaurante El Minero', '76.354.771-K', 'Diego de Almagro', 32_900, 'pending'],
  ['demo-matias', 'demo-psa', 2, 'MATERIALES Y HERRAMIENTAS', 'Sodimac Antofagasta', '96.792.430-K', 'Antofagasta', 186_490, 'pending'],
  ['demo-matias', 'demo-psa', 3, 'ALOJAMIENTO', 'Hotel Desierto Florido', '76.112.983-4', 'Copiapó', 1_240_000, 'pending', { description: '4 noches cuadrilla montaje' }],
  ['demo-javiera', 'demo-sela', 2, 'TRANSPORTE TERRESTRE', 'Cabify', '76.341.213-3', 'Santiago', 18_700, 'pending'],
  ['demo-javiera', 'demo-sela', 4, 'PEAJES Y TAG', 'Autopista del Itata', '96.977.920-K', 'Chillán', 7_400, 'pending'],
  ['demo-javiera', 'demo-sela', 6, 'EPP Y SEGURIDAD', 'Prosegur Equipamiento', '76.019.236-2', 'Los Ángeles', 94_500, 'pending'],
  ['demo-diego', 'demo-psa', 5, 'PASAJES AÉREOS', 'LATAM Airlines', '89.862.200-2', 'Santiago', 214_600, 'pending', { description: 'SCL–CPO ida y vuelta, visita de obra' }],
  ['demo-paula', 'demo-sela', 7, 'GASTOS DE REPRESENTACIÓN', 'Restaurante Lo de Arriba', '76.205.884-1', 'Los Ángeles', 156_000, 'pending'],
  ['demo-ignacio', 'demo-adm', 3, 'TELEFONÍA E INTERNET', 'Entel PCS', '96.806.980-2', 'Santiago', 29_990, 'pending'],
  ['demo-nicolas', 'demo-psa', 9, 'COMBUSTIBLE', 'Shell Caldera', '96.687.020-7', 'Caldera', 74_200, 'approved'],
  ['demo-nicolas', 'demo-psa', 11, 'ALIMENTACIÓN', 'Colaciones Don Pepe', '77.001.552-0', 'Copiapó', 48_000, 'approved'],
  ['demo-matias', 'demo-psa', 12, 'ESTACIONAMIENTOS', 'Estacionamientos Saba', '96.854.430-6', 'Antofagasta', 6_500, 'approved'],
  ['demo-matias', 'demo-ml220', 15, 'MATERIALES Y HERRAMIENTAS', 'Ferretería Industrial Norte', '76.488.120-3', 'Calama', 312_800, 'approved'],
  ['demo-javiera', 'demo-sela', 13, 'ALOJAMIENTO', 'Hotel Mundo Nuevo', '76.903.114-8', 'Los Ángeles', 389_000, 'approved'],
  ['demo-diego', 'demo-psa', 16, 'ARRIENDO', 'Arriendo Camionetas del Norte', '76.611.270-9', 'Copiapó', 1_650_000, 'approved', { category: 'TRANSPORTE TERRESTRE', description: 'Arriendo 4x4 por 15 días' }],
  ['demo-paula', 'demo-sela', 18, 'PASAJES AÉREOS', 'Sky Airline', '88.417.000-1', 'Santiago', 98_300, 'approved'],
  ['demo-ignacio', 'demo-adm', 20, 'VARIOS', 'Correos de Chile', '60.503.000-9', 'Santiago', 12_600, 'approved'],
  ['demo-nicolas', 'demo-psa', 22, 'ALIMENTACIÓN', 'Supermercado Unimarc', '76.012.676-4', 'Diego de Almagro', 87_350, 'rejected', { rejectionReason: 'Compra de supermercado sin detalle de colaciones; adjunta la boleta desglosada.' }],
  ['demo-matias', 'demo-ml220', 25, 'COMBUSTIBLE', 'Aramco Calama', '79.588.870-5', 'Calama', 91_000, 'rejected', { rejectionReason: 'La boleta no es legible. Sube una foto más nítida.' }],
  ['demo-javiera', 'demo-sela', 27, 'PEAJES Y TAG', 'Ruta del Bosque', '96.965.880-1', 'Los Ángeles', 5_800, 'approved'],
  ['demo-diego', 'demo-psa', 29, 'GASTOS DE REPRESENTACIÓN', 'Café Altiplano', '76.430.091-5', 'Copiapó', 23_400, 'approved'],
  ['demo-paula', 'demo-sela', 31, 'TELEFONÍA E INTERNET', 'Starlink Chile', '77.501.882-K', 'Los Ángeles', 47_990, 'approved'],
  ['demo-ignacio', 'demo-adm', 34, 'MATERIALES Y HERRAMIENTAS', 'Librería Nacional', '76.081.540-1', 'Santiago', 8_900, 'approved'],
];

// Collections a visitor can fill; the reset clears them before reseeding.
const WIPED = ['expenses', 'allocations', 'notifications', 'mailQueue', 'rateLimits', 'aggregateLedger', 'pinLog', 'userPins', 'projects', 'invoices'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Removes everything visitors could have changed, keeping the Auth accounts.
 * Deleting expenses fires onExpenseWritten, so we wait for those triggers to
 * settle before zeroing balances (otherwise a late trigger skews them).
 */
export async function wipeDemoData(db: Firestore, settleMs = 25_000): Promise<void> {
  await db.recursiveDelete(db.collection('expenses'));
  await sleep(settleMs);
  for (const col of WIPED) await db.recursiveDelete(db.collection(col));
  for (const uid of RETIRED_UIDS) await db.doc(`users/${uid}`).delete();
  for (const p of PEOPLE) {
    await db.doc(`users/${p.uid}`).set({ balance: 0, delegation: null, fcmTokens: [], hasPin: false, pinDisabled: false, notificationPrefs: null }, { merge: true });
  }
}

/** Writes settings, user profiles, projects, allocations and expenses. */
export async function seedDemoData(db: Firestore, now = new Date()): Promise<{ people: number; projects: number; expenses: number }> {
  const daysAgo = (n: number, hour = 11) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  await db.doc('settings/tenant').set({ ...DEMO_SETTINGS, updatedAt: now.toISOString(), updatedByName: 'Datos de demostración' });

  for (const p of PEOPLE) {
    await db.doc(`users/${p.uid}`).set(
      {
        uid: p.uid,
        email: p.email,
        displayName: p.name,
        role: p.role,
        title: p.title,
        active: true,
        tenantId: 'demo',
        managerUid: p.manager ?? null,
        balance: 0,
        ...(p.permissions ? { permissions: p.permissions } : {}),
        createdAt: daysAgo(60).toISOString(),
      },
      { merge: true },
    );
  }

  const batch = db.batch();
  for (const pr of PROJECTS) {
    batch.set(db.doc(`projects/${pr.id}`), { name: pr.name, code: pr.code, client: pr.client, status: 'active', budget: pr.budget, expenses: 0, createdAt: daysAgo(60).toISOString() });
  }
  for (const p of PEOPLE.filter((x) => x.role === 'professional' && x.manager)) {
    const projectId = p.manager === 'demo-diego' ? 'demo-psa' : 'demo-sela';
    const pr = PROJECTS.find((x) => x.id === projectId)!;
    batch.set(db.doc(`allocations/demo-alloc-${p.uid}`), {
      userId: p.uid, userName: p.name, projectId, projectName: pr.name,
      amount: 800_000, date: daysAgo(40).toISOString(), createdAt: daysAgo(40).toISOString(), type: 'allocation',
    });
  }
  await batch.commit();

  // One by one so each fires onExpenseCreated and builds its approval flow.
  let n = 0;
  for (const [uid, projectId, ago, category, merchant, taxId, city, amount, status, extra = {}] of EXPENSES) {
    const person = PEOPLE.find((p) => p.uid === uid)!;
    const pr = PROJECTS.find((x) => x.id === projectId)!;
    const created = daysAgo(ago, 9 + (n % 8));
    const reviewer = status === 'pending' ? {} : { reviewedAt: daysAgo(Math.max(ago - 1, 0), 17).toISOString(), reviewedByUid: 'demo-rodrigo', reviewedByName: 'Rodrigo Pizarro' };
    n += 1;
    await db.doc(`expenses/demo-exp-${String(n).padStart(2, '0')}`).set({
      userId: uid, userName: person.name, projectId, projectName: pr.name,
      eventName: pr.code, category: extra.category ?? category, date: created.toISOString().slice(0, 10), time: null,
      merchant, taxId, invoiceNumber: `${['BE', 'FE'][n % 2]}-${100000 + n * 137}`, city, address: null, phone: null,
      paymentMethod: n % 3 === 0 ? 'Debit Card' : 'Credit Card', cardBrand: n % 3 === 0 ? null : ['visa', 'mastercard'][n % 2],
      cardCompany: 'Andes Energía SpA', cardLast4: n % 3 === 0 ? null : String(4000 + n * 37).slice(-4),
      description: extra.description ?? `${category.toLowerCase()} — ${pr.name}`,
      amount, currency: 'CLP', baseCurrency: 'CLP', amountBase: null, amountCOP: null,
      receiptUrl: null, voucherUrl: null, status, createdAt: created.toISOString(),
      isCompanyExpense: false, splitGroupId: null, trm: null, trmSource: null,
      ...(extra.rejectionReason ? { rejectionReason: extra.rejectionReason } : {}),
      ...reviewer,
    });
  }
  // One foreign-currency expense: software paid in USD with its CLP equivalent.
  await db.doc('expenses/demo-exp-usd').set({
    userId: 'demo-paula', userName: 'Paula Herrera', projectId: 'demo-sela', projectName: 'Subestación Los Ángeles',
    eventName: 'SELA-26', category: 'TELEFONÍA E INTERNET', date: daysAgo(8).toISOString().slice(0, 10), time: null,
    merchant: 'ETAP Software Inc.', taxId: null, invoiceNumber: 'INV-20931', city: 'Irvine, CA', address: null, phone: null,
    paymentMethod: 'Credit Card', cardBrand: 'amex', cardCompany: 'Andes Energía SpA', cardLast4: '1009',
    description: 'Licencia mensual software de estudios eléctricos', amount: 149, currency: 'USD',
    trm: 948.6, trmSource: 'Banco Central de Chile (mindicador.cl)', baseCurrency: 'CLP', amountBase: Math.round(149 * 948.6), amountCOP: null,
    receiptUrl: null, voucherUrl: null, status: 'pending', createdAt: daysAgo(8).toISOString(), isCompanyExpense: false, splitGroupId: null,
  });

  return { people: PEOPLE.length, projects: PROJECTS.length, expenses: EXPENSES.length + 1 };
}
