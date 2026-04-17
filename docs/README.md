# docs/

Documentación operacional del proyecto **SPI Smart Expense**. Los archivos de
esta carpeta son insumos para trabajo con agentes (Claude Code, Antigravity)
y para onboarding del equipo.

No contienen código ejecutable. No se importan desde `src/`.

---

## Archivos actuales

### `implementation-plan.md`

Plan activo de mejoras multi-fase. Cada fase es un prompt auto-contenido
en inglés, listo para pegar en Claude Code. Fases entregables de forma
independiente (cada una se puede `firebase deploy` sin romper la anterior).

**Estado por fase** (actualizar al terminar cada una):

| Fase | Scope | Estado |
|------|-------|--------|
| 1 | Constantes compartidas + `cardBrand` (AmEx, Citi, etc.) | ✅ Deployada 2026-04-16 |
| 2 | Dashboard admin con KPIs + alertas + tendencia 30d | ✅ Deployada 2026-04-16 |
| 3 | Approvals estilo ETFA (filtros, sort, bulk, atajos) | ✅ Deployada 2026-04-16 |
| 4 | Mobile-first + PWA install prompt | ✅ Deployada 2026-04-16 |
| 5 | Polish pass (skeletons, empty states, a11y, optimistic) | ✅ Deployada 2026-04-16 |
| 6 † | Rediseño del dashboard (hero proyectos, anomalías, equipo) | ✅ Deployada 2026-04-16 |

† Micro-fase post-plan, rediseño del dashboard.

Marcar cada fila como ✅ al deployar a producción.

---

## Parking lot — mejoras futuras

- **Firestore transactions en escrituras relacionadas.** Las operaciones
  que modifican balance del usuario y estado del gasto en paralelo no son
  atómicas. Si la primera write succeed y la segunda falla, Firestore queda
  inconsistente. Fix real requiere `runTransaction` con read-modify-write
  atómico. Bug latente desde el código original, no introducido por el plan.

- **Migración de `confirm()` nativos a `ConfirmDialog`.** Quedan 14 call
  sites en `src/` usando el `confirm()` del navegador. La app ya tiene un
  componente `ConfirmDialog` (Fase 3) con estilo consistente. Migrar cada
  call site a state + component wiring unifica la UX de confirmaciones.

- **Iconos PWA cuadrados.** El manifest (`public/manifest.webmanifest`)
  referencia `/logo.png` (1024×433) para 192x192 y 512x512. Chrome los
  estira. Reemplazar con assets cuadrados (`icon-192.png`, `icon-512.png`)
  elimina la distorsión y habilita `"maskable"` como segunda entrada para
  Android adaptive icons. Ver `_todo` en el manifest.

- **Focus-ring sweep pendiente.** La utility `.focus-ring` se aplicó en
  las páginas y modales del plan original. Falta aplicar en `AdminReports`,
  `AdminUserSeeder`, `AdminModuleSelector` y cualquier nueva página futura.
  Es un find-replace, no requiere nueva lógica.

---

## Cómo usar estos documentos

### Con Claude Code

Desde la raíz del repo:

\`\`\`bash
claude
\`\`\`

Luego, para arrancar una fase:

\`\`\`
Read docs/implementation-plan.md and execute Phase N exactly as
specified. Show me a summary of changed files when done and wait for
my approval before running npm run build.
\`\`\`

**Regla de oro:** una fase por turno. No ejecutar múltiples fases en la
misma sesión sin revisar el diff entre cada una.

---

## Convenciones

- **Idioma:** contenido en español. Prompts para agentes en inglés.
- **Nombres:** kebab-case, descriptivos.
- **Formato:** Markdown puro. Diagramas con Mermaid inline.
- **Obsoletos:** mover a \`docs/archive/\` con banner de fecha, no borrar.

---

## Contacto

Responsable técnico: **Edmundo Spohr** (edmundo@spohr.cl)
Backend / infra: **Felipe Soto Santibáñez**

---

## Historial

| Fase | Commit | Deployada |
|------|--------|-----------|
| 1 | `5cd5ffe` | 2026-04-16 |
| 2 | `a9c93c8` | 2026-04-16 |
| 3 | `8e9225f` | 2026-04-16 |
| 4 | `8fcea36` | 2026-04-16 |
| 5 | `<sha>` | 2026-04-16 |
| 6 | `<sha>` | 2026-04-16 |
