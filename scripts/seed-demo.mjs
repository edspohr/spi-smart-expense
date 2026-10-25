// Seeds (or resets) the Expense Buddy demo tenant with a fictitious Chilean
// company, "Andes Energía SpA": people with a manager hierarchy, projects,
// allocations, settings with a two-level approval policy, and ~25 expenses
// in CLP (plus one in USD) across statuses. Expenses are written as plain
// documents: the onExpenseCreated / onExpenseWritten triggers build the
// approval flows and balances, exactly as in real use.
//
//   npm run seed:demo                                   # emulators (project expense-buddy-demo)
//   npm run reset:demo                                  # wipe demo data (keeps accounts) and reseed
//   node scripts/seed-demo.mjs --prod [--key path/to/sa.json] [--password X] [--reset]   (ADC when no --key)
//
// Accounts use the password from --password (or DEMO_PASSWORD); in the
// emulators it defaults to Demo2026!. In production a random password is
// generated and printed once if none is given.

import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i > -1 ? args[i + 1] : undefined;
};
const prod = flag('--prod');
const reset = flag('--reset');
const projectId = opt('--project') ?? 'expense-buddy-demo';

if (!prod) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
}
const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');

if (prod) {
  // Either a service-account key (--key) or your gcloud Application Default
  // Credentials (`gcloud auth application-default login` + set-quota-project).
  const keyPath = opt('--key');
  if (keyPath && !existsSync(keyPath)) {
    console.error(`Key file not found: ${keyPath}`);
    process.exit(1);
  }
  const sa = keyPath ? JSON.parse(readFileSync(keyPath, 'utf8')) : null;
  const target = sa?.project_id ?? projectId;
  if (!/demo/i.test(target)) {
    console.error(`Refusing: ${target} does not look like a demo project.`);
    process.exit(1);
  }
  initializeApp({ ...(sa ? { credential: cert(sa) } : { credential: applicationDefault() }), projectId: target });
  console.log(`Target: PRODUCTION ${target} (${sa ? 'service account key' : 'gcloud ADC'})`);
} else {
  initializeApp({ projectId });
  console.log(`Target: emulators (${projectId})`);
}

const password = opt('--password') ?? process.env.DEMO_PASSWORD ?? (prod ? randomBytes(9).toString('base64url') : 'Demo2026!');
const auth = getAuth();
const db = getFirestore();
const DOMAIN = 'andesenergia.demo';

export const PEOPLE = [
  { uid: 'demo-camila', name: 'Camila Rojas', email: `camila.rojas@${DOMAIN}`, role: 'superadmin', title: 'Gerenta de Administración y Finanzas', permissions: { isColombiaApprover: true } },
  { uid: 'demo-rodrigo', name: 'Rodrigo Pizarro', email: `rodrigo.pizarro@${DOMAIN}`, role: 'admin', title: 'Contador', permissions: { isColombiaApprover: true } },
  { uid: 'demo-diego', name: 'Diego Muñoz', email: `diego.munoz@${DOMAIN}`, role: 'professional', title: 'Jefe de Obra — Parque Solar Atacama' },
  { uid: 'demo-paula', name: 'Paula Herrera', email: `paula.herrera@${DOMAIN}`, role: 'professional', title: 'Jefa de Proyecto — Subestaciones' },
  { uid: 'demo-valentina', name: 'Valentina Soto', email: `valentina.soto@${DOMAIN}`, role: 'professional', title: 'Supervisora de Terreno', manager: 'demo-diego' },
  { uid: 'demo-matias', name: 'Matías Fuentes', email: `matias.fuentes@${DOMAIN}`, role: 'professional', title: 'Técnico Eléctrico', manager: 'demo-diego' },
  { uid: 'demo-javiera', name: 'Javiera Contreras', email: `javiera.contreras@${DOMAIN}`, role: 'professional', title: 'Ingeniera de Protecciones', manager: 'demo-paula' },
  { uid: 'demo-ignacio', name: 'Ignacio Vera', email: `ignacio.vera@${DOMAIN}`, role: 'assistant', title: 'Asistente de Administración' },
];

const PROJECTS = [
  { id: 'demo-psa', code: 'PSA-26', name: 'Parque Solar Atacama', client: 'Andes Energía SpA', budget: 18_000_000 },
  { id: 'demo-sela', code: 'SELA-26', name: 'Subestación Los Ángeles', client: 'Andes Energía SpA', budget: 12_000_000 },
  { id: 'demo-ml220', code: 'ML220', name: 'Mantención Línea 220 kV', client: 'Andes Servicios Ltda.', budget: 9_000_000 },
  { id: 'demo-adm', code: 'ADM', name: 'Administración Santiago', client: 'Andes Energía SpA', budget: 4_000_000 },
];

const SETTINGS = {
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

const today = new Date();
const daysAgo = (n, hour = 11) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

// [uid, projectId, daysAgo, category, merchant, taxId, city, amount, status, extra]
const EXPENSES = [
  ['demo-valentina', 'demo-psa', 1, 'COMBUSTIBLE', 'Copec Ruta 5 Norte', '99.520.000-7', 'Copiapó', 68_400, 'pending'],
  ['demo-valentina', 'demo-psa', 1, 'ALIMENTACIÓN', 'Restaurante El Minero', '76.354.771-K', 'Diego de Almagro', 32_900, 'pending'],
  ['demo-matias', 'demo-psa', 2, 'MATERIALES Y HERRAMIENTAS', 'Sodimac Antofagasta', '96.792.430-K', 'Antofagasta', 186_490, 'pending'],
  ['demo-matias', 'demo-psa', 3, 'ALOJAMIENTO', 'Hotel Desierto Florido', '76.112.983-4', 'Copiapó', 1_240_000, 'pending', { description: '4 noches cuadrilla montaje' }],
  ['demo-javiera', 'demo-sela', 2, 'TRANSPORTE TERRESTRE', 'Cabify', '76.341.213-3', 'Santiago', 18_700, 'pending'],
  ['demo-javiera', 'demo-sela', 4, 'PEAJES Y TAG', 'Autopista del Itata', '96.977.920-K', 'Chillán', 7_400, 'pending'],
  ['demo-javiera', 'demo-sela', 6, 'EPP Y SEGURIDAD', 'Prosegur Equipamiento', '76.019.236-2', 'Los Ángeles', 94_500, 'pending'],
  ['demo-diego', 'demo-psa', 5, 'PASAJES AÉREOS', 'LATAM Airlines', '89.862.200-2', 'Santiago', 214_600, 'pending', { description: 'SCL–CPO ida y vuelta, visita de obra' }],
  ['demo-paula', 'demo-sela', 7, 'GASTOS DE REPRESENTACIÓN', 'Restaurante Lo de Arriba', '76.205.884-1', 'Los Ángeles', 156_000, 'pending'],
  ['demo-ignacio', 'demo-adm', 3, 'TELEFONÍA E INTERNET', 'Entel PCS', '96.806.980-2', 'Santiago', 29_990, 'pending'],
  ['demo-valentina', 'demo-psa', 9, 'COMBUSTIBLE', 'Shell Caldera', '96.687.020-7', 'Caldera', 74_200, 'approved'],
  ['demo-valentina', 'demo-psa', 11, 'ALIMENTACIÓN', 'Colaciones Don Pepe', '77.001.552-0', 'Copiapó', 48_000, 'approved'],
  ['demo-matias', 'demo-psa', 12, 'ESTACIONAMIENTOS', 'Estacionamientos Saba', '96.854.430-6', 'Antofagasta', 6_500, 'approved'],
  ['demo-matias', 'demo-ml220', 15, 'MATERIALES Y HERRAMIENTAS', 'Ferretería Industrial Norte', '76.488.120-3', 'Calama', 312_800, 'approved'],
  ['demo-javiera', 'demo-sela', 13, 'ALOJAMIENTO', 'Hotel Mundo Nuevo', '76.903.114-8', 'Los Ángeles', 389_000, 'approved'],
  ['demo-diego', 'demo-psa', 16, 'ARRIENDO', 'Arriendo Camionetas del Norte', '76.611.270-9', 'Copiapó', 1_650_000, 'approved', { category: 'TRANSPORTE TERRESTRE', description: 'Arriendo 4x4 por 15 días' }],
  ['demo-paula', 'demo-sela', 18, 'PASAJES AÉREOS', 'Sky Airline', '88.417.000-1', 'Santiago', 98_300, 'approved'],
  ['demo-ignacio', 'demo-adm', 20, 'VARIOS', 'Correos de Chile', '60.503.000-9', 'Santiago', 12_600, 'approved'],
  ['demo-valentina', 'demo-psa', 22, 'ALIMENTACIÓN', 'Supermercado Unimarc', '76.012.676-4', 'Diego de Almagro', 87_350, 'rejected', { rejectionReason: 'Compra de supermercado sin detalle de colaciones; adjunta la boleta desglosada.' }],
  ['demo-matias', 'demo-ml220', 25, 'COMBUSTIBLE', 'Aramco Calama', '79.588.870-5', 'Calama', 91_000, 'rejected', { rejectionReason: 'La boleta no es legible. Sube una foto más nítida.' }],
  ['demo-javiera', 'demo-sela', 27, 'PEAJES Y TAG', 'Ruta del Bosque', '96.965.880-1', 'Los Ángeles', 5_800, 'approved'],
  ['demo-diego', 'demo-psa', 29, 'GASTOS DE REPRESENTACIÓN', 'Café Altiplano', '76.430.091-5', 'Copiapó', 23_400, 'approved'],
  ['demo-paula', 'demo-sela', 31, 'TELEFONÍA E INTERNET', 'Starlink Chile', '77.501.882-K', 'Los Ángeles', 47_990, 'approved'],
  ['demo-ignacio', 'demo-adm', 34, 'MATERIALES Y HERRAMIENTAS', 'Librería Nacional', '76.081.540-1', 'Santiago', 8_900, 'approved'],
];

async function upsertUser(p) {
  try {
    await auth.getUser(p.uid);
    await auth.updateUser(p.uid, { email: p.email, password, displayName: p.name, disabled: false });
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    await auth.createUser({ uid: p.uid, email: p.email, password, displayName: p.name, emailVerified: true });
  }
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

async function wipe() {
  for (const col of ['expenses', 'allocations', 'notifications', 'mailQueue', 'rateLimits', 'aggregateLedger', 'pinLog', 'projects']) {
    await db.recursiveDelete(db.collection(col));
  }
  for (const p of PEOPLE) await db.doc(`users/${p.uid}`).set({ balance: 0, delegation: null }, { merge: true });
  console.log('  demo data wiped (accounts kept)');
}

async function main() {
  if (reset) await wipe();

  await db.doc('settings/tenant').set({ ...SETTINGS, updatedAt: new Date().toISOString(), updatedByName: 'Datos de demostración' }, { merge: true });
  for (const p of PEOPLE) await upsertUser(p);

  const batch = db.batch();
  for (const pr of PROJECTS) {
    batch.set(db.doc(`projects/${pr.id}`), { name: pr.name, code: pr.code, client: pr.client, status: 'active', budget: pr.budget, expenses: 0, createdAt: daysAgo(60).toISOString() });
  }
  const field = PEOPLE.filter((p) => p.role === 'professional' && p.manager);
  for (const p of field) {
    const project = p.manager === 'demo-diego' ? 'demo-psa' : 'demo-sela';
    const pr = PROJECTS.find((x) => x.id === project);
    batch.set(db.doc(`allocations/demo-alloc-${p.uid}`), {
      userId: p.uid, userName: p.name, projectId: project, projectName: pr.name,
      amount: 800_000, date: daysAgo(40).toISOString(), createdAt: daysAgo(40).toISOString(), type: 'allocation',
    });
  }
  await batch.commit();

  // Expenses one by one so each triggers onExpenseCreated with its own flow.
  let n = 0;
  for (const [uid, projectId, ago, category, merchant, taxId, city, amount, status, extra = {}] of EXPENSES) {
    const person = PEOPLE.find((p) => p.uid === uid);
    const pr = PROJECTS.find((x) => x.id === projectId);
    const created = daysAgo(ago, 9 + (n % 8));
    const reviewer = status === 'pending' ? {} : { reviewedAt: daysAgo(Math.max(ago - 1, 0), 17).toISOString(), reviewedByUid: 'demo-rodrigo', reviewedByName: 'Rodrigo Pizarro' };
    await db.doc(`expenses/demo-exp-${String(++n).padStart(2, '0')}`).set({
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

  console.log(`  ${PEOPLE.length} people, ${PROJECTS.length} projects, ${EXPENSES.length + 1} expenses`);
  console.log('\nAccounts (all share the same password):');
  for (const p of PEOPLE) console.log(`  ${p.role.padEnd(12)} ${p.email}  — ${p.title}`);
  console.log(`\nPassword: ${password}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
