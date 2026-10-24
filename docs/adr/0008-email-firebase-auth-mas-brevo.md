# 0008 — Email: Firebase Auth nativo + Brevo para transaccionales

**Estado:** Aceptada
**Fecha:** 2026-10-24
**Ola:** 3 (invitaciones), 5 (transaccionales)

## Contexto

La gestión de usuarios por invitación necesita emails de alta y reset de
password. Los flujos de aprobación necesitan avisos (aprobado, rechazado,
pendiente hace N días, resumen). Hoy no se envía ningún email. Cada tenant
tiene su propio Firebase project y su propia marca.

## Decisión

- **Invitación, verificación y reset de password:** emails nativos de
  Firebase Auth (plantillas del proyecto, con nombre del tenant y dominio
  autorizado). Gratis, confiables y sin construir el flujo de set-password a
  mano.
- **Transaccionales de negocio:** Brevo, enviado desde Cloud Functions con
  API key en Secret Manager y plantillas por tenant. Opt-out por usuario.

## Alternativas consideradas

- **Solo Firebase Auth.** Cero integración extra, pero sin avisos de
  aprobación/rechazo por email (solo push y campana in-app).
- **Todo por Brevo/SendGrid.** Control total de branding, pero obliga a
  implementar tokens de set-password, gestionar reputación de dominio por
  cliente y mantener plantillas duplicadas.
- **Extensión Trigger Email de Firebase.** Más simple, pero menos control
  de plantillas y sin opt-out ni métricas por tenant.

## Consecuencias

- Las plantillas de Auth se personalizan por proyecto en el bootstrap del
  tenant (runbook Ola 7).
- Brevo requiere sender verificado por tenant (o un sender compartido de
  Expense Buddy como default).
- Los emails transaccionales se disparan desde las callables, nunca desde
  el cliente.
