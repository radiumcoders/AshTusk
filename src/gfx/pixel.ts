/** Canvas + colour helpers shared by the procedural art generators. */

export type RGB = [number, number, number];

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgba = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const scale = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];

/** Pixel buffer painter used to build textures one pixel at a time. */
export class Pix {
  readonly data: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: RGB, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }
  get(x: number, y: number): RGB {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }
  alpha(x: number, y: number): number {
    return this.data[(y * this.w + x) * 4 + 3];
  }
  clear(x: number, y: number) {
    this.data[(y * this.w + x) * 4 + 3] = 0;
  }
  toCanvas(): HTMLCanvasElement {
    const [c, ctx] = makeCanvas(this.w, this.h);
    ctx.putImageData(new ImageData(this.data as Uint8ClampedArray<ArrayBuffer>, this.w, this.h), 0, 0);
    return c;
  }
}

/** Build a sprite from a character map. '.' and ' ' are transparent. */
export function fromMap(rows: string[], palette: Record<string, string>): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const p = new Pix(w, h);
  const cache: Record<string, RGB> = {};
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (!col) continue;
      p.set(x, y, (cache[col] ??= hex(col)));
    }
  }
  return p.toCanvas();
}

/** Horizontally mirrored copy of a canvas. */
export function flipped(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

/** Soft radial glow sprite, cached by colour+radius. */
const glowCache = new Map<string, HTMLCanvasElement>();
export function glowSprite(color: RGB, radius: number): HTMLCanvasElement {
  const key = `${color.join(',')}:${radius}`;
  let g = glowCache.get(key);
  if (g) return g;
  const size = radius * 2;
  const [c, ctx] = makeCanvas(size, size);
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, rgba(color, 0.55));
  grad.addColorStop(0.35, rgba(color, 0.22));
  grad.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  glowCache.set(key, c);
  return c;
}
