# 0018 — Exportador contable y conectores ERP

**Estado:** Aceptada
**Fecha:** 2026-11-03
**Ola:** 11

## Contexto

"Integración ERP" es la brecha #2 del benchmark: finanzas quiere que lo
aprobado llegue a la contabilidad sin volver a digitarlo. Los ERP comunes
en Chile (Softland, Defontana, SAP Business One) importan comprobantes desde
archivos; sus API piden credenciales por cliente y quedan para después.

## Decisión

1. **Mapeo por tenant** en `settings/tenant.accounting`, escrito solo por
   `adminUpdateSettings` (se reemplaza completo, no se mezcla): cuenta por
   pagar al personal, cuenta de tarjeta corporativa, cuenta de IVA crédito
   fiscal, tasa de IVA incluida, tipos de documento con IVA recuperable,
   origen del centro de costo y cuenta de gasto por categoría.
   `parseAccountingSettings` lo valida en el servidor y en el navegador.
2. **Un asiento cuadrado por rendición aprobada**, en moneda base
   (`buildJournals`, `functions/src/accounting.logic.ts`, puro): debe a la
   cuenta de la categoría (neto), debe al IVA si el tipo de documento lo
   permite, haber a la cuenta por pagar o a la tarjeta corporativa. Se
   calcula en unidades mínimas enteras, así que cuadra siempre.
3. **IVA conservador:** solo se separa en documentos en moneda base, de un
   tipo listado (33 en el demo) y cuyo timbre no falló (ADR 0017). Boletas,
   documentos sin tipo y recibos del extranjero van completos al gasto.
4. **La vista previa y la exportación usan el mismo código.** El navegador
   importa el builder desde `functions/` (como en la Ola 10); el callable
   `buildAccountingExport` lo vuelve a ejecutar con los datos del servidor y
   se niega si alguna rendición de la selección está bloqueada (categoría
   sin cuenta, falta cuenta por pagar, sin monto en moneda base…).
5. **`ErpConnector`** (`functions/src/accounting.connectors.ts`): cada formato
   recibe los mismos asientos y devuelve archivos. Hoy: CSV genérico,
   Softland, Defontana y SAP B1 (DTW, cabecera y líneas). Cada conector
   declara sus `assumptions`, que la página muestra.
6. **Trazabilidad:** cada exportación crea `accountingExports/{id}` (quién,
   cuándo, formato, filtros, ids, total, hash SHA-256 de los archivos y los
   archivos mismos si caben en un documento) y marca cada rendición con
   `accountingExport` más un movimiento `exported`. Por defecto no se
   reexporta lo ya exportado; "incluir ya exportadas" lo permite y el
   registro cuenta cuántas fueron reexportadas.
7. **Contabilizado = cerrado.** Las reglas impiden cambiar monto, moneda,
   fecha, categoría, centro de costo, RUT, folio o comercio de una rendición
   exportada; `reviewExpense` no la reabre y `deleteExpense` no la borra.
8. **PIN** con la acción existente `export`. Módulo `modules.accounting`:
   apagado en SPI, encendido en el demo; el callable lo exige.
9. **No depende de TD-026.** El exportador calcula el monto en moneda base
   de cada rendición (`baseAmountFor`, misma regla que `baseAmountOf`) y no
   lee `users.balance` ni `projects.expenses`. Cerrar TD-026 cambia saldos
   de SPI y requiere una migración en producción: queda como decisión
   aparte del responsable.

## Disciplina de supuestos

Donde el formato de columnas sale de material público y no de una plantilla
confirmada por un cliente, el conector lo dice en el código (`ASSUMPTION:`),
en `assumptions` (visible en la página) y aquí:

- **Softland:** el orden de columnas lo define el importador de cada
  instalación; se entrega el orden más común (cuenta, debe, haber, glosa,
  centro de costo, RUT auxiliar, tipo y número de documento, fecha).
- **Defontana:** columnas con su vocabulario (centro de negocio, ficha por
  RUT); orden exacto de la plantilla sin confirmar; CSV en vez de .xlsx.
- **SAP B1:** nombres de campo de las plantillas estándar de DTW para
  asientos (`RecordKey`/`ParentKey`, `ReferenceDate`, `AccountCode`,
  `CostingCode`…), fechas `AAAAMMDD`, memo a 50 caracteres; confirmar con la
  versión del cliente.

Ningún conector se anuncia como "nativo" hasta que un cliente lo importe
(`docs/pendientes.md`).

## Alternativas consideradas

- **Generar el archivo en el navegador.** Más simple, pero el registro de
  exportación y la marca en cada rendición podrían falsificarse; el servidor
  es quien deja constancia.
- **Conectores por API (SAP B1 Service Layer, API de Defontana).** Piden
  credenciales y ambientes de prueba por cliente; la interfaz deja lugar
  para un `push` posterior sin cambiar el modelo de asientos.
- **Asiento agrupado por período.** Algunos contadores lo prefieren; con un
  asiento por rendición se conserva la trazabilidad y agrupar es un cambio
  del conector, no del builder.
- **Cuentas por persona o ajustes por rendición.** Fuera de este corte
  (backlog).

## Consecuencias

- El bundle crece ~23 KiB en todos los tenants (página, tarjeta y builder);
  SPI ve un interruptor "Contabilidad" apagado en Ajustes → Módulos y el
  callable existe en su proyecto, pero rechaza mientras el módulo esté
  apagado.
- Exportaciones de más de ~200 rendiciones se escriben en varios lotes; si
  uno falla, el registro queda y algunas rendiciones no quedan marcadas
  (TD-041).
- Los archivos de más de ~900 KB no se guardan en el registro; se vuelven a
  generar con "incluir ya exportadas".
- Una rendición exportada solo se corrige con un ajuste en el ERP; la app no
  "descontabiliza".
