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

- Probado con timbres sintéticos firmados con claves de prueba. **No se ha
  probado aún con una boleta real**, y la app **no trae todavía las claves
  públicas del SII**: hoy toda boleta real queda en "Verificación
  pendiente". No ofrecer "validación SII" como disponible hasta cerrar ambas
  cosas.
- iPhone: no confirmado que Safari acepte el tamaño de clave de los CAF; si
  no, el teléfono muestra "pendiente" y verifica el servidor.

### Cómo decirlo en una propuesta (cuando esté cerrado)

> Verificación criptográfica del timbre electrónico SII de cada boleta y
> factura, en el teléfono y sin conexión, confirmada en el servidor. Detecta
> timbres alterados, folios no autorizados y diferencias entre lo rendido y
> lo impreso. No reemplaza la consulta de estado en el SII.

No decir: "validado ante el SII", "consulta en línea al SII", "detecta
boletas duplicadas", "verifica el Registro de Compras".

---

## 2. Exportación contable

Pendiente (Ola 11). Esta sección se completa con los formatos, su contenido
exacto y los supuestos de cada ERP.
