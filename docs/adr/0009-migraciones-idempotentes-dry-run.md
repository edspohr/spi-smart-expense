# 0009 — Migraciones idempotentes con dry-run

**Estado:** Aceptada
**Fecha:** 2026-10-24
**Ola:** 0

## Contexto

Varias olas agregan campos a documentos existentes (`tenantId`, `active`,
`managerUid`, claims, niveles de aprobación). SPI tiene datos reales en
producción y no puede tener downtime ni resultados inconsistentes. Con
varios tenants, la misma migración se ejecutará varias veces en proyectos
distintos.

## Decisión

Cada cambio de esquema trae un script en `scripts/migrations/NNN-nombre.ts`
(Admin SDK, TypeScript) que:
- es **idempotente**: correrlo dos veces no cambia nada la segunda vez;
- corre en **`--dry-run` por defecto** y reporta qué documentos cambiaría y
  cómo;
- aplica solo con `--apply` explícito y `--project <id>`;
- escribe en lotes con reintentos y registra un resumen en
  `migrations/{NNN}` del tenant;
- va precedido de un export de Firestore a GCS cuando se aplica en
  producción.

Los cambios de esquema son aditivos: el código nuevo tolera documentos sin
el campo nuevo mientras la migración no haya corrido.

## Alternativas consideradas

- **Backfill al vuelo en lectura/login.** Menos ceremonia, pero defaults
  inconsistentes, escrituras ocultas en el cliente y difícil de auditar.
- **Big-bang con ventana de mantenimiento.** Solo viable para una base
  chica; no escala a N tenants.

## Consecuencias

- Toda ola con cambio de datos incluye su script y su entrada en
  `docs/validation/ola-N.md` con el reporte del dry-run.
- El runbook de bootstrap de tenant ejecuta todas las migraciones en orden
  sobre un proyecto nuevo (quedan en no-op).
- El código debe tolerar el estado "antes de migrar" al menos una ola.
