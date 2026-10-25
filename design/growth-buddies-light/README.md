# Growth Buddies Light

Paleta clara compartida por todas las apps "buddies" (Expense Buddy y las
que vengan). Deriva del sistema oscuro de la web de Growth Buddies
(`web-growth-buddies/docs/design-system.md`): fondo `#0B0B0F`, líneas
`#232330`, texto atenuado `#A7A7B2`, acento turquesa `#0097B2` y su variante
oscura `#005E70`. En claro, el negro pasa a ser la tinta y el turquesa
sigue siendo **un solo acento disciplinado**.

| Archivo | Uso |
|---------|-----|
| `tokens.json` | Fuente de verdad (escala, semánticos, mapeo para tenants) |
| `tokens.css` | Variables `--gb-*` para cualquier app web |
| `tailwind-preset.cjs` | `presets: [require('…/tailwind-preset.cjs')]` → `teal-*`, `ink-*`, `gb-*` |

Para copiarlo a otra app, copiar la carpeta entera; `tokens.json` manda.

## Escalas

| Paso | Teal | Blanco encima | Ink | Sobre blanco |
|------|------|---------------|-----|--------------|
| 50 | `#E8F7FA` | — | `#F6F6F8` | — |
| 100 | `#CCEEF4` | — | `#ECECEF` | — |
| 200 | `#99DDE9` | — | `#DCDCE3` | — |
| 300 | `#5CCADD` | — | `#C4C4CE` | — |
| 400 | `#00B5D6` | 2.45 | `#A7A7B2` | 2.38 |
| 500 | `#00A5C3` | 2.93 | `#6E6E7A` | 5.03 ✅ |
| 600 | `#0097B2` **marca** | 3.46 (solo grande/íconos) | `#55555F` | 7.37 ✅ |
| 700 | `#007C93` **acción** | 4.88 ✅ | `#3A3A45` | 11.22 ✅ |
| 800 | `#005E70` | 7.41 ✅ | `#232330` | 15.50 ✅ |
| 900 | `#0A4552` | 10.57 ✅ | `#14141A` | 18.35 ✅ |
| 950 | `#062B34` | 14.97 ✅ | `#0B0B0F` **tinta** | 19.64 ✅ |

Contraste WCAG medido (2026-10-25). ✅ = AA para texto normal (≥ 4.5).

Estados: éxito `#15803D` (5.02), alerta `#B45309` (5.02), error `#DC2626`
(4.83), info = teal-700.

## Reglas

1. **Marca ≠ acción.** `teal-600` `#0097B2` es la identidad: logo, ícono,
   acentos, bordes activos, gráficos. Botones primarios y enlaces usan
   `teal-700` `#007C93` (texto blanco AA); hover `teal-800`.
2. Fondo de página `ink-50`, tarjetas blancas con borde `ink-200`; texto
   `ink-950`, secundario `ink-600`, atenuado `ink-500`. Nunca `ink-400` para
   texto que hay que leer.
3. Un acento por vista. El degradado de marca
   (`#00B5D6 → #0097B2 → #005E70`, 135°) es para el ícono de la app y
   superficies hero, no para botones.
4. Foco: anillo `teal-400`.
5. Tipografía: Inter (texto), Geist (títulos), como la web.

## Apps con `branding.palette` (Expense Buddy)

Su escala Tailwind `brand` usa `600` para botones, así que el mapeo
(`tenantPalette` en `tokens.json`) corre un paso: `500 = #0097B2` (marca),
`600 = #007C93`, `700 = #005E70`. `themeColor = #0097B2`.

## Ícono de app

Monograma tipográfico sobre tile sólido **tinta** `ink-950`, en Instrument
Serif: las letras en `ink-50` y la inicial de "buddy" en itálica `teal-400`
`#00B5D6` (sobre oscuro el turquesa claro tiene más fuerza que `teal-600`).
Monograma al ~54 % del ancho, espaciado ajustado a mano, sin degradados ni
bordes. Expense Buddy: **ExB** (`scripts/brand/expense-buddy-icon.py`, lee
los contornos de `scripts/brand/fonts`). Decisión:
`docs/adr/0013-paleta-growth-buddies-light.md`.
