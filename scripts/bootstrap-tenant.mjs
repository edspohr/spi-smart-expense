// Scaffolds a new tenant (one Firebase project per client, ADR 0001):
//   tenants/<id>.json            from the demo template (name, colours, country)
//   functions/.env.<projectId>   Cloud Functions params (region, currency, country)
//   .env.<id>.example            web config placeholders for `vite --mode <id>`
//   .firebaserc                  project alias <id> → <projectId>
// and prints the remaining console/CLI steps (docs/runbooks/bootstrap-tenant.md).
//
//   npm run bootstrap-tenant -- --id elecnor --name "Elecnor Chile" --project elecnor-gastos \
//     --country CL --region southamerica-west1 --color "#0b5ea8" [--force]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (n, fallback) => {
  const i = args.indexOf(n);
  return i > -1 ? args[i + 1] : fallback;
};
const id = opt('--id');
const name = opt('--name');
const projectId = opt('--project');
const country = (opt('--country', 'CL') ?? 'CL').toUpperCase();
const region = opt('--region', country === 'CL' ? 'southamerica-west1' : 'southamerica-east1');
const color = opt('--color', '#059669');
const force = args.includes('--force');

if (!id || !/^[a-z][a-z0-9-]{1,30}$/.test(id) || !name || !projectId) {
  console.error('Usage: --id <slug> --name "<Display name>" --project <firebase-project-id> [--country CL|CO] [--region r] [--color #hex]');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COUNTRY = {
  CL: { language: 'es-CL', baseCurrency: 'CLP', currencies: ['CLP', 'USD', 'EUR'], taxIdLabel: 'RUT', fxProvider: 'mindicador', timezone: 'America/Santiago' },
  CO: { language: 'es-CO', baseCurrency: 'COP', currencies: ['COP', 'USD', 'EUR'], taxIdLabel: 'NIT', fxProvider: 'banrep', timezone: 'America/Bogota' },
}[country];
if (!COUNTRY) {
  console.error(`Unsupported country ${country}. Add it to src/lib/country.ts first.`);
  process.exit(1);
}

// Tailwind-like palette from one colour: lighten for 50/100, darken for 700-900.
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)));
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}
const palette = { 50: shade(color, 0.93), 100: shade(color, 0.85), 500: shade(color, 0.15), 600: color, 700: shade(color, -0.18), 800: shade(color, -0.33), 900: shade(color, -0.48) };

function writeOnce(rel, content) {
  const file = path.join(root, rel);
  if (existsSync(file) && !force) {
    console.log(`  = ${rel} exists (use --force to overwrite)`);
    return;
  }
  writeFileSync(file, content);
  console.log(`  ✓ ${rel}`);
}

const template = JSON.parse(readFileSync(path.join(root, 'tenants/demo.json'), 'utf8'));
const tenant = {
  ...template,
  id,
  name,
  shortName: name.length > 14 ? name.split(' ')[0] : name,
  functionsRegion: region,
  branding: { ...template.branding, logo: `/brands/${id}/logo.png`, icon: `/brands/${id}/icon.png`, themeColor: color, palette, productName: 'Rendiciones', legalName: name },
  locale: { country, language: COUNTRY.language, baseCurrency: COUNTRY.baseCurrency, currencies: COUNTRY.currencies, taxIdLabel: COUNTRY.taxIdLabel, fxProvider: COUNTRY.fxProvider },
  cardCompanies: [name],
};
writeOnce(`tenants/${id}.json`, JSON.stringify(tenant, null, 2) + '\n');

writeOnce(
  `functions/.env.${projectId}`,
  `FUNCTIONS_REGION=${region}\nTENANT_ID=${id}\nBASE_CURRENCY=${COUNTRY.baseCurrency}\nCOUNTRY=${country}\nTIMEZONE=${COUNTRY.timezone}\nVERTEX_LOCATION=global\nGEMINI_DAILY_LIMIT_USER=60\nGEMINI_DAILY_LIMIT_TENANT=1500\nEMAIL_PROVIDER=none\nEMAIL_FROM=\nAPP_NAME=${name}\nAPP_URL=https://${projectId}.web.app\nBRAND_COLOR=${color}\n`,
);

writeOnce(
  `.env.${id}.example`,
  `VITE_TENANT=${id}\nVITE_FIREBASE_API_KEY=your_api_key\nVITE_FIREBASE_AUTH_DOMAIN=${projectId}.firebaseapp.com\nVITE_FIREBASE_PROJECT_ID=${projectId}\nVITE_FIREBASE_STORAGE_BUCKET=${projectId}.firebasestorage.app\nVITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id\nVITE_FIREBASE_APP_ID=your_app_id\nVITE_RECAPTCHA_SITE_KEY=\nVITE_FCM_VAPID_KEY=\n`,
);

const rcPath = path.join(root, '.firebaserc');
const rc = existsSync(rcPath) ? JSON.parse(readFileSync(rcPath, 'utf8')) : { projects: {} };
rc.projects = { ...(rc.projects ?? {}), [id]: projectId };
writeFileSync(rcPath, JSON.stringify(rc, null, 2) + '\n');
console.log(`  ✓ .firebaserc alias ${id} → ${projectId}`);

console.log(`
Next steps (details in docs/runbooks/bootstrap-tenant.md):
  1. Firebase console: create project ${projectId} on Blaze; Firestore in ${region};
     Authentication → Email/Password on, sign-up OFF; add a Web app → copy config to .env.${id}
  2. Brand: put logo.png and icon.png in public/brands/${id}/, then
       python3 scripts/generate-icons.py ${id}
  3. Infra (once):
       gcloud services enable compute.googleapis.com cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com eventarc.googleapis.com aiplatform.googleapis.com recaptchaenterprise.googleapis.com --project ${projectId}
       gcloud projects add-iam-policy-binding ${projectId} --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" --role="roles/aiplatform.user" --condition=None
  4. Backend:  firebase deploy --only firestore,storage,functions --project ${id}
  5. Frontend: npx vite build --mode ${id} && firebase deploy --only hosting --project ${id}
  6. First superadmin:
       node scripts/bootstrap-superadmin.mjs --email <owner@client> --tenant ${id} --apply --prod   (with that project's service account)
`);
