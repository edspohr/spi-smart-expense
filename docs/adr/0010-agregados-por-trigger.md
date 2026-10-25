# 0010 — Agregados de dinero por trigger, no por callables

**Estado:** Aceptada
**Fecha:** 2026-10-25
**Ola:** 2

## Contexto

El plan original de la Ola 2 movía la lógica de dinero a cuatro callables
(`approveExpense`, `rejectExpense`, `editExpense`, `deleteExpense`). Al
inventariar el cliente aparecieron más puntos que escriben `users.balance`
o `projects.expenses` de los previstos: alta de gasto (`ExpenseForm`,
`BulkUpload`), borrado propio (`UserExpenses`), edición
(`EditExpenseModal`), borrado y cambio de estado de admin
(`AdminApprovals`, `AdminUserDetails`). Cada uno repetía la misma regla con
pequeñas diferencias (TD-026 es una de ellas). Además la Ola 6 necesita que
un gasto creado offline se sincronice sin pasar por un callable.

## Decisión

Un único trigger `onExpenseWritten` (`functions/src/aggregates.ts`) deriva
los agregados de cualquier escritura en `expenses/{id}`: creación, edición,
borrado y cambio de estado. La regla vive en una función pura
(`aggregates.logic.ts`, testeada): el balance de un usuario es la suma de
sus gastos no rechazados y no de empresa; el gasto de un proyecto es la
suma de sus gastos aprobados. El trigger es idempotente mediante
`aggregateLedger/{eventId}` porque Firestore entrega eventos al menos una
vez.

Los callables quedan para lo que exige autorización y auditoría:
`reviewExpense` (aprobar/rechazar/reabrir) y `extractReceipt`. Crear,
editar y borrar siguen siendo escrituras directas del cliente, validadas
por rules que prohíben tocar `status`, `createdAt`, `users.balance` y
`projects.expenses`.

## Alternativas consideradas

- **Callables para cada operación de dinero.** Más puntos de entrada,
  misma regla duplicada otra vez, y no cubre la sincronización offline ni
  escrituras hechas por scripts.
- **Mantener la lógica en el cliente con rules más estrictas.** Las rules
  no pueden expresar "incrementa exactamente el monto del gasto" de forma
  robusta ni cubrir borrados.
- **Recalcular agregados bajo demanda** (sin campos materializados). Rompe
  el dashboard actual y multiplica lecturas.

## Consecuencias

- Ninguna pantalla escribe `balance` ni `expenses` de proyecto; las rules lo
  garantizan y los tests de rules lo cubren.
- El saldo que ve el usuario justo después de enviar puede llegar ~1 s tarde
  (TD-028: pasar el dashboard a `onSnapshot`).
- La corrección de monedas mezcladas (TD-026) ahora es un cambio en una sola
  función pura más una migración de recálculo.
- Un rollback de hosting/rules sin deshabilitar el trigger duplicaría
  saldos; el runbook de deploy lo contempla.
