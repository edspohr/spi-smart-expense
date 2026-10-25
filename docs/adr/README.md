# Architecture Decision Records

Un ADR registra una decisión de arquitectura: el contexto que la motivó, la
decisión tomada, las alternativas descartadas y sus consecuencias. Se escribe
cuando se decide, no después. Un ADR no se edita para cambiar la decisión: se
escribe uno nuevo que lo reemplaza y el viejo pasa a estado `Reemplazada por
NNNN`.

Formato: MADR simplificado, un archivo por decisión, numeración secuencial,
nombre en kebab-case en español.

## Plantilla

```markdown
# NNNN — Título

**Estado:** Propuesta | Aceptada | Reemplazada por NNNN
**Fecha:** YYYY-MM-DD
**Ola:** N

## Contexto
## Decisión
## Alternativas consideradas
## Consecuencias
```

## Índice

| ADR | Título | Estado | Ola |
|-----|--------|--------|-----|
| [0001](0001-un-firebase-project-por-cliente.md) | Un Firebase project por cliente | Aceptada | 0 |
| [0002](0002-monorepo-con-config-por-tenant.md) | Monorepo con configuración por tenant | Aceptada | 0 |
| [0003](0003-cloud-functions-y-app-check.md) | Cloud Functions y App Check | Aceptada | 2 |
| [0004](0004-roles-y-custom-claims.md) | Roles y custom claims | Aceptada | 2-3 |
| [0005](0005-pin-por-accion-server-side.md) | PIN por acción verificado server-side | Aceptada | 4 |
| [0006](0006-typescript-gradual.md) | TypeScript gradual | Aceptada | 0 |
| [0007](0007-pais-y-moneda-por-tenant.md) | País y moneda por tenant | Aceptada | 7 |
| [0008](0008-email-firebase-auth-mas-brevo.md) | Email: Firebase Auth nativo + Brevo | Aceptada | 3, 5 |
| [0009](0009-migraciones-idempotentes-dry-run.md) | Migraciones idempotentes con dry-run | Aceptada | 0 |
| [0010](0010-agregados-por-trigger.md) | Agregados de dinero por trigger, no por callables | Aceptada | 2 |
| [0011](0011-gemini-via-vertex-ai.md) | Gemini vía Vertex AI (IAM, sin API key) | Aceptada | 2 |
