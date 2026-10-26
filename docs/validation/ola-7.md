# Validación — Ola 7: País configurable y tenant demo

**Fecha:** 2026-10-25
**Impacto en SPI:** transparente. SPI sigue en COP con TRM de BanRep, NIT,
Nequi/Daviplata, "Regístrate aquí" y sus categorías y centros de costo de
siempre. El único cambio de datos es que los gastos nuevos guardan además
`baseCurrency` y `amountBase` (iguales a `COP` y `amountCOP`).

Formato: qué cambió → cómo probarlo → estado esperado. Marcar ✅ al verificar.

---

## 1. País por tenant (`src/lib/country.ts`)

**Qué cambió:** registro `{ CO, CL }` con moneda base, proveedor de tipo de
cambio, etiqueta y validador de ID fiscal (NIT con dígito DIAN, RUT con
módulo 11 portado de ETFA), placeholders, billetera y locale. Todo lo que
antes decía "COP", "TRM", "NIT" o "Colombia" sale de ahí:

- Tipo de cambio: `banrep` (USD→COP histórico), `mindicador` (USD/EUR→CLP,
  retrocede hasta 7 días por fines de semana) y `open.er-api` como respaldo.
- Equivalente en moneda base: `amountBase` + `baseCurrency` en cada gasto;
  `amountCOP` se sigue escribiendo solo cuando la base es COP. Los lectores
  usan `amountBase ?? amountCOP`.
- Totales: la moneda base ya no se excluye (antes CLP quedaba fuera).
- "Aprobador Colombia" pasa a "Aprobador {país} ({moneda})": mismo permiso
  (`isColombiaApprover`) y misma semántica para SPI; el claim lleva ahora
  `baseCurrency` y las reglas comparan contra él.
- Gemini: el prompt recibe el país. CO conserva el texto y el mapeo de
  categorías de SPI tal cual; CL lee RUT, boleta/factura, IVA 19 %, CLP sin
  decimales y bencineras chilenas (Copec, Shell, Aramco, Enex) como
  COMBUSTIBLE.

**Cómo probarlo (SPI):** Nueva Rendición en USD → el TRM sigue diciendo
Banco de la República; el campo dice "NIT"; Reportes y Dashboard muestran
los mismos totales que antes.

**Estado esperado:** nada distinto a la vista. ☐

## 2. Tenant demo "Expense Buddy" (Andes Energía SpA)

**Qué cambió:** `tenants/demo.json` completo (CLP/CL/mindicador, verde
`#059669`, logo e ícono propios en `public/brands/demo/`, categorías
chilenas, empresas de tarjeta, conciliación apagada, región
`southamerica-west1`). Login, sidebar, placeholders y pie de página salen
del tenant. Las clases `blue-*` de la app pasaron a `brand-*`: para SPI es
el mismo azul (su paleta es idéntica), para el demo es verde. Los centros
de costo por defecto de SPI se movieron a `tenants/spi.json`
(`defaultProjects`), así el bundle demo no contiene nada de SPI.

**Cómo probarlo (emuladores):**

```bash
npm run emulators:demo      # terminal 1 (proyecto expense-buddy-demo)
npm run seed:demo           # terminal 2
npm run dev:demo:emu        # terminal 3
```

Entrar como `rodrigo.pizarro@andesenergia.demo` / `Demo2026!` (admin).

**Estado esperado (verificado 2026-10-25 en emuladores):**
- Login verde con logo Expense Buddy, sin "Regístrate aquí" ✅
- Aprobaciones: 10 pendientes con insignias "Espera a Diego Muñoz",
  "Espera a Paula Herrera" o "Lista para finanzas"; montos `$1.240.000`
  sin decimales; el gasto en USD muestra `$149.00 USD` ✅
- Peaje de `$7.400` aprobado solo (bajo el umbral de `$10.000`) ✅
- Formulario manual: "RUT / Identificación Fiscal", `995200007` se formatea
  a `99.520.000-7` al salir del campo; `99.520.000-1` muestra "El RUT no
  parece válido" ✅
- Selects con categorías chilenas, CLP primero, empresas Andes ✅
- Claims: `tenantId: demo`, `baseCurrency: CLP` ✅
- Bundle demo sin "SPI Americas"; bundle SPI sin "Andes"/"Expense Buddy" ✅

## 3. Datos de demostración (`scripts/seed-demo.mjs`)

**Qué cambió:** empresa ficticia con 8 personas (superadmin Camila, admin
contador Rodrigo, dos jefaturas con equipo, tres profesionales y un
asistente), 4 centros de costo, asignaciones, política "Por niveles"
(responsable → finanzas, doble firma desde `$1.000.000`, auto-aprobación
bajo `$10.000`) y 25 gastos en distintos estados, uno en USD. Los gastos se
escriben como documentos normales: los triggers arman los flujos y saldos
igual que en uso real.

- `npm run seed:demo` — emuladores (idempotente).
- `npm run reset:demo` — borra gastos, proyectos, asignaciones,
  notificaciones y contadores (conserva cuentas) y vuelve a sembrar.
- Producción: `node scripts/seed-demo.mjs --prod --key <sa.json>
  [--password X] [--reset]`; se niega si el proyecto no contiene "demo";
  sin `--password` genera una y la imprime una vez.

**Estado esperado:** reset + seed en ~15 s; mismos saldos tras cada reset
(verificado: `demo-matias` = `$1.745.790` en ambas corridas) ✅

## 4. Alta de un tenant nuevo (`scripts/bootstrap-tenant.mjs`)

**Qué cambió:** genera `tenants/<id>.json` desde la plantilla demo (paleta
derivada de un color), `functions/.env.<proyecto>`, `.env.<id>.example` y
el alias en `.firebaserc`, e imprime los pasos de consola. Procedimiento
completo en `docs/runbooks/bootstrap-tenant.md`.

**Cómo probarlo:** `npm run bootstrap-tenant -- --id prueba --name "Prueba
SpA" --project prueba-gastos` y revisar los archivos; luego borrarlos.

**Estado esperado:** archivos creados; una segunda corrida no los pisa sin
`--force`. ☐

## 5. Ambiente de emuladores por proyecto

`functions/.env.local` quedó solo con `APP_URL=`: repetía los valores de
SPI y, como tiene prioridad sobre `.env.<proyecto>`, hacía que el emulador
del demo emitiera claims con `tenantId: spi`. Los parámetros de cada tenant
viven únicamente en `functions/.env.<projectId>` (ahora versionados; no
contienen secretos).

## Calidad

- `npm run lint` ✅ · 94 tests web ✅ · 46 tests functions ✅ · 20 tests de
  reglas ✅ · `npm run build` y `npm run build:demo` ✅

## Deploy

- 2026-10-25: SPI (`spi-smart-expense`) — Functions (18, `southamerica-east1`),
  reglas de Firestore y Storage, índices y hosting. Verificado: el bundle en
  producción es el mismo del build local, con marca SPI, sin textos del demo
  y con BanRep; `healthcheck` responde `ok`; login sin errores de consola,
  "Regístrate aquí" visible. El claim `baseCurrency` llega a cada usuario en
  su próxima escritura; mientras tanto las reglas asumen `COP`.
- 2026-10-25: demo (`expense-buddy-demo`, https://expense-buddy-demo.web.app).
  Firestore y Storage en `southamerica-west1`, Auth con correo/contraseña y
  registro desactivado en el servidor, APIs y rol Vertex, reglas, índices,
  18 Functions y hosting. Datos sembrados con ADC. Verificado: 10 pendientes
  con flujo, 13 aprobados, 2 rechazados; saldos iguales a los emuladores;
  claims `tenantId: demo` / `baseCurrency: CLP`; Gemini responde vía Vertex
  en el proyecto; `healthcheck` ok; login verde sin errores de consola y
  manifest `Expense Buddy` / `es-CL` / `#059669`. Falta: ingresar con una
  cuenta real desde el navegador y el teléfono (pendiente del responsable).
- Ajuste: `staleApprovalReminders` corre en `SCHEDULER_REGION` porque Cloud
  Scheduler no existe en `southamerica-west1` (demo: `southamerica-east1`;
  SPI no cambia).

## Marca Growth Buddies Light y logo ExB (2026-10-25)

**Qué cambió:** paleta clara compartida en `design/growth-buddies-light/`
(ADR 0013) aplicada al demo: `brand` turquesa (`600 = #007C93` para botones
AA, `500 = #0097B2` identidad), `themeColor #0097B2`, CTA "Rendir un Gasto"
vía `branding.ctaPalette` (escala `cta` nueva; SPI conserva el verde por
defecto). Logo/ícono **"B-recibo"** (B blanca cuya base es el borde dentado de una boleta, sobre tile turquesa) generado por `scripts/brand/expense-buddy-icon.py`
(SVG para login y sidebar, PNG para PWA; maskable y apple-touch a sangre).

**Estado (verificado):** valores computados en el navegador
(`#007C93` botón y CTA, `#0097B2` theme-color) ✅; login, sidebar y
dashboard móvil con el logo ExB ✅; íconos legibles de 512 a 32 px ✅; build
SPI con `--cta-600: 22 163 74` (verde) ✅; demo publicado con el manifest
nuevo ✅. Pendiente: ver el ícono instalado en un teléfono real ☐

## Landing comercial en el login del demo (2026-10-25)

**Qué cambió:** `src/components/LoginLanding.tsx` envuelve la tarjeta de
login cuando el tenant declara `landing` (y opcional `poweredBy`) en
`tenants/<id>.json`: titular, beneficios, seis funcionalidades reales (IA,
aprobación por niveles, sin señal, app instalable, presupuesto, seguridad),
llamado a la acción ("Agenda una demo" → Calendly, WhatsApp) y la insignia
"Powered by Growth Buddies" (enlace con UTM). Escritorio: propuesta a la
izquierda y login fijo a la derecha. Teléfono: titular corto → login →
funcionalidades. Como app instalada (`display-mode: standalone`) solo se ve
el login. SPI no declara `landing`: su login no cambia.

**Estado (verificado en navegador):** escritorio 1440 px y móvil 375 px sin
scroll horizontal ✅; login completo sobre el pliegue en móvil ✅; regla
`standalone` generada ✅; sin errores de consola ✅; bundle SPI sin el texto
de la landing ✅. Pendiente: abrir la app instalada y confirmar que salta la
landing ☐

## Demo en un clic, captura de leads y calculadora (2026-10-25)

**Qué cambió:**
- **Demo en un clic:** bajo el login, "Entra al demo" con tres roles
  (trabajador en terreno → Nueva rendición, jefatura → Mis aprobaciones,
  finanzas → Aprobaciones). El callable `demoSignIn` (solo con
  `DEMO_MODE=true`, nunca en clientes) emite un custom token para la cuenta
  fija del rol; límite de 30 ingresos por IP por hora. La superadmin no se
  ofrece.
- **Reinicio nocturno:** `resetDemoData` (04:00 Santiago, en
  `SCHEDULER_REGION`) borra gastos, notificaciones, PINs, tokens push y
  fotos subidas por visitantes y vuelve a sembrar. Los datos viven en
  `functions/src/demo.data.ts`, compartidos con `scripts/seed-demo.mjs`.
- **Leads:** formulario en el recuadro de contacto que escribe en el CRM de
  Growth Buddies (Firestore `leads` del proyecto `growth-buddies`, el mismo
  de growthbuddies.cl): llega el correo "Nuevo lead" y entra al seguimiento
  de días 1/3/7 con contenido de rendición de gastos (`interest`). Incluye
  UTM, dispositivo y el cálculo de ahorro si el visitante lo adjunta.
  Honeypot contra bots.
- **Medición:** Google Analytics (Firebase, `VITE_FIREBASE_MEASUREMENT_ID`)
  solo en la landing: `landing_view`, `demo_start`, `cta_click`,
  `calculator_use`, `lead_submit`.
- **Calculadora de ahorro:** supuestos editables (personas, rendiciones,
  minutos hoy y con la app, costo hora) → horas y CLP al mes y al año;
  lógica en `src/lib/savings.ts` con tests.

**Estado (verificado en emuladores):** jefatura entra como Diego a "Mis
aprobaciones" (4 pendientes) ✅; finanzas entra como Rodrigo a Aprobaciones
con permisos de admin ✅; lead guardado con `interest`, `partial: false`,
UTM y cálculo (con las reglas de Growth Buddies cargadas en el emulador) ✅;
reinicio borra gasto, PIN y token de un visitante y deja saldos idénticos
(Valentina $223.500, Matías $1.745.790) ✅; bundle SPI sin rastro del demo
ni del CRM ✅. **Producción:** funciones y hosting desplegados; `demoSignIn`
espera el permiso `serviceAccountTokenCreator` (pendiente del responsable) ☐;
probar un lead real con un correo propio ☐; ver eventos en GA4 ☐.

## Identidad "Tinta" del demo (2026-10-25)

**Qué cambió:** marco oscuro (sidebar, encabezado, landing) vía tokens
`chrome-*` y `data-chrome="ink"`; pantallas de trabajo claras; CTA ámbar
`#F5A524` con texto tinta ("Rendir un Gasto", "Iniciar Sesión", "Agenda una
demo"); ícono B-recibo turquesa sobre tinta; `themeColor #0B0B0F`.

**Estado (verificado en navegador):** landing oscura sin recorte de la
columna de login ✅; Aprobaciones con sidebar y encabezado tinta y tabla
clara ✅; dashboard móvil con encabezado tinta y CTA ámbar ✅; SPI sin
`data-chrome`, botón de login azul `rgb(37, 99, 235)`, CTA verde y tokens
iguales a los grises originales ✅; 99 tests ✅.

## Landing: sin calculadora ni formulario, con modo sin conexión (2026-10-25)

**Qué cambió:** por decisión del responsable se quitaron la calculadora de
ahorro y el formulario de contacto (y su código: `SavingsCalculator`,
`LeadForm`, `leads.ts`, `savings.ts`); quedan "Agenda una demo" y WhatsApp.
Nueva sección "Así funciona cuando no hay señal"
(`src/components/landing/OfflineExplainer.tsx`, texto en
`tenants/demo.json` → `landing.offline`): cuatro pasos desde el punto de
vista de quien rinde, con los mismos mensajes que muestra la app ("Sin
conexión · 1 sin enviar", "Se envió 1 rendición guardada sin conexión") y la
aclaración honesta de que la lectura con IA necesita conexión y de que los
envíos salen con la app abierta.

**Estado (verificado en navegador):** escritorio y móvil sin scroll
horizontal ✅; 96 tests ✅.
