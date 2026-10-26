# Runbook — Alta de un tenant nuevo

Un cliente = un proyecto Firebase (ADR 0001) construido desde este repo con
su `tenants/<id>.json` (ADR 0002). Tiempo estimado: 1-2 horas, la mayor
parte esperando la propagación de APIs en GCP.

## 0. Datos que hay que tener

- Id corto (`elecnor`), nombre visible ("Elecnor Chile"), país (`CL`/`CO`).
- Color de marca, logo horizontal y un ícono cuadrado (PNG, fondo
  transparente o color).
- Correo del primer superadmin del cliente.
- Si el cliente usará Google login, registro abierto, PIN, correos.

## 1. Generar los archivos del tenant

```bash
npm run bootstrap-tenant -- --id elecnor --name "Elecnor Chile" \
  --project elecnor-gastos --country CL --color "#0b5ea8"
```

Crea `tenants/elecnor.json`, `functions/.env.elecnor-gastos`,
`.env.elecnor.example` y el alias en `.firebaserc`. No pisa archivos
existentes sin `--force`. Revisar en `tenants/elecnor.json`:

- `branding.productName`, `legalName`, `emailPlaceholder`
- `auth.googleLogin` y `auth.selfSignup` (por defecto: invitación solamente)
- `categories`, `cardCompanies`, `defaultProjects` (opcional) y `modules`

## 2. Consola de Firebase (responsable)

1. Crear el proyecto `elecnor-gastos` y pasarlo a plan **Blaze**.
2. Firestore en la región de `functionsRegion` (CL: `southamerica-west1`).
3. Authentication → Email/contraseña activado. Si `selfSignup` es `false`:
   Configuración → Acciones del usuario → **desmarcar "Habilitar creación
   (registro)"** (la UI ya oculta el enlace; esto lo cierra en el servidor).
4. Storage con la misma región.
5. Agregar una app Web y copiar su config a `.env.elecnor` (a partir de
   `.env.elecnor.example`).
6. App Check: crear clave reCAPTCHA Enterprise con el dominio
   `elecnor-gastos.web.app`, registrarla en App Check (monitor) y ponerla en
   `VITE_RECAPTCHA_SITE_KEY`.

## 3. Infraestructura GCP (una vez)

```bash
gcloud services enable compute.googleapis.com cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com \
  eventarc.googleapis.com aiplatform.googleapis.com recaptchaenterprise.googleapis.com \
  --project elecnor-gastos
gcloud projects add-iam-policy-binding elecnor-gastos \
  --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user" --condition=None
```

Si el primer deploy de Functions falla por el agente de Eventarc o con
"Could not create Cloud Run service" (500), esperar 1-5 minutos y
reintentar con `--force` (también fija la política de limpieza de
imágenes). Pasó con SPI y con el demo.

Lo que se puede hacer sin consola (hecho así en el demo):

```bash
gcloud firestore databases create --location=southamerica-west1 --type=firestore-native --project <proyecto>
# bucket por defecto de Firebase Storage
curl -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "x-goog-user-project: <proyecto>" -H "Content-Type: application/json" \
  -d '{"location":"southamerica-west1","storageClass":"REGIONAL"}' \
  https://firebasestorage.googleapis.com/v1alpha/projects/<proyecto>/defaultBucket
```

Authentication sí requiere el clic "Comenzar" en la consola (la API que
lo inicializa convierte el proyecto en Identity Platform). Después, el
registro se apaga con `PATCH .../admin/v2/projects/<proyecto>/config` y
`client.permissions.disabledUserSignup: true`.

**Cloud Scheduler no existe en `southamerica-west1`:** el script deja
`SCHEDULER_REGION=southamerica-east1` en `functions/.env.<proyecto>` para
la función programada.

## 4. Marca

```bash
mkdir -p public/brands/elecnor   # copiar logo.png e icon.png aquí
python3 scripts/generate-icons.py elecnor
```

## 5. Deploy

```bash
firebase deploy --only firestore,storage,functions --project elecnor
npx vite build --mode elecnor && firebase deploy --only hosting --project elecnor
```

Verificar que la Function `extractReceipt` responde (`npm run vertex:check`
con el proyecto del cliente) y que el sitio carga con su marca.

## 6. Primer superadmin

Descargar una clave de service account del proyecto (Configuración →
Cuentas de servicio) como `scripts/serviceAccountKey.json` (ignorada por
git) y correr. **Ojo:** ese mismo nombre puede contener hoy la clave de
SPI; moverla antes (`mv scripts/serviceAccountKey.json
scripts/serviceAccountKey.spi.json`) y comprobar el `project_id` del
archivo, o el superadmin se crearía en el proyecto equivocado:

```bash
node scripts/bootstrap-superadmin.mjs --email <owner@cliente> --tenant elecnor --dry-run --prod
node scripts/bootstrap-superadmin.mjs --email <owner@cliente> --tenant elecnor --apply --prod
```

Borrar la clave al terminar. El superadmin invita al resto desde
Configuración → Usuarios y define la política de aprobación en Ajustes.

## 7. Tenant demo

El demo usa el mismo procedimiento con `--id demo --project
expense-buddy-demo` (los archivos ya existen). Para cargar los datos
ficticios en producción:

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project expense-buddy-demo
node scripts/seed-demo.mjs --prod > scripts/demo-credentials.local   # genera la clave; archivo ignorado por git
```

(`--key <sa.json>` sigue disponible si se prefiere una service account.)

`--reset` lo devuelve al estado inicial antes de cada presentación (sin
`--password` conserva las claves). Además, solo en el demo:

- `DEMO_MODE=true` en `functions/.env.expense-buddy-demo` publica
  `demoSignIn` (demo en un clic) y `resetDemoData` (reinicio 04:00).
- Los custom tokens exigen que la cuenta de servicio de Functions firme por
  sí misma (una vez):

```bash
gcloud services enable iamcredentials.googleapis.com --project expense-buddy-demo
gcloud iam service-accounts add-iam-policy-binding 746906129123-compute@developer.gserviceaccount.com \
  --member="serviceAccount:746906129123-compute@developer.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator" --project expense-buddy-demo
```

- Los leads de la landing van al CRM de Growth Buddies (`leads` en el
  proyecto `growth-buddies`); la config pública está en `tenants/demo.json`
  → `leads`. Para probar en emuladores, cargar las reglas de Growth Buddies
  en el emulador para ese proyecto (ver `docs/validation/ola-7.md`).

## Checklist de cierre

- [ ] Login con la marca del cliente, sin registro abierto si corresponde
- [ ] Rendición con foto → Gemini lee RUT/NIT y monto en moneda local
- [ ] Aprobar y rechazar; el saldo se mueve
- [ ] Instalar la PWA en Android e iPhone
- [ ] Anotar proyecto, región y contacto en el registro de clientes
