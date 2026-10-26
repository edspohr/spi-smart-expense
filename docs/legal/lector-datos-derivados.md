# Lector que aprende: cláusula, anexo, avisos y consentimientos

**Estado:** BORRADOR v1 (2026-10-26) para revisión de un abogado antes de
usarlo con clientes. No es asesoría legal.
**Decisión técnica:** ADR 0016. **Olas:** 8b (modo sombra, dentro del
ambiente del cliente), 8c (capa general), 8d (imágenes).

---

## 1. En simple (para el equipo y para el cliente)

- Expense Buddy lee las boletas en el teléfono para poder rendir sin señal.
- Para que esa lectura mejore, cada rendición compara lo que leyó el
  teléfono con lo que confirmó la persona. **Esa comparación ocurre dentro
  del ambiente exclusivo del cliente** (Ola 8b).
- Si el cliente lo autoriza (cláusula + interruptor en Ajustes), enviamos a
  Growth Buddies **solo lo que describe al documento**: qué empresa lo
  emitió, en qué parte de la boleta estaba el total, qué tipo de error tuvo
  la lectura. **Nunca** montos, personas, categorías, centros de costo ni
  imágenes (Ola 8c).
- Con eso mejora el lector de todos los clientes, también el de quien no
  autoriza. Quien autoriza ayuda a que mejore más rápido en los emisores que
  más usa.
- Guardar imágenes para entrenar un modelo propio requiere otra
  autorización, separada (Ola 8d).

---

## 2. Cláusula contractual: datos derivados (Ola 8c)

> **Cláusula [N]. Datos Derivados para la mejora del lector de documentos.**
>
> [N].1 **Definiciones.** "Datos del Cliente": toda información que el
> Cliente o sus usuarios ingresan o generan en su ambiente de Expense
> Buddy, incluidas imágenes de comprobantes, montos, fechas, categorías,
> centros de costo y datos de personas. "Datos Derivados": atributos
> técnicos sobre la estructura de los documentos tributarios procesados y
> sobre el desempeño del lector, generados automáticamente a partir de los
> Datos del Cliente y que no identifican al Cliente, a sus usuarios ni a
> personas naturales, según el Anexo [N-A].
>
> [N].2 **Autorización.** El Cliente autoriza a [Growth Buddies SpA] a
> generar Datos Derivados y a utilizarlos, de forma agregada y combinada con
> los de otros clientes, con la única finalidad de mantener y mejorar las
> funciones de lectura de documentos de Expense Buddy, incluidas sus
> versiones futuras.
>
> [N].3 **Exclusiones.** Los Datos Derivados no incluirán, en ningún caso:
> (a) imágenes o fotografías de documentos; (b) montos, fechas, folios o
> números de documento concretos; (c) categorías, centros de costo,
> proyectos o cualquier clasificación propia del Cliente; (d) datos de
> personas naturales, incluidos usuarios del Cliente y emisores que sean
> personas naturales; (e) información que permita identificar al Cliente.
>
> [N].4 **Medidas.** [Growth Buddies] aplicará las medidas descritas en el
> Anexo [N-A]: minimización en origen (los atributos se calculan en el
> ambiente del Cliente y solo se transmite el resultado), exclusión de
> emisores personas naturales, transmisión cifrada, almacenamiento en un
> proyecto separado con acceso restringido y registro de accesos.
>
> [N].5 **Activación y revocación.** La generación de Datos Derivados
> requiere, además de esta cláusula, que un superadministrador del Cliente
> la active en la configuración de Expense Buddy. El Cliente puede
> desactivarla en cualquier momento; desde entonces no se generarán nuevos
> Datos Derivados. Los ya incorporados en forma agregada a versiones del
> lector no son separables y podrán seguir usándose.
>
> [N].6 **Titularidad.** Los Datos del Cliente son y seguirán siendo de
> propiedad del Cliente. Las mejoras del lector, incluidas las que resulten
> del uso de Datos Derivados agregados, son de propiedad de [Growth
> Buddies]. El Cliente recibirá dichas mejoras como parte del servicio, sin
> costo adicional.
>
> [N].7 **No comercialización.** [Growth Buddies] no venderá ni cederá
> Datos Derivados a terceros como conjunto de datos. Podrá usar
> estadísticas agregadas (por ejemplo, porcentaje de acierto del lector)
> en materiales comerciales, sin identificar clientes.
>
> [N].8 **Ley aplicable.** El tratamiento se ajustará a la normativa de
> protección de datos aplicable [Chile: Ley N° 19.628 y, desde su
> entrada en vigencia, Ley N° 21.719; Colombia: Ley 1581 de 2012 y Decreto
> 1377 de 2013].

### Cláusula opcional separada: imágenes para entrenamiento (Ola 8d)

> **Cláusula [M]. Muestras de documentos para entrenamiento.** El Cliente
> podrá autorizar, mediante activación separada en la configuración, que
> una muestra de imágenes de comprobantes sea copiada a un repositorio de
> entrenamiento de [Growth Buddies], previo recorte automático de datos de
> personas (nombres, RUT de personas naturales, números de tarjeta), con
> retención máxima de [24] meses y la única finalidad de entrenar y evaluar
> modelos de lectura de documentos. El Cliente puede revocar esta
> autorización en cualquier momento y solicitar la eliminación de las
> muestras aún no incorporadas a un modelo entrenado. Esta autorización es
> independiente de la Cláusula [N] y no es condición del servicio.

---

## 3. Anexo [N-A]: anexo técnico de Datos Derivados

| Se transmite (si está autorizado) | Ejemplo | Por qué |
|---|---|---|
| RUT/NIT del emisor **persona jurídica** | 99.520.000-7 | Agrupar el conocimiento por emisor |
| Razón social del emisor | COPEC S.A. | Diccionario general de emisores |
| Tipo de documento | Boleta electrónica (39) | Reglas por tipo |
| Etiqueta que marcó el total | "TOTAL A PAGAR" | Formato por emisor |
| Formato de fecha detectado | dd-MMM-aaaa | Reglas de fecha |
| Acierto por campo (sí/no) y tipo de error | monto: no, "coma en RUT" | Medir y corregir |
| Motor, versión del lector, tiempo de lectura | ocr, v1.3, 640 ms | Comparar versiones |
| Identificador seudónimo del ambiente | hash rotado | Evitar duplicados, sin identificar al cliente |

| Nunca se transmite | |
|---|---|
| Imágenes, texto completo leído | |
| Montos, fechas, folios concretos | |
| Categorías, centros de costo, eventos, proyectos | |
| Nombres, correos, RUT de usuarios o de emisores personas naturales, tarjetas | |
| Nombre del cliente | |

**Regla de persona jurídica.** Chile: RUT ≥ 50.000.000. Colombia: NIT que
empieza por 8 o 9. Los demás emisores se excluyen completos (ni RUT ni
razón social).

**Dónde se calcula.** En una Function del ambiente del cliente: solo el
resultado sale hacia el proyecto central.

**Seguridad.** El proyecto central es de Google Cloud (Firestore). Cada
ambiente escribe con una cuenta de servicio que solo puede crear documentos
en su colección (no leer ni borrar). El acceso humano queda restringido al
equipo de Growth Buddies, con registro de auditoría.

**Retención.** Los registros individuales se agregan y se borran a los
[12] meses. Los agregados se conservan mientras exista el servicio.

**Subencargado.** Google Cloud Platform (región [southamerica-west1]).

---

## 4. Aviso para las personas que rinden

**Versión corta** (tarjeta "Listo para terreno", Ola 8b):

> Para que la lectura sin señal mejore, la app compara lo que leyó el
> teléfono con lo que tú confirmas. No se guardan fotos extra ni se
> comparte tu información fuera de [Empresa].

**Versión larga** (enlace "Más información"):

> **¿Qué hace la app con mis boletas?**
> La foto de tu boleta se guarda en el ambiente de [Empresa], como siempre.
> Además, el teléfono intenta leerla por sí mismo, para que puedas rendir
> aunque no tengas señal.
>
> **¿Qué se mide?** Si el teléfono acertó cada dato (monto, fecha, RUT,
> comercio) comparado con lo que tú confirmaste. Ese resultado (acertó /
> no acertó) se guarda sin tu nombre.
>
> **¿Quién lo ve?** El superadministrador de [Empresa], como porcentajes
> de acierto.
>
> **¿Sale algo de [Empresa]?** Solo si [Empresa] lo autorizó: datos
> técnicos sobre el formato de las boletas de empresas (por ejemplo, en
> qué parte de las boletas de Copec está el total). Nunca tu nombre, tus
> montos ni tus fotos.

---

## 5. Texto del consentimiento en Ajustes (Ola 8c)

Versión de texto: `derived-v1`. Se registra quién lo activó, cuándo y esta
versión. Cambiar el texto obliga a pedir la aceptación otra vez.

> **Aportar a la mejora del lector (datos derivados)**
> Autorizo a Growth Buddies a recibir, desde el ambiente de [Empresa], datos
> técnicos sobre el formato de las boletas de empresas emisoras y sobre el
> acierto del lector, según la cláusula [N] del contrato. No incluye
> imágenes, montos, categorías, centros de costo ni datos de personas.
> Puedo desactivarlo cuando quiera.
> ☐ Activar · [Ver qué se envía]

---

## 6. Cómo venderlo

**Frase:** "El lector mejora con toda la red; tus datos de negocio nunca
salen de tu ambiente."

**Objeciones previsibles:**

- *"¿Ustedes venden nuestros datos?"* No. La cláusula lo prohíbe; lo que
  sale (si lo autorizas) describe boletas de empresas, no a tu empresa.
- *"¿Y si no lo autorizamos?"* Recibes igual cada mejora del lector. Solo
  no aportas.
- *"¿Qué pasa con las fotos?"* Se quedan en tu ambiente. Entrenar con
  imágenes es otra autorización, opcional y revocable.
- *"¿Cumple la ley de datos?"* Se diseñó con minimización en origen,
  exclusión de personas naturales y consentimiento separado para
  imágenes (Ley 19.628 / 21.719 en Chile; Ley 1581 en Colombia). Revisado
  por [abogado].

---

## 7. Para revisar con el abogado

1. Si los atributos de la tabla 3 califican como datos anonimizados bajo la
   Ley 21.719 (vigente desde el 1 de diciembre de 2026) y la Ley 1581.
2. La regla de persona jurídica por rango de RUT/NIT: ¿basta, o hay que
   excluir también EIRL y empresas individuales con el RUT de la persona?
3. Si el aviso a usuarios basta o se requiere consentimiento individual de
   cada trabajador (finalidad compatible vs. nueva finalidad).
4. La titularidad de las mejoras ([N].6) y la no separabilidad de lo ya
   agregado tras la revocación ([N].5).
5. La transferencia internacional si un cliente colombiano aporta a un
   proyecto central alojado en Chile (o al revés).
6. El tratamiento de la cláusula de imágenes (base de licitud, retención,
   recorte) y si conviene un DPA aparte.
