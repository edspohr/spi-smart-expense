import { parseTaxBarcode } from './barcodeParsers';
import type { BarcodeData } from './types';

// Phone photos are rarely square to the receipt and zxing's PDF417 reader
// gives up past ~1° of tilt, so the scan retries a few small rotations.
// Pure (pixels in, pixels out) so the browser and the corpus test share it.

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Degrees tried in order; 0 first so a straight photo costs one pass. */
export const SCAN_ROTATIONS = [0, -2, 2, -4, 4, -7, 7];

/** Rotates RGBA pixels around the centre (nearest neighbour, white fill, same size). */
export function rotatePixels(src: Pixels, degrees: number): Pixels {
  if (!degrees) return src;
  const { width: w, height: h, data } = src;
  const out = new Uint8ClampedArray(w * h * 4).fill(255);
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const sx = Math.round(cos * dx + sin * dy + cx);
      const sy = Math.round(-sin * dx + cos * dy + cy);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const si = (sy * w + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = data[si]!;
      out[di + 1] = data[si + 1]!;
      out[di + 2] = data[si + 2]!;
      out[di + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/** Runs `read` (zxing) over each rotation until a tax barcode parses. */
export async function scanTaxBarcode(pixels: Pixels, read: (img: Pixels) => Promise<string[]>): Promise<BarcodeData | null> {
  for (const deg of SCAN_ROTATIONS) {
    for (const text of await read(rotatePixels(pixels, deg))) {
      const parsed = parseTaxBarcode(text);
      if (parsed) return parsed;
    }
  }
  return null;
}
