# Pendientes del responsable (Edmundo)

Tareas que solo puede hacer el dueño del proyecto (consola de Firebase/GCP,
pruebas con sesión real en producción, acciones con clientes). El desarrollo
no se detiene por ellas; se revisan al cierre de cada ola.

Marcar `[x]` con la fecha al cerrar.

## Abiertos

- [ ] **Probar la Ola 3 en producción** (5 min): recargar la app (o cerrar y
  abrir sesión) y confirmar que ves Configuración → Usuarios y Ajustes;
  revisar que la lista muestra a los 12 usuarios; invitar un correo propio de
  prueba, completar el correo, entrar y luego eliminarlo. Confirmar con un
  admin de SPI que no ve esa sección.
- [ ] **Verificar Ola 2 en producción** (5 min): entrar como admin a
  https://spi-smart-expense.web.app, revisar que la consola del navegador no
  muestre `permission-denied`, subir un recibo en "Nueva Rendición", aprobar
  una rendición y rechazar otra, ver la campana del profesional, correr la
  reconciliación en `/admin/reconciliation` (dry-run, sin drift).
- [ ] **Borrar la key vieja de Google AI Studio** (estuvo pública en el
  bundle; ya nada la usa): AI Studio → API keys, o GCP → APIs y servicios →
  Credenciales del proyecto `spi-smart-expense`.
- [ ] **Activar enforce de App Check** desde el 2026-11-01, si el panel de
  App Check muestra ~100 % de solicitudes verificadas: Firestore, Storage y
  luego avisarme para poner `enforceAppCheck: true` en las Functions.
- [ ] **Verificar la campana de notificaciones** con un usuario que tenga
  notificaciones (índice desplegado en Ola 0, TD-024).
- [ ] **Probar la instalación de la PWA** en Android (prompt nativo) y en
  iPhone (modal con pasos) — validación Ola 1, puntos 1 y 2.

## Más adelante (no urgente)

- [ ] Cuando quieras mostrar el PIN a SPI (tras el deploy de Ola 4): crear
  tu PIN en Mi Espacio → Seguridad y activarlo en Ajustes; avisar a los
  admins para que creen el suyo (verán un aviso amarillo).

- [ ] Crear el proyecto Firebase del tenant demo (`expense-buddy-demo`) para
  la Ola 7.

## Cerrados

- [x] 2026-10-25 — Habilitar APIs de Functions/Vertex y rol IAM en
  `spi-smart-expense`.
- [x] 2026-10-25 — Crear clave reCAPTCHA Enterprise y registrar App Check en
  modo monitor.
