# 0017 — Verificación del timbre electrónico (TED) sin conexión

**Estado:** Aceptada
**Fecha:** 2026-11-03
**Ola:** 10

## Contexto

"Validación SII" es la brecha #1 del benchmark en licitaciones chilenas
(`docs/research/benchmark-2026-10.md`). El plan v4 proponía consultar el
estado de cada documento ante el SII o un proveedor. Esa consulta necesita el
certificado digital de cada cliente o un tercero pagado, no cubre boletas (el
SII no las individualiza en el Registro de Compras del receptor) y no
funciona sin señal, que es el caso de faena que nos diferencia.

Cada DTE impreso trae en su PDF417 el TED, con dos firmas SHA1withRSA:

- **FRMA**: el SII firma el `<DA>` del CAF (RUT emisor, tipo de documento,
  rango de folios autorizado, fecha, clave pública del emisor `RSAPK`). Se
  verifica con la clave pública del SII identificada por `IDK`.
- **FRMT**: el emisor firma el `<DD>` (RUT, tipo, folio, fecha, receptor,
  monto, primer ítem, CAF) con la clave privada del CAF. Se verifica con el
  `RSAPK` que viaja en el propio CAF.

Las dos se pueden verificar en el teléfono, sin red, si la app trae las
claves públicas del SII.

## Decisión

1. **Verificación criptográfica local, sin consulta al SII.** `verifyTed`
   (`functions/src/tedVerify.logic.ts`, puro, WebCrypto) comprueba FRMA,
   FRMT, que el folio esté dentro del rango `RNG` del CAF y que el RUT del
   `<DD>` sea el del CAF. Las diferencias de monto, fecha y RUT con lo que la
   persona envió son **advertencias** (`mismatches`), no fallas: el documento
   es auténtico aunque se haya rendido mal.
2. **Una sola implementación.** El archivo vive en `functions/src/` porque
   `functions/` no puede importar `src/`; el navegador lo importa desde ahí.
3. **Estados:** `verified`, `invalid_signature`, `folio_out_of_range`,
   `issuer_mismatch`, `not_verifiable` (sin TED legible) y `error` (clave
   del SII desconocida o falla de criptografía; nunca se presenta como
   falla del documento).
4. **El servidor manda.** El teléfono verifica al analizar y guarda
   `rawTed` + `fiscalVerification` (`verifiedOn: 'device'`, provisional).
   `verifyFiscalDocument` (trigger `onDocumentWritten`, solo en tenants con
   `COUNTRY=CL`) re-verifica con `rawTed` y sobrescribe con
   `verifiedOn: 'server'`; si no hay `rawTed`, escribe `not_verifiable`. Se
   repite cuando cambian monto, fecha, RUT o moneda. Las reglas aceptan un
   resultado del dispositivo solo al crear y congelan `rawTed` y
   `fiscalVerification` después.
5. **Bytes firmados.** Los emisores firman el XML aplanado en ISO-8859-1.
   `barcode.ts` guarda cada byte escaneado como un carácter cuando el texto
   trae `<TED`, y el verificador prueba latin1 y UTF-8, con y sin espacios
   entre etiquetas.
6. **Claves del SII en el repo.** PEM públicos en `functions/sii-keys/<IDK>.pem`,
   empaquetados en el bundle (`siiKeys.ts`, `import.meta.glob`) y leídos del
   disco en Functions. Sin la clave de su `IDK`, un TED queda en `error`
   ("Verificación pendiente"). Runbook: `docs/runbooks/sii-keys.md`.
   *Actualización 2026-11-03:* se publicó `300.pem` (producción). El SII no
   publica estas claves; la de producción viene del certificado del SII que
   distribuye LibreDTE y se comprobó con firmas reales del SII. `IDK 100`
   (certificación) se excluye a propósito: sus CAF no tienen validez
   tributaria y no deben verse "verificados".
7. **Política por tenant** `settings/tenant.fiscal.tedVerification`:
   `off` (por defecto, SPI) | `advisory` (demo) | `required`. Con `required`
   el formulario no deja enviar un TED cuyo resultado sea una falla; un
   `error` o la ausencia de TED no bloquean. El servidor no rechaza: marca, y
   la falla aparece como anomalía en el dashboard.
8. **Solo Chile.** Filtro y columnas de reportes, tarjeta de Ajustes y
   trigger existen solo con `locale.country = CL`. `READER_VERSION` no cambió
   (1.3.0) para no partir las métricas del lector de SPI.

## Alternativas consideradas

- **Consulta de estado al SII con el certificado de la empresa.** Más fuerte
  para facturas (detecta anuladas y si el documento llegó al Registro de
  Compras), pero no cubre boletas, requiere custodiar certificados por
  cliente y no funciona offline. Queda en el backlog como capa adicional.
- **Proveedor de validación de terceros** (Fintoc u otros): costo por
  consulta y dependencia externa; fuera de alcance por pedido explícito.
- **Parser XML genérico.** El TED es una gramática chica y cerrada; un
  parser por expresiones evita sumar peso al bundle offline.
- **Verificar solo en el servidor.** Perdería el aviso en faena; el resultado
  del teléfono es útil aunque sea provisional.

## Consecuencias

- Lo que el sello garantiza: que el SII autorizó ese rango de folios a ese
  RUT y que ese documento lo emitió quien tiene la clave del CAF, con los
  datos impresos. No garantiza que el documento no esté anulado, que haya
  llegado al Registro de Compras, ni que la foto corresponda a una compra
  de quien rinde.
- **Un TED válido se puede reutilizar** (fotocopia, otra boleta del mismo
  comercio). Solo se nota si monto, fecha o RUT no coinciden. No hay
  detección de folios duplicados entre rendiciones todavía (backlog).
- `required` es una barrera de interfaz: un cliente modificado puede crear
  el documento y el servidor solo lo marca (TD-038).
- El bundle crece ~13 KiB en todos los tenants, SPI incluido (lógica y UI
  compartidas); las reglas nuevas aplican a SPI, donde los campos no existen.
- Nada se probó aún con un TED emitido por un contribuyente real ni con
  claves reales del SII (TD-039). Los tamaños de clave (CAF de 512 bits,
  SII de 1024) y la forma exacta del XML firmado vienen de la documentación
  conocida, no de una boleta real.
- Safari/iOS podría no aceptar claves RSA de 512 bits en WebCrypto; en ese
  caso el teléfono muestra "Verificación pendiente" y decide el servidor.
- `fiscalVerification` y `rawTed` no salen del tenant: el esquema de
  `exportDerivedData` (ADR 0016) los rechaza y hay un test que lo cubre.
