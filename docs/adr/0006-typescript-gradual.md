# 0006 — TypeScript gradual

**Estado:** Aceptada
**Fecha:** 2026-10-24
**Ola:** 0

## Contexto

El frontend es JavaScript puro (`.jsx`) sin contratos de datos. Al
compartir el mismo código entre varios tenants y al mover lógica a Cloud
Functions, la falta de tipos en `Expense`, `User`, `Tenant` y compañía se
vuelve el principal riesgo de regresión. Una migración big-bang de ~16
páginas y ~30 componentes no cabe en una ola deployable.

## Decisión

Adopción gradual:
- `functions/` y `shared/` nacen en TypeScript `strict`.
- `tsconfig.json` en la raíz con `allowJs: true`, `checkJs: false`,
  `strict: true` para `.ts/.tsx`; `npm run typecheck` en CI.
- `src/types/models.ts` define los modelos de datos desde la Ola 0.
- `src/lib/*` se migra a `.ts` a medida que se toca; cada archivo nuevo es
  `.ts/.tsx`.
- Las páginas `.jsx` se migran a `.tsx` solo cuando se refactorizan
  (Ola 9 para los monolitos).

## Alternativas consideradas

- **Seguir en JavaScript + JSDoc.** Menos churn, pero los contratos quedan
  opcionales y no se verifican en CI.
- **Solo Functions en TypeScript.** Deja el frontend sin modelos
  compartidos justo donde más se comparte código entre tenants.
- **Migración completa de una vez.** Rompe la regla de olas deployables y
  mezcla refactor con features.

## Consecuencias

- Conviven `.jsx` y `.tsx` durante varias olas; ESLint debe cubrir ambos.
- `shared/` es la única fuente de tipos y constantes para app y functions.
- Cada ola deja menos JavaScript que la anterior; no se agrega JS nuevo.
