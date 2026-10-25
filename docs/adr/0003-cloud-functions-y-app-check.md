# 0003 — Cloud Functions y App Check

**Estado:** Aceptada
**Fecha:** 2026-10-24
**Ola:** 2 (scaffold en Ola 0)

## Contexto

La app es 100% cliente: la key de Gemini viaja en el bundle (TD-002 /
TD-022), la lógica de dinero (aprobar, balances, presupuesto) corre en el
navegador, no hay forma de hashear un PIN ni de crear usuarios con el Admin
SDK, y cualquier cliente que decompile puede consumir cuota. El proyecto de
SPI ya está en plan Blaze.

## Decisión

Introducir Cloud Functions (2.ª gen, TypeScript, Node 22) para:
proxy de Gemini con rate limit, callables transaccionales de dinero,
gestión de usuarios con Admin SDK, PIN, email, push, jobs programados.
Secretos en Secret Manager (`defineSecret`). App Check con reCAPTCHA
Enterprise en Firestore, Storage y Functions: primero en modo monitor (una
semana), después enforce.

## Alternativas consideradas

- **Seguir cliente-side con Extensions/trucos.** No resuelve el secreto en
  el bundle ni permite PIN server-side.
- **Backend propio (Cloud Run / Express).** Más control, pero otra pieza
  que operar por tenant y sin la integración nativa con Auth/App Check.
- **Enforce de App Check desde el día uno.** Riesgo de bloquear sesiones
  activas de SPI; monitor primero.

## Consecuencias

- `src/lib/gemini.js` se convierte en thin client; cold start de 1-3 s en
  la primera llamada (mitigación en backlog: `minInstances`).
- Las rules dejan de ser la única barrera: la lógica de negocio sensible
  vive en callables testeables.
- Costo adicional por tenant pequeño (Functions + Secret Manager + App
  Check), dentro del free tier a la escala de SPI.
- Requiere emuladores en CI para tests de callables y rules.

## Estado de implementación (2026-10-25, Ola 2)

- Desplegables: `extractReceipt` (Gemini vía Vertex AI con IAM, ADR 0011; rate limit por
  usuario y tenant), `reviewExpense`, `healthcheck`, triggers
  `onExpenseWritten` y `onUserWritten`. Los callables de dinero
  `editExpense`/`deleteExpense` se reemplazaron por el trigger de agregados
  (ADR 0010).
- App Check en modo monitor: `enforceAppCheck: false` en los `onCall`; el
  cliente inicializa reCAPTCHA Enterprise solo con `VITE_RECAPTCHA_SITE_KEY`.
  La fecha de enforce se anota en `docs/backlog.md`.
- Hallazgo: además de la key de Gemini, `validateEnv(import.meta.env)`
  incrustaba todas las `VITE_*` en el bundle. Corregido con lecturas
  explícitas; la key de Gemini debe rotarse tras el deploy.
