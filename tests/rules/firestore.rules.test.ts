import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc, query, where } from 'firebase/firestore';

// Runs against the Firestore emulator: `npm run test:rules`.
const PROJECT_ID = 'rules-test-expense-buddy';
let env: RulesTestEnvironment;

const PRO = 'pro-1';
const OTHER = 'pro-2';
const ADMIN = 'admin-1';
const ASSISTANT = 'assistant-1';
const APPROVER_USD = 'approver-usd';
const APPROVER_COP = 'approver-cop';

const ctx = (uid: string, claims: Record<string, unknown>) => env.authenticatedContext(uid, claims).firestore();
const pro = () => ctx(PRO, { role: 'professional' });
const other = () => ctx(OTHER, { role: 'professional' });
const admin = () => ctx(ADMIN, { role: 'admin', canApprove: true, canDelete: true, canExport: true });
const assistant = () => ctx(ASSISTANT, { role: 'assistant' });
const approverUsd = () => ctx(APPROVER_USD, { role: 'professional', canApprove: true });
const approverCop = () => ctx(APPROVER_COP, { role: 'professional', isColombiaApprover: true });
const inactive = () => ctx(PRO, { role: 'professional', active: false });

const expense = (overrides: Record<string, unknown> = {}) => ({
  userId: PRO,
  userName: 'Pro',
  projectId: 'p1',
  projectName: 'P1',
  eventName: 'EVENTO',
  category: 'VARIOS',
  date: '2026-10-01',
  merchant: 'Tienda',
  description: 'x',
  amount: 1000,
  currency: 'COP',
  status: 'pending',
  createdAt: '2026-10-01T10:00:00.000Z',
  isCompanyExpense: false,
  ...overrides,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_PORT || 8080),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users', PRO), { uid: PRO, email: 'pro@test', displayName: 'Pro', role: 'professional', balance: 0 });
    await setDoc(doc(db, 'users', ADMIN), { uid: ADMIN, email: 'admin@test', displayName: 'Admin', role: 'admin', balance: 0 });
    await setDoc(doc(db, 'projects', 'p1'), { name: 'P1', budget: 100, expenses: 0, status: 'active', createdAt: 'x' });
    await setDoc(doc(db, 'expenses', 'own-pending'), expense());
    await setDoc(doc(db, 'expenses', 'own-approved'), expense({ status: 'approved' }));
    await setDoc(doc(db, 'expenses', 'other-usd'), expense({ userId: OTHER, currency: 'USD', amount: 10 }));
    await setDoc(doc(db, 'notifications', 'n1'), { toUid: PRO, type: 't', title: 'T', body: '', expenseId: null, read: false, createdAt: 'x' });
    await setDoc(doc(db, 'rateLimits', 'r1'), { count: 1 });
  });
});

describe('expenses — professional', () => {
  it('reads own expenses but not others', async () => {
    await assertSucceeds(getDoc(doc(pro(), 'expenses', 'own-pending')));
    await assertFails(getDoc(doc(pro(), 'expenses', 'other-usd')));
    await assertSucceeds(getDocs(query(collection(pro(), 'expenses'), where('userId', '==', PRO))));
    await assertFails(getDocs(collection(pro(), 'expenses')));
  });

  it('creates a valid pending expense for itself only', async () => {
    await assertSucceeds(setDoc(doc(pro(), 'expenses', 'new-1'), expense()));
    await assertFails(setDoc(doc(pro(), 'expenses', 'new-2'), expense({ userId: OTHER })));
    await assertFails(setDoc(doc(pro(), 'expenses', 'new-3'), expense({ status: 'approved' })));
    await assertFails(setDoc(doc(pro(), 'expenses', 'new-4'), expense({ amount: 0 })));
    await assertFails(setDoc(doc(pro(), 'expenses', 'new-5'), expense({ amount: '100' })));
    await assertFails(setDoc(doc(pro(), 'expenses', 'new-6'), expense({ currency: 'XXX' })));
  });

  it('edits own pending expense but never its status, owner or approved docs', async () => {
    await assertSucceeds(updateDoc(doc(pro(), 'expenses', 'own-pending'), { amount: 2000, merchant: 'Otra' }));
    await assertFails(updateDoc(doc(pro(), 'expenses', 'own-pending'), { status: 'approved' }));
    await assertFails(updateDoc(doc(pro(), 'expenses', 'own-pending'), { userId: OTHER }));
    await assertFails(updateDoc(doc(pro(), 'expenses', 'own-approved'), { amount: 5 }));
    await assertFails(updateDoc(doc(pro(), 'expenses', 'other-usd'), { amount: 5 }));
  });

  it('deletes own pending expense only', async () => {
    await assertSucceeds(deleteDoc(doc(pro(), 'expenses', 'own-pending')));
    await assertFails(deleteDoc(doc(pro(), 'expenses', 'own-approved')));
    await assertFails(deleteDoc(doc(pro(), 'expenses', 'other-usd')));
  });

  it('is locked out when the active claim is false', async () => {
    await assertFails(getDoc(doc(inactive(), 'expenses', 'own-pending')));
    await assertFails(getDoc(doc(inactive(), 'users', PRO)));
  });
});

describe('expenses — assistant, approvers, admin', () => {
  it('assistant creates on behalf of others but cannot read them afterwards', async () => {
    await assertSucceeds(setDoc(doc(assistant(), 'expenses', 'a-1'), expense({ userId: OTHER })));
    await assertFails(getDoc(doc(assistant(), 'expenses', 'other-usd')));
  });

  it('USD approver reads/edits USD but not COP; COP approver the opposite', async () => {
    await assertSucceeds(getDoc(doc(approverUsd(), 'expenses', 'other-usd')));
    await assertFails(getDoc(doc(approverUsd(), 'expenses', 'own-pending')));
    await assertSucceeds(updateDoc(doc(approverUsd(), 'expenses', 'other-usd'), { merchant: 'Edit' }));
    await assertFails(updateDoc(doc(approverUsd(), 'expenses', 'own-pending'), { merchant: 'Edit' }));

    await assertSucceeds(getDoc(doc(approverCop(), 'expenses', 'own-pending')));
    await assertFails(getDoc(doc(approverCop(), 'expenses', 'other-usd')));
  });

  it('nobody changes status from the client, not even admin', async () => {
    await assertFails(updateDoc(doc(admin(), 'expenses', 'own-pending'), { status: 'approved' }));
    await assertFails(updateDoc(doc(approverCop(), 'expenses', 'own-pending'), { status: 'rejected' }));
  });

  it('admin reads and edits anything but deletes only through the callable', async () => {
    await assertSucceeds(getDocs(collection(admin(), 'expenses')));
    await assertSucceeds(updateDoc(doc(admin(), 'expenses', 'own-approved'), { amount: 999, merchant: 'Admin edit' }));
    await assertFails(deleteDoc(doc(admin(), 'expenses', 'own-approved')));
  });

  it('movements are append-only and stamped with the author', async () => {
    const ref = doc(admin(), 'expenses', 'own-pending', 'movements', 'm1');
    await assertSucceeds(setDoc(ref, { field: 'merchant', from: 'a', to: 'b', byUid: ADMIN, byName: 'Admin', at: 'x' }));
    await assertFails(setDoc(doc(admin(), 'expenses', 'own-pending', 'movements', 'm2'), { field: 'x', byUid: PRO, at: 'x' }));
    await assertFails(updateDoc(ref, { to: 'c' }));
    await assertFails(deleteDoc(ref));
  });
});

describe('users', () => {
  it('self-registers only as a zero-balance professional', async () => {
    const newbie = ctx('new-1', {});
    await assertSucceeds(setDoc(doc(newbie, 'users', 'new-1'), { uid: 'new-1', email: 'n@test', displayName: 'N', role: 'professional', balance: 0 }));
    await assertFails(setDoc(doc(ctx('new-2', {}), 'users', 'new-2'), { uid: 'new-2', email: 'n@test', displayName: 'N', role: 'admin', balance: 0 }));
    await assertFails(setDoc(doc(ctx('new-3', {}), 'users', 'new-3'), { uid: 'new-3', email: 'n@test', displayName: 'N', role: 'professional', balance: 500 }));
    await assertFails(setDoc(doc(ctx('new-4', {}), 'users', 'new-4'), { uid: 'new-4', role: 'professional', balance: 0, permissions: { canApprove: true } }));
  });

  it('users edit their profile but not role, permissions or balance', async () => {
    await assertSucceeds(updateDoc(doc(pro(), 'users', PRO), { displayName: 'Nuevo nombre', forcePasswordChange: false }));
    await assertFails(updateDoc(doc(pro(), 'users', PRO), { role: 'admin' }));
    await assertFails(updateDoc(doc(pro(), 'users', PRO), { balance: 1000000 }));
    await assertFails(updateDoc(doc(pro(), 'users', PRO), { permissions: { canApprove: true } }));
    await assertFails(updateDoc(doc(pro(), 'users', ADMIN), { displayName: 'x' }));
  });

  it('only superadmins change privileges, never their own', async () => {
    const superadmin = () => ctx('super-1', { role: 'superadmin', canApprove: true });
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'users', 'super-1'), { uid: 'super-1', role: 'superadmin', balance: 0 });
    });
    await assertFails(updateDoc(doc(admin(), 'users', PRO), { role: 'assistant' }));
    await assertFails(updateDoc(doc(admin(), 'users', PRO), { permissions: { canApprove: true } }));
    await assertFails(updateDoc(doc(admin(), 'users', PRO), { active: false }));
    await assertSucceeds(updateDoc(doc(superadmin(), 'users', PRO), { role: 'assistant', active: false, managerUid: ADMIN }));
    await assertFails(updateDoc(doc(superadmin(), 'users', 'super-1'), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(superadmin(), 'users', 'super-1'), { displayName: 'Edmundo' }));
    await assertFails(deleteDoc(doc(admin(), 'users', PRO)));
  });

  it('settings: everyone active reads, only superadmin writes', async () => {
    const superadmin = () => ctx('super-1', { role: 'superadmin' });
    await assertSucceeds(setDoc(doc(superadmin(), 'settings', 'tenant'), { security: { pinEnabled: true } }));
    await assertSucceeds(getDoc(doc(pro(), 'settings', 'tenant')));
    await assertFails(setDoc(doc(admin(), 'settings', 'tenant'), { security: { pinEnabled: false } }));
    await assertFails(getDoc(doc(inactive(), 'settings', 'tenant')));
  });

  it('admin edits non-privilege user fields, projects may not have their totals edited', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'users', PRO), { balance: 10 }));
    await assertSucceeds(updateDoc(doc(admin(), 'projects', 'p1'), { budget: 500 }));
    await assertFails(updateDoc(doc(admin(), 'projects', 'p1'), { expenses: 500 }));
    await assertFails(updateDoc(doc(pro(), 'projects', 'p1'), { budget: 500 }));
  });
});

describe('notifications and server-only collections', () => {
  it('recipient reads and marks as read; others cannot', async () => {
    await assertSucceeds(getDoc(doc(pro(), 'notifications', 'n1')));
    await assertSucceeds(updateDoc(doc(pro(), 'notifications', 'n1'), { read: true }));
    await assertFails(updateDoc(doc(pro(), 'notifications', 'n1'), { title: 'hack' }));
    await assertFails(getDoc(doc(other(), 'notifications', 'n1')));
    await assertFails(deleteDoc(doc(pro(), 'notifications', 'n1')));
  });

  it('rateLimits, aggregateLedger, userPins and pinLog are invisible even to admins', async () => {
    const superadmin = () => ctx('super-1', { role: 'superadmin' });
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'userPins', PRO), { hash: 'x', salt: 'y' });
    });
    await assertFails(getDoc(doc(admin(), 'rateLimits', 'r1')));
    await assertFails(setDoc(doc(admin(), 'aggregateLedger', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(pro(), 'userPins', PRO)));
    await assertFails(getDoc(doc(superadmin(), 'userPins', PRO)));
    await assertFails(setDoc(doc(pro(), 'userPins', PRO), { hash: 'mine' }));
    await assertFails(getDocs(collection(superadmin(), 'pinLog')));
  });

  it('users cannot grant themselves PIN state', async () => {
    await assertFails(updateDoc(doc(pro(), 'users', PRO), { hasPin: true }));
  });
});

describe('approval flow (Ola 5)', () => {
  it('lets the current approver read, and nobody forge the flow', async () => {
    const boss = () => ctx('boss-1', { role: 'professional' });
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'expenses', 'flow-1'), expense({ pendingApproverUids: ['boss-1'], approvalFlow: { currentStep: 0, steps: [] } }));
    });
    await assertSucceeds(getDoc(doc(boss(), 'expenses', 'flow-1')));
    await assertFails(getDoc(doc(boss(), 'expenses', 'own-pending')));
    await assertSucceeds(getDocs(query(collection(boss(), 'expenses'), where('pendingApproverUids', 'array-contains', 'boss-1'))));
    await assertFails(setDoc(doc(pro(), 'expenses', 'forged'), expense({ pendingApproverUids: ['pro-1'] })));
    await assertFails(updateDoc(doc(pro(), 'expenses', 'flow-1'), { pendingApproverUids: [] }));
    await assertFails(updateDoc(doc(admin(), 'expenses', 'flow-1'), { approvalFlow: { currentStep: 1, steps: [] } }));
  });

  it('users manage their own email preference; mailQueue is server-only', async () => {
    await assertSucceeds(updateDoc(doc(pro(), 'users', PRO), { notificationPrefs: { email: false } }));
    await assertFails(getDocs(collection(admin(), 'mailQueue')));
  });
});
