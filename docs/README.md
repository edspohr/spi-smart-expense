# docs/

Documentación operacional de **Expense Buddy** (plataforma genérica de
rendición de gastos) y de su primer tenant, **SPI Smart Expense**. Los
archivos de esta carpeta son insumos para trabajo con agentes (Claude Code)
y para onboarding y handover a clientes.

No contienen código ejecutable. No se importan desde `src/`.

---

## Mapa de documentos

| Archivo / carpeta | Qué contiene | Cuándo se actualiza |
|-------------------|--------------|---------------------|
| `implementation-plan.md` | Plan v4 por olas: 0-7 deployadas (historia) y roadmap 8-16 en orden sugerido, sin fechas (ADR 0014). Objetivo, scope, dependencias e impacto en SPI; prompt ejecutable de la próxima ola. Tabla de estado al inicio. | Al cerrar cada ola |
| `research/` | Investigación de mercado que respalda decisiones de producto. Hoy: `benchmark-2026-10.md` (resumen del benchmark Chile/Colombia/Perú/México). | Cuando hay un estudio nuevo |
| `adr/` | Architecture Decision Records (0001-0016) con plantilla e índice en `adr/README.md`. | Cuando se toma o reemplaza una decisión de arquitectura |
| `technical-debt.md` | Deuda técnica conocida (TD-NNN) con severidad, impacto y fix recomendado. | Al cerrar o descubrir deuda en cada ola |
| `backlog.md` | Fuera de alcance deliberado, con razón y ola tras la cual reevaluar. | Al cerrar cada ola (podar lo que entró) |
| `validation/ola-N.md` | Doc de validación por ola: qué cambió / cómo probarlo / estado esperado. | Al cerrar cada ola |
| `runbooks/` | Procedimientos operativos. Hoy: `emulators.md` (entorno de pruebas local con cuentas seed), `deploy-ola-2.md` (primera salida de Functions, claims y rules, con orden de cutover y rollback) `deploy-ola-3.md` (usuarios, ajustes y primer superadmin) `bootstrap-tenant.md` (alta de un cliente nuevo y del demo) y `learning-hub.md` (proyecto central del lector que aprende, Ola 8c). Ola 8 añade handover a cliente, secretos, restore. | Cuando cambia la operación |
| `legal/` | Borradores contractuales y de privacidad para revisión legal. Hoy: `lector-datos-derivados.md` (borrador para abogado: cláusula de datos derivados, anexo técnico, avisos y consentimientos, ADR 0016) y `textos-vigentes-lector.md` (textos provisionales que usa la app, con su versión). | Cuando cambia lo que se comparte o un abogado lo revisa |
| `pendientes.md` | Tareas que solo puede hacer el responsable (consola, pruebas en producción). Se revisan al cierre de cada ola. | Cada vez que surge o se cierra una |
| `testing-backlog-deploy.md` | Checklist de pruebas pre-deploy heredado del plan v2. | Según uso |
| `archive/` | Documentos obsoletos con banner de fecha (plan v2, fases 1-6). | Nunca se editan |

**Estado por ola:** ver la tabla al inicio de `implementation-plan.md`.
El historial de deploys del plan v2 (fases 1-6, 2026-04-16) está al final de
este archivo.

---

## Cómo usar estos documentos

### Con Claude Code

Desde la raíz del repo:

\`\`\`bash
claude
\`\`\`

Luego, para arrancar una ola:

\`\`\`
Read docs/implementation-plan.md and the ADRs it references, then execute
Ola N exactly as specified. Show me a summary of changed files when done
and wait for my approval before running npm run build.
\`\`\`

**Regla de oro:** una ola por turno. No ejecutar múltiples olas en la
misma sesión sin revisar el diff entre cada una. Cada ola cierra con su
`validation/ola-N.md` y la actualización de `technical-debt.md`,
`backlog.md` y `adr/` si corresponde.

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

### Plan v3 — olas

| Ola | Commit | Deployada |
|-----|--------|-----------|
| 0 | `3a7b8e2` | 2026-10-25 |
| 1 | `f2ff128` | 2026-10-25 |
| 2 | `cb7e8bf` | 2026-10-25 |
| 3 | `47a5827` | 2026-10-25 |
| 4 | `23bfff1` | 2026-10-25 |
| 5 | `ed26b9c` | 2026-10-25 |
| 6 | `1f5d0af` | 2026-10-25 |
| 7 | `6378638` | 2026-10-25 (SPI y demo) |
| 8 | `89a4592` | 2026-10-26 (SPI con lector apagado; demo activo) |
| 8b | `a79a856` | 2026-10-26 (SPI apagado; demo con modo sombra) |

### Plan v2 — fases (archivado)

| Fase | Commit | Deployada |
|------|--------|-----------|
| 1 | `5cd5ffe` | 2026-04-16 |
| 2 | `a9c93c8` | 2026-04-16 |
| 3 | `8e9225f` | 2026-04-16 |
| 4 | `8fcea36` | 2026-04-16 |
| 5 | `<sha>` | 2026-04-16 |
| 6 | `<sha>` | 2026-04-16 |
