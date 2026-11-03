// Ola 11: client side of the accounting export. The preview runs the same
// pure builder as the server (functions/src/accounting.logic.ts); the export
// itself, its run record and the stamps on each expense are server-only.

import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { callFunction } from './functions';
import { withPin } from './pin';
import type { AccountingExpense, ProjectRef } from '../../functions/src/accounting.logic';
import type { ConnectorId, ExportFile } from '../../functions/src/accounting.connectors';

export interface ExportRequest {
  connector: ConnectorId;
  from: string;
  to: string;
  includeExported: boolean;
  projectIds: string[];
}

export interface ExportResult {
  exportId: string;
  files: ExportFile[];
  count: number;
  total: number;
  currency: string;
}

export interface ExportRun {
  id: string;
  createdAt: string;
  createdByName: string;
  connector: ConnectorId;
  filters: { from: string; to: string; includeExported: boolean; projectIds: string[] };
  count: number;
  reExported: number;
  totalBase: number;
  currency: string;
  fileHash: string;
  files: { name: string; mimeType: string; bytes: number; stored: boolean }[];
}

function requireDb() {
  if (!db) throw new Error('Firebase no está configurado.');
  return db;
}

/** Approved expenses in the period (same query and index as the callable). */
export async function loadApprovedExpenses(from: string, to: string): Promise<AccountingExpense[]> {
  const snap = await getDocs(query(
    collection(requireDb(), 'expenses'),
    where('status', '==', 'approved'),
    where('date', '>=', from),
    where('date', '<=', to),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AccountingExpense);
}

export async function loadProjects(): Promise<Record<string, ProjectRef & { label: string }>> {
  const snap = await getDocs(collection(requireDb(), 'projects'));
  return Object.fromEntries(snap.docs.map((d) => {
    const { code = null, name = null } = d.data() as { code?: string; name?: string };
    return [d.id, { code, name, label: [code, name].filter(Boolean).join(' · ') || d.id }];
  }));
}

export function runAccountingExport(req: ExportRequest): Promise<ExportResult> {
  return withPin('exportar a contabilidad', (pin) =>
    callFunction<ExportRequest & { pin?: string }, ExportResult>('buildAccountingExport', { ...req, ...(pin ? { pin } : {}) }));
}

export async function listExportRuns(max = 20): Promise<ExportRun[]> {
  const snap = await getDocs(query(collection(requireDb(), 'accountingExports'), orderBy('createdAt', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExportRun);
}

/** Files of a past run, as stored by the server (files over ~900 KB are not kept). */
export async function loadRunFiles(run: ExportRun): Promise<ExportFile[]> {
  const out: ExportFile[] = [];
  for (let i = 0; i < run.files.length; i++) {
    if (!run.files[i]!.stored) continue;
    const snap = await getDoc(doc(requireDb(), 'accountingExports', run.id, 'files', String(i)));
    if (snap.exists()) out.push(snap.data() as ExportFile);
  }
  return out;
}

export function downloadFiles(files: ExportFile[]): void {
  for (const f of files) {
    const url = URL.createObjectURL(new Blob([f.content], { type: f.mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
