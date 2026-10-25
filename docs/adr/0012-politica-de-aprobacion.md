# 0012 — Política de aprobación por tenant (simple o por niveles)

**Estado:** Aceptada
**Fecha:** 2026-10-25
**Ola:** 5

## Contexto

SPI aprueba en un paso: cualquier admin (o aprobador por moneda) decide.
Empresas como Elecnor necesitan que primero apruebe el responsable directo
de quien rinde, luego finanzas, con doble firma sobre montos altos y
reemplazos cuando el responsable no está. Debe ser configurable por tenant
sin cambiar el comportamiento de SPI.

## Decisión

- `settings/tenant.approvalPolicy` con `mode: 'single' | 'levels'`,
  `autoApproveBelow`, `managerApproval`, `secondSignatureAbove`,
  `allowDelegation`, `staleReminders`, `staleDays`. Default = `single` sin
  automatismos (SPI idéntico).
- Un trigger `onExpenseCreated` calcula al crear: auto-aprobación bajo el
  umbral o un `approvalFlow` (pasos `manager` → `finance`, con
  `signaturesRequired` 1 o 2). En modo simple no escribe nada.
- `reviewExpense` avanza firma a firma; la rendición solo pasa a
  `approved` al completar el último paso. Nadie aprueba lo propio en modo
  por niveles; los admins pueden actuar en cualquier paso (queda marcado
  "como administrador").
- `pendingApproverUids` (responsable y su delegado activo) permite a un
  responsable que no es admin leer y aprobar lo de su equipo
  (`/dashboard/approvals`). `setDelegation` actualiza las rendiciones
  abiertas al delegar o terminar.
- Lógica pura en `functions/src/approval.logic.ts` con tests.

## Alternativas consideradas

- **Arreglo genérico de niveles `[{maxAmount, approver}]`.** Más flexible
  pero difícil de configurar y explicar; los casos reales (responsable +
  finanzas + doble firma) caben en el modelo elegido. Se puede extender.
- **Calcular el flujo al primer intento de aprobación.** Sin trigger, pero
  impide la auto-aprobación y avisar al responsable al momento de rendir.
- **Dar a los responsables rol admin.** Expondría todas las rendiciones.

## Consecuencias

- Cambiar la política aplica a rendiciones nuevas; las abiertas conservan su
  flujo.
- El trigger de creación lee settings y el perfil del usuario en cada
  rendición nueva (costo marginal).
- La delegación cubre el paso del responsable; finanzas se reemplaza
  asignando permisos de aprobador en Usuarios.
