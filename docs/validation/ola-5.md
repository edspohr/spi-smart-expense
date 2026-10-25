# Validación — Ola 5: Flujos de aprobación, auditoría y email

**Fecha:** 2026-10-25
**Impacto en SPI:** transparente con la política por defecto (Simple, sin
automatismos): se aprueba exactamente como hoy. Visible positivo: la línea
de tiempo de auditoría en el detalle de cada rendición, y en Mi Espacio la
preferencia de correos.

Formato: qué cambió → cómo probarlo → estado esperado. Marcar ✅ al verificar.

---

## 1. Política de aprobación (Ajustes)

**Qué cambió:** `settings/tenant.approvalPolicy` (ADR 0012), editable por el
superadmin. Opciones: modo Simple o Por niveles; aprobación del responsable;
segunda firma de finanzas desde un monto; auto-aprobación bajo un monto;
delegación; recordatorios de pendientes tras N días (días hábiles, 8:00).
Aplica a rendiciones nuevas.

**Cómo probarlo:** cambiar a "Por niveles", asignar un responsable a un
usuario de prueba en Usuarios, rendir un gasto con ese usuario.

**Estado esperado:** el responsable recibe una notificación y ve el gasto en
"Mis aprobaciones"; finanzas lo ve con la etiqueta "Espera a …". ☐

## 2. Flujo por niveles (`onExpenseCreated`, `reviewExpense`)

- Bajo `autoApproveBelow` → aprobado al instante por "Aprobación
  automática", con evento en el historial y aviso a quien rindió.
- Paso responsable → solo el responsable, su delegado activo o un admin
  (marcado "como administrador"). Quien rinde nunca aprueba lo propio.
- Paso finanzas → admins o aprobadores por moneda; con doble firma, dos
  personas distintas.
- `reviewExpense` devuelve `partial: true` mientras faltan firmas; la
  rendición sigue pendiente y Aprobaciones se refresca.
- Rechazar en cualquier paso termina el flujo; reabrir lo reinicia.

## 3. Mis aprobaciones (`/dashboard/approvals`)

Para responsables de cualquier rol (incluye asistentes y profesionales).
Aparece en el menú con contador solo en modo Por niveles y si hay
pendientes. Aprobar con comentario opcional, rechazar con motivo, ver
detalle con la línea de tiempo. Acceso por `pendingApproverUids`, campo que
solo escribe el servidor.

## 4. Delegación (Mi Espacio)

Un responsable elige a otra persona y una fecha de término; las rendiciones
abiertas que esperaban al responsable pasan a ser visibles y aprobables por
el delegado al instante. "Terminar" revierte.

## 5. Línea de tiempo de auditoría

`AuditTimeline` reemplaza la lista cruda de movimientos: inicio del flujo,
aprobaciones por paso, aprobación final, rechazos con motivo, reaperturas,
auto-aprobaciones y ediciones de campos, con actor, comentario y fecha.
Cierra TD-016.

## 6. Correo (Brevo)

Outbox `mailQueue` (solo servidor) y función `sendQueuedEmail` que se
despliega únicamente con `EMAIL_PROVIDER=brevo`. Plantillas con la marca del
tenant: aprobada, rechazada, solicitud de aprobación, resumen de pendientes.
Respeta `notificationPrefs.email` del usuario. En SPI queda **apagado**
hasta configurar la key y el remitente (ver `docs/pendientes.md`).

## 7. Tests

`approval.test.ts` (10: política, auto-aprobación, pasos, quién puede,
doble firma, delegación), `mail.test.ts` (3: marca, escapado, resumen),
rules (lectura por `pendingApproverUids`, nadie falsifica el flujo,
preferencia de correo propia, `mailQueue` inaccesible). Total 78
unitarios, 20 de rules.

## Verificado en emuladores (2026-10-25)

Con política Por niveles (auto < 50.000, doble firma ≥ 1.000.000) y Sofía
(asistente) como responsable de Pablo: 30.000 se auto-aprobó; 300.000 →
Pablo no puede aprobar lo propio, Sofía aprueba con comentario (`partial`),
Sofía no puede firmar finanzas, Ana (finanzas) aprueba → `approved`;
2.000.000 → admin override en el paso responsable, Ana firma 1 de 2, Sara
firma 2 de 2 → `approved`; delegación de Sofía a Ana agregó a Ana a
`pendingApproverUids`. Timeline con flujo, paso con comentario y
aprobación final. UI: Sofía ve "Mis aprobaciones (1)", la tarjeta de la
rendición y la línea de tiempo en el detalle.

## Estado del deploy

- Pendiente.
