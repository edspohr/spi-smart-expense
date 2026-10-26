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
