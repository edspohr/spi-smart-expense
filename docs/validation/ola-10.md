# Validación — Ola 10: Timbre electrónico verificado sin conexión

**Fecha:** 2026-11-03
**Rama:** `ola-10/fiscal-ted` (sin desplegar)
**Decisión:** ADR 0017 · **Claves:** `docs/runbooks/sii-keys.md`
**Impacto en SPI:** transparente. SPI es Colombia: `fiscal.tedVerification`
queda en `off`, `verifyFiscalDocument` no se exporta (`COUNTRY=CO`), no hay
filtro, columnas ni tarjeta nuevas y `READER_VERSION` sigue en 1.3.0. Lo que
sí cambia para SPI: el bundle crece ~13 KiB (precache 2539,44 → 2552,33 KiB)
y `firestore.rules` valida dos campos que SPI nunca escribe.

**Límite principal:** no hay claves reales del SII en el repo. Hasta
agregarlas, todo TED real queda en "Verificación pendiente". Todo lo marcado
✅ se probó con timbres sintéticos firmados por una clave falsa del SII.

Formato: qué cambió → cómo probarlo → estado esperado. Marcar ✅ al verificar.

---

## 1. Lectura del timbre con sus bytes (`barcode.ts`)

**Qué cambió:** cuando el PDF417 trae `<TED`, el lector guarda cada byte
escaneado como un carácter (`rawTed`, latin1). Para el QR DIAN y cualquier
otro código el texto sigue igual que antes.

**Estado esperado:** pruebas en `localReader.test.ts` (TED con Ñ conserva el
byte `0xD1`). Corpus del lector sin cambios (100 %). ✅

## 2. Verificación (`functions/src/tedVerify.logic.ts`)

**Qué cambió:** `verifyTed` verifica FRMA (SII, clave por `IDK`), FRMT
(emisor, `RSAPK` del CAF), folio dentro de `RNG` y RUT del documento igual
al del CAF. Monto, fecha y RUT distintos de lo rendido quedan como
advertencias (`mismatches`). Mismo archivo en el teléfono y en Functions.

**Cómo probarlo:** `npm test -- --run functions/src/tedVerify.logic.test.ts`.

**Estado esperado:** 17 pruebas: válido en latin1 (con Ñ), en UTF-8 y con el
XML indentado; FRMA y FRMT adulterados → `invalid_signature`; monto cambiado
en el XML → `invalid_signature`; folio fuera de rango; RUT distinto del CAF;
`IDK` desconocido → `error`; diferencias de monto y fecha como advertencia;
PEM con nota de fuente. ✅

## 3. Formulario (`ExpenseForm.jsx`)

**Qué cambió:** con `tedVerification` distinto de `off` y país CL, al
"Analizar Documentos" el teléfono busca el timbre en paralelo con el motor
que corresponda (Gemini, lector local o sombra) y muestra el resultado. Al
confirmar compara el timbre con los valores **finales** (monto, fecha, RUT) y
guarda `rawTed` + `fiscalVerification` (`verifiedOn: 'device'`), también en
rendiciones divididas por centro de costo (sin comparar el total). En
`required`, un timbre con firma inválida, folio fuera de rango o RUT
distinto no se puede enviar; "Sin timbre" y "Verificación pendiente" sí.

**Estado esperado (demo, emulador, Chromium):** timbre sintético con Ñ y
clave de 512 bits → "Timbre verificado en el dispositivo". ✅ (2026-11-02)
Modo `required` bloqueando: ☐ no probado en navegador. Ruta con Gemini: ☐
(Gemini no responde en el emulador; se probó la ruta `ai.localFirst`).
Envío desde la cola sin conexión: ☐.

## 4. Verificación en el servidor (`functions/src/fiscal.ts`)

**Qué cambió:** `verifyFiscalDocument` (`onDocumentWritten` en `expenses`,
solo con `COUNTRY=CL`, región explícita del tenant) re-verifica `rawTed` y
sobrescribe con `verifiedOn: 'server'`. Sin `rawTed` escribe
`not_verifiable`, así que un `verified` declarado por el cliente sin timbre
no sobrevive. Repite al cambiar monto, fecha, RUT o moneda. Con el modo en
`off` borra cualquier valor que haya llegado. Parámetro
`TED_VERIFICATION_DEFAULT` (`advisory` en `.env.expense-buddy-demo`) para
cuando `settings/tenant` no lo define.

**Estado esperado (emulador demo, clave temporal):**

| Caso | Resultado |
|------|-----------|
| Timbre válido, monto rendido 50.000 vs. 68.400 impreso | `verified`, `server`, advertencia de monto ✅ |
| Timbre con `MNT` cambiado | `invalid_signature` ✅ |
| Sin `rawTed` y `fiscalVerification.status = verified` escrito por el cliente | `not_verifiable` ✅ |
| Editar el monto de una rendición verificada | re-verificado, advertencia actualizada ✅ |
| Escritura del trigger | no se vuelve a disparar (sin bucle) ✅ |
| Modo `off` | `fiscalVerification` borrado ✅ |

Se detectó y corrigió que el trigger se registraba en `us-central1` (el
módulo carga antes de `setGlobalOptions`). ✅

## 5. Reglas (`firestore.rules`)

**Qué cambió:** al crear, `rawTed` (texto ≤ 4096) y `fiscalVerification`
(esquema `cl_ted`, `verifiedOn: 'device'`, estado válido) son opcionales y
validados; al actualizar, ambos inmutables desde el navegador.

**Cómo probarlo:** `npm run test:rules`, bloque "fiscal verification (Ola 10)".

**Estado esperado:** 24/24; se rechaza crear con `verifiedOn: 'server'`, con
un estado inventado o con `rawTed` muy largo, y cambiar cualquiera de los dos
después. ✅

## 6. Dónde se ve

- **Aprobaciones** (`AdminApprovals`, `MyApprovals`) y **detalle**
  (`ExpenseDetailsModal`): distintivo con RUT, tipo, folio, rango del CAF,
  dónde se verificó y diferencias. ✅
- **Dashboard → anomalías:** "Timbre SII no verifica" para firma inválida,
  folio fuera de rango o RUT distinto. Con el seed demo: 2 filas. ✅
- **Reportes:** filtro "Timbre SII" (Verificado / Fallido / Sin timbre o
  pendiente) y 5 columnas en Excel y CSV (Timbre SII, Motivo Timbre, RUT
  Timbre, Folio Timbre, Diferencias Timbre), solo en tenants CL. Filtro
  "Fallido": 2 filas. ✅ Archivos Excel/CSV abiertos y revisados: ☐.
- **Ajustes → Verificación del timbre SII:** superadmin elige
  Desactivada / Informativa / Obligatoria; pasa por `adminUpdateSettings`
  con PIN. ✅
- `AdminUserDetails` y `UserExpenses` no tienen distintivo por fila; el
  detalle sí lo muestra.

## 7. Recorrido completo (emulador demo)

```bash
node scripts/fixtures/make-ted-fixture.mjs --out /tmp/ted
cp /tmp/ted/900.pem functions/sii-keys/        # temporal, no hacer commit
npm run functions:build
npm run emulators:demo                         # terminal 1
npm run seed:demo                              # cuando esté listo
npm run dev:demo:emu                           # terminal 2
```

1. Entrar como superadmin del demo → Ajustes → Verificación del timbre SII:
   "Informativa".
2. Rendir un Gasto → subir `/tmp/ted/ted-valid.png` → Analizar: "Timbre
   verificado en el dispositivo".
3. Cambiar el monto a 50.000 y confirmar. En el detalle, tras unos segundos:
   "Timbre SII verificado", verificado en el servidor, monto del timbre
   68.400 vs. 50.000.
4. Rendir con `/tmp/ted/ted-tampered.png`: "Timbre inválido · Firma del
   emisor (FRMT) inválida"; aparece en Dashboard → anomalías y en Reportes
   con el filtro "Fallido".
5. Ajustes → "Obligatoria" y repetir el paso 4: el formulario no deja enviar.
6. `rm functions/sii-keys/900.pem`.

### Sin conexión

Mi Espacio → "Preparar para terreno" → "Simular sin señal" (o modo avión con
la app instalada) → pasos 2-3. El distintivo aparece igual (verificación en
el teléfono); al volver la señal, la rendición se envía con `rawTed` y el
servidor la confirma. ☐ no probado en esta ola.

### Reproducir una firma fallida

- Con la imagen: `ted-tampered.png` del paso 4.
- Con el script:
  `node scripts/sii/verify-ted.mjs --image /tmp/ted/ted-tampered.png --keys /tmp/ted`
  → `invalid_signature`, "Firma del emisor (FRMT) inválida".
- Sin la clave (`--keys` a una carpeta vacía) → `error`, "Clave pública SII
  no disponible (IDK 900)": así se verá cualquier boleta real hoy.

## 8. Datos del demo

`seed:demo` siembra cuatro resultados de servidor estáticos (sin `rawTed`):
verificado, verificado con diferencia de monto, firma inválida y folio fuera
de rango. Así el demo muestra los estados sin claves.

## 9. Corpus

- Hoy: timbres sintéticos generados en cada prueba
  (`src/lib/localReader/__fixtures__/ted/makeTed.ts`) y, para pruebas
  manuales, `scripts/fixtures/make-ted-fixture.mjs`. Ninguna clave queda en
  el repo.
- Falta: boletas y facturas chilenas reales con su timbre, para confirmar los
  bytes firmados y la decodificación del PDF417 impreso en papel térmico.
  Van a `src/lib/localReader/__fixtures__/receipts/` (`real-*.jpg`) con su
  fila en `expected.json`, junto a lo que dijo
  `scripts/sii/verify-ted.mjs` (`docs/pendientes.md`).

## 10. No probado

- Un TED emitido por un contribuyente real y claves reales del SII (TD-039).
- WebCrypto de Safari/iOS con claves RSA de 512 bits y SHA-1.
- Modo `required` en el navegador, ruta Gemini y cola sin conexión (§3).
- Excel/CSV abiertos.

## 11. Checks de calidad

- `npm run lint`, `npm run typecheck`: ✅
- `npm test -- --run`: ✅ 165 (24 archivos)
- `npm run test:rules`: ✅ 24
- `npm run build` y `npm run build:demo`: ✅ (precache SPI +12,89 KiB, demo
  +12,93 KiB, 26 → 27 entradas)
- `npm run functions:build`: ✅
