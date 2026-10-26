# 0014 — Roadmap post-benchmark: offline automatizado primero

**Estado:** Aceptada
**Fecha:** 2026-10-26
**Ola:** 8 en adelante (plan v4)

## Contexto

El benchmark de mercado (Chile, Colombia, Perú y México;
`docs/research/benchmark-2026-10.md`) concluye que:

- Para competir en licitaciones chilenas faltan la validación ante el SII,
  la integración contable con ERP (Softland, Defontana, SAP B1), un ciclo
  formal de fondos por rendir y viáticos, la captura por WhatsApp y
  evidencia de seguridad (SSO, certificaciones).
- Lo que nadie más ofrece es la rendición offline con sincronización
  automática, el ambiente dedicado por cliente, la marca blanca y el proceso
  configurado por un equipo local. Expense Buddy no puede competir en precio
  con el SaaS por usuario.
- El alojamiento físico de los datos no es un diferenciador (Google Cloud,
  como casi todos).

El orden lógico por impacto en licitaciones sería SII → ERP → fondos.

## Decisión

1. **La próxima ola (8) es el offline automatizado**, no las brechas de
   licitación: lectura de la boleta en el teléfono sin red (timbre
   electrónico PDF417 y QR DIAN exactos; OCR local con reglas para el
   resto), "Listo para terreno" (todo lo necesario precargado),
   verificación con IA al reconectar con métrica de precisión, corpus de
   pruebas en CI y un modo "simular sin señal" para demos. Junto con el
   cierre de los pendientes del responsable.
   Motivo: es el gancho que cierra negocios en el segmento (faenas sin
   señal), ningún competidor lo documenta, y cada uso en testing o con
   clientes lo depura. "Funciona sin señal" vende; "lee la boleta sin
   señal" cierra.
2. **Después, en este orden sugerido y sin fechas:** 9 operación de flota y
   seguridad base · 10 timbre + validación SII · 11 integración contable ·
   12 fondos por rendir, viáticos, kilometraje y políticas · 13 WhatsApp +
   email · 14 enterprise (SSO, pentest, roles) · 15 Colombia DIAN +
   conciliación de cartola · 16 calidad y escala.
3. **Fuera del roadmap:** emisión de tarjetas, reserva de viajes y
   movimiento de dinero propio. Perú, México, agentes de IA de auditoría e
   ISO 27001 quedan diferidos hasta que un cliente los pida.
4. **Comunicación honesta:** WhatsApp se presenta como "en roadmap" hasta
   que exista; el OCR local se presenta con sus límites (exacto con timbre
   o QR, aproximado en papel sin código).

## Alternativas consideradas

- **Orden del benchmark (SII → ERP → fondos primero).** Maximiza la
  paridad para licitaciones formales, pero llega a la mesa sin un
  diferencial demostrable; el informe mismo dice que sin offline "gana solo
  donde pesan la operación offline, el control del ambiente y la
  adaptación".
- **WhatsApp primero.** Visible para prospectos, pero los locales ya lo
  tienen: es paridad, no diferencia.
- **OCR local más tarde (después de ERP).** Retrasa el mensaje de apertura
  para minería, energía y construcción y la recolección de datos reales
  que lo mejoran.

## Consecuencias

- La Ola 8 deja bases reutilizables: el lector del TED alimenta la Ola 10
  (SII) y el del QR DIAN la Ola 15; el lector local sirve a WhatsApp
  (Ola 13).
- Se necesita un corpus de boletas reales anonimizadas (lo aporta el
  responsable) y una métrica `ocrEval` sin datos personales.
- Hasta la Ola 10-12, Expense Buddy seguirá perdiendo licitaciones que
  exijan SII o ERP como excluyentes; la estrategia es ganar primero clientes
  fundadores donde pesa el terreno.
- Los prompts de las olas 9-16 se escriben al iniciarlas; el orden puede
  cambiar con lo que pidan los clientes fundadores (se registra aquí o en un
  ADR nuevo).
