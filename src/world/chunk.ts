import { CHUNK, HEIGHT } from '../config';
import { BLOCKS } from './blocks';

export const VOL = CHUNK * CHUNK * HEIGHT;
/** Local index inside a chunk: x fastest, then z, then y. */
export const idx = (x: number, y: number, z: number) => (y * CHUNK + z) * CHUNK + x;

/** A 16x16 column of the world, full height. */
export class Chunk {
  /** Packed light per cell: sky << 4 | block. Filled by the mesher. */
  light = new Uint8Array(VOL);
  /** Per column: one above the highest opaque block (sky reaches down to here). */
  readonly top = new Uint8Array(CHUNK * CHUNK);
  modified = false;
  /** Needs a new mesh (geometry or lighting changed). */
  dirty = true;
  lit = false;
  /** Light emitters (block coords) for ambient particles. */
  emitters: number[] = [];

  constructor(readonly cx: number, readonly cz: number, readonly blocks: Uint8Array) {
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) this.recalcTop(x, z);
  }

  recalcTop(x: number, z: number) {
    let y = HEIGHT - 1;
    while (y >= 0 && !BLOCKS[this.blocks[idx(x, y, z)]].opaque) y--;
    this.top[z * CHUNK + x] = y + 1;
  }

  serialize(): string {
    const a = this.blocks;
    const parts: string[] = [];
    for (let i = 0; i < a.length; ) {
      const v = a[i];
      let n = 1;
      while (i + n < a.length && a[i + n] === v) n++;
      parts.push(n === 1 ? v.toString(36) : `${v.toString(36)}*${n.toString(36)}`);
      i += n;
    }
    return parts.join(',');
  }

  static deserialize(cx: number, cz: number, s: string): Chunk {
    const out = new Uint8Array(VOL);
    let i = 0;
    for (const part of s.split(',')) {
      const [v, n] = part.split('*');
      const count = n ? parseInt(n, 36) : 1;
      out.fill(parseInt(v, 36), i, i + count);
      i += count;
    }
    return new Chunk(cx, cz, out);
  }
}
