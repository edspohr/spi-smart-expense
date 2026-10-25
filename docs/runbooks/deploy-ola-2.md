# Runbook — Deploy de la Ola 2 (backend seguro)

Primera salida a producción con Cloud Functions, claims y rules nuevas.
El orden importa: las rules nuevas niegan las escrituras de dinero y de
`status` que hacía el cliente viejo, así que una pestaña sin recargar falla
de forma segura en lugar de duplicar saldos. Hacerlo en horario de poco uso
(SPI: noche en Colombia).

Prerrequisitos: `firebase login` y `gcloud auth login` vigentes, proyecto en
plan Blaze (costo esperado de Functions + Vertex AI + App Check a escala SPI:
USD 0-5 al mes), `scripts/serviceAccountKey.json` presente (nunca commitear),
rama `main` limpia y CI en verde.

## 1. Vertex AI (API + permiso de la service account)

Gemini se consume vía Vertex AI con IAM: no hay API key que guardar ni
rotar. Una sola vez por proyecto. Primero las APIs: Compute Engine crea la
service account por defecto que usan las Functions 2.ª gen (sin ella el
binding IAM falla con "Service account ... does not exist") y las demás las
necesita el deploy:

```bash
gcloud services enable compute.googleapis.com cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com eventarc.googleapis.com aiplatform.googleapis.com --project spi-smart-expense
```

Esperar ~1 minuto a que exista `<número>-compute@developer.gserviceaccount.com`
(`gcloud iam service-accounts list --project spi-smart-expense`) y luego:

```bash
gcloud projects add-iam-policy-binding spi-smart-expense --member="serviceAccount:614294009208-compute@developer.gserviceaccount.com" --role="roles/aiplatform.user" --condition=None
```

(`614294009208` es el número del proyecto `spi-smart-expense`; la service
account por defecto de Cloud Functions 2.ª gen es
`<número>-compute@developer.gserviceaccount.com`. Para otro tenant,
`gcloud projects describe <id> --format="value(projectNumber)"`.)

Verificar que los modelos responden en la ubicación configurada
(`VERTEX_LOCATION`, por defecto `global`) antes del deploy: `npm run
vertex:check -- --project spi-smart-expense`. Verificado el 2026-10-25:
`gemini-3.6-flash` y `gemini-3.5-flash-lite` responden en `global`; en
`us-central1` todavía devuelven 404. Si un tenant exige residencia regional,
fijar `VERTEX_LOCATION` en `functions/.env.<projectId>` y repetir el check.

## 2. Functions

```bash
firebase deploy --only functions --project spi-smart-expense
```

Se despliegan `healthcheck`, `extractReceipt`, `reviewExpense`,
`onExpenseWritten` y `onUserWritten`. Desde este momento cualquier
escritura en `expenses` ajusta balances en el servidor; el cliente viejo
sigue escribiendo también, por eso el paso 4 va inmediatamente después.

## 3. Backfill de claims

```bash
npm run functions:build
npm run claims:backfill -- --dry-run --prod
npm run claims:backfill -- --apply --prod
```

Revisar el dry-run: cada usuario debe pasar de `{}` a
`{role, tenantId: 'spi', active, canApprove, ...}`. Los usuarios sin cuenta
de Auth se listan y se omiten.

Si algún admin de arranque todavía no tiene `role: admin`:

```bash
npm run admins:bootstrap -- --tenant spi --dry-run --prod
npm run admins:bootstrap -- --tenant spi --apply --prod
```

## 4. Hosting + rules, en un solo comando

```bash
npm run build
firebase deploy --only hosting,firestore:rules,storage --project spi-smart-expense
```

Por qué juntos: el build nuevo deja de escribir `balance` y de cambiar
`status` desde el cliente; las rules nuevas lo prohíben. Una pestaña con el
build viejo que intente aprobar o enviar un gasto recibe `permission-denied`,
ve el toast "Actualización disponible" y recarga. No hay ventana de doble
conteo.

## 5. Verificación en producción

1. Abrir la app, iniciar sesión como admin; en consola del navegador no debe
   haber `permission-denied`.
2. Subir una foto de recibo en "Nueva Rendición": los campos deben
   pre-llenarse (primera llamada 2-10 s por cold start).
3. Aprobar una rendición y rechazar otra: toasts correctos, la campana del
   profesional recibe la notificación, `movements` tiene la entrada con
   `byName`.
4. Reconciliar saldos: ejecutar `recalculateAllUserBalances` en modo dry-run
   desde `/admin/reconciliation` (TD-018) y confirmar que no hay drift.
5. Revisar Logs de Functions en Firebase console: sin errores en
   `onExpenseWritten` ni `onUserWritten`.
6. Dejar la Ola 2 como "Deployada" en `docs/implementation-plan.md`,
   `docs/README.md` y `docs/validation/ola-2.md`.

## 6. App Check (monitor → enforce)

1. Firebase console → App Check → registrar la app web con reCAPTCHA
   Enterprise; copiar la site key.
2. Añadir `VITE_RECAPTCHA_SITE_KEY=<key>` al `.env` de build y redeployar
   hosting (`npm run build && firebase deploy --only hosting`).
3. Una semana en modo monitor revisando el panel de App Check (porcentaje
   de solicitudes verificadas en Firestore, Storage y Functions).
4. Activar enforce en Firestore, Storage y luego en Functions
   (`enforceAppCheck: true` en los `onCall` y redeploy). Anotar la fecha en
   `docs/backlog.md`.

## 7. Eliminar la key vieja de Google AI Studio

La key `VITE_GEMINI_API_KEY` estuvo embebida en el bundle público hasta esta
ola y ya nada la usa (Vertex autentica con IAM). Borrarla en Google AI Studio
→ API keys (o en GCP → Credenciales) para que no pueda consumir cuota a
nombre del proyecto.

## Rollback

- Hosting: Firebase console → Hosting → "Revertir" a la release anterior.
- Rules: `git checkout <commit anterior> -- firestore.rules storage.rules &&
  firebase deploy --only firestore:rules,storage`.
- Functions pueden quedar desplegadas: con el cliente y rules viejos vuelven
  a escribirse balances desde el navegador y el trigger también los
  ajustaría. Si se hace rollback de hosting/rules, deshabilitar
  `onExpenseWritten` (`firebase functions:delete onExpenseWritten`) y correr
  la reconciliación de saldos.
