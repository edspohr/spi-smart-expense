# Validación — Ola 8: Offline automatizado

**Fecha:** 2026-10-26
**Impacto en SPI:** transparente. Todo queda detrás de
`settings/tenant.offline.localReader` (apagado por defecto). Sin activarlo,
SPI no ve "Listo para terreno", el formulario llama a la IA como siempre y
sin señal sigue ofreciendo ingreso manual + cola (Ola 6). Las dos Functions
nuevas (`getMerchantDictionary`, `verifyLocalRead`) no hacen nada si nadie
lee en el teléfono. El demo lo trae activado.

Formato: qué cambió → cómo probarlo → estado esperado. Marcar ✅ al verificar.

---

## 1. Lector en el teléfono (`src/lib/localReader/`)

**Qué cambió:** la app lee la boleta sin red y sin IA en la nube:

- **Código tributario primero (exacto).** `zxing-wasm` decodifica el timbre
  electrónico chileno (PDF417 del TED: RUT emisor, razón social, tipo de
  DTE, folio, fecha, total, primer ítem) y el QR de la factura electrónica
  DIAN (NIT, número, fecha, total, CUFE). Reintenta con giros de ±2°, ±4° y
  ±7° (`barcodeScan.ts`), porque una foto ligeramente torcida hacía fallar
  el PDF417.
- **OCR + reglas si no hay código.** `tesseract.js` con el modelo español
  (2 MB) sobre la foto en grises y con contraste; luego reglas en
  TypeScript puro (`rules.ts`): total (descarta subtotal, neto, IVA y
  propina), fecha (dd/mm/aaaa, aaaa-mm-dd, "22-OCT-2026"), hora, RUT/NIT
  con dígito verificador, folio, medio de pago y tarjeta, moneda y
  comercio. Tolera confusiones típicas del OCR (coma por punto en el RUT,
  cero por O en el mes).
- **Diccionario del tenant.** RUT/NIT → comercio y categoría más
  frecuentes entre los gastos aprobados (callable `getMerchantDictionary`,
  caché de 6 h en `cache/merchantDictionary`, guardado en el teléfono).
- **Categoría por palabras clave**, mapeada a los nombres de categoría de
  cada tenant (GASOLINA en SPI, COMBUSTIBLE en el demo).
- **Confianza por campo** (alta/media/baja) y origen (timbre, QR DIAN,
  conocido, leído, palabra clave).
- Los motores se sirven desde nuestro dominio (`/ocr/<versión>/`, ~7 MB) y
  se cargan solo cuando hacen falta; no entran al precache del service
  worker.

**Cómo probarlo:** `npm test -- --run src/lib/localReader` (18 pruebas, de
ellas una de corpus con las 8 boletas sintéticas de
`src/lib/localReader/__fixtures__/receipts/`).

**Estado esperado:** corpus al 100 %: timbre 3/3 en todos los campos; OCR
monto 5/5, fecha 5/5, RUT 4/4. Umbral que hace fallar CI: códigos 100 %,
monto y fecha por OCR ≥ 90 %. ✅ (2026-10-26)

## 2. Formulario "leído sin conexión" (`ExpenseForm.jsx`)

**Qué cambió:** al pulsar "Analizar Documentos":

- **Sin señal** (real o simulada) **y lector activo** → lee en el teléfono,
  precarga el formulario y muestra un aviso ("Leído del timbre
  electrónico, sin conexión…") y un distintivo por campo: "Del timbre",
  "Del QR DIAN", "Conocido", "Leído", "Revisa", "Verifica".
- **Sin señal y lector apagado** → ingreso manual, como en la Ola 6.
- **Con señal** → IA como siempre; si la llamada falla por red, cae al
  lector local.
- **Con señal y `ai.localFirst`** → si la lectura local trae monto y fecha
  con confianza alta, no llama a la IA.
- Nunca se envía sola: la persona confirma. El gasto guarda `localRead`
  (motor, tipo de documento, offline, duración, valores y confianza leídos).

**Cómo probarlo (emulador):** ver el recorrido completo en la sección 6.

**Estado esperado:** TED leído en ~0,1 s; boleta de papel en ~0,5-0,7 s en
un notebook (más en teléfonos de gama media). ✅ (2026-10-26, emulador)

## 3. "Listo para terreno" (`fieldReady.ts`, `FieldReadyCard.tsx`)

**Qué cambió:** tarjeta en Mi Espacio (`/dashboard/mi-espacio`), visible
solo con el lector activo. "Preparar para terreno" descarga los motores a
la caché `ocr-assets` (la misma desde la que el service worker los sirve),
los deja cargados, actualiza el diccionario y trae del servidor los
centros de costo, el perfil y las rendiciones propias a la caché offline de
Firestore. Muestra "Listo para terreno · actualizado hace X", centros de
costo y comercios conocidos. Se refresca solo (una vez por sesión, a los
5 s) cuando ya estaba preparado y tiene más de 12 h.

**Cómo probarlo:** Mi Espacio → "Preparar para terreno".

**Estado esperado:** pasa a "Listo para terreno" con "2 centros de costo"
en el emulador; las cuatro piezas del lector quedan en la caché. ✅
(2026-10-26, emulador)

## 4. Verificación con IA al sincronizar (`functions/src/offline.ts`)

**Qué cambió:** `verifyLocalRead` (trigger de creación de `expenses`) actúa
solo si el gasto trae `localRead`: Gemini relee la foto desde Storage y la
compara con lo enviado en monto, fecha y RUT/NIT. Escribe `aiReview`
(`match | mismatch | no-image | error`, campo solo de servidor: las reglas
lo rechazan desde el navegador). Si difiere, avisa a quien rindió ("la IA
leyó otro valor en el monto") y Aprobaciones muestra "Revisar: la IA leyó
otro valor"; el detalle lista enviado vs. IA. Además guarda un registro
anónimo en `ocrEval` (motor, tipo de documento, duración, confianza y
acierto por campo; sin imagen ni valores ni persona).

**Cómo probarlo:** sección 6.

**Estado esperado:** `aiReview.status = "match"` con
`gemini-3.6-flash`; un `ocrEval` con los seis campos en `true`. ✅
(2026-10-26, emulador con Vertex real)

## 5. Ajustes del superadmin y "Simular sin señal"

**Qué cambió:**

- Ajustes → **Lectura sin conexión**: activa el lector y "Listo para
  terreno" (`offline.localReader`) y "Leer en el teléfono también con
  señal" (`ai.localFirst`). Ambos validados en `adminUpdateSettings`.
- **Precisión del lector**: acierto por campo, total y separado por código
  vs. texto, tiempo típico y cuántas difirieron según la IA (últimos 500
  `ocrEval`, solo superadmin).
- **"Simular sin señal"** en la tarjeta de terreno (todo el tenant demo y
  superadmins): corta Firestore (`disableNetwork`), bloquea los callables
  y marca la cabecera "Sin señal (simulado)". Al volver, la cola se envía
  sola, como en una reconexión real. Sobrevive a recargar la pestaña.

**Estado esperado:** los dos interruptores guardan y el panel muestra 100 %
en los seis campos tras la prueba. ✅ (2026-10-26, emulador)

## 6. Recorrido completo (emulador)

```bash
npm run emulators      # terminal 1
npm run seed:emu       # cuando diga "All emulators ready"
npm run dev:emu        # terminal 2
```

1. Entrar como `superadmin.prueba@expensebuddy.test` (clave en
   `scripts/seed-emulator.mjs`) → Ajustes → activar "Lectura sin conexión".
2. Mi Espacio → "Preparar para terreno" → "Simular sin señal".
3. Mi Resumen → Rendir un Gasto → subir
   `src/lib/localReader/__fixtures__/receipts/ted-boleta-combustible.png` →
   Analizar: comercio, RUT, fecha, folio, monto y moneda CLP "Del timbre";
   categoría GASOLINA "Revisa".
4. Completar Evento y forma de pago → Confirmar: "Sin conexión: la
   rendición quedó guardada…".
5. Mi Espacio → "Volver a tener señal": la rendición pendiente se envía
   sola.
6. Ajustes → Precisión del lector: 1 lectura por código, 100 %.

(En SPI la advertencia "El NIT no parece válido" aparece porque la boleta
de prueba es chilena; es lo esperado.) ✅ (2026-10-26)

## 7. Límites conocidos

- **Envío en segundo plano (Background Sync):** investigado y no
  implementado. El SDK de Firestore y la sesión de Firebase Auth viven en
  la página, no en el service worker, y Background Sync solo existe en
  Chrome/Android (no en iPhone). La cola se envía al abrir la app con señal
  o al volver la cobertura con la app abierta.
- El OCR local es menos preciso que la IA en papel térmico arrugado o mal
  fotografiado; las métricas reales llegarán con el corpus de boletas del
  responsable y con el uso (panel de precisión).
- El corpus actual es sintético (generado con
  `scripts/fixtures/make-receipt-fixtures.py`); las boletas reales se suman
  en la misma carpeta con su entrada en `expected.json`.

## 8. Checks de calidad

- `npm run lint`, `npm run typecheck`: ✅
- `npm test -- --run`: ✅ 121 pruebas (incluye corpus y lógica de
  `offline.logic.ts`)
- `npm run test:rules`: ✅ 21 (nueva: `localRead` permitido, `aiReview`
  solo servidor, `ocrEval` solo lectura de superadmin, `cache` invisible)
- `npm run build` y `npm run build:demo`: ✅ (`dist/ocr/7.0.0-3.1.6/` y
  `sw.js` con la caché `ocr-assets`)
- `npm run functions:build`: ✅

---

# Ola 8b — Lector que aprende I (modo sombra y capa del cliente)

**Fecha:** 2026-10-26
**Impacto en SPI:** ninguno mientras no active "Medir el lector en todas las
rendiciones". El demo lo trae activo. Decisión: ADR 0016; textos legales:
`docs/legal/lector-datos-derivados.md` (borrador para abogado).

## 9. Modo sombra (`offline.shadowRead`)

**Qué cambió:** con señal y Gemini leyendo como siempre, el teléfono lee la
misma foto en segundo plano (sin precargar ni mostrar nada). Se salta con
ahorro de datos o red 2G y si no termina antes de enviar. El gasto guarda
`localRead` (`mode: 'shadow'`, versión del lector, montos candidatos con su
etiqueta) y `aiRead` (lo que leyó Gemini). Con "Leer en el teléfono también
con señal", una lectura local poco confiable también queda como medición
sombra. Es independiente del lector offline: se puede medir antes de
activarlo. Las rendiciones distribuidas en varios centros de costo ya no
llevan la lectura (antes contaban cada parte como error de monto).

**Cómo probarlo (emulador):** Ajustes → activar solo "Medir el lector en
todas las rendiciones" → Rendir un Gasto con
`__fixtures__/receipts/papel-restaurant-propina.png` → Analizar (lo llena
Gemini; sin distintivos) → completar Evento → Confirmar.

**Estado esperado:** `localRead.mode = "shadow"` (~1 s de lectura), `aiRead`
con el modelo, sin `aiReview`; un `ocrEval` con `localVsSubmitted`,
`aiVsSubmitted` y `localVsAi`. ✅ (2026-10-26, emulador con Vertex real)

## 10. Aprendizaje por emisor (`readerProfiles`)

**Qué cambió:** si exactamente una etiqueta del OCR traía el monto
confirmado, suma un voto para ese RUT/NIT emisor. Con 2 votos o más y
mayoría clara (≥ 60 %), el diccionario del teléfono entrega
`amountLabel` y el lector prefiere esa línea para el total en la próxima
boleta del emisor. Todo queda en el proyecto del cliente (solo servidor).

**Estado esperado:** tras la prueba 9, `readerProfiles/76354771-K` con
`labels["TOTAL A PAGAR"] = 1`. Pruebas unitarias del voto, el umbral y la
preferencia en `offline.test.ts` y `localReader.test.ts`. ✅

## 11. Métricas diarias y panel

**Qué cambió:** `ocrStats/{fecha}` con contadores por modo, motor y campo,
acierto de la IA vs. lo confirmado, tiempo medio por motor y diferencias
según la IA. El panel de Ajustes lee los últimos 30 días: columnas
Teléfono / Con código / Por texto / IA, desglose sombra vs. sin señal y
monto por semana.

**Estado esperado:** "1 día con lecturas · 1 lectura (1 en modo sombra, 0
sin señal) · texto 1 s" y 100 % en monto, fecha, comercio y categoría. ✅

## 12. Aviso a las personas que rinden

**Qué cambió:** la tarjeta de terreno de Mi Espacio muestra el aviso corto
y un "Más información" desplegable (texto de §4 del documento legal), con
la etiqueta fiscal del país (NIT/RUT). Si el tenant solo mide (sin lector
offline) aparece únicamente el aviso.

**Estado esperado:** visible en SPI con "NIT". ✅

## 13. Checks de calidad (8b)

- lint, typecheck: ✅ · `npm test -- --run`: ✅ 129 · `test:rules`: ✅ 21
  (nuevos casos: `localRead`/`aiRead` inmutables tras crear, `ocrStats`
  solo lectura de superadmin, `readerProfiles` invisible) · ambos builds y
  functions: ✅

---

# Ola 8c — Lector que aprende II (capa general)

**Fecha:** 2026-10-26
**Impacto en SPI:** ninguno. El consentimiento está apagado y no hay
proyecto central: aunque alguien lo active, el envío queda en el propio
proyecto (`learningOutbox`). **Textos provisionales `derived-v0`**: no
activar con clientes reales hasta la revisión legal (`docs/pendientes.md`).

## 14. Consentimiento (Ajustes → "Aportar a la mejora del lector")

**Qué cambió:** tarjeta con el texto (`src/lib/learningTerms.ts`, marcado
"Versión provisional"), casilla para aceptar o revocar, estado con
quién/cuándo/versión y aviso si el texto cambió. El callable
`adminUpdateSettings` exige la versión vigente y registra cada cambio en
`consentLog`; las reglas impiden escribir `settings/tenant.learning` desde
el navegador.

**Estado esperado:** al aceptar, "Activado por Sara Superadmin el … (texto
derived-v0)" y un `consentLog` `grant`; al revocar, "Desactivado: nada sale
de tu ambiente" y un `revoke`. ✅ (2026-10-26, emulador)

## 15. "Ver qué se envía" y exportación

**Qué cambió:** `previewDerivedData` devuelve el envío exacto, el destino y
el último resultado. `exportDerivedData` corre a diario a las 07:00 UTC:
sin consentimiento vigente no envía; con él, manda la foto de votos por
emisor (solo personas jurídicas) y los contadores de los días cerrados
desde el último envío, al hub o, sin `LEARNING_HUB_URL`, a
`learningOutbox/{día}`.

**Cómo se probó (emulador, SPI = CO):** perfiles `900123456-7` (empresa) y
`1020304050` (persona) más un día de contadores con datos de la IA.

**Estado esperado:** la vista previa muestra 1 emisor (solo la empresa) y 1
día, sin el bloque `ai`; la primera exportación escribe el outbox con los 6
campos del esquema y `lastExportDay = 2026-10-25`; la segunda manda 0 días
nuevos; tras revocar, `status: skipped (sin consentimiento)`. ✅

## 16. Hub y paquete de lectura

**Qué cambió:** `ingestContribution` (solo con `HUB_MODE=true`; no existe en
los proyectos de clientes) verifica el ID token de Google, la lista de
remitentes y el esquema exacto. `npm run pack:build -- --project <hub>`
genera `src/lib/localReader/pack/reader-pack.json` (hoy versión `0`,
vacío); el lector usa sus etiquetas salvo que el cliente haya aprendido la
suya. Runbook: `docs/runbooks/learning-hub.md`.

**Estado esperado:** pruebas unitarias de esquema, filtro de personas
naturales, agregación y precedencia del paquete. ✅ La verificación del
token y el envío HTTPS real quedan sin probar hasta crear el proyecto
central. ☐

## 17. Checks de calidad (8c)

- lint, typecheck: ✅ · `npm test -- --run`: ✅ 135 · `test:rules`: ✅ 21
  (consentLog y learningOutbox solo lectura de superadmin; `learning` no
  editable desde el navegador) · ambos builds y functions: ✅ ·
  `ingestContribution` ausente sin `HUB_MODE`: ✅

---

# Ajustes para SPI: viajeros y boletas del extranjero

**Fecha:** 2026-10-26
**Por qué:** SPI no va a faenas, pero viaja mucho a ferias. Rendir en el
avión o sin datos es su caso, y sus boletas vienen a menudo de EE. UU.

## 18. Boletas del extranjero (lector 1.3.0)

**Qué cambió:** el lector reconoce boletas en inglés (marcadores como
THANK YOU, TAX, TIP, SERVER o el código postal "IL 60616") y entonces lee
las fechas mes/día, "OCT 12, 2026", horas AM/PM, totales en inglés (TOTAL
DUE, AMOUNT DUE, GRAND TOTAL; descarta TAX, TIP y CHANGE), pagos en
inglés (CREDIT, DEBIT, CASH) y "$" como USD. Si no está seguro del idioma
y la fecha puede leerse de las dos formas (05/10), la marca "Verifica". La
categoría reconoce ferias (EXHIBITOR, REGISTRATION, BADGE → TICKET FERIA),
hoteles y aerolíneas de EE. UU., Lyft/Uber/taxi, tecnología y comidas.

**Estado esperado:** corpus al 100 % con 4 casos nuevos (folio de hotel en
Chicago con 10/03 = 3 de octubre, restaurante con propina y 7:42 PM, taxi
con "OCT 12, 2026", factura colombiana con QR DIAN real decodificado desde
la imagen). ✅

## 19. Tasa de cambio al aterrizar

**Qué cambió:** sin señal, el formulario ya no intenta pedir la tasa y
avisa "la tasa de cambio se calculará sola al enviar, con la del día de la
boleta". Al enviar (cola offline o envío normal sin tasa), `fillMissingRates`
busca la tasa oficial de la fecha de la boleta y completa `trm`,
`trmSource` y el equivalente en COP. Antes, esas rendiciones quedaban sin
conversión.

**Cómo se probó (emulador, SPI, perfil Profesional):** sin señal simulada →
folio del Hyatt de Chicago → leído en el teléfono: USD 339,29, 3 oct, Visa
4421, HOTEL → Confirmar (queda en cola) → volver a tener señal.

**Estado esperado:** la rendición llega con TRM 3.273,49 (Banco de la
República, 3 oct), COP 1.110.662 y la IA confirma la lectura (`match`). ✅

## 20. "Listo para viajar"

**Qué cambió:** el texto del kit sin señal depende del tenant
(`tenants/<id>.json → offline.context`): SPI usa `travel` ("Listo para
viajar", ícono de avión, "rendir en el avión o sin datos"); el demo sigue
con "terreno". Mi Resumen muestra una línea con el estado ("Listo para
viajar · actualizado hace 4 h" o "¿Viajas pronto? Prepara la app…") que
lleva a Mi Espacio. Solo aparece con el lector activo.

**Estado esperado:** visible en SPI con el lector activo en el emulador. ✅

## 21. Activación en SPI

El modo sombra quedó **activo en SPI** (2026-10-26) para medir con boletas
reales; el lector sin conexión sigue apagado hasta revisar el panel de
precisión (2-4 semanas).
