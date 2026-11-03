# Runbook — Claves públicas del SII (Ola 10)

La verificación del timbre (ADR 0017) necesita la clave pública del SII que
firmó cada CAF. El CAF la identifica con `<IDK>`. Sin la clave, la app
muestra "Verificación pendiente" (`status: error`) y nunca "fallido".

## 1. Dónde viven

- `functions/sii-keys/<IDK>.pem` (una por `IDK`, formato SPKI,
  `-----BEGIN PUBLIC KEY-----`).
- El navegador las empaqueta al construir (`src/lib/localReader/siiKeys.ts`,
  `import.meta.glob`); Functions las lee del disco (`functions/src/fiscal.ts`,
  la carpeta sube con el deploy porque `firebase.json` solo ignora `src`).
- Son públicas. Nunca guardar ahí una clave privada ni un CAF completo de un
  cliente.

## 2. Obtener una clave

**Estado (2026-11-03): `300.pem` publicada.**

- **El SII no publica estas claves** en ningún lugar localizable. Circulan
  como dos certificados X.509 autofirmados del SII de 2003 (vencidos en
  2004, pero en uso): `100.cer` (certificación) y `300.cer` (producción).
  Su número de serie es el `IDK`. Fuente usada: LibreDTE,
  `libredte-lib-core/certs/` @ `06f03bdf16b95a3f7246a72ac5ca465f137f435b`
  (huellas comparadas con los archivos de GitHub).
- **`100` comprobada:** verifica la `FRMA` del CAF de ejemplo oficial del
  manual de certificación del SII, y con ella el timbre completo verifica
  (`functions/src/tedVerify.official.test.ts`). Se guarda solo como fixture
  de test (`functions/src/__fixtures__/sii-idk-100.pem`): los CAF de
  certificación no tienen validez tributaria y no deben verse "verificados".
- **`300` comprobada por estructura:** en cuatro CAF de producción públicos
  (repositorios de GitHub de 2020 a 2023), la `FRMA` descifrada con esta
  clave da un bloque PKCS#1 v1.5 SHA-1 bien formado. Eso solo ocurre si la
  firmó la clave privada correspondiente. El hash no coincide con el `<DA>`
  publicado porque esos repositorios anonimizaron el CAF (RUT `11111111-1`,
  nombres). Falta una verificación completa con una boleta real
  (`docs/pendientes.md`).
- **Seguridad:** RSA de 512 bits con SHA-1. Detecta timbres alterados o
  inventados, pero no resiste a un atacante que factorice la clave (horas y
  decenas de dólares en la nube, según "Factoring as a Service", 2016).
- **Rotación:** no hay canal oficial. La señal sería un CAF nuevo con un
  `IDK` distinto de 300; la app lo muestra como "Verificación pendiente",
  nunca como falla.

Opciones si aparece un `IDK` nuevo, en orden de preferencia:

1. Documentación técnica del SII para DTE (formato del CAF y del TED) o la
   mesa de ayuda del SII para desarrolladores.
2. El proveedor de facturación electrónica de un cliente chileno.
3. Un CAF de certificación propio (ambiente de certificación del SII): su
   `IDK` y el formato permiten probar el flujo, no las claves de producción.

4. Calcularla desde boletas reales: el timbre de cada boleta trae el `<DA>`
   del CAF y su `<FRMA>`. Con 3-4 pares (`DA`, `FRMA`) del mismo `IDK`, de
   emisores distintos, el módulo RSA del SII sale de un MCD de
   `firma^e − mensaje_con_relleno_PKCS#1` (e = 65537 o 3). Una quinta
   boleta lo confirma: una clave equivocada no verifica ninguna firma.

**Lo que dicen los documentos del SII (revisados el 2026-11-03):**

- *Instructivo técnico para la emisión de DTE* (28-10-2021,
  `sii.cl/factura_electronica/instructivo_emision.pdf`), §1.4: el
  contribuyente debe verificar el CAF "con la llave pública que el SII
  publique para esos efectos". **El instructivo no trae la clave ni dice
  dónde se publica.** §A.2.4 confirma las reglas que ya aplica
  `tedVerify.logic.ts`: SHA1withRSA PKCS#1, bytes ISO-8859-1 tal como se
  imprimen, sin blancos ni saltos entre tags, sin tocar el contenido de los
  elementos.
- *Manual del ambiente de certificación* (2009,
  `sii.cl/servicios_online/docs/manual_certificacion.pdf`), §5.1-5.2: trae un
  timbre completo de ejemplo con un CAF de **certificación (`IDK` 100)** y la
  firma `FRMT` que resulta. `functions/src/tedVerify.official.test.ts` lo usa:
  nuestro armado del texto firmado reproduce la firma del SII. El `IDK` de
  producción no aparece en ninguno de los dos.

Al agregar la clave, anotar en la primera línea del PEM (fuera del bloque) la
fuente y la fecha, por ejemplo `# SII, <url o contacto>, 2026-11-10`.

## 3. Probar la clave antes de publicarla

Con una boleta real cuyo TED tenga ese `IDK`:

```bash
node scripts/sii/verify-ted.mjs --image boleta.jpg --keys ruta/300.pem
```

- `"status": "verified"` → la clave es correcta.
- `"invalid_signature"` con razón "Firma SII (FRMA) inválida" → la clave no
  corresponde a ese `IDK` o la boleta no es auténtica: probar con otra.
- `"Firma del emisor (FRMT) inválida"` con FRMA válida → la clave del SII es
  correcta, pero los bytes firmados no coinciden con lo escaneado: revisar
  codificación (ADR 0017 §5) con `--xml` y el texto exacto del timbre.
- `"error"` "Clave pública SII no disponible" → el `IDK` impreso es otro;
  el JSON de salida lo muestra en `idk`.

También acepta `--xml ted.xml` (el `<TED>…</TED>` guardado en latin1).

## 4. Publicar

1. Copiar el PEM a `functions/sii-keys/<IDK>.pem` y hacer commit.
2. `npm run build` (o `build:demo`) y `firebase deploy --only hosting,functions`
   en cada tenant chileno. No hace falta cambiar `READER_VERSION`: las
   claves van en el bundle de la app, no en los motores de `/ocr/`.
3. Las rendiciones que quedaron en `error` no se re-verifican solas: se
   re-verifican al editar monto, fecha o RUT. Para todas, un script de
   re-verificación queda pendiente (TD-039).

## 5. Rotación

El SII cambia de clave con poca frecuencia. Una clave nueva aparece como un
`IDK` desconocido: rendiciones en "Verificación pendiente" con razón
"Clave pública SII no disponible (IDK …)". Agregarla con los pasos 2-4; no
borrar las anteriores (los CAF antiguos siguen vigentes).

## 6. Pruebas con claves sintéticas

```bash
node scripts/fixtures/make-ted-fixture.mjs --out /tmp/ted
```

Genera `ted-valid.png`, `ted-tampered.png`, `900.pem` (clave falsa del SII)
y `teds.json`. Para ver "Timbre verificado" en el emulador, copiar `900.pem`
a `functions/sii-keys/` mientras se prueba y **borrarlo después**: nunca debe
llegar a un commit.
