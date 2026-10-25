// Seeds the local Firebase Emulator Suite with test accounts and sample data.
// Refuses to run against anything but the emulators: both *_EMULATOR_HOST
// variables are forced here, before firebase-admin is imported.
//
// Usage: npm run emulators   (in another terminal)
//        npm run seed:emu [-- --project spi-smart-expense]

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';

const { initializeApp } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');

const projectArg = process.argv.indexOf('--project');
const projectId = projectArg > -1 ? process.argv[projectArg + 1] : 'spi-smart-expense';

for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
    console.error(`Refusing to seed: ${host} is not a local emulator host`);
    process.exit(1);
  }
}

initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();

// Test credentials — emulator only. Never create these in a real project.
export const TEST_PASSWORD = 'Prueba2026!';
export const TEST_USERS = [
  {
    uid: 'test-admin',
    email: 'admin.prueba@expensebuddy.test',
    displayName: 'Ana Admin',
    role: 'admin',
    permissions: { isColombiaApprover: true },
  },
  {
    uid: 'test-professional',
    email: 'profesional.prueba@expensebuddy.test',
    displayName: 'Pablo Profesional',
    role: 'professional',
  },
  {
    uid: 'test-assistant',
    email: 'asistente.prueba@expensebuddy.test',
    displayName: 'Sofía Asistente',
    role: 'assistant',
  },
];

const PROJECTS = [
  { id: 'proj-feria-bogota', name: 'Feria Bogotá 2026', code: 'FB-26', client: 'Cliente Demo', budget: 15000000 },
  { id: 'proj-mision-miami', name: 'Misión Comercial Miami', code: 'MM-26', client: 'Cliente Demo', budget: 8000000 },
];

const now = new Date();
const iso = (daysAgo, hour = 10) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const ymd = (daysAgo) => iso(daysAgo).slice(0, 10);

const baseExpense = {
  time: null,
  taxId: null,
  invoiceNumber: null,
  city: 'Bogotá',
  address: null,
  phone: null,
  cardBrand: null,
  cardCompany: null,
  cardLast4: null,
  receiptUrl: null,
  voucherUrl: null,
  isCompanyExpense: false,
  splitGroupId: null,
  trm: null,
  amountCOP: null,
  trmSource: null,
};

const EXPENSES = [
  {
    id: 'exp-pending-1',
    userId: 'test-professional',
    userName: 'Pablo Profesional',
    projectId: 'proj-feria-bogota',
    projectName: 'Feria Bogotá 2026',
    eventName: 'FERIA BOGOTÁ 2026',
    category: 'RESTAURANTE - ALIMENTACION',
    date: ymd(1),
    merchant: 'Restaurante La Puerta Falsa',
    description: 'Almuerzo con cliente',
    amount: 185000,
    currency: 'COP',
    paymentMethod: 'Credit Card',
    cardBrand: 'visa',
    cardLast4: '4242',
    status: 'pending',
    createdAt: iso(1),
  },
  {
    id: 'exp-pending-2',
    userId: 'test-professional',
    userName: 'Pablo Profesional',
    projectId: 'proj-mision-miami',
    projectName: 'Misión Comercial Miami',
    eventName: 'MISIÓN MIAMI',
    category: 'TRANSPORTE TERRESTRE',
    date: ymd(3),
    city: 'Miami',
    merchant: 'Uber',
    description: 'Aeropuerto a hotel',
    amount: 42.5,
    currency: 'USD',
    paymentMethod: 'Wallet',
    status: 'pending',
    createdAt: iso(3),
    trm: 4100,
    amountCOP: 174250,
    trmSource: 'seed',
  },
  {
    id: 'exp-approved-1',
    userId: 'test-professional',
    userName: 'Pablo Profesional',
    projectId: 'proj-feria-bogota',
    projectName: 'Feria Bogotá 2026',
    eventName: 'FERIA BOGOTÁ 2026',
    category: 'HOTEL',
    date: ymd(12),
    merchant: 'Hotel Tequendama',
    description: 'Dos noches feria',
    amount: 620000,
    currency: 'COP',
    paymentMethod: 'Credit Card',
    cardBrand: 'mastercard',
    cardLast4: '1881',
    status: 'approved',
    createdAt: iso(12),
  },
  {
    id: 'exp-rejected-1',
    userId: 'test-professional',
    userName: 'Pablo Profesional',
    projectId: 'proj-feria-bogota',
    projectName: 'Feria Bogotá 2026',
    eventName: 'FERIA BOGOTÁ 2026',
    category: 'VARIOS',
    date: ymd(20),
    merchant: 'Papelería Central',
    description: 'Material sin soporte',
    amount: 35000,
    currency: 'COP',
    paymentMethod: 'Cash',
    status: 'rejected',
    rejectionReason: 'Falta el recibo legible',
    createdAt: iso(20),
  },
  {
    id: 'exp-stale-pending',
    userId: 'test-assistant',
    userName: 'Sofía Asistente',
    projectId: 'proj-mision-miami',
    projectName: 'Misión Comercial Miami',
    eventName: 'MISIÓN MIAMI',
    category: 'TRANSPORTE AEREO',
    date: ymd(30),
    merchant: 'Avianca',
    description: 'Tiquete BOG-MIA',
    amount: 1850000,
    currency: 'COP',
    paymentMethod: 'Transfer',
    status: 'pending',
    createdAt: iso(30),
  },
];

async function upsertAuthUser(u) {
  try {
    await auth.getUser(u.uid);
    await auth.updateUser(u.uid, { email: u.email, password: TEST_PASSWORD, displayName: u.displayName });
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    await auth.createUser({ uid: u.uid, email: u.email, password: TEST_PASSWORD, displayName: u.displayName, emailVerified: true });
  }
}

async function main() {
  console.log(`Seeding emulators for project "${projectId}"…`);

  for (const u of TEST_USERS) {
    await upsertAuthUser(u);
    const { uid, email, displayName, role, permissions } = u;
    await db.doc(`users/${uid}`).set(
      { uid, email, displayName, role, balance: 0, ...(permissions ? { permissions } : {}) },
      { merge: true },
    );
  }

  const batch = db.batch();
  for (const p of PROJECTS) {
    batch.set(db.doc(`projects/${p.id}`), {
      name: p.name,
      code: p.code,
      client: p.client,
      status: 'active',
      budget: p.budget,
      expenses: 0,
      createdAt: iso(60),
    });
    batch.set(db.doc(`allocations/alloc-${p.id}-professional`), {
      userId: 'test-professional',
      userName: 'Pablo Profesional',
      projectId: p.id,
      projectName: p.name,
      amount: Math.round(p.budget * 0.2),
      date: iso(45),
      createdAt: iso(45),
      type: 'allocation',
    });
  }
  for (const e of EXPENSES) {
    const { id, ...data } = e;
    batch.set(db.doc(`expenses/${id}`), { ...baseExpense, ...data });
  }
  await batch.commit();

  // Pending reimbursements credit the professional's balance on submission.
  const pendingBalance = EXPENSES.filter((e) => e.userId === 'test-professional' && e.status !== 'rejected' && e.currency === 'COP')
    .reduce((sum, e) => sum + e.amount, 0);
  await db.doc('users/test-professional').set({ balance: pendingBalance }, { merge: true });

  console.log(`Users: ${TEST_USERS.map((u) => u.email).join(', ')}`);
  console.log(`Password for all test users: ${TEST_PASSWORD}`);
  console.log(`Projects: ${PROJECTS.length}, expenses: ${EXPENSES.length}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
