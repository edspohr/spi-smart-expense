# Validación — Dashboard y uso desde el teléfono (2026-11-03)

Trabajo transversal, fuera de las olas. Commit `def7cba` en `main`,
deployado en SPI (solo hosting) y, vía merge, en el demo.

## Qué cambió

- **Dashboard de administración:** seis tarjetas compactas en lugar de cinco
  grandes, en 2 columnas en el teléfono, 3 en tablet y escritorio, 6 en
  pantallas anchas:
  - **Por aprobar:** cantidad y monto; abre Aprobaciones.
  - **Más antiguo:** días que lleva la pendiente más vieja y cuántas pasan
    de 7 días (ícono rojo si alguna).
  - **Rendido** y **Aprobado** en el período elegido.
  - **Fondos por rendir** y **Por reembolsar:** suma de saldos negativos y
    positivos de las personas; abren Balances.
  - Se quitaron «Promedio por gasto» y «Proyectos activos».
  - Las dos de pendientes ignoran el filtro de período (sí respetan cliente y
    centro de costo); las de saldos muestran el saldo actual.
- **Tablas en el teléfono:** Aprobaciones, Balances, Mis rendiciones, Mi
  resumen, Reportes, Usuarios, Centros de costo, detalle de centro de costo,
  detalle de usuario, Conciliación y Actividad por persona se ven como
  tarjetas bajo 1024 px (768 px las angostas), con los mismos botones. En
  escritorio, las columnas secundarias aparecen desde 1280 / 1536 px para que
  la columna de acciones no quede fuera de pantalla.
- **Filtros del dashboard:** fijos al hacer scroll solo en escritorio.
- **Eliminado «Recalcular Saldos (Repair)»** en Balances
  (`src/utils/fixBalances.js`). Ver TD-018.

## Cómo probarlo

1. `npm run emulators`, `npm run seed:emu` y `npm run dev:emu`. Si el
   superadmin de prueba no ve datos, correr
   `node scripts/migrations/002-backfill-claims.mjs --apply` contra el
   emulador.
2. Entrar como superadmin de prueba y abrir `/admin` en escritorio: seis
   tarjetas en dos filas de tres.
3. Emular un teléfono (375 px) y recorrer `/admin`, `/admin/approvals`,
   `/admin/balances`, `/admin/reports`, `/admin/users`,
   `/admin/users/<id>`, `/admin/projects` y `/dashboard/expenses`.
4. En Aprobaciones (teléfono), usar ver, editar, aprobar y rechazar desde una
   tarjeta y marcar varias para la barra de acciones en lote.

## Estado esperado

- Ninguna página tiene scroll horizontal en 375 px (salvo Carga Masiva, que
  es una herramienta de escritorio, y la vista previa contable del demo).
- En 1280 px la tabla de Aprobaciones muestra Fecha, Usuario, Comercio
  (con el centro de costo debajo), Proyecto, Monto y Acciones.
- Balances ya no tiene el botón «Recalcular Saldos (Repair)».
