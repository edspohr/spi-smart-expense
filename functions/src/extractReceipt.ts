import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { GoogleGenAI, type Part } from '@google/genai';
import { COUNTRY, GEMINI_DAILY_LIMIT_TENANT, GEMINI_DAILY_LIMIT_USER, TENANT_ID, nowIso, requireAuth } from './common';
import { buildReceiptPrompt, isTransientGeminiError, postProcessExtraction } from './gemini.logic';

// Gemini is called through Vertex AI: the Functions service account
// authenticates with IAM (roles/aiplatform.user), so there is no API key to
// store, rotate or leak, and receipts stay inside the tenant's GCP project.
// `global` is where new Gemini models ship first; regional endpoints
// (us-central1, europe-west1...) lag and 404 on newer ids. Set per tenant
// when data residency requires a region (validate with `npm run vertex:check`).
const VERTEX_LOCATION = defineString('VERTEX_LOCATION', { default: 'global' });

export const PRIMARY_MODEL = 'gemini-3.6-flash';
export const FALLBACK_MODEL = 'gemini-3.5-flash-lite';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']);
const MAX_IMAGE_BASE64 = 6 * 1024 * 1024; // ~4.5 MB binary; client compresses to far less

interface ImageInput {
  data: string;
  mimeType: string;
}

function vertexClient(): GoogleGenAI {
  const project = getApp().options.projectId ?? process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new HttpsError('failed-precondition', 'No se pudo determinar el proyecto de GCP.');
  return new GoogleGenAI({ vertexai: true, project, location: VERTEX_LOCATION.value() });
}

function parseImages(raw: unknown): ImageInput[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 2) {
    throw new HttpsError('invalid-argument', 'Envía una o dos imágenes.');
  }
  return raw.map((img) => {
    const data = img?.data;
    const mimeType = img?.mimeType;
    if (typeof data !== 'string' || typeof mimeType !== 'string' || !ALLOWED_MIME.has(mimeType)) {
      throw new HttpsError('invalid-argument', 'Formato de imagen no soportado.');
    }
    if (data.length > MAX_IMAGE_BASE64) {
      throw new HttpsError('invalid-argument', 'La imagen es demasiado grande (máx. 4 MB).');
    }
    return { data, mimeType };
  });
}

// Daily counters per user and per tenant in a single transaction. Document
// ids embed the date so old counters are cheap to purge.
async function consumeQuota(uid: string) {
  const db = getFirestore();
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const userRef = db.doc(`rateLimits/${day}_user_${uid}`);
  const tenantRef = db.doc(`rateLimits/${day}_tenant_${TENANT_ID.value()}`);
  // Superadmins tune limits at runtime in settings/tenant; params are the default.
  const ai = (await db.doc('settings/tenant').get()).data()?.ai ?? {};
  const userLimit = Number.isInteger(ai.dailyLimitUser) ? (ai.dailyLimitUser as number) : GEMINI_DAILY_LIMIT_USER.value();
  const tenantLimit = Number.isInteger(ai.dailyLimitTenant) ? (ai.dailyLimitTenant as number) : GEMINI_DAILY_LIMIT_TENANT.value();

  await db.runTransaction(async (tx) => {
    const [u, t] = await Promise.all([tx.get(userRef), tx.get(tenantRef)]);
    const userCount = (u.data()?.count as number | undefined) ?? 0;
    const tenantCount = (t.data()?.count as number | undefined) ?? 0;
    if (userCount >= userLimit) {
      throw new HttpsError(
        'resource-exhausted',
        `Alcanzaste el límite diario de ${userLimit} lecturas con IA. Puedes ingresar el gasto manualmente.`,
      );
    }
    if (tenantCount >= tenantLimit) {
      throw new HttpsError('resource-exhausted', 'La organización alcanzó su límite diario de lecturas con IA. Ingresa el gasto manualmente.');
    }
    const stamp = { count: FieldValue.increment(1), lastAt: nowIso(), day };
    tx.set(userRef, { ...stamp, uid, kind: 'user' }, { merge: true });
    tx.set(tenantRef, { ...stamp, tenantId: TENANT_ID.value(), kind: 'tenant' }, { merge: true });
  });
}

async function generateWithFallback(ai: GoogleGenAI, parts: Part[]) {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const tryModel = async (model: string, maxAttempts: number) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }] });
        return { text: result.text ?? '', model };
      } catch (err) {
        lastError = err;
        if (!isTransientGeminiError(err) || attempt === maxAttempts) throw err;
        await sleep(800 * 2 ** (attempt - 1) + Math.random() * 400);
      }
    }
    throw lastError;
  };

  try {
    return await tryModel(PRIMARY_MODEL, 3);
  } catch (err) {
    if (!isTransientGeminiError(err)) throw err;
    logger.warn('primary Gemini model unavailable, falling back', { error: String(err) });
    return tryModel(FALLBACK_MODEL, 2);
  }
}

// Receipt extraction behind auth and daily rate limits. `mode: 'health'` is
// a cheap text-only probe the UI uses to warn before uploading.
export const extractReceipt = onCall({ memory: '512MiB', timeoutSeconds: 120 }, async (req) => {
  const { uid } = requireAuth(req);
  const ai = vertexClient();

  if (req.data?.mode === 'health') {
    try {
      const result = await ai.models.generateContent({ model: PRIMARY_MODEL, contents: 'ping' });
      return { ok: !!result.text, model: PRIMARY_MODEL };
    } catch (err) {
      logger.warn('Gemini health probe failed', { error: String(err) });
      return { ok: false, model: PRIMARY_MODEL, reason: err instanceof Error ? err.message : 'unknown' };
    }
  }

  const images = parseImages(req.data?.images);
  const categories: string[] = Array.isArray(req.data?.categories)
    ? req.data.categories.filter((c: unknown): c is string => typeof c === 'string').slice(0, 50)
    : [];

  await consumeQuota(uid);

  const parts: Part[] = [
    { text: buildReceiptPrompt(categories, COUNTRY.value() === 'CL' ? 'CL' : 'CO') },
    ...images.map((img) => ({ inlineData: { data: img.data, mimeType: img.mimeType } })),
  ];

  let text: string;
  let model: string;
  try {
    ({ text, model } = await generateWithFallback(ai, parts));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Gemini extraction failed', { uid, error: msg });
    if (/429|Quota exceeded/.test(msg)) {
      throw new HttpsError('resource-exhausted', 'Se alcanzó el límite de uso de IA. Intenta en 1 minuto o ingresa el gasto manualmente.');
    }
    if (isTransientGeminiError(err)) {
      throw new HttpsError('unavailable', 'El servicio de IA está saturado momentáneamente. Intenta en 30-60 segundos o ingresa el gasto manualmente.');
    }
    throw new HttpsError('internal', 'No se pudo leer el comprobante. Ingresa los datos manualmente.');
  }

  try {
    return { ...postProcessExtraction(text, categories), _model: model };
  } catch {
    logger.error('Gemini returned unparsable JSON', { uid, model, sample: text.slice(0, 200) });
    throw new HttpsError('internal', 'La IA devolvió una respuesta inválida. Ingresa los datos manualmente.');
  }
});
