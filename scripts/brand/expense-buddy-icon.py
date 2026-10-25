#!/usr/bin/env python3
"""Expense Buddy app icon: "ExB" monogram on a Growth Buddies Light tile.

Usage: python3 scripts/brand/expense-buddy-icon.py

"Ex" in ink (#0B0B0F) and the B ("Buddy") in brand turquoise (#0097B2), on a light white → teal-50 → teal-100 tile. One list of primitives
renders both the SVG and the PNGs, so every asset matches:
  public/brands/demo/icon.svg             squircle, transparent corners (UI logo)
  public/brands/demo/icon.png             1024 px, same
  public/icons/demo/icon-192.png          Android "any" (squircle)
  public/icons/demo/icon-512.png          Android "any" (squircle)
  public/icons/demo/icon-512-maskable.png full bleed; glyph inside the 80 % safe zone
  public/icons/demo/apple-touch-180.png   full bleed, opaque (iOS applies its own mask)
Colours: design/growth-buddies-light/tokens.json.
"""
import math
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[2]
GRID = 1024
INK = '#0B0B0F'     # ink-950
TEAL = '#0097B2'    # teal-600 (brand)
X_COLOR, B_COLOR = INK, TEAL  # "Ex" dark, B turquoise
LINE = '#DCDCE3'    # ink-200, hairline around the squircle
BG_STOPS = [(0.0, '#FFFFFF'), (0.55, '#E8F7FA'), (1.0, '#CCEEF4')]  # white → teal-50 → teal-100

# ── Glyph in its own units (cap height 440, stroke 88) ─────────────────────
H, T = 440, 88
MID0, MID1 = 176, 264
R_OUT, R_IN = (MID1 - 0) // 2, (MID1 - 0) // 2 - T   # 132, 44


def glyph():
    """Primitives: ('rect', color, x0, y0, x1, y1) | ('poly', color, pts)
    | ('half', color, cx, y0, y1, r) right half-disc | ('hole', ...) cut."""
    p = []
    # E
    p += [('rect', INK, 0, 0, T, H), ('rect', INK, 0, 0, 224, T),
          ('rect', INK, 0, MID0, 196, MID1), ('rect', INK, 0, H - T, 224, H)]
    # x (lowercase, x-height 290), two slimmer diagonals so it reads as a connector
    x0, x1, top, w = 256, 488, 150, 78
    p += [('poly', X_COLOR, [(x0, top), (x0 + w, top), (x1, H), (x1 - w, H)]),
          ('poly', X_COLOR, [(x1 - w, top), (x1, top), (x0 + w, H), (x0, H)])]
    # B
    bx = 520
    p.append(('rect', B_COLOR, bx, 0, bx + T, H))
    for y0, y1, xr in [(0, MID1, bx + 236), (MID0, H, bx + 256)]:
        cx = xr - R_OUT
        p += [('rect', B_COLOR, bx, y0, cx, y1), ('half', B_COLOR, cx, y0, y1, R_OUT)]
    for y0, y1, xr in [(0, MID1, bx + 236), (MID0, H, bx + 256)]:
        cx = xr - R_OUT
        p += [('hole', None, bx + T, y0 + T, cx, y1 - T), ('half-hole', None, cx, y0 + T, y1 - T, R_IN)]
    return p, bx + 256  # glyph width 776


PRIMS, GW = glyph()
BX = 520
BOWLS = [(0, MID1, BX + 236), (MID0, H, BX + 256)]  # (top, bottom, outer right) in glyph units


def is_bowl_part(prim):
    """Bowl rects/half-discs/holes: the SVG draws bowls as evenodd paths instead."""
    kind = prim[0]
    if kind in ('half', 'hole', 'half-hole'):
        return True
    return kind == 'rect' and prim[2] == BX and prim[4] != BX + T


def place(scale):
    """Transform glyph units → grid units, centred."""
    ox = (GRID - GW * scale) / 2
    oy = (GRID - H * scale) / 2
    return lambda x, y: (ox + x * scale, oy + y * scale)


def superellipse(size, n=5.0, steps=720):
    a = size / 2
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append((a + a * abs(c) ** (2 / n) * math.copysign(1, c), a + a * abs(s) ** (2 / n) * math.copysign(1, s)))
    return pts


# ── SVG ─────────────────────────────────────────────────────────────────────
def svg(scale=0.9):
    tf = place(scale)
    sq = 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in superellipse(GRID)) + 'Z'
    by_color = {INK: [], TEAL: []}
    for prim in PRIMS:
        if is_bowl_part(prim):
            continue
        if prim[0] == 'rect':
            _, col, a, b, c, d = prim
            (x0, y0), (x1, y1) = tf(a, b), tf(c, d)
            by_color[col].append(f'<path d="M{x0:.1f},{y0:.1f}H{x1:.1f}V{y1:.1f}H{x0:.1f}Z"/>')
        elif prim[0] == 'poly':
            _, col, pts = prim
            by_color[col].append('<path d="M' + 'L'.join('%.1f,%.1f' % tf(*q) for q in pts) + 'Z"/>')
    # Bowls: outer D shape + inner D hole in one evenodd path (no masks; holes never overlap other shapes).
    for y0, y1, xr in BOWLS:
        cx = xr - R_OUT
        (bx, ya), (xc, yb) = tf(BX, y0), tf(cx, y1)
        (bi, ia), (_, ib) = tf(BX + T, y0 + T), tf(cx, y1 - T)
        ro, ri = R_OUT * scale, R_IN * scale
        d = (f'M{bx:.1f},{ya:.1f}H{xc:.1f}A{ro:.1f},{ro:.1f} 0 0 1 {xc:.1f},{yb:.1f}H{bx:.1f}Z'
             f'M{bi:.1f},{ia:.1f}H{xc:.1f}A{ri:.1f},{ri:.1f} 0 0 1 {xc:.1f},{ib:.1f}H{bi:.1f}Z')
        by_color[B_COLOR].append(f'<path fill-rule="evenodd" d="{d}"/>')
    stops = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in BG_STOPS)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {GRID} {GRID}" role="img" aria-label="Expense Buddy">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">{stops}</linearGradient></defs>
<path d="{sq}" fill="url(#bg)" stroke="{LINE}" stroke-width="6"/>
<g fill="{INK}">{''.join(by_color[INK])}</g>
<g fill="{TEAL}">{''.join(by_color[TEAL])}</g>
</svg>
'''


# ── PNG ─────────────────────────────────────────────────────────────────────
def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def background(size):
    small = Image.new('RGB', (256, 256))
    px = small.load()
    stops = [(o, hex_rgb(c)) for o, c in BG_STOPS]
    for y in range(256):
        for x in range(256):
            t = (x + y) / 510
            for (o0, c0), (o1, c1) in zip(stops, stops[1:]):
                if o0 <= t <= o1:
                    k = (t - o0) / (o1 - o0)
                    px[x, y] = tuple(round(c0[i] + (c1[i] - c0[i]) * k) for i in range(3))
                    break
    return small.resize((size, size), Image.BICUBIC).convert('RGBA')


def glyph_layer(size, scale, color):
    k = size / GRID
    tf = place(scale)
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)

    def box(a, b, c, e):
        (x0, y0), (x1, y1) = tf(a, b), tf(c, e)
        return [x0 * k, y0 * k, x1 * k - 1, y1 * k - 1]

    for prim in PRIMS:
        kind, col = prim[0], prim[1]
        if kind == 'rect' and col == color:
            d.rectangle(box(*prim[2:]), fill=255)
        elif kind == 'poly' and col == color:
            d.polygon([tuple(v * k for v in tf(*q)) for q in prim[2]], fill=255)
        elif kind == 'half' and col == color:
            _, _, cx, y0, y1, r = prim
            d.pieslice(box(cx - r, y0, cx + r, y1), -90, 90, fill=255)
    if color == B_COLOR:  # holes only cut the B
        for prim in PRIMS:
            if prim[0] == 'hole':
                d.rectangle(box(*prim[2:]), fill=0)
            elif prim[0] == 'half-hole':
                _, _, cx, y0, y1, r = prim
                d.pieslice(box(cx - r, y0, cx + r, y1), -90, 90, fill=0)
    layer = Image.new('RGBA', (size, size), hex_rgb(color) + (0,))
    layer.putalpha(m)
    return layer


def render(full_bleed, scale):
    size = 2048
    img = background(size)
    for col in (INK, TEAL):
        img.alpha_composite(glyph_layer(size, scale, col))
    if not full_bleed:
        k = size / GRID
        pts = [(x * k, y * k) for x, y in superellipse(GRID)]
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).polygon(pts, fill=255)
        ImageDraw.Draw(img).line(pts + [pts[0]], fill=hex_rgb(LINE) + (255,), width=round(6 * k))
        img.putalpha(mask)
    return img


def main():
    brand = ROOT / 'public/brands/demo'
    icons = ROOT / 'public/icons/demo'
    brand.mkdir(parents=True, exist_ok=True)
    icons.mkdir(parents=True, exist_ok=True)
    (brand / 'icon.svg').write_text(svg())
    squircle = render(False, 0.9)
    bleed = render(True, 0.76)  # maskable safe zone: 80 % circle
    out = [
        (brand / 'icon.png', squircle, 1024, 'RGBA'),
        (icons / 'icon-192.png', squircle, 192, 'RGBA'),
        (icons / 'icon-512.png', squircle, 512, 'RGBA'),
        (icons / 'icon-512-maskable.png', bleed, 512, 'RGB'),
        (icons / 'apple-touch-180.png', render(True, 0.82), 180, 'RGB'),
    ]
    for path, img, px, mode in out:
        img.resize((px, px), Image.LANCZOS).convert(mode).save(path, optimize=True)
        print('wrote', path.relative_to(ROOT))
    print('wrote', (brand / 'icon.svg').relative_to(ROOT))


if __name__ == '__main__':
    main()
