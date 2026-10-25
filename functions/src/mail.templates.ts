// Transactional email templates. Pure: they only build subject + HTML from
// variables, so they can be tested and branded per tenant (name, colour, URL).

export interface Branding {
  appName: string;
  appUrl: string;
  color: string;
}

export type TemplateId = 'approved' | 'rejected' | 'needsApproval' | 'staleDigest';

export interface TemplateVars {
  recipientName?: string;
  merchant?: string;
  amount?: string;
  reason?: string;
  submitterName?: string;
  approverName?: string;
  count?: number;
  items?: { merchant: string; amount: string; submitterName: string; days: number }[];
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

function layout(b: Branding, title: string, body: string, cta: { label: string; path: string }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;color:#27272a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${esc(b.color)};color:#ffffff;padding:16px 24px;font-weight:700;font-size:16px">${esc(b.appName)}</td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:18px">${esc(title)}</h1>${body}
<p style="margin:24px 0 0"><a href="${esc(b.appUrl)}${esc(cta.path)}" style="display:inline-block;background:${esc(b.color)};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">${esc(cta.label)}</a></p>
</td></tr>
<tr><td style="padding:12px 24px;font-size:12px;color:#71717a;border-top:1px solid #f4f4f5">Recibes este correo por tu cuenta en ${esc(b.appName)}. Puedes desactivar los correos en Mi Espacio.</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (text: string) => `<p style="margin:0 0 8px;line-height:1.5">${text}</p>`;

export function renderTemplate(id: TemplateId, v: TemplateVars, b: Branding): { subject: string; html: string } {
  const hello = p(`Hola ${esc(v.recipientName ?? '')},`);
  switch (id) {
    case 'approved':
      return {
        subject: `Rendición aprobada: ${v.merchant ?? ''}`,
        html: layout(b, 'Tu rendición fue aprobada', hello + p(`La rendición de <strong>${esc(v.merchant)}</strong> por <strong>${esc(v.amount)}</strong> fue aprobada.`), {
          label: 'Ver mis rendiciones',
          path: '/dashboard/expenses',
        }),
      };
    case 'rejected':
      return {
        subject: `Rendición rechazada: ${v.merchant ?? ''}`,
        html: layout(
          b,
          'Tu rendición fue rechazada',
          hello + p(`La rendición de <strong>${esc(v.merchant)}</strong> por <strong>${esc(v.amount)}</strong> fue rechazada.`) + p(`Motivo: ${esc(v.reason)}`),
          { label: 'Revisar y corregir', path: '/dashboard/expenses' },
        ),
      };
    case 'needsApproval':
      return {
        subject: `Aprobación pendiente: ${v.submitterName ?? ''} — ${v.merchant ?? ''}`,
        html: layout(
          b,
          'Tienes una rendición por aprobar',
          hello + p(`<strong>${esc(v.submitterName)}</strong> rindió <strong>${esc(v.merchant)}</strong> por <strong>${esc(v.amount)}</strong> y espera tu aprobación.`),
          { label: 'Ir a mis aprobaciones', path: '/dashboard/approvals' },
        ),
      };
    case 'staleDigest': {
      const rows = (v.items ?? [])
        .slice(0, 20)
        .map(
          (i) =>
            `<tr><td style="padding:6px 0;border-bottom:1px solid #f4f4f5">${esc(i.submitterName)}</td><td style="padding:6px 0;border-bottom:1px solid #f4f4f5">${esc(i.merchant)}</td><td style="padding:6px 0;border-bottom:1px solid #f4f4f5;text-align:right">${esc(i.amount)}</td><td style="padding:6px 0;border-bottom:1px solid #f4f4f5;text-align:right">${i.days} días</td></tr>`,
        )
        .join('');
      return {
        subject: `${v.count ?? 0} rendiciones esperan tu revisión`,
        html: layout(
          b,
          'Rendiciones sin revisar',
          hello + p(`Hay <strong>${v.count ?? 0}</strong> rendiciones esperando tu revisión hace varios días.`) +
            `<table role="presentation" width="100%" style="font-size:13px;margin-top:8px">${rows}</table>`,
          { label: 'Revisar ahora', path: '/dashboard/approvals' },
        ),
      };
    }
  }
}
