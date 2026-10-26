import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { TENANT_ID, nowIso, requireAuth } from './common';
import { readReceiptImagesWithGemini } from './extractReceipt';
import { notifyUser } from './notify';
import {
  aiMismatches,
  buildDictionary,
  compareFields,
  confirmedAmountLabel,
  issuerKey,
  learnedAmountLabel,
  mismatchSummary,
  nestDotted,
  readModeOf,
  statIncrements,
  storagePathFromUrl,
  type MerchantVote,
} from './offline.logic';

// Ola 8 — automated offline mode, server side.

const DICTIONARY_TTL_MS = 6 * 3_600_000;

/**
 * The tenant's merchant dictionary (tax id → most frequent merchant name and
 * category among approved expenses, plus the learned label of the total on
 * that issuer's receipts), cached in cache/merchantDictionary.
 */
export const getMerchantDictionary = onCall({ memory: '512MiB' }, async (req) => {
  requireAuth(req);
  const db = getFirestore();
  const ref = db.doc('cache/merchantDictionary');
  const cached = (await ref.get()).data();
  if (cached?.builtAt && Date.now() - new Date(cached.builtAt as string).getTime() < DICTIONARY_TTL_MS) {
    return { entries: cached.entries ?? {}, builtAt: cached.builtAt };
  }
  const snap = await db.collection('expenses').where('status', '==', 'approved').limit(5000).get();
  const votes: MerchantVote[] = [];
  snap.forEach((d) => {
    const e = d.data();
    if (typeof e.taxId === 'string' && typeof e.merchant === 'string') {
      votes.push({ taxId: e.taxId, merchant: e.merchant, category: typeof e.category === 'string' ? e.category : undefined });
    }
  });
  const entries: Record<string, { merchant?: string; category?: string; amountLabel?: string }> = buildDictionary(votes);
  const profiles = await db.collection('readerProfiles').limit(5000).get();
  profiles.forEach((d) => {
    const label = learnedAmountLabel(d.data().labels as Record<string, number> | undefined);
    if (label) entries[d.id] = { ...entries[d.id], amountLabel: label };
  });
  const builtAt = nowIso();
  await ref.set({ entries, builtAt, sourceCount: votes.length });
  return { entries, builtAt };
});

async function loadReceipt(url: string): Promise<{ data: string; mimeType: string } | null> {
  const path = storagePathFromUrl(url);
  if (!path) return null;
  const file = getStorage().bucket().file(path);
  const [[buffer], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  return { data: buffer.toString('base64'), mimeType: (meta.contentType as string) || 'image/jpeg' };
}

type Comparison = ReturnType<typeof compareFields>;

/** Gemini re-reads the photo of a read that filled the form; notifies on a mismatch. */
async function verifyWithGemini(
  expenseId: string,
  e: DocumentData,
  local: Record<string, unknown>,
  submitted: Record<string, unknown>,
): Promise<{ aiReview: Record<string, unknown>; aiVsSubmitted: Comparison | null; localVsAi: Comparison | null }> {
  try {
    const image = typeof e.receiptUrl === 'string' ? await loadReceipt(e.receiptUrl) : null;
    if (!image) return { aiReview: { status: 'no-image', checkedAt: nowIso() }, aiVsSubmitted: null, localVsAi: null };
    const ai = await readReceiptImagesWithGemini([image], []);
    const critical = ['amount', 'date', 'taxId', 'invoiceNumber'] as const;
    const mismatches = aiMismatches(ai, submitted);
    if (mismatches.length) {
      await notifyUser({
        toUid: e.userId,
        type: 'expense_review',
        title: 'Revisa tu rendición',
        body: `Al verificar la boleta${e.merchant ? ` de ${e.merchant}` : ''}, la IA leyó otro valor en ${mismatchSummary(mismatches)}.`,
        expenseId,
      }).catch((err) => logger.warn('notify failed', { error: String(err) }));
    }
    return {
      aiReview: { status: mismatches.length ? 'mismatch' : 'match', checkedAt: nowIso(), model: ai._model ?? null, mismatches },
      aiVsSubmitted: compareFields(ai, submitted, [...critical]),
      localVsAi: compareFields(local, ai, [...critical]),
    };
  } catch (err) {
    logger.warn('offline read verification failed', { expenseId, error: String(err) });
    return { aiReview: { status: 'error', checkedAt: nowIso() }, aiVsSubmitted: null, localVsAi: null };
  }
}

/**
 * Measures (and, for reads that filled the form, verifies) an expense whose
 * receipt was read on the device.
 * - offline / local-first: Gemini re-reads the photo and is compared with
 *   what the person submitted (aiReview, flagged on a mismatch in amount,
 *   date or tax id).
 * - shadow (Ola 8b): Gemini already filled the form (aiRead); no second call
 *   and no aiReview, only the three-way comparison.
 * Every read adds an anonymous ocrEval (no image, no values), daily counters
 * (ocrStats) and, when the OCR saw the confirmed total under one label, a
 * vote for that issuer (readerProfiles).
 */
export const verifyLocalRead = onDocumentCreated({ document: 'expenses/{expenseId}', memory: '512MiB', timeoutSeconds: 120 }, async (event) => {
  const snap = event.data;
  const e = snap?.data();
  if (!snap || !e?.localRead || e.aiReview) return;
  const db = getFirestore();
  const local = (e.localRead.values ?? {}) as Record<string, unknown>;
  const submitted: Record<string, unknown> = {
    amount: e.amount, date: e.date, taxId: e.taxId, invoiceNumber: e.invoiceNumber, category: e.category, merchant: e.merchant,
  };

  const mode = readModeOf(e.localRead);

  // 1. Accuracy of the on-device reader against the confirmed values.
  const localVsSubmitted = compareFields(local, submitted);

  // 2. Gemini: the read that filled the form (shadow) or a verification re-read.
  let aiReview: Record<string, unknown> | null = null;
  let aiVsSubmitted: Comparison | null = null;
  let localVsAi: Comparison | null = null;
  if (mode === 'shadow') {
    const aiValues = (e.aiRead?.values ?? null) as Record<string, unknown> | null;
    if (aiValues) {
      aiVsSubmitted = compareFields(aiValues, submitted);
      localVsAi = compareFields(local, aiValues);
    }
  } else {
    ({ aiReview, aiVsSubmitted, localVsAi } = await verifyWithGemini(snap.id, e, local, submitted));
  }

  const engine = typeof e.localRead.engine === 'string' ? e.localRead.engine : 'ocr';
  const createdAt = nowIso();
  const writes: Promise<unknown>[] = [
    db.collection('ocrEval').add({
      createdAt,
      tenantId: TENANT_ID.value(),
      mode,
      engine,
      readerVersion: typeof e.localRead.readerVersion === 'string' ? e.localRead.readerVersion : null,
      packVersion: typeof e.localRead.packVersion === 'string' ? e.localRead.packVersion : null,
      docType: e.localRead.docType ?? null,
      offline: mode === 'offline',
      durationMs: typeof e.localRead.durationMs === 'number' ? e.localRead.durationMs : null,
      confidence: e.localRead.confidence ?? {},
      localVsSubmitted,
      aiVsSubmitted,
      localVsAi,
      aiStatus: aiReview?.status ?? null,
    }),
    db.doc(`ocrStats/${createdAt.slice(0, 10)}`).set(
      { date: createdAt.slice(0, 10), ...nestDotted(
        statIncrements(mode, engine, localVsSubmitted, aiVsSubmitted, {
          durationMs: typeof e.localRead.durationMs === 'number' ? e.localRead.durationMs : null,
          aiMismatch: aiReview?.status === 'mismatch',
        }),
        (n) => FieldValue.increment(n),
      ) },
      { merge: true },
    ),
  ];
  if (aiReview) writes.push(snap.ref.update({ aiReview }));

  // Learning per issuer: which label carried the confirmed total.
  const key = issuerKey(e.taxId);
  const label = key ? confirmedAmountLabel(e.localRead.amountCandidates, e.amount) : null;
  if (key && label) {
    writes.push(db.doc(`readerProfiles/${key}`).set({ labels: { [label]: FieldValue.increment(1) }, updatedAt: createdAt }, { merge: true }));
  }
  await Promise.all(writes);
});
