import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { TENANT_ID, nowIso, requireAuth } from './common';
import { readReceiptImagesWithGemini } from './extractReceipt';
import { notifyUser } from './notify';
import { aiMismatches, buildDictionary, compareFields, mismatchSummary, storagePathFromUrl, type MerchantVote } from './offline.logic';

// Ola 8 — automated offline mode, server side.

const DICTIONARY_TTL_MS = 6 * 3_600_000;

/**
 * The tenant's merchant dictionary (tax id → most frequent merchant name and
 * category among approved expenses), cached in cache/merchantDictionary.
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
  const entries = buildDictionary(votes);
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

/**
 * Verifies an expense whose receipt was read on the device: Gemini re-reads
 * the photo and is compared with what the person submitted (flagged on a
 * mismatch in amount, date or tax id); the local read is compared with the
 * submitted values to measure the on-device reader (ocrEval, anonymous: no
 * image, no values).
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

  // 1. Accuracy of the on-device reader against the confirmed values.
  const localVsSubmitted = compareFields(local, submitted);

  // 2. Gemini verification of the submitted values.
  let aiReview: Record<string, unknown> = { status: 'skipped', checkedAt: nowIso() };
  let aiVsSubmitted: ReturnType<typeof compareFields> | null = null;
  try {
    const image = typeof e.receiptUrl === 'string' ? await loadReceipt(e.receiptUrl) : null;
    if (image) {
      const ai = await readReceiptImagesWithGemini([image], []);
      aiVsSubmitted = compareFields(ai, submitted, ['amount', 'date', 'taxId', 'invoiceNumber']);
      const mismatches = aiMismatches(ai, submitted);
      aiReview = {
        status: mismatches.length ? 'mismatch' : 'match',
        checkedAt: nowIso(),
        model: ai._model ?? null,
        mismatches,
      };
      if (mismatches.length) {
        await notifyUser({
          toUid: e.userId,
          type: 'expense_review',
          title: 'Revisa tu rendición',
          body: `Al verificar la boleta${e.merchant ? ` de ${e.merchant}` : ''}, la IA leyó otro valor en ${mismatchSummary(mismatches)}.`,
          expenseId: snap.id,
        }).catch((err) => logger.warn('notify failed', { error: String(err) }));
      }
    } else {
      aiReview = { status: 'no-image', checkedAt: nowIso() };
    }
  } catch (err) {
    logger.warn('offline read verification failed', { expenseId: snap.id, error: String(err) });
    aiReview = { status: 'error', checkedAt: nowIso() };
  }

  await snap.ref.update({ aiReview });
  await db.collection('ocrEval').add({
    createdAt: nowIso(),
    tenantId: TENANT_ID.value(),
    engine: e.localRead.engine ?? 'ocr',
    docType: e.localRead.docType ?? null,
    offline: e.localRead.offline === true,
    durationMs: typeof e.localRead.durationMs === 'number' ? e.localRead.durationMs : null,
    confidence: e.localRead.confidence ?? {},
    localVsSubmitted,
    aiVsSubmitted,
    aiStatus: aiReview.status,
  });
});
