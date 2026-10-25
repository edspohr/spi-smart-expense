# 0013 — Paleta Growth Buddies Light compartida por las apps "buddies"

**Estado:** Aceptada
**Fecha:** 2026-10-25
**Ola:** 7 (marca del tenant demo)

## Contexto

Expense Buddy es la primera de varias apps "buddies" de Growth Buddies. La
web de Growth Buddies tiene un sistema oscuro (fondo `#0B0B0F`, acento
`#0097B2`), pero las apps móviles necesitan un tema claro, legible en
terreno y con una identidad común entre productos. El demo usaba un verde
genérico y un logo provisorio.

## Decisión

- Una paleta clara, **Growth Buddies Light**, versionada en
  `design/growth-buddies-light/` (`tokens.json` como fuente de verdad, más
  `tokens.css` y un preset de Tailwind). Escalas `teal` e `ink` derivadas de
  los tokens oscuros de la web, con contraste WCAG medido.
- **Marca ≠ acción:** `#0097B2` (teal-600) es la identidad (logo, ícono,
  acentos), pero el blanco encima da 3.46:1; botones y enlaces usan
  `#007C93` (teal-700, 4.88:1).
- Los tenants de Expense Buddy la consumen por config: `branding.palette`
  (mapeo `tenantPalette`), `branding.ctaPalette` para el botón principal y
  `branding.designSystem: "growth-buddies-light"`.
- Ícono de app: un **símbolo**, no iniciales. Expense Buddy usa la
  **"B-recibo"**: una B (Buddy) sólida cuya base es el borde dentado de una
  boleta, en blanco sobre tile turquesa `#0097B2`. Un solo trazo dice
  "buddy" y "gasto", es propio y se lee a 40 px. Vectores en grilla 1024;
  los PNG se renderizan del mismo SVG con resvg
  (`scripts/brand/expense-buddy-icon.py`).
- Se descartaron, tras revisarlos con el responsable: monograma "EB"
  geométrico, "ExB" en varias tipografías (Geist, Instrument Serif,
  Fraunces, combinaciones) y sobre fondos claro y tinta. Con tres letras el
  logo seguía viéndose genérico ("barato"); lo que funcionó fue un símbolo
  con concepto.

## Alternativas consideradas

- **Usar el tema oscuro de la web.** Fuerte en marketing, pero cansador y
  menos legible al sol para rendir gastos en terreno.
- **`#0097B2` como color de botón.** Fiel a la web, pero falla AA con texto
  blanco normal.
- **Paquete npm compartido desde ya.** Correcto a futuro; con una sola app
  consumidora es burocracia. Se mueve cuando exista la segunda (backlog).

## Consecuencias

- SPI no cambia: no declara `designSystem` ni `ctaPalette`, su CTA sigue en
  el verde por defecto (`--cta-*` en `index.css`).
- Nuevas apps buddies copian `design/growth-buddies-light/` (o lo importan
  cuando sea paquete) y siguen las reglas de su README.
- Quedan colores fijos fuera de la paleta (p. ej. el degradado `indigo` del
  avatar en el sidebar, compartido con SPI); se migran cuando se decida
  tocar el look de SPI.
