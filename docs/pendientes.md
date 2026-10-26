# Pendientes del responsable (Edmundo)

Tareas que solo puede hacer el dueño del proyecto (consola de Firebase/GCP,
pruebas con sesión real en producción, acciones con clientes). El desarrollo
no se detiene por ellas; se revisan al cierre de cada ola.

Marcar `[x]` con la fecha al cerrar.

## Abiertos

- [ ] **Activar el demo en un clic** (1 min): correr los dos comandos
  `gcloud` de `docs/runbooks/bootstrap-tenant.md` (sección Tenant demo:
  `iamcredentials` + `serviceAccountTokenCreator`). Sin eso los botones
  "Entra al demo" muestran error.
- [ ] Revisar en Google Analytics (propiedad del proyecto
  `expense-buddy-demo`) que lleguen `landing_view`, `demo_start` y
  `cta_click`.

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

- [ ] **Activar notificaciones push**: Firebase console → Configuración del
  proyecto → Cloud Messaging → Certificados push web → "Generar par de
  claves"; pásame la clave pública y la pongo en `VITE_FCM_VAPID_KEY` y
  redeployo. Luego probar en tu teléfono (Mi Espacio → Notificaciones).
- [ ] **Probar rendir sin señal** en terreno (modo avión) y **compartir una
  foto** desde la galería a la app instalada en Android.

- [ ] **Activar correos (Brevo)** cuando quieras: crear una API key en Brevo
  (SMTP & API → API keys) y verificar un remitente (p. ej.
  `notificaciones@spohr.cl`); luego correr
  `firebase functions:secrets:set BREVO_API_KEY --project spi-smart-expense`
  y avisarme el remitente para poner `EMAIL_PROVIDER=brevo` y redeployar.
- [ ] Si SPI quiere aprobación por niveles: asignar responsables en Usuarios y
  elegir "Por niveles" en Ajustes → Política de aprobación.

- [ ] Cuando quieras mostrar el PIN a SPI (tras el deploy de Ola 4): crear
  tu PIN en Mi Espacio → Seguridad y activarlo en Ajustes; avisar a los
  admins para que creen el suyo (verán un aviso amarillo).

- [ ] **Probar el demo** en https://expense-buddy-demo.web.app (10 min):
  entrar como `rodrigo.pizarro@andesenergia.demo` (admin) con la clave de
  `scripts/demo-credentials.local`, aprobar algo; entrar como
  `diego.munoz@…` y aprobar a su equipo en "Mis aprobaciones"; rendir con
  foto de una boleta chilena desde el teléfono e instalar la PWA. Antes de
  cada presentación: `node scripts/seed-demo.mjs --prod --reset`.
- [ ] Opcional demo: clave reCAPTCHA Enterprise para App Check
  (`expense-buddy-demo.web.app`) y clave Web Push si se quiere mostrar push.

## Cerrados

- [x] 2026-10-25 — Crear el proyecto Firebase del demo `expense-buddy-demo`
  (Blaze, app Web, Authentication con correo/contraseña).

- [x] 2026-10-25 — Habilitar APIs de Functions/Vertex y rol IAM en
  `spi-smart-expense`.
- [x] 2026-10-25 — Crear clave reCAPTCHA Enterprise y registrar App Check en
  modo monitor.
