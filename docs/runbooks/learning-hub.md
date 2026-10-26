# Runbook — Learning hub (Ola 8c)

The learning hub is a central Growth Buddies Firebase project that receives
the anonymised contributions of the tenants that consented (ADR 0016) and
feeds the reader pack shipped in every build. **Do not connect a client
until the legal texts are `derived-v1`** (`docs/legal/textos-vigentes-lector.md`).

## How the pieces fit

```
tenant project                              hub project (HUB_MODE=true)
──────────────                              ───────────────────────────
verifyLocalRead → readerProfiles, ocrStats
exportDerivedData (daily 07:00 UTC)
  consent + version ok?  ──no──► skipped
  buildContribution()                        ingestContribution (HTTPS)
  LEARNING_HUB_URL empty ─► learningOutbox     verify Google ID token
  else POST + ID token  ───────────────────►  sender ∈ HUB_ALLOWED_SENDERS
                                               validateContribution()
                                               envIssuers/{envId}, envStats/{envId}_{day}
repo: npm run pack:build -- --project <hub> ◄─ aggregate envIssuers
      → src/lib/localReader/pack/reader-pack.json → next build of every tenant
```

## 1. Create the hub (once)

1. Create a Firebase project (Blaze), for example `growth-buddies-learning`,
   Firestore in `southamerica-west1`. No Auth, no Hosting needed.
2. Add `.firebaserc` alias `hub` and `functions/.env.<hub-project>`:

   ```
   FUNCTIONS_REGION=southamerica-west1
   HUB_MODE=true
   HUB_AUDIENCE=https://southamerica-west1-<hub-project>.cloudfunctions.net/ingestContribution
   HUB_ALLOWED_SENDERS=
   ```

   `LEARNING_HUB_URL`, `HUB_AUDIENCE` and `HUB_ALLOWED_SENDERS` are plain
   environment variables, not Functions params, so tenants without a hub
   deploy without being asked for them.

3. Firestore rules for the hub: deny everything to clients (only the
   function writes). Deploy only what the hub needs:

   ```bash
   firebase deploy --only functions:ingestContribution,firestore:rules --project <hub-project>
   ```

   After the first deploy, copy the real function URL into `HUB_AUDIENCE`
   if it differs (2nd gen may give a `run.app` URL) and redeploy.

## 2. Connect a tenant

Only for a client whose contract includes the clause and who will turn on
the consent in Ajustes.

1. Find the tenant's Functions service account (default:
   `<project-number>-compute@developer.gserviceaccount.com`) and add it to
   `HUB_ALLOWED_SENDERS` in the hub's env file; redeploy the hub function.
2. Allow the hub's Cloud Run service to be invoked by that account:

   ```bash
   gcloud run services add-iam-policy-binding ingestcontribution \
     --region southamerica-west1 --project <hub-project> \
     --member serviceAccount:<tenant-sa> --role roles/run.invoker
   ```

3. In the tenant, set `LEARNING_HUB_URL=<HUB_AUDIENCE>` in
   `functions/.env.<tenant-project>` and deploy its functions.
4. Superadmin of the tenant: Ajustes → "Aportar a la mejora del lector" →
   "Ver qué se envía" (destination must say "proyecto central") → accept.
5. Next day: tenant `cache/learning.lastResult.status = "sent"` with
   `destination: "hub"`; hub has `envIssuers/<envId>`.

Until step 3, an accepted consent only writes to the tenant's own
`learningOutbox` (useful to review what would leave).

## 3. Build and ship the reader pack

```bash
npm run pack:build -- --project <hub-project> --dry-run   # review
npm run pack:build -- --project <hub-project>             # writes reader-pack.json
```

Thresholds: ≥ 3 votes and ≥ 70 % majority per issuer (stricter than a
tenant's own 2 votes / 60 %). Review the diff, bump `READER_VERSION` if the
rules changed too, commit, and deploy the tenants as usual. Every expense
read stores `packVersion`, so accuracy can be compared before/after a pack
(ocrEval).

## 4. Disconnect a tenant / revocation

- The client revokes in Ajustes: exports stop the same day (logged in
  `consentLog`). Already aggregated votes stay in the pack (clause [N].5).
- To also remove its snapshot from future packs: delete
  `envIssuers/<envId>` and `envStats/<envId>_*` in the hub (the tenant's
  `cache/learning.envId` gives the id) and remove its service account from
  `HUB_ALLOWED_SENDERS`.

## 5. Changing the consent text

Bump `DERIVED_TERMS_VERSION` in `src/lib/learningTerms.ts` and
`functions/src/learning.logic.ts` (a test checks they match), update
`docs/legal/textos-vigentes-lector.md`, deploy. Every tenant's export stops
until a superadmin accepts the new version.
