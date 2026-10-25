import { defineString } from 'firebase-functions/params';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { nowIso } from './common';
import { renderTemplate, type Branding, type TemplateId, type TemplateVars } from './mail.templates';
import { linkForType, sendPush } from './push';

// In-app notifications plus optional email through an outbox (mailQueue).
// Email is enabled per tenant with EMAIL_PROVIDER=brevo in
// functions/.env.<projectId>; until then nothing is queued and the sender
// function is not even deployed, so a missing Brevo key never blocks a deploy.

export const EMAIL_PROVIDER = defineString('EMAIL_PROVIDER', { default: 'none' });
export const EMAIL_FROM = defineString('EMAIL_FROM', { default: '' });
export const APP_NAME = defineString('APP_NAME', { default: 'Expense Buddy' });
export const APP_URL = defineString('APP_URL', { default: '' });
export const BRAND_COLOR = defineString('BRAND_COLOR', { default: '#2563eb' });

const emailEnabled = () => EMAIL_PROVIDER.value() === 'brevo' && EMAIL_FROM.value() !== '';

export interface NotifyInput {
  toUid: string;
  type: string;
  title: string;
  body: string;
  expenseId?: string | null;
  email?: { template: TemplateId; vars: TemplateVars };
}

export async function notifyUser(input: NotifyInput): Promise<void> {
  const db = getFirestore();
  await db.collection('notifications').add({
    toUid: input.toUid,
    type: input.type,
    title: input.title,
    body: input.body,
    expenseId: input.expenseId ?? null,
    read: false,
    createdAt: nowIso(),
  });
  await sendPush(input.toUid, { title: input.title, body: input.body, link: linkForType(input.type), tag: input.expenseId ?? undefined });
  if (!input.email || !emailEnabled()) return;

  const user = (await db.doc(`users/${input.toUid}`).get()).data();
  if (!user?.email || user.active === false || user.notificationPrefs?.email === false) return;
  await db.collection('mailQueue').add({
    to: user.email,
    toName: user.displayName ?? '',
    template: input.email.template,
    vars: { recipientName: user.displayName ?? '', ...input.email.vars },
    status: 'queued',
    createdAt: nowIso(),
  });
}

function branding(): Branding {
  return { appName: APP_NAME.value(), appUrl: APP_URL.value(), color: BRAND_COLOR.value() };
}

// Sends one queued email through Brevo's transactional API and records the
// outcome on the queue document (status sent | failed).
// The secret is declared here, not at module scope: the CLI resolves every
// declared secret on deploy, even for functions that are not exported.
export function makeEmailSender() {
  const BREVO_API_KEY = defineSecret('BREVO_API_KEY');
  return onDocumentCreated({ document: 'mailQueue/{id}', secrets: [BREVO_API_KEY] }, async (event) => {
    const snap = event.data;
    if (!snap) return;
    const mail = snap.data();
    const { subject, html } = renderTemplate(mail.template, mail.vars ?? {}, branding());
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY.value(), 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: EMAIL_FROM.value(), name: APP_NAME.value() },
          to: [{ email: mail.to, name: mail.toName || undefined }],
          subject,
          htmlContent: html,
        }),
      });
      if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
      await snap.ref.update({ status: 'sent', sentAt: nowIso() });
    } catch (err) {
      logger.error('email send failed', { id: event.params.id, error: String(err) });
      await snap.ref.update({ status: 'failed', error: String(err).slice(0, 500), failedAt: nowIso() });
    }
  });
}
