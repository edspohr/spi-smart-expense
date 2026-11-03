# Trazabilidad fiscal y salida contable — qué hace y qué no

Documento para preparar propuestas y responder licitaciones. Describe lo que
existe en el código, sin adornos. Si algo dice "pendiente", no se ofrece
como disponible.

Decisiones técnicas: ADR 0017 (timbre) y ADR 0018 (exportador contable).

---

## 1. Timbre electrónico (Chile)

### Qué hace

Toda boleta o factura electrónica chilena impresa trae un código de barras
PDF417, el **timbre electrónico (TED)**. La app lo lee al fotografiar el
comprobante y verifica, **en el propio teléfono y sin conexión**, dos firmas
digitales que vienen dentro:

1. **La del SII sobre la autorización de folios (CAF).** Prueba que el SII
   autorizó a ese RUT a emitir ese tipo de documento en ese rango de folios.
2. **La del emisor sobre el documento.** Prueba que ese documento (RUT,
   tipo, folio, fecha, monto, receptor, primer ítem) lo emitió quien tiene
   la clave de ese CAF y que esos datos no se alteraron.

Además revisa que el folio esté dentro del rango autorizado y que el RUT del
documento sea el del CAF. Luego compara el timbre con lo que la persona
rindió (monto, fecha, RUT) y marca las diferencias.

El resultado se vuelve a calcular en el servidor al sincronizar; el del
servidor es el que vale.

### Qué resultado ve el aprobador

| Distintivo | Significa |
|------------|-----------|
| Timbre SII verificado | Las dos firmas y el rango son correctos. Puede traer advertencias si lo rendido no coincide con lo impreso. |
| Timbre inválido | Alguna firma no corresponde: el timbre fue alterado o no es auténtico. |
| Folio fuera de rango | El folio no está dentro del rango autorizado por el SII. |
| RUT emisor no coincide | El RUT del documento no es el autorizado en el CAF. |
| Sin timbre | No se encontró un timbre legible en la foto. |
| Verificación pendiente | No se pudo verificar (falta la clave del SII o falló el teléfono). No es una falla del documento. |

Las fallas aparecen en las anomalías del panel, en el filtro de reportes y
en una columna del Excel/CSV.

### Qué garantiza y qué no

**Garantiza:** que el documento es auténtico (emitido por ese RUT, con un
folio autorizado por el SII) y que el monto, la fecha y el RUT impresos en el
timbre son los originales.

**No garantiza:**

- Que el documento **no esté anulado** ni que haya sido aceptado por el SII
  después de emitido. Eso requiere consultar al SII (no incluido).
- Que la factura figure en el **Registro de Compras** de la empresa. Las
  boletas nunca figuran ahí.
- Que la foto corresponda a **una compra de quien rinde**. Un timbre
  auténtico se puede rendir dos veces o usar una boleta ajena; solo se nota
  si el monto, la fecha o el RUT rendidos no coinciden. Todavía no se
  detectan folios repetidos entre rendiciones.
- Que el comercio exista o esté vigente: se verifica la firma, no el estado
  del contribuyente.

### Cómo se configura

Por cliente, en Ajustes (superadmin): **Desactivada**, **Informativa** (se
muestra el resultado y se permite enviar) u **Obligatoria** (el formulario no
deja enviar un timbre que no verifica; "Sin timbre" y "Verificación
pendiente" sí se pueden enviar). En modo obligatorio, el bloqueo es del
formulario: el servidor no rechaza, marca la rendición y la deja como
anomalía.

Solo existe para clientes en Chile.

### Estado actual (2026-11-03)

- La app trae la clave pública del SII de producción (`IDK 300`) desde el
  2026-11-03. Está comprobada contra el ejemplo oficial del SII y contra
  firmas reales del SII, pero **todavía no con una boleta real completa
  fotografiada**. Hasta esa prueba, decir "en piloto" antes que
  "disponible".
- Las claves del SII son RSA de 512 bits con SHA-1 (de 2003). Bastan para
  detectar timbres alterados o inventados por cualquiera, pero un atacante
  con recursos podría factorizar una clave de 512 bits. No prometer
  "imposible de falsificar".
- iPhone: no confirmado que Safari acepte el tamaño de clave de los CAF; si
  no, el teléfono muestra "pendiente" y verifica el servidor.
- La landing del demo ya presenta la función (2026-11-03), con un texto que
  se ciñe a lo que garantiza: emisor, folio autorizado y monto. El
  responsable decidió mantenerla antes de cerrar lo anterior (2026-11-03).

### Cómo decirlo en una propuesta (cuando esté cerrado)

> Verificación criptográfica del timbre electrónico SII de cada boleta y
> factura, en el teléfono y sin conexión, confirmada en el servidor. Detecta
> timbres alterados, folios no autorizados y diferencias entre lo rendido y
> lo impreso. No reemplaza la consulta de estado en el SII.

No decir: "validado ante el SII", "consulta en línea al SII", "detecta
boletas duplicadas", "verifica el Registro de Compras".

---

## 2. Exportación contable

### Qué hace

Finanzas elige un período (y opcionalmente un centro de costo) y descarga
las rendiciones aprobadas como asientos contables listos para importar en su
ERP. Cada rendición es un asiento cuadrado, en la moneda base:

- **Debe** a la cuenta de gasto de su categoría (neto de IVA si corresponde).
- **Debe** a IVA crédito fiscal, solo en facturas (u otro tipo que el
  cliente indique) cuyo timbre no falló.
- **Haber** a la cuenta por pagar al personal, o a la cuenta de la tarjeta
  corporativa si fue un gasto con tarjeta de la empresa.

Cada línea lleva centro de costo, RUT y nombre del proveedor, tipo y folio
del documento, quién rindió y el estado del timbre SII.

Antes de exportar hay una vista previa con los asientos y lo que falta
configurar; no se puede exportar mientras falte una cuenta. Cada exportación
queda registrada (quién, cuándo, qué rendiciones, total y una huella del
archivo) y se puede volver a descargar. Una rendición exportada queda
cerrada: no se edita, no se reabre y no se borra en la app, y no se vuelve a
exportar salvo que se pida explícitamente.

### Formatos

| Formato | Archivo | Estado |
|---------|---------|--------|
| CSV genérico | Un CSV con una fila por línea, separado por punto y coma, que Excel abre directo | Listo |
| Softland ERP | Archivo plano de comprobantes | Columnas por confirmar con el importador del cliente |
| Defontana | CSV de comprobantes (centro de negocio, ficha) | Orden de la plantilla por confirmar; CSV, no .xlsx |
| SAP Business One | Plantillas de Data Transfer Workbench (cabecera y líneas) | Nombres de campo estándar por confirmar con la versión del cliente |

### Qué no hace

- **No se conecta por API** a ningún ERP: se descarga un archivo y se
  importa en el ERP. SAP B1 Service Layer y la API de Defontana son trabajo
  futuro.
- No agrupa varias rendiciones en un solo asiento por período.
- No maneja cuentas distintas por persona ni ajustes por rendición.
- No "descontabiliza": una corrección posterior se hace en el ERP.

### Cómo decirlo en una propuesta

> Exportación de las rendiciones aprobadas como asientos contables cuadrados
> con IVA, centro de costo y proveedor, en CSV o en el formato de
> importación de Softland, Defontana o SAP Business One, con registro de cada
> exportación y sin doble contabilización.

Hasta importar con un cliente real, decir "formato de importación de
Softland/Defontana/SAP B1, ajustado en la puesta en marcha". No decir
"integración nativa" ni "conexión en línea con el ERP". La landing del demo
(2026-11-03) sigue esta regla: "el formato se ajusta a su ERP en la
implementación".
