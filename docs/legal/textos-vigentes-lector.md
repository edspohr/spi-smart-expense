# Textos vigentes del lector que aprende

> **PROVISIONAL — `derived-v0` — pendiente de revisión legal.**
> Estos son los textos que la app muestra y registra hoy. Se escribieron a
> partir del borrador `lector-datos-derivados.md` mientras un abogado lo
> revisa (ver `docs/pendientes.md`). **No incluir en contratos firmados ni
> activar la capa general con clientes reales hasta reemplazarlos por
> `derived-v1`.** El demo puede usarlos (datos ficticios).

| Texto | Versión | Dónde vive en el código |
|---|---|---|
| Consentimiento de datos derivados (Ajustes) | `derived-v0` | `src/lib/learningTerms.ts`, `functions/src/learning.logic.ts` (`DERIVED_TERMS_VERSION`) |
| Aviso a las personas que rinden | `notice-v0` | `src/components/ReaderNotice.tsx` |
| Cláusula contractual | `clause-v0` | Este documento, §3 |

**Al cambiar de versión:**
1. Actualizar el texto aquí y en el código.
2. Subir `DERIVED_TERMS_VERSION` en ambos archivos (deben coincidir; hay
   una prueba que lo verifica).
3. Al desplegar, cada cliente que había aceptado queda con un consentimiento
   de versión anterior: la exportación se detiene hasta que un
   superadministrador acepte la nueva versión en Ajustes.

---

## 1. Consentimiento en Ajustes (`derived-v0`)

> **Aportar a la mejora del lector (datos derivados)** · versión provisional
>
> Autorizo a Growth Buddies a recibir, desde el ambiente de mi empresa,
> datos técnicos sobre el formato de las boletas de empresas emisoras y
> sobre el acierto del lector, para mejorar la lectura de documentos de
> Expense Buddy. No incluye imágenes, montos, fechas, folios, categorías,
> centros de costo ni datos de personas. Puedo desactivarlo cuando quiera;
> lo ya incorporado en forma agregada al lector no se puede separar.

Se registra: quién lo activó, cuándo, versión del texto, y cada cambio en
`consentLog` (solo servidor).

## 2. Aviso a las personas que rinden (`notice-v0`)

Texto actual en `ReaderNotice.tsx` (igual a §4 del borrador).

## 3. Cláusula contractual (`clause-v0`)

Igual a la §2 del borrador `lector-datos-derivados.md` (cláusula [N]),
con los campos entre corchetes sin completar. Pendiente: razón social de
Growth Buddies, retenciones (propuesta: registros individuales 12 meses,
imágenes 24 meses), región del proyecto central.

## 4. Qué se envía exactamente (`derived-v0`)

Lo genera `buildContribution()` en `functions/src/learning.logic.ts` y lo
valida `validateContribution()` (el proyecto central rechaza cualquier
campo adicional). El superadministrador puede ver el envío real en Ajustes
→ "Ver qué se envía".

```json
{
  "schema": "derived-v0",
  "envId": "seudónimo aleatorio del ambiente (no el nombre del cliente)",
  "country": "CL",
  "generatedAt": "2026-10-26T12:00:00.000Z",
  "issuers": [
    { "issuer": "99520000-7", "labels": { "TOTAL": 4, "TOTAL A PAGAR": 1 } }
  ],
  "stats": [
    {
      "date": "2026-10-26",
      "reads": 12,
      "byMode": { "shadow": 10, "offline": 2 },
      "fields": { "shadow": { "ocr": { "amount": { "ok": 8, "total": 10 } } } },
      "time": { "ocr": { "sum": 9800, "n": 10 } }
    }
  ]
}
```

- `issuers`: solo emisores persona jurídica (CL: RUT ≥ 50.000.000; CO: NIT
  que empieza por 8 o 9) y solo las etiquetas del total con sus votos.
- `stats`: contadores diarios de acierto, sin `ai` (no describen al
  lector) ni identificadores.
