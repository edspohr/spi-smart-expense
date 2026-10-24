# 0002 — Monorepo con configuración por tenant

**Estado:** Aceptada
**Fecha:** 2026-10-24
**Ola:** 0

## Contexto

Con un Firebase project por cliente (ADR 0001) hay que decidir cómo se
organiza el código: un repo por cliente, un repo base con forks, o un solo
repo que construya para cada tenant.

## Decisión

Un solo repositorio. La app React queda en la raíz (sin mover `src/`),
se agregan `functions/` (Cloud Functions, TypeScript) y `shared/` (tipos y
constantes compartidas entre app y functions) como workspaces npm.

La configuración por cliente vive en `tenants/<id>.json` (branding, país,
moneda, módulos, umbrales, flags) y se inyecta en build con `VITE_TENANT`
vía `define` de Vite. Los ajustes editables en runtime por el superadmin
(Ola 3) se guardan en Firestore `tenants/<id>/settings` y se mezclan sobre
los defaults del JSON.

## Alternativas consideradas

- **Repo base + fork por cliente.** Permite customizaciones profundas pero
  cada fix se mergea N veces; el mantenimiento mensual se vuelve inviable.
- **Mover la app a `app/`** (como Comandas). Más ordenado pero mueve cientos
  de archivos sin beneficio funcional ahora; se puede hacer después.
- **Config solo en Firestore.** Impide generar manifest, íconos y
  `<title>` por tenant en build y obliga a un fetch antes del primer render.

## Consecuencias

- Un fix beneficia a todos los clientes: es lo que sostiene el cobro
  mensual.
- Toda feature nueva debe ser configurable por tenant y mantener el
  default de SPI intacto (regla del plan).
- CI construye para `spi` y `demo` en cada PR; agregar un tenant es agregar
  un JSON y un job de deploy.
- Las customizaciones "profundas" de un cliente se expresan como flags y
  módulos, no como ramas.
