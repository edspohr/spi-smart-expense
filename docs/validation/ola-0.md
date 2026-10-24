# Validación — Ola 0: Fundaciones

**Fecha:** 2026-10-24
**Impacto en SPI:** transparente. Ningún cambio funcional visible para usuarios finales.

Formato: qué cambió → cómo probarlo → estado esperado. Marcar ✅ al verificar.

---

## 1. Configuración por tenant

**Qué cambió:** `tenants/spi.json` y `tenants/demo.json` definen nombre, paleta,
locale, auth y módulos. Vite inyecta el JSON como `__TENANT__` y reemplaza los
`%TENANT_*%` de `index.html`. La paleta `brand` de Tailwind ahora lee variables
CSS `--brand-*` que `applyTenantTheme()` fija al arrancar.

**Cómo probarlo:**
```bash
npm run build && grep -o "<title>[^<]*</title>" dist/index.html
npm run build:demo && grep -o "<title>[^<]*</title>" dist/index.html
```
Luego `npm run dev`, abrir `/login` y comparar visualmente con producción.

**Estado esperado:** `SPI Smart Expense` en el primer build, `Expense Buddy` en
el segundo; `theme-color` `#2563eb` vs `#059669`. El login de SPI se ve idéntico
al actual (mismos azules, mismas sombras). ☐

## 2. Admins de arranque fuera del código

**Qué cambió:** la lista de emails que obtienen `role: admin` en su primer login
salió de `AuthContext.jsx` y vive en `tenants/spi.json → auth.bootstrapAdminEmails`.

**Cómo probarlo:** `grep -rn "spohr.cl" src/` solo debe aparecer en `seedData.js`.
Un login existente sigue cargando su rol desde Firestore sin cambios.

**Estado esperado:** cero emails hardcodeados en `src/context`. ☐

## 3. Validación de variables de entorno

**Qué cambió:** `src/lib/env.ts` valida las 7 `VITE_*` requeridas; `main.jsx`
muestra `EnvError.jsx` con la lista exacta si falta alguna.

**Cómo probarlo:**
```bash
VITE_GEMINI_API_KEY= npm run dev
```

**Estado esperado:** pantalla "Configuración incompleta" listando
`VITE_GEMINI_API_KEY`; con `.env` completo la app arranca normal. ☐

## 4. TypeScript gradual y modelos tipados

**Qué cambió:** `tsconfig.json` (`allowJs`, `strict`), `src/types/models.ts`
con `UserDoc`, `ExpenseDoc`, `ProjectDoc`, `AllocationDoc`, `MovementDoc`,
`NotificationDoc`; `tenant.ts` y `env.ts` nacen en TS.

**Cómo probarlo:** `npm run typecheck`

**Estado esperado:** sin errores. ☐

## 5. Tests unitarios

**Qué cambió:** Vitest + Testing Library. Suites en `permissions`, `format`,
`tenant`, `env` (19 tests).

**Cómo probarlo:** `npm test -- --run`

**Estado esperado:** 4 archivos, 19 tests en verde. ☐

## 6. Workspace de Cloud Functions

**Qué cambió:** `functions/` (TypeScript, Node 22, `firebase-functions` v6) con
el callable `healthcheck`, cableado en `firebase.json` con `predeploy` de build.
No se ha deployado todavía.

**Cómo probarlo:** `npm run functions:build && ls functions/lib`

**Estado esperado:** `index.js` compilado. Deploy real queda para Ola 2. ☐

## 7. Índices Firestore versionados

**Qué cambió:** `firestore.indexes.json` declara `notifications(toUid, createdAt
DESC)` y `expenses(userId, createdAt DESC)`. El proyecto de SPI no tenía ningún
índice compuesto (ver TD-024: la campana de notificaciones probablemente falla
hoy en silencio).

**Cómo probarlo:**
```bash
firebase deploy --only firestore:indexes --project spi-smart-expense
```
Esperar estado `Enabled` en Firebase Console → Firestore → Indexes. Abrir la app
con un usuario que tenga notificaciones.

**Estado esperado:** índices creados; la campana muestra notificaciones. ☐

## 8. CI en GitHub Actions

**Qué cambió:** `.github/workflows/ci.yml` corre lint, typecheck, tests y build
para `spi` y `demo`, más build de `functions/`. No deploya.

**Cómo probarlo:** push a `main` o abrir un PR; revisar la pestaña Actions.

**Estado esperado:** los tres jobs en verde. ☐

## 9. Lint

**Qué cambió:** ESLint cubre `.ts/.tsx` con `typescript-eslint`. Tres reglas
React Compiler de `eslint-plugin-react-hooks` 7.x quedaron en `off` (TD-023)
porque reportaban 18 errores preexistentes en páginas monolíticas.

**Cómo probarlo:** `npm run lint`

**Estado esperado:** cero errores, cero warnings. ☐

## 10. Documentación

**Qué cambió:** `docs/implementation-plan.md` reescrito (Olas 0–9),
`docs/adr/0001–0009`, `docs/backlog.md`, `docs/technical-debt.md` (TD-020
resuelto, TD-021/022 en curso, TD-023/024/025 nuevos), `README.md`, `CLAUDE.md`,
`docs/README.md`. Plan v2 archivado en `docs/archive/`.

**Estado esperado:** cada decisión de la propuesta tiene su ADR; el estado de
Ola 0 pasa a "Deployada" en la tabla del plan al publicar. ☐

---

## Pendientes para marcar la Ola 0 como deployada

1. `firebase deploy --only hosting,firestore:indexes --project spi-smart-expense`
2. Verificar punto 7 en producción.
3. Actualizar la tabla de estado en `docs/implementation-plan.md`.
