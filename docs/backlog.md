# Backlog — fuera de alcance deliberado

Ideas y mejoras que se decidió **no** hacer en las olas 0-9 del plan v3
(`docs/implementation-plan.md`). Cada entrada dice por qué quedó afuera y
después de qué ola conviene reevaluarla. La deuda técnica conocida vive en
`docs/technical-debt.md`; esto es lo que todavía no es deuda sino decisión.

Al mover un ítem al plan, borrarlo de aquí y referenciar la ola.

| Ítem | Por qué queda afuera | Reevaluar después de |
|------|----------------------|----------------------|
| Multi-país dentro de un mismo tenant (reglas por país o centro de costo) | Ningún cliente lo necesita hoy; multiplica la complejidad de política de aprobación, FX y formatos (ADR 0007). | Ola 7, cuando Elecnor defina su alcance geográfico |
| Storybook para componentes compartidos | Útil cuando haya varios tenants con branding distinto; hoy el costo de mantenerlo supera el beneficio. | Ola 9 |
| Virtualización de tablas (`@tanstack/react-virtual`) — TD-017 | La paginación con cursores de la Ola 8 debería bastar; virtualizar solo si hay >200 filas en pantalla. | Ola 8 |
| Reporte de variación presupuestaria (presupuesto vs. ejecutado por proyecto/usuario/mes) — TD-015 | Valor de negocio alto pero independiente del endurecimiento; mejor diseñarlo con feedback de SPI y Elecnor. | Ola 8 |
| Renombrar el repo a `expense-buddy` | Cosmético; romper URLs de GitHub, CI y Firebase Hosting sin beneficio hasta que exista el tenant demo. | Ola 7 |
| UX de login sin Google por tenant (`auth.googleLogin: false`) | El flag existe desde Ola 0, pero la pantalla de login solo se ajusta visualmente (ocultar botón). Falta revisar onboarding solo-password y mensajes de error. | Ola 3 |
| `minInstances: 1` en `extractReceipt` | Elimina el cold start (2-10 s en la primera lectura del día) pero cuesta ~USD 3-5/mes por tenant. Medir primero la latencia real con Sentry. | Ola 8 |
| Fecha de enforce de App Check | Desplegado en monitor en Ola 2. Requiere registrar la key reCAPTCHA Enterprise (manual), una semana de métricas limpias y luego `enforceAppCheck: true` en los `onCall`. Anotar aquí la fecha cuando se active. | Tras el deploy de Ola 2 + 1 semana |
| Service account dedicada para Functions | Hoy las Functions corren con la service account por defecto de Compute (rol Editor amplio). Crear `expense-buddy-functions@<proyecto>` con `datastore.user`, `firebaseauth.admin`, `aiplatform.user`, `logging.logWriter`, `eventarc.eventReceiver` y fijarla en `setGlobalOptions({ serviceAccount })`. | Ola 8 (operación) o al dar de alta el tenant demo |
| Eliminar la key de Google AI Studio | Estuvo pública en el bundle hasta Ola 2 y ya nada la usa (Vertex AI con IAM). Borrarla en AI Studio / GCP Credenciales. | Inmediatamente después del deploy de Ola 2 |
| Series históricas EUR→COP / EUR→CLP — TD-007 | Requiere API pagada; solo si contabilidad exige exactitud histórica en EUR. | Ola 7 |
| PIN al abrir la app (`AppLock` de Comandas) | Se decidió PIN por acción (ADR 0005). Puede ofrecerse como opción por tenant si un cliente lo pide. | Ola 4 |
| Mover la app a `app/` (estructura tipo Comandas) | Se mantiene la app en la raíz para evitar mover cientos de archivos (ADR 0002). | Ola 9 |
| Focus-ring sweep en `AdminReports`, `AdminModuleSelector` y páginas nuevas (heredado del parking lot v2) | Find-replace de la utility `.focus-ring`; sin lógica. Hacerlo al refactorizar cada página. | Ola 9 |
| Branding editable en runtime desde `/admin/settings` | Manifest, íconos y paleta son de build (Ola 1); editarlos en caliente exige generar el manifest dinámicamente. | Cuando un cliente lo pida |
| Invitaciones para cuentas Google sin contraseña (`claimInvite`) | Hoy la invitación crea cuenta email/contraseña; si la persona entra con Google con el mismo correo verificado, Firebase la vincula. Revisar si un tenant usa solo Google. | Ola 7 |
| Resumen semanal por correo | La Ola 5 dejó recordatorio diario de pendientes (opt-in). El resumen semanal para quien rinde/aprueba puede salir de la misma plantilla. | Tras activar Brevo |
| Dictado por voz en descripciones (`useSpeechToText`, ETFA) | Previsto en Ola 7 y postergado: útil en terreno pero no bloquea la demo; Web Speech API solo es fiable en Chrome/Android. | Tras feedback de Elecnor |
| Usuarios de sistema ocultos (`isSystemUser()`, patrón ETFA) | Los datos demo usan personas ficticias visibles a propósito. Volver a esto si aparecen cuentas técnicas (soporte, integraciones). | A demanda |
| Renombrar `isColombiaApprover` → `isBaseCurrencyApprover` | Semántica ya genérica (ADR 0007); el renombre exige migrar `users.permissions` y claims en cada tenant. | Ola 9 |
| Paquete compartido `@growth-buddies/design` | La paleta Growth Buddies Light vive en `design/growth-buddies-light/` de este repo (ADR 0013). Publicarla como paquete cuando una segunda app buddies la use. | Segunda app buddies |
| Avatar del sidebar con degradado `indigo` | Color fijo fuera de la paleta; cambiarlo a `brand` también altera el look de SPI. | Cuando SPI acepte retoques visuales |
| Calculadora de ahorro y formulario de contacto en la landing | Implementados y retirados por decisión del responsable (no convencían); recuperables desde el historial de git (commit 50a76ea). | A demanda |
| Video de 20 s en la landing, caso SPI y logos, planes visibles, dominio propio | Siguientes palancas comerciales propuestas con la landing; requieren material o decisiones del responsable (video, permiso de SPI, precios, dominio). | Tras medir la landing |
| Validar facturas electrónicas (DTE) ante el SII y exportar a Defontana / Nubox / Softland | Diferenciador fuerte para finanzas en Chile; requiere certificado digital y alcance con un cliente. | Con Elecnor u otro cliente chileno |
| Niveles de aprobación genéricos | Hoy: responsable → finanzas con doble firma (ADR 0012). Un arreglo arbitrario de niveles por monto si un cliente lo pide. | A demanda |
