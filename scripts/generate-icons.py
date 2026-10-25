#!/usr/bin/env python3
"""Generate PWA icons for a tenant from its logo.

Usage: python3 scripts/generate-icons.py <tenant-id> [--bg #ffffff]

Reads tenants/<id>.json for branding.logo (a path under public/), writes
public/icons/<id>/{icon-192,icon-512,icon-512-maskable,apple-touch-180}.png.
Run once per tenant when the logo changes; outputs are committed.
"""
import argparse
import json
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    v = value.lstrip('#')
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def fit_on_square(logo: Image.Image, size: int, content_ratio: float, bg: tuple[int, int, int]) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), bg + (255,))
    box = int(size * content_ratio)
    scaled = logo.copy()
    scaled.thumbnail((box, box), Image.LANCZOS)
    offset = ((size - scaled.width) // 2, (size - scaled.height) // 2)
    canvas.alpha_composite(scaled, offset)
    return canvas.convert('RGB')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('tenant')
    parser.add_argument('--bg', default='#ffffff', help='background colour behind the logo')
    args = parser.parse_args()

    cfg = json.loads((ROOT / 'tenants' / f'{args.tenant}.json').read_text())
    logo_path = ROOT / 'public' / cfg['branding']['logo'].lstrip('/')
    out_dir = ROOT / 'public' / 'icons' / args.tenant
    out_dir.mkdir(parents=True, exist_ok=True)

    logo = Image.open(logo_path).convert('RGBA')
    bg = hex_to_rgb(args.bg)

    # "any" icons: logo fills ~84% of the square. Maskable: Android crops a
    # circle/squircle, so keep the logo inside the central 66%.
    targets = [
        ('icon-192.png', 192, 0.84),
        ('icon-512.png', 512, 0.84),
        ('icon-512-maskable.png', 512, 0.66),
        ('apple-touch-180.png', 180, 0.84),
    ]
    for name, size, ratio in targets:
        fit_on_square(logo, size, ratio, bg).save(out_dir / name, optimize=True)
        print(f'wrote {out_dir.relative_to(ROOT) / name}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
