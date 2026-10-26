// Consent text for the cross-client layer of the learning reader (Ola 8c,
// ADR 0016). PROVISIONAL until legal review: docs/legal/textos-vigentes-lector.md.
// The version must match DERIVED_TERMS_VERSION in functions/src/learning.logic.ts.

export const DERIVED_TERMS_VERSION = 'derived-v0';
export const DERIVED_TERMS_PROVISIONAL = true;

export const DERIVED_TERMS_TITLE = 'Aportar a la mejora del lector (datos derivados)';

export const DERIVED_TERMS_TEXT =
  'Autorizo a Growth Buddies a recibir, desde el ambiente de mi empresa, datos técnicos sobre el formato de las boletas de empresas emisoras y sobre el acierto del lector, para mejorar la lectura de documentos de Expense Buddy. No incluye imágenes, montos, fechas, folios, categorías, centros de costo ni datos de personas. Puedo desactivarlo cuando quiera; lo ya incorporado en forma agregada al lector no se puede separar.';

/** What is sent and what never is, for the "Ver qué se envía" panel. */
export const DERIVED_SENT = [
  'RUT/NIT de emisores que son empresas (no personas naturales) y la etiqueta donde sus boletas muestran el total, con cuántas veces se confirmó.',
  'Contadores diarios de acierto del lector por campo y por motor (código o texto), y su tiempo de lectura.',
  'Un identificador aleatorio del ambiente (no el nombre de la empresa).',
];
export const DERIVED_NEVER = [
  'Imágenes o texto de las boletas.',
  'Montos, fechas, folios o números de documento.',
  'Categorías, centros de costo, eventos o proyectos.',
  'Nombres, correos, RUT de personas, tarjetas.',
  'Qué leyó la IA ni cuánto la corrigen las personas.',
];
