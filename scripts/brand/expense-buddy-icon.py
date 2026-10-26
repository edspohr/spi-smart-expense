#!/usr/bin/env python3
"""Expense Buddy app icon: the "B-recibo" mark.

Usage (needs Pillow + resvg-py):
    python3 -m pip install pillow resvg-py
    python3 scripts/brand/expense-buddy-icon.py

Design (ADR 0013): a solid B — for Buddy — whose base is a receipt's torn
zigzag edge, in turquoise (#00B5D6) on the Growth Buddies ink tile (#0B0B0F). One
symbol says "buddy" and "expense", and as a single silhouette it holds up at
40 px. Everything is drawn as vectors on a 1024 grid; the PNGs are rendered
from the same SVG with resvg, so every asset matches:
  public/brands/demo/icon.svg             squircle (UI logo: login, sidebar)
  public/brands/demo/icon.png             1024 px, same
  public/icons/demo/icon-192.png          Android "any" (squircle)
  public/icons/demo/icon-512.png          Android "any" (squircle)
  public/icons/demo/icon-512-maskable.png full bleed; mark inside the 80 % safe zone
  public/icons/demo/apple-touch-180.png   full bleed, opaque (iOS applies its own mask)
"""
import io
import math
import pathlib

import resvg_py
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
GRID = 1024
TILE = '#0B0B0F'   # ink-950, Growth Buddies "Tinta" frame
MARK = '#00B5D6'   # teal-400, the accent on dark

# ── The mark (grid units). Strokes ≈100; counters concentric with the bowls.
def zigzag(x_right, x_left, y_base, depth, teeth):
    step = (x_right - x_left) / (2 * teeth)
    return ''.join(f'L{x_right - i * step:.1f},{y_base + (depth if i % 2 else 0):.1f}' for i in range(1, 2 * teeth + 1))


TOP_BOWL = 'M352,232H540A126,126 0 0 1 540,484H352Z'
BOTTOM_BOWL = 'M352,416H556A150,150 0 0 1 706,566V760' + zigzag(706, 352, 760, 34, 5) + 'Z'  # receipt tear
COUNTER_TOP = 'M452,332H524A44,44 0 0 1 524,420H452Z'
COUNTER_BOTTOM = 'M452,516H556A50,50 0 0 1 606,566V660H452Z'
MARK_CENTER = (529, 511)  # centre of the mark's box (x 352-706, y 232-794)


def squircle_path(n=5.0, steps=360):
    a = GRID / 2
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append((a + a * abs(c) ** (2 / n) * math.copysign(1, c), a + a * abs(s) ** (2 / n) * math.copysign(1, s)))
    return 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + 'Z'


def svg(scale=1.14, full_bleed=False):
    tile = f'<rect width="{GRID}" height="{GRID}" fill="{TILE}"/>' if full_bleed else f'<path d="{squircle_path()}" fill="{TILE}"/>'
    tx, ty = GRID / 2 - MARK_CENTER[0] * scale, GRID / 2 - MARK_CENTER[1] * scale
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {GRID} {GRID}" role="img" aria-label="Expense Buddy">\n'
            f'{tile}\n<g transform="translate({tx:.1f},{ty:.1f}) scale({scale})">'
            f'<path fill="{MARK}" d="{TOP_BOWL}{BOTTOM_BOWL}"/>'
            f'<path fill="{TILE}" d="{COUNTER_TOP}{COUNTER_BOTTOM}"/></g>\n</svg>\n')


def png(svg_text, px):
    return Image.open(io.BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=svg_text, width=px, height=px))))


def main():
    brand = ROOT / 'public/brands/demo'
    icons = ROOT / 'public/icons/demo'
    brand.mkdir(parents=True, exist_ok=True)
    icons.mkdir(parents=True, exist_ok=True)
    logo = svg()
    (brand / 'icon.svg').write_text(logo)
    out = [
        (brand / 'icon.png', logo, 1024, 'RGBA'),
        (icons / 'icon-192.png', logo, 192, 'RGBA'),
        (icons / 'icon-512.png', logo, 512, 'RGBA'),
        (icons / 'icon-512-maskable.png', svg(0.98, full_bleed=True), 512, 'RGB'),  # 80 % safe zone
        (icons / 'apple-touch-180.png', svg(1.08, full_bleed=True), 180, 'RGB'),
    ]
    for path, text, px, mode in out:
        png(text, px).convert(mode).save(path, optimize=True)
        print('wrote', path.relative_to(ROOT))
    print('wrote', (brand / 'icon.svg').relative_to(ROOT))


if __name__ == '__main__':
    main()
