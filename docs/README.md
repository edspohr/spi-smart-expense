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
| 1 | Constantes compartidas + `cardBrand` (AmEx, Citi, etc.) | ⏳ En validación |
| 2 | Dashboard admin con KPIs + alertas + tendencia 30d | ⏳ Pendiente |
| 3 | Approvals estilo ETFA (filtros, sort, bulk, atajos) | ⏳ Pendiente |
| 4 | Mobile-first + PWA install prompt | ⏳ Pendiente |
| 5 | Polish pass (skeletons, empty states, a11y, optimistic) | ⏳ Pendiente |

Marcar cada fila como ✅ al deployar a producción.

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
