# 0015 — Lector de boletas en el dispositivo

**Estado:** Aceptada
**Fecha:** 2026-10-26
**Ola:** 8

## Contexto

La Ola 8 (ADR 0014) pide leer la boleta sin red y sin IA en la nube. Había
que decidir con qué motores, desde dónde se sirven, cómo se mide la
precisión sin guardar datos personales y cómo convive con Gemini.

## Decisión

1. **Código tributario antes que OCR.** `zxing-wasm` (reader, ~0,9 MB)
   decodifica el PDF417 del timbre electrónico chileno y el QR DIAN. Es
   exacto y tarda milisegundos; si hay código, no se corre OCR. Se
   reintenta con pequeños giros porque el PDF417 no tolera más de ~1° de
   inclinación.
2. **OCR con `tesseract.js` + `@tesseract.js-data/spa` (`4.0.0_best_int`,
   2 MB)** solo cuando no hay código, seguido de reglas en TypeScript puro
   (`src/lib/localReader/rules.ts`) testeadas con un corpus de boletas.
   Se descartaron modelos de IA en el navegador (pesados para gama media) y
   APIs nativas de texto (no existen de forma uniforme en la web).
3. **Motores servidos desde nuestro dominio**, versionados en
   `/ocr/<tesseract>-<zxing>/` (plugin de Vite: middleware en dev, archivos
   emitidos en build). No entran al precache (~7 MB que no todos usan): el
   service worker los sirve CacheFirst desde la caché `ocr-assets`, que
   "Listo para terreno" llena explícitamente. Sin CDN de terceros: funciona
   con CSP estricta y sin depender de jsDelivr en faena.
4. **Gemini sigue siendo la fuente de verdad.** Lo leído en el teléfono
   solo precarga el formulario; la persona confirma. Al sincronizar, una
   Function relee con Gemini y marca diferencias en monto, fecha o RUT/NIT
   (`aiReview`, solo servidor).
5. **Métrica anónima.** `ocrEval` guarda motor, tipo de documento,
   duración, confianza y acierto por campo (true/false), nunca la imagen,
   los valores ni la persona. Solo superadmin la lee.
6. **Opt-in por tenant** (`offline.localReader`, `ai.localFirst`, ambos
   falsos por defecto): SPI no cambia hasta activarlo.

## Consecuencias

- +~7 MB por versión de motores en Hosting y en el teléfono de quien
  prepara "terreno"; al subir de versión cambia la carpeta y se descargan
  de nuevo.
- La lista de casos fallidos con valores no existe por diseño (privacidad);
  para depurar reglas se usa el corpus (`__fixtures__/receipts/`), al que
  se suman boletas reales anonimizadas.
- El diccionario del tenant expone a cada usuario autenticado los pares
  RUT → comercio/categoría de gastos aprobados (datos de empresas, no de
  personas).
- La Ola 10 (SII) y la 15 (DIAN) reutilizan los parsers del TED y del QR.
