# Claves públicas del SII (Chile)

Claves públicas del SII que verifican la firma FRMA del CAF (la que acredita
que el SII autorizó el rango de folios al RUT emisor). ADR 0017.

- Un archivo por clave: `<IDK>.pem` (SPKI, `-----BEGIN PUBLIC KEY-----`),
  donde `IDK` es el valor de `<CAF><DA><IDK>` del timbre.
- El navegador las empaqueta al construir (`src/lib/localReader/siiKeys.ts`)
  y Functions las lee del disco (`functions/src/fiscal.ts`).
- Si llega un `IDK` que no está aquí, la rendición queda en "Verificación
  pendiente" con razón "Clave pública SII no disponible (IDK …)".

- `300.pem`: producción (palena), la que firma los CAF reales.
- **IDK 100 (certificación) no va aquí a propósito:** sus CAF son de prueba,
  sin validez tributaria, así que una boleta de prueba quedaría "verificada".
  Su clave vive solo como fixture de test
  (`functions/src/__fixtures__/sii-idk-100.pem`).

Cómo obtener, probar y publicar una clave: `docs/runbooks/sii-keys.md`.

Son claves **públicas**. Nunca poner aquí claves privadas ni la clave falsa
que genera `scripts/fixtures/make-ted-fixture.mjs`.
