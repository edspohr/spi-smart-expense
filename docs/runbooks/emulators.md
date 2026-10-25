# Runbook — Entorno de pruebas con Firebase Emulator Suite

Entorno local aislado para probar la app sin tocar el proyecto Firebase de
ningún cliente. Las cuentas y los datos viven solo en tu máquina.

## Requisitos

- Node 22 y `firebase-tools` (ya usado para deploy).
- Java 21+ para el emulador de Firestore. En este Mac está instalado vía
  Homebrew (`/opt/homebrew/opt/openjdk/bin`); los scripts npm lo agregan al
  `PATH` automáticamente. En otra máquina: `brew install openjdk`.
- Python 3 + Pillow solo si vas a regenerar íconos (`npm run icons`).

## Arranque

Terminal 1 — emuladores (Auth 9099, Firestore 8080, Storage 9199, UI 4000):

```bash
npm run emulators
```

Terminal 2 — sembrar cuentas y datos de prueba (idempotente, se puede repetir):

```bash
npm run seed:emu
```

Terminal 3 — app apuntando a los emuladores:

```bash
npm run dev:emu
```

`npm run emulators:resume` arranca importando el último estado exportado en
`emulator-data/` (ignorado por git). `npm run emulators` arranca vacío y
exporta al salir.

## Cuentas de prueba

Definidas en `scripts/seed-emulator.mjs` (`TEST_USERS`, `TEST_PASSWORD`).
Todas comparten la misma contraseña, que está en ese archivo y nunca debe
usarse en un proyecto real.

| Email | Rol | Notas |
|-------|-----|-------|
| `superadmin.prueba@expensebuddy.test` | superadmin | Ve Configuración → Usuarios y Ajustes |
| `admin.prueba@expensebuddy.test` | admin | `permissions.isColombiaApprover: true` (puede aprobar COP) |
| `profesional.prueba@expensebuddy.test` | professional | Tiene 2 asignaciones y 4 gastos seed en distintos estados |
| `asistente.prueba@expensebuddy.test` | assistant | Un gasto pendiente de 30 días (alerta de "sin revisar") |

Datos seed: 2 centros de costo (`proj-feria-bogota`, `proj-mision-miami`),
2 asignaciones, 5 gastos (pendientes COP/USD, aprobado, rechazado, pendiente
antiguo). Ningún gasto tiene imagen de recibo.

## Tenant demo (Expense Buddy, Chile)

```bash
npm run emulators:demo   # terminal 1 — proyecto expense-buddy-demo, functions en southamerica-west1
npm run seed:demo        # terminal 2 — Andes Energía SpA (npm run reset:demo para volver a cero)
npm run dev:demo:emu     # terminal 3 — build demo (.env.demo) apuntando a los emuladores
```

Cuentas `@andesenergia.demo` con clave `Demo2026!`: `camila.rojas`
(superadmin), `rodrigo.pizarro` (admin), `diego.munoz` y `paula.herrera`
(jefaturas que aprueban a su equipo), `valentina.soto`, `matias.fuentes`,
`javiera.contreras` (profesionales) e `ignacio.vera` (asistente). El script
imprime la lista al terminar.

`functions/.env.local` solo debe tener overrides propios del emulador
(`APP_URL=`): tiene prioridad sobre `functions/.env.<proyecto>` y, si repite
`TENANT_ID` u otros parámetros, contamina el tenant que estés probando.

## Inspección rápida sin UI

El emulador de Firestore acepta REST con un token ficticio:

```bash
curl -s -H "Authorization: Bearer owner" \
  "http://127.0.0.1:8080/v1/projects/spi-smart-expense/databases/(default)/documents/expenses"
```

Los rechazos de rules quedan en `firestore-debug.log`.

## Límites

- `extractReceipt` llama a Vertex AI real (proyecto `spi-smart-expense`,
  centavos por lectura) usando tus Application Default Credentials:
  `gcloud auth application-default login` con una cuenta que tenga
  `roles/aiplatform.user` en el proyecto. Usa "Ingresar Manualmente" para no
  consumir cuota.
- El proyecto de los emuladores es `spi-smart-expense` para que coincida con
  el `.env`, pero nada sale de localhost. El script de seed se niega a correr
  si `FIRESTORE_EMULATOR_HOST` no es local.
- El service worker no corre en `dev:emu`; para probar instalación usa
  `npm run preview` (sin emuladores) o producción.
