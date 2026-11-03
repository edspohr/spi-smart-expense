import { createHash } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type WriteBatch } from 'firebase-admin/firestore';
import { BASE_CURRENCY, isAdminRole, nowIso, requireAuth } from './common';
import { requirePinFor } from './pin';
import { buildJournals, parseAccountingSettings, type AccountingExpense, type ProjectRef } from './accounting.logic';
import { CONNECTORS, isConnectorId } from './accounting.connectors';

// Ola 11 (ADR 0018): the only writer of accountingExports/{id} and of
// expenses.accountingExport. Rebuilds the journals on the server with the
// same pure builder the preview uses, refuses while any expense in the
// selection is blocked, and records exactly what left and when.

const MAX_EXPENSES = 2000;
const MAX_STORED_FILE = 900_000; // bytes; a Firestore doc holds up to 1 MiB
const BATCH_OPS = 450;

const isoDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const buildAccountingExport = onCall({ memory: '512MiB', timeoutSeconds: 120 }, async (req) => {
  const { claims, actor } = requireAuth(req);
  if (!isAdminRole(claims.role)) throw new HttpsError('permission-denied', 'Solo administradores pueden exportar a contabilidad.');

  const input = req.data ?? {};
  if (!isConnectorId(input.connector)) throw new HttpsError('invalid-argument', 'Formato de exportación no válido.');
  if (!isoDate(input.from) || !isoDate(input.to) || input.from > input.to) {
    throw new HttpsError('invalid-argument', 'El período no es válido.');
  }
  const from = input.from as string;
  const to = input.to as string;
  const includeExported = input.includeExported === true;
  const projectIds = Array.isArray(input.projectIds)
    ? input.projectIds.filter((p: unknown): p is string => typeof p === 'string').slice(0, 30)
    : [];

  const db = getFirestore();
  const settings = (await db.doc('settings/tenant').get()).data() ?? {};
  if (settings.modules?.accounting !== true) {
    throw new HttpsError('failed-precondition', 'El módulo de contabilidad está desactivado.');
  }
  await requirePinFor(req, 'export', { ref: `accounting:${from}..${to}` });

  const snap = await db.collection('expenses')
    .where('status', '==', 'approved')
    .where('date', '>=', from)
    .where('date', '<=', to)
    .get();
  const expenses = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as AccountingExpense)
    .filter((e) => !projectIds.length || projectIds.includes(e.projectId as string))
    .filter((e) => includeExported || !e.accountingExport);
  if (!expenses.length) throw new HttpsError('failed-precondition', 'No hay rendiciones aprobadas por exportar en ese período.');
  if (expenses.length > MAX_EXPENSES) {
    throw new HttpsError('failed-precondition', `Son más de ${MAX_EXPENSES} rendiciones: acota el período.`);
  }

  const projects: Record<string, ProjectRef> = {};
  for (const p of (await db.collection('projects').get()).docs) {
    projects[p.id] = { code: p.data().code ?? null, name: p.data().name ?? null };
  }
  const baseCurrency = BASE_CURRENCY.value();
  const batch = buildJournals(expenses, parseAccountingSettings(settings.accounting), { baseCurrency, projects });
  if (batch.blocked.length) {
    throw new HttpsError('failed-precondition', `${batch.blocked.length} rendiciones no se pueden contabilizar todavía. Revisa la vista previa.`);
  }

  const runRef = db.collection('accountingExports').doc();
  const connector = CONNECTORS[input.connector as keyof typeof CONNECTORS];
  const files = connector.build(batch.ready, { exportId: runRef.id, from, to });
  const fileHash = createHash('sha256').update(files.map((f) => `${f.name}\n${f.content}`).join('\n')).digest('hex');
  const at = nowIso();
  const expenseIds = batch.ready.map((j) => j.expenseId);
  const fileMeta = files.map((f) => ({ name: f.name, mimeType: f.mimeType, bytes: Buffer.byteLength(f.content, 'utf8') }));

  const batches: WriteBatch[] = [db.batch()];
  let ops = 0;
  const write = (fn: (b: WriteBatch) => void) => {
    if (ops >= BATCH_OPS) { batches.push(db.batch()); ops = 0; }
    fn(batches[batches.length - 1]!);
    ops += 1;
  };

  write((b) => b.set(runRef, {
    createdAt: at,
    createdByUid: actor.uid,
    createdByName: actor.name,
    connector: connector.id,
    filters: { from, to, includeExported, projectIds },
    expenseIds,
    count: expenseIds.length,
    reExported: batch.ready.filter((j) => j.warnings.includes('already_exported')).length,
    totalBase: batch.totals.debit,
    currency: baseCurrency,
    fileHash,
    files: fileMeta.map((m) => ({ ...m, stored: m.bytes <= MAX_STORED_FILE })),
  }));
  files.forEach((f, i) => {
    if (fileMeta[i]!.bytes <= MAX_STORED_FILE) write((b) => b.set(runRef.collection('files').doc(String(i)), f));
  });
  for (const j of batch.ready) {
    const ref = db.doc(`expenses/${j.expenseId}`);
    write((b) => b.update(ref, { accountingExport: { exportId: runRef.id, exportedAt: at, connector: connector.id } }));
    write((b) => b.set(ref.collection('movements').doc(), {
      action: 'exported', field: 'accountingExport', from: null, to: runRef.id, byUid: actor.uid, byName: actor.name, at, comment: null,
    }));
  }
  // Batches commit in order; the run record goes first so a partial failure
  // still leaves a trace of which expenses were meant to be stamped.
  for (const b of batches) await b.commit();

  logger.info('accounting export', { exportId: runRef.id, connector: connector.id, count: expenseIds.length });
  return { exportId: runRef.id, files, count: expenseIds.length, total: batch.totals.debit, currency: baseCurrency };
});
