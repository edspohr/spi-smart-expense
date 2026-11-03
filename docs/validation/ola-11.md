# Validación — Ola 11: Exportación contable

**Fecha:** 2026-11-03
**Rama:** `ola-11/accounting-export` (sobre `ola-10/fiscal-ted`, sin desplegar)
**Decisión:** ADR 0018
**Impacto en SPI:** transparente. `modules.accounting` queda en `false`: no
hay menú ni página, y `buildAccountingExport` rechaza. Lo que SPI sí ve: un
interruptor "Contabilidad" apagado en Ajustes → Módulos (superadmin), el
callable nuevo en su proyecto, un índice compuesto nuevo y ~23 KiB más en el
bundle (precache 2552,33 → 2575,32 KiB). Las reglas nuevas solo actúan sobre
rendiciones con `accountingExport`, que en SPI no existen. TD-026 no se tocó.

Formato: qué cambió → cómo probarlo → estado esperado. Marcar ✅ al verificar.

---

## 1. Asientos (`functions/src/accounting.logic.ts`)

**Qué cambió:** un asiento cuadrado por rendición aprobada, en moneda base,
con IVA separado solo en documentos de tipo recuperable cuyo timbre no
falló. Bloquea lo que no se puede contabilizar (categoría sin cuenta, falta
cuenta por pagar o de tarjeta, falta cuenta de IVA, sin monto en moneda
base, no aprobada) y advierte (timbre fallido, ya exportada, sin centro de
costo).

**Cómo probarlo:** `npm test -- --run functions/src/accounting.test.ts`.

**Estado esperado:** 12 pruebas: factura 119.000 → 100.000 + 19.000 IVA;
boleta completa al gasto; redondeo a pesos (10.001 → 8.404 + 1.597); dos
decimales en USD; sin IVA con timbre fallido y en recibos del extranjero;
tarjeta corporativa; COP sin IVA y con `amountCOP` heredado; normalización
del mapeo. ✅

## 2. Formatos (`functions/src/accounting.connectors.ts`)

**Qué cambió:** CSV genérico (`;`, BOM, una fila por línea), Softland
(`.txt`, `dd/mm/aaaa`), Defontana (CSV con centro de negocio y ficha) y SAP
B1 (DTW: `JournalEntries` + `JournalEntries_Lines`, dos filas de título,
`AAAAMMDD`). Cada uno muestra sus supuestos.

**Cómo probarlo:** `npm test -- --run functions/src/accounting.connectors.test.ts`.

**Estado esperado:** 6 pruebas con el contenido exacto de cada archivo para
una factura y una boleta con `;` en el nombre del comercio. ✅
Importación real en Softland, Defontana o SAP B1: ☐ (sin acceso a ningún ERP).

## 3. Exportación en el servidor (`buildAccountingExport`)

**Qué cambió:** admin o superadmin, módulo activo, PIN de "Exportar
reportes". Lee las aprobadas del período (índice `status + date`), filtra
centro de costo y ya exportadas, rehace los asientos, se niega si hay
bloqueadas, escribe `accountingExports/{id}` (+ `files/`) y marca cada
rendición con `accountingExport` y un movimiento `exported`.

**Estado esperado (emulador demo, Camila Rojas, 2026-09-01 a 2026-11-03):**

| Caso | Resultado |
|------|-----------|
| Vista previa | 13 listas, 0 con problemas, Debe = Haber = $2.684.890 ✅ |
| Exportar en SAP B1 | 2 archivos, 13 rendiciones marcadas, registro en el historial ✅ |
| Volver a abrir la página | 0 listas; "Incluir ya exportadas (13 en el período)" ✅ |
| Descargar desde el historial | los mismos 2 archivos ✅ |
| Reexportar en CSV genérico con "incluir ya exportadas" | 13 rendiciones, "(13 reexportadas)" ✅ |
| Reabrir o eliminar una rendición exportada | "La rendición ya fue exportada a contabilidad." ✅ |
| Quitar la cuenta de VARIOS en Ajustes | vista previa: "Categoría sin cuenta contable: 1", botón deshabilitado ✅ |
| Llamar al callable igual | "1 rendiciones no se pueden contabilizar todavía…" ✅ |

PIN activo al exportar: ☐ (el demo tiene el PIN apagado). Exportación de
más de 450 escrituras (varios lotes): ☐.

## 4. Reglas e índice

**Qué cambió:** `accountingExport` no se puede crear ni cambiar desde el
navegador; una rendición exportada no cambia monto, moneda, tasa, fecha,
categoría, centro de costo, RUT, folio, comercio, tipo de gasto ni dueño;
`accountingExports` y `files` solo los leen admins. Índice
`expenses (status ASC, date ASC)`.

**Cómo probarlo:** `npm run test:rules`, bloque "accounting export (Ola 11)".

**Estado esperado:** 27/27. ✅ Antes de desplegar:
`firebase deploy --only firestore:indexes` en cada tenant que active el
módulo.

## 5. Mapeo en Ajustes y página

- **Ajustes → Mapeo contable** (superadmin, visible con el módulo activo):
  cuentas, IVA (%), tipos con IVA recuperable, centro de costo y una cuenta
  por categoría con el conteo "N sin cuenta". Guardar reemplaza el mapeo
  completo (una cuenta borrada desaparece). ✅
- **Contabilidad** en el menú de Gestión (admins, con el módulo activo):
  período, centro de costo, formato, "incluir ya exportadas", supuestos del
  formato, vista previa (50 rendiciones con sus líneas), problemas con
  enlace a Ajustes, historial de las últimas 20 exportaciones. ✅
- El demo trae un plan de cuentas de ejemplo (no es una recomendación
  contable).

## 6. Recorrido (emulador demo)

```bash
npm run emulators:demo      # terminal 1
npm run seed:demo           # cuando esté listo
npm run dev:demo:emu        # terminal 2
```

1. Entrar como superadmin o "Finanzas" → Contabilidad.
2. Desde 2026-09-01 (o un mes atrás) → revisar la vista previa.
3. Formato SAP B1 → Exportar: se descargan dos archivos.
4. Ver el historial; activar "incluir ya exportadas" y exportar en CSV.
5. Ajustes → borrar una cuenta → la vista previa bloquea.

## 7. No probado

- Importar los archivos en un ERP real (TD-042).
- PIN activo, exportaciones grandes en varios lotes (TD-041).
- Rendiciones con factura (tipo 33) en el demo: el seed no trae tipo de
  documento, así que no se vio la línea de IVA en el navegador (sí en las
  pruebas).

## 8. Checks de calidad

- `npm run lint`, `npm run typecheck`: ✅
- `npm test -- --run`: ✅ 184 (26 archivos)
- `npm run test:rules`: ✅ 27
- `npm run build` (2575,32 KiB) y `npm run build:demo` (2584,00 KiB): ✅
- `npm run functions:build`: ✅
