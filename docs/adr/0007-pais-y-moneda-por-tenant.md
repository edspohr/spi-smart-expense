# 0007 — País y moneda por tenant

**Estado:** Aceptada
**Fecha:** 2026-10-24
**Ola:** 7

## Contexto

La app asume Colombia: COP como base, TRM de Banco de la República, NIT,
Nequi/Daviplata, aprobador "Colombia" definido por moneda, y CLP excluido de
los totales. Elecnor y el tenant demo operan en Chile (CLP, RUT, UF/USD vía
mindicador.cl). SPI debe seguir exactamente igual.

## Decisión

El país es una propiedad del tenant (`country: "CO" | "CL" | ...`). Un
registro `src/lib/country.ts` resuelve por país: moneda base, proveedor de
tipo de cambio (BanRep / mindicador.cl / open.er-api como fallback),
etiqueta y validador de ID fiscal (NIT / RUT), billeteras, locale de
formato y hints para el prompt de Gemini. La moneda base participa en
totales y conversiones; `isColombiaApprover` pasa a `isBaseCurrencyApprover`
con la misma semántica para SPI.

Un tenant opera en **un** país. Multi-país dentro de un tenant queda en
backlog.

## Alternativas consideradas

- **Elecnor en Colombia también.** No corresponde al caso de uso real y
  deja el demo sin prueba de generalidad.
- **Multi-país por centro de costo desde ahora.** Mucho más complejo
  (política de aprobación, FX y formatos por gasto); sin demanda concreta.
- **Dejar Colombia hardcodeado y parchear para Chile.** Produce dos
  codebases de facto.

## Consecuencias

- Agregar un país = agregar una entrada al registro y, si aplica, un
  proveedor FX.
- El prompt de Gemini y las validaciones de formulario dependen del tenant;
  los tests deben correr para CO y CL.
- Series históricas EUR (TD-007) siguen pendientes y van a backlog.

## Implementación (2026-10-25)

- Registro en `src/lib/country.ts` (web) y parámetro `COUNTRY` +
  `BASE_CURRENCY` en `functions/.env.<proyecto>` (servidor). El país se
  declara en `tenants/<id>.json` → `locale.country`.
- Cada gasto guarda `baseCurrency` y `amountBase`; se lee como
  `amountBase ?? amountCOP` para no migrar el histórico de SPI.
- El permiso sigue llamándose `isColombiaApprover` en datos y claims (su
  significado es "moneda base"); la UI lo rotula con el país.
- El prompt de Gemini conserva el texto colombiano original para CO y
  agrega reglas chilenas para CL; los tests cubren ambos.
