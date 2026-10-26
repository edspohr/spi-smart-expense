# 0016 — Lector que aprende: modo sombra, capa del cliente y capa general

**Estado:** Aceptada
**Fecha:** 2026-10-26
**Ola:** 8b, 8c y 8d (extiende ADR 0015)

## Contexto

La Ola 8 dejó un lector de boletas en el teléfono que solo se mide cuando
se usa sin señal (pocas rendiciones). El responsable define el lector
offline como punta de lanza comercial y como activo de largo plazo: debe
volverse más preciso con el uso de todos los clientes.

Dos restricciones:

1. **La promesa de ambiente exclusivo** (ADR 0001): los datos de negocio de
   un cliente nunca se mezclan con los de otro.
2. **Las leyes de datos personales** (Chile: Ley 19.628 y Ley 21.719, que
   rige desde diciembre de 2026; Colombia: Ley 1581 de 2012): finalidad,
   minimización y consentimiento informado.

El motor OCR (tesseract) no se reentrena con el uso. Lo que sí mejora con
datos son las capas encima: reglas, formatos por emisor, diccionarios y,
más adelante, un modelo propio de lectura.

## Decisión

### 1. Modo sombra (Ola 8b)

Con señal, el lector local corre en todas las rendiciones **en paralelo y
sin mostrarse**. Gemini sigue precargando el formulario y la persona
confirma. Cada rendición deja una comparación de tres puntas: teléfono vs.
Gemini vs. valor confirmado.

- El lector nunca precarga en modo sombra. Así el valor confirmado no queda
  sesgado por la propia lectura local y Gemini actúa como juez
  independiente.
- Corre después de la respuesta de Gemini, sin bloquear el envío. Si no
  terminó a tiempo, la rendición sale sin medición.
- No corre con ahorro de datos activo ni en redes 2G (los motores pesan
  ~7 MB la primera vez).
- No llama a Gemini de nuevo: el trigger compara con la lectura de Gemini
  que trajo el formulario (`aiRead`).
- Opt-in por tenant (`offline.shadowRead`, apagado por defecto). Todo queda
  dentro del ambiente del cliente: no requiere consentimiento adicional
  más allá del contrato de servicio.

### 2. Capa del cliente (Ola 8b)

Se aprende dentro del proyecto del cliente y nunca sale de él:

- Emisor → comercio y categoría (diccionario, ya existente).
- **Formato por emisor:** qué etiqueta marca el total verdadero en las
  boletas de ese emisor ("TOTAL A PAGAR", "TOTAL"). Se aprende comparando
  los montos candidatos que vio el OCR con el monto confirmado
  (`readerProfiles/{rut}`, solo servidor). Se usa con al menos 2 votos.
- Métricas diarias (`ocrStats/{fecha}`) para ver la tendencia.

### 3. Capa general (Ola 8c)

Lo que describe **al documento** es general; lo que describe **cómo el
cliente clasifica y opera** es del cliente.

| General (puede cruzar) | Del cliente (nunca cruza) |
|---|---|
| RUT/NIT del emisor **persona jurídica** (CL: RUT ≥ 50.000.000; CO: NIT que empieza por 8 o 9) y su razón social. Los emisores personas naturales se excluyen completos | Categorías, centros de costo, eventos |
| Etiqueta del total por emisor, formatos de fecha, tipo de documento | Montos, fechas y folios concretos |
| Tipo de error del OCR (p. ej. "coma en RUT") y acierto por campo | Personas, correos, tarjetas, imágenes |
| Versión del lector y tiempo de lectura | Emisor → categoría elegida por el cliente |

- Un proyecto central de Growth Buddies recibe solo atributos de la
  columna izquierda, y **solo de clientes que firmaron la cláusula de datos
  derivados y la activaron en Ajustes** (`learning.shareDerived`, con
  registro de quién, cuándo y qué versión del texto aceptó).
- Lo aprendido vuelve como un **paquete de lectura versionado** que viaja
  en cada build a todos los clientes (`src/lib/localReader/pack/`). No hay
  consultas en tiempo real al proyecto central: un cliente sin la cláusula
  igual recibe las mejoras, solo que no aporta.
- Las personas que rinden ven un aviso en "Listo para terreno" que explica
  qué se mide y qué no.
- **Transporte (implementado en la Ola 8c):** el ambiente no escribe en el
  proyecto central con permisos de base de datos (IAM de Firestore no
  limita por colección). Envía por HTTPS a `ingestContribution` con un ID
  token firmado por Google de su cuenta de servicio; el hub verifica el
  token, una lista de remitentes permitidos y el esquema exacto
  (`validateContribution`: cualquier campo extra rechaza el envío). El hub
  no guarda la identidad del remitente, solo el seudónimo aleatorio del
  ambiente, y conserva la última foto de votos por ambiente (reenviar no
  duplica). Sin `LEARNING_HUB_URL`, el envío queda en `learningOutbox` del
  propio cliente.
- **Integridad del consentimiento:** `settings/tenant.learning` solo cambia
  por el callable (las reglas lo impiden desde el navegador, incluso al
  superadministrador), que exige la versión vigente del texto y registra
  cada alta y baja en `consentLog`. Si cambia el texto, la exportación se
  detiene hasta una nueva aceptación.

### 4. Corpus de imágenes y modelo propio (Ola 8d)

Guardar imágenes para entrenar exige un **segundo consentimiento,
separado** (`learning.shareImages`), retención acotada, recorte de datos
personales y la posibilidad de retirarlo. Se aborda solo cuando haya
volumen y clientes que lo acepten.

## Consecuencias

- El valor del lector como activo depende de que los derechos de uso estén
  limpios: **la cláusula contractual va antes que el código de la capa
  general**. Hay un borrador en `docs/legal/lector-datos-derivados.md`
  para revisión de un abogado.
- Se vende como "el lector mejora con toda la red; tus datos de negocio
  nunca salen de tu ambiente". Es coherente con ADR 0001.
- El costo de la nube no sube con el modo sombra: corre en el teléfono y el
  trigger no llama a Gemini.
- La batería y los datos móviles son un riesgo en teléfonos de gama baja.
  Por eso se salta con ahorro de datos y en redes lentas, y se mide el
  tiempo de lectura.
- La capa general añade un proyecto central que operar (Ola 8c): cuentas
  de servicio por tenant con permiso de solo escritura sobre una
  colección.
