# 0001 — Un Firebase project por cliente

**Estado:** Aceptada
**Fecha:** 2026-10-24
**Ola:** 0

## Contexto

Expense Buddy se vende como una instancia por cliente con costo de
implementación y cuota mensual. SPI es el primer tenant; Elecnor y otros
vendrán. Hay que decidir cómo se aíslan los datos y la facturación entre
clientes antes de escribir código multi-tenant.

## Decisión

Cada cliente tiene su propio Firebase project (Auth, Firestore, Storage,
Functions, Hosting, App Check). El código es único (ADR 0002) y se construye
por tenant con `VITE_TENANT`. El `tenantId` se guarda igualmente en claims y
documentos para que el código sea el mismo en todos los despliegues y para
permitir un futuro modo compartido si hiciera falta.

## Alternativas consideradas

- **Multi-tenant lógico en una sola base** (`tenantId` en cada doc, rules
  por tenant). Más barato al inicio, pero rules complejas, riesgo de fuga
  entre clientes, un solo punto de falla y difícil de vender a una empresa
  grande que quiere sus datos aparte.
- **Híbrido** (SPI aparte, resto compartido). Duplica la complejidad
  operativa sin eliminar el riesgo del modo compartido.

## Consecuencias

- Aislamiento total de datos, cuotas, costos y SLA por cliente; handover
  limpio al proyecto GCP del cliente (runbook basado en ETFA
  `docs/plan-cierre.md`).
- Cada nuevo cliente requiere `bootstrap-tenant` (Ola 7) y un deploy
  propio; CI construye por tenant.
- Los costos de Functions/App Check/Secret Manager se multiplican por
  tenant, pero a la escala actual quedan dentro del free tier o cerca.
- Las migraciones de esquema se corren por tenant (ADR 0009).
