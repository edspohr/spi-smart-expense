# Claves públicas del SII (Chile)

Carpeta con las claves públicas del SII usadas por `tedVerify.logic.ts` para
verificar la firma FRMA del CAF (la que acredita que el folio fue autorizado
al RUT emisor por el SII).

Cada clave viaja como PEM con nombre `<IDK>.pem`, donde `IDK` es el identificador
que aparece en `<CAF><DA><IDK>` del timbre electrónico. Los archivos los lee
`siiKeys.ts` con `import.meta.glob` al construir el bundle, se cachean como
`CryptoKey` tras la primera verificación y nunca salen del cliente ni del
servidor hacia terceros.

## Cuándo agregar una clave

Cuando un receipt chileno llegue con un `IDK` que no está acá, el verificador
devolverá `fiscalVerification.status = 'error'` con razón "Clave pública SII
no disponible (IDK …)". Es la señal para bajar la clave y agregarla.

## Rotación

1. Bajar la clave desde el canal oficial del SII (ver `docs/runbooks/sii-keys.md`).
2. Guardar el archivo como `<IDK>.pem`, con cabecera `-----BEGIN PUBLIC KEY-----`.
3. Agregar al inicio del archivo un comentario corto con fuente y fecha de
   obtención (comentario fuera del bloque PEM; los lectores PEM lo ignoran).
4. Bump de `READER_VERSION` en `src/lib/localReader/index.ts` para que los
   dispositivos re-descarguen los engines y las claves.
5. `npm run build && firebase deploy --only hosting` para publicar.

Son claves **públicas**. Nunca pongas aquí claves privadas.
