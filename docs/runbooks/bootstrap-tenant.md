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

Si el primer deploy de Functions falla por el agente de Eventarc, esperar
5 minutos y reintentar (ver `deploy-ola-2.md`).

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
node scripts/seed-demo.mjs --prod --key path/to/demo-sa.json --password '<clave para mostrar>'
```

`--reset` lo devuelve al estado inicial antes de cada presentación.

## Checklist de cierre

- [ ] Login con la marca del cliente, sin registro abierto si corresponde
- [ ] Rendición con foto → Gemini lee RUT/NIT y monto en moneda local
- [ ] Aprobar y rechazar; el saldo se mueve
- [ ] Instalar la PWA en Android e iPhone
- [ ] Anotar proyecto, región y contacto en el registro de clientes
