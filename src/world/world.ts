import { CHUNK, HEIGHT, KEEP_RADIUS } from '../config';
import { B, BLOCKS } from './blocks';
import { Chunk, idx } from './chunk';
import { Generator } from './generator';

const key = (cx: number, cz: number) => ((cx & 0xffff) << 16) | (cz & 0xffff);

/** Infinite voxel world made of 16x16xHEIGHT chunks. */
export class World {
  readonly gen: Generator;
  readonly chunks = new Map<number, Chunk>();
  private stored = new Map<number, string>();
  private last: Chunk | null = null;
  /** Called after a block changes (for remeshing). */
  onChange?: (x: number, y: number, z: number) => void;

  constructor(readonly seed: number, saved?: Record<string, string>) {
    this.gen = new Generator(seed);
    if (saved)
      for (const [k, v] of Object.entries(saved)) {
        const [cx, cz] = k.split(',').map(Number);
        this.stored.set(key(cx, cz), v);
      }
  }

  peek(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(key(cx, cz));
  }

  chunk(cx: number, cz: number): Chunk {
    const l = this.last;
    if (l && l.cx === cx && l.cz === cz) return l;
    const k = key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      const s = this.stored.get(k);
      if (s) {
        c = Chunk.deserialize(cx, cz, s);
        c.modified = true;
        this.stored.delete(k);
      } else c = new Chunk(cx, cz, this.gen.generate(cx, cz));
      this.chunks.set(k, c);
    }
    this.last = c;
    return c;
  }

  get(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    const cx = x >> 4;
    const cz = z >> 4;
    return this.chunk(cx, cz).blocks[idx(x - (cx << 4), y, z - (cz << 4))];
  }

  solid(x: number, y: number, z: number): boolean {
    return BLOCKS[this.get(x, y, z)].solid;
  }

  /** Height of the walkable surface at a column (one above the top opaque block). */
  top(x: number, z: number): number {
    const cx = x >> 4;
    const cz = z >> 4;
    return this.chunk(cx, cz).top[(z - (cz << 4)) * CHUNK + (x - (cx << 4))];
  }

  /** Packed light (sky << 4 | block) at a cell; sky-only estimate if not yet lit. */
  light(x: number, y: number, z: number): number {
    if (y >= HEIGHT) return 0xf0;
    if (y < 0) return 0;
    const c = this.chunk(x >> 4, z >> 4);
    if (!c.lit) return y >= this.top(x, z) ? 0xf0 : 0;
    return c.light[idx(x & 15, y, z & 15)];
  }

  set(x: number, y: number, z: number, id: number) {
    if (y < 0 || y >= HEIGHT) return;
    const cx = x >> 4;
    const cz = z >> 4;
    const c = this.chunk(cx, cz);
    const lx = x - (cx << 4);
    const lz = z - (cz << 4);
    const i = idx(lx, y, lz);
    if (c.blocks[i] === id) return;
    c.blocks[i] = id;
    c.modified = true;
    c.recalcTop(lx, lz);
    // Light can travel ~14 blocks, so nearby chunks need relighting too.
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = this.peek(cx + dx, cz + dz);
        if (n) n.dirty = true;
      }
    this.onChange?.(x, y, z);
  }

  unloadFar(pcx: number, pcz: number, onUnload: (c: Chunk) => void) {
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) <= KEEP_RADIUS && Math.abs(c.cz - pcz) <= KEEP_RADIUS) continue;
      if (c.modified) this.stored.set(k, c.serialize());
      onUnload(c);
      this.chunks.delete(k);
      if (this.last === c) this.last = null;
    }
  }

  serialize(): Record<string, string> {
    const out: Record<string, string> = {};
    const name = (k: number) => `${(k >> 16) << 16 >> 16},${(k << 16) >> 16}`;
    for (const [k, s] of this.stored) out[name(k)] = s;
    for (const [k, c] of this.chunks) if (c.modified) out[name(k)] = c.serialize();
    return out;
  }
}
