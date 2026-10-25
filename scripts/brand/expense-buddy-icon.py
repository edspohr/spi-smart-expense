#!/usr/bin/env python3
"""Expense Buddy app icon: "ExB" in Instrument Serif on an ink tile.

Usage (needs Pillow + fontTools):
    python3 -m pip install pillow fonttools
    python3 scripts/brand/expense-buddy-icon.py

Design (ADR 0013): solid ink tile (#0B0B0F, the Growth Buddies web
background), "E" in Instrument Serif and "x" in its italic in off-white, and
the "B" of Buddy in italic turquoise (#00B5D6, teal-400: the accent the
Growth Buddies web uses on dark). The glyph outlines are read from the font
files in scripts/brand/fonts (SIL OFL), so the SVG is pure paths and the PNGs
come from the very same outlines and spacing:
  public/brands/demo/icon.svg             squircle, transparent corners (UI logo)
  public/brands/demo/icon.png             1024 px, same
  public/icons/demo/icon-192.png          Android "any" (squircle)
  public/icons/demo/icon-512.png          Android "any" (squircle)
  public/icons/demo/icon-512-maskable.png full bleed; monogram inside the 80 % safe zone
  public/icons/demo/apple-touch-180.png   full bleed, opaque (iOS applies its own mask)
"""
import math
import pathlib

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONTS = pathlib.Path(__file__).resolve().parent / 'fonts'
GRID = 1024
INK = '#0B0B0F'     # ink-950: tile
PAPER = '#F6F6F8'   # ink-50: "Ex"
ACCENT = '#00B5D6'  # teal-400: "B" (accent on dark)

REGULAR = TTFont(FONTS / 'InstrumentSerif-Regular.ttf')
ITALIC = TTFont(FONTS / 'InstrumentSerif-Italic.ttf')
# (character, font, colour, kerning after it in em). Spacing tuned by eye:
# the italic x tucks under the E's arm and into the B.
LETTERS = [('E', REGULAR, PAPER, -0.02), ('x', ITALIC, PAPER, -0.07), ('B', ITALIC, ACCENT, 0.0)]


def glyph(font, ch):
    gs = font.getGlyphSet()
    name = font.getBestCmap()[ord(ch)]
    bp = BoundsPen(gs)
    gs[name].draw(bp)
    return gs, name, bp.bounds  # (xMin, yMin, xMax, yMax) in font units, y up


def layout():
    """Glyph origins in font units (em = 1000) with ink-box spacing + kerning."""
    x, items = 0.0, []
    for ch, font, col, kern in LETTERS:
        gs, name, (x0, y0, x1, y1) = glyph(font, ch)
        items.append((gs, name, col, x - x0))
        x += (x1 - x0) + kern * font['head'].unitsPerEm
    width = x - LETTERS[-1][3] * 1000
    ys = [glyph(f, c)[2] for c, f, _, _ in LETTERS]
    return items, width, min(b[1] for b in ys), max(b[3] for b in ys)


ITEMS, INK_W, Y_MIN, Y_MAX = layout()


def transform(width_ratio):
    """Font units → grid units (y down), monogram centred on its ink box."""
    s = GRID * width_ratio / INK_W
    ox = (GRID - INK_W * s) / 2
    oy = GRID / 2 + (Y_MAX + Y_MIN) / 2 * s
    return s, ox, oy


def superellipse(size, n=5.0, steps=720):
    a = size / 2
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append((a + a * abs(c) ** (2 / n) * math.copysign(1, c), a + a * abs(s) ** (2 / n) * math.copysign(1, s)))
    return pts


# ── SVG ─────────────────────────────────────────────────────────────────────
def svg(width_ratio=0.54):
    s, ox, oy = transform(width_ratio)
    sq = 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in superellipse(GRID)) + 'Z'
    paths = []
    for gs, name, col, gx in ITEMS:
        pen = SVGPathPen(gs, ntos=lambda v: f'{v:.1f}')
        gs[name].draw(TransformPen(pen, (s, 0, 0, -s, ox + gx * s, oy)))
        paths.append(f'<path fill="{col}" d="{pen.getCommands()}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {GRID} {GRID}" role="img" aria-label="Expense Buddy">\n'
            f'<path d="{sq}" fill="{INK}"/>\n' + '\n'.join(paths) + '\n</svg>\n')


# ── PNG ─────────────────────────────────────────────────────────────────────
class FlattenPen(BasePen):
    """Collects contours as polylines (curves sampled) for Pillow."""

    def __init__(self, gs, steps=24):
        super().__init__(gs)
        self.contours, self.cur, self.steps = [], [], steps

    def _moveTo(self, p):
        self.cur = [p]

    def _lineTo(self, p):
        self.cur.append(p)

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        for i in range(1, self.steps + 1):
            t = i / self.steps
            mt = 1 - t
            self.cur.append(tuple(mt ** 3 * a + 3 * mt * mt * t * b + 3 * mt * t * t * c + t ** 3 * d
                                  for a, b, c, d in zip(p0, p1, p2, p3)))

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        for i in range(1, self.steps + 1):
            t = i / self.steps
            mt = 1 - t
            self.cur.append(tuple(mt * mt * a + 2 * mt * t * b + t * t * c for a, b, c in zip(p0, p1, p2)))

    def _closePath(self):
        if len(self.cur) > 2:
            self.contours.append(self.cur)
        self.cur = []

    _endPath = _closePath


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def render(full_bleed, width_ratio, size=2048):
    s, ox, oy = transform(width_ratio)
    k = size / GRID
    img = Image.new('RGBA', (size, size), hex_rgb(INK) + (255,))
    for gs, name, col, gx in ITEMS:
        pen = FlattenPen(gs)
        gs[name].draw(pen)
        mask = Image.new('1', (size, size), 0)
        for contour in pen.contours:  # even-odd: XOR each contour (outer shapes and counters)
            m = Image.new('1', (size, size), 0)
            ImageDraw.Draw(m).polygon([((ox + (gx + x) * s) * k, (oy - y * s) * k) for x, y in contour], fill=1)
            mask = ImageChops.logical_xor(mask, m)
        img.paste(Image.new('RGBA', (size, size), hex_rgb(col) + (255,)), (0, 0), mask.convert('L'))
    if not full_bleed:
        sq = Image.new('L', (size, size), 0)
        ImageDraw.Draw(sq).polygon([(x * k, y * k) for x, y in superellipse(GRID)], fill=255)
        img.putalpha(sq)
    return img


def main():
    brand = ROOT / 'public/brands/demo'
    icons = ROOT / 'public/icons/demo'
    brand.mkdir(parents=True, exist_ok=True)
    icons.mkdir(parents=True, exist_ok=True)
    (brand / 'icon.svg').write_text(svg())
    squircle = render(False, 0.54)
    out = [
        (brand / 'icon.png', squircle, 1024, 'RGBA'),
        (icons / 'icon-192.png', squircle, 192, 'RGBA'),
        (icons / 'icon-512.png', squircle, 512, 'RGBA'),
        (icons / 'icon-512-maskable.png', render(True, 0.46), 512, 'RGB'),  # 80 % safe zone
        (icons / 'apple-touch-180.png', render(True, 0.52), 180, 'RGB'),
    ]
    for path, img, px, mode in out:
        img.resize((px, px), Image.LANCZOS).convert(mode).save(path, optimize=True)
        print('wrote', path.relative_to(ROOT))
    print('wrote', (brand / 'icon.svg').relative_to(ROOT))


if __name__ == '__main__':
    main()
