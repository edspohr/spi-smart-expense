# 0011 — Gemini vía Vertex AI, no vía Gemini Developer API

**Estado:** Aceptada
**Fecha:** 2026-10-25
**Ola:** 2

## Contexto

La extracción de recibos usaba la Gemini Developer API (key de Google AI
Studio) con el SDK `@google/generative-ai`, que está deprecado. Al mover la
llamada a Cloud Functions (ADR 0003) había que decidir cómo autenticar y qué
SDK usar. La key estuvo expuesta en el bundle web hasta esta ola, y el
producto se venderá a empresas (Elecnor) que preguntan por tratamiento de
datos y credenciales.

## Decisión

Llamar a los mismos modelos Gemini a través de **Vertex AI** con el SDK
`@google/genai` (`vertexai: true`, `project`, `location`). La service account
de Cloud Functions autentica con IAM (`roles/aiplatform.user`); no existe
ninguna API key que guardar, rotar o filtrar. La ubicación se parametriza con
`VERTEX_LOCATION`, por defecto el endpoint `global` (los modelos nuevos llegan
ahí primero; `us-central1` devolvía 404 para `gemini-3.6-flash` el
2026-10-25). La key de AI Studio se elimina.

## Alternativas consideradas

- **Gemini Developer API + Secret Manager.** Funciona y tiene free tier, pero
  sigue habiendo una key que rotar, sin contrato enterprise de datos ni
  residencia regional. Para un cliente corporativo suena a prototipo.
- **Firebase AI Logic (SDK cliente con App Check).** Evita el backend, pero la
  Ola 2 ya exige Functions para rate limit, auditoría y futura cola offline;
  duplicaría caminos.
- **Otro proveedor (Claude, OpenAI).** Posible más adelante vía la misma
  callable; hoy el prompt y la calidad están validados con Gemini.

## Consecuencias

- Cada tenant es un proyecto GCP: habilitar `aiplatform.googleapis.com` y dar
  el rol a la service account forma parte del bootstrap de tenant (Ola 7).
- Sin free tier: la demo para Elecnor consume centavos reales por lectura.
- Los nombres de modelo pueden llegar a los endpoints regionales con retraso;
  `scripts/vertex-check.mjs` verifica que `PRIMARY_MODEL` y `FALLBACK_MODEL`
  respondan en la ubicación configurada antes de cada deploy.
- `global` no garantiza residencia de datos en una región concreta. Un tenant
  con ese requisito (p. ej. Elecnor en Europa) fija una región en
  `VERTEX_LOCATION` y acepta usar solo los modelos disponibles ahí.
- En emuladores, `extractReceipt` usa las Application Default Credentials de
  gcloud del desarrollador.
