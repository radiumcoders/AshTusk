/**
 * Procedural 16x16 block textures, packed into one atlas for the voxel
 * mesher. Every pixel is generated in code from a seeded RNG.
 */
import { mulberry32 } from '../engine/rng';
import { hex, makeCanvas, Pix, type RGB, scale } from './pixel';

type R = () => number;
type Painter = (p: Pix, r: R) => void;

const S = 16;
const jitter = (c: RGB, r: R, amt = 0.08): RGB => scale(c, 1 - amt + r() * amt * 2);

function fill(p: Pix, c: RGB, r: R, amt = 0.08) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, jitter(c, r, amt));
}
function specks(p: Pix, r: R, c: RGB, n: number, size = 1) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * S);
    const y = Math.floor(r() * S);
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) p.set(x + dx, y + dy, jitter(c, r, 0.05));
  }
}
function blobs(p: Pix, r: R, c: RGB, hi: RGB, n: number, rad = 2) {
  for (let i = 0; i < n; i++) {
    const cx = 2 + r() * 12;
    const cy = 2 + r() * 12;
    const rr = rad * (0.7 + r() * 0.6);
    for (let y = Math.floor(cy - rr); y <= cy + rr; y++)
      for (let x = Math.floor(cx - rr); x <= cx + rr; x++) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d <= rr * rr) p.set(x, y, jitter(d < rr * 0.5 && x < cx ? hi : c, r, 0.06));
      }
  }
}
function cracks(p: Pix, r: R, c: RGB, n: number) {
  for (let i = 0; i < n; i++) {
    let x = Math.floor(r() * S);
    let y = Math.floor(r() * S);
    const len = 3 + Math.floor(r() * 5);
    for (let k = 0; k < len; k++) {
      p.set(x, y, c);
      if (r() < 0.5) x += r() < 0.5 ? -1 : 1;
      else y += 1;
    }
  }
}
function border(p: Pix, c: RGB) {
  for (let i = 0; i < S; i++) {
    p.set(i, 0, c);
    p.set(i, 15, c);
    p.set(0, i, c);
    p.set(15, i, c);
  }
}
function bricks(p: Pix, r: R, brick: RGB, mortar: RGB) {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const off = Math.floor(y / 4) % 2 ? 4 : 0;
      const m = y % 4 === 3 || (x + off) % 8 === 7;
      p.set(x, y, m ? jitter(mortar, r, 0.04) : jitter(scale(brick, y % 4 === 0 ? 1.1 : 1), r, 0.05));
    }
}
function bark(p: Pix, r: R, base: RGB, dark: RGB) {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const groove = (x + Math.floor(y / 5) * 2) % 4 === 0 && r() < 0.85;
      p.set(x, y, groove ? jitter(dark, r, 0.05) : jitter(base, r, 0.06));
    }
}
function rings(p: Pix, r: R, wood: RGB, ring: RGB, barkC: RGB) {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      p.set(x, y, jitter(d > 6.5 ? barkC : Math.floor(d) % 2 ? ring : wood, r, 0.05));
    }
}
function foliage(p: Pix, r: R, base: RGB, dark: RGB, light: RGB, holes = 0.1) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, jitter(dark, r, 0.05));
  for (let i = 0; i < 11; i++) {
    const cx = r() * S;
    const cy = r() * S;
    const rad = 2 + r() * 1.8;
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > rad * rad) continue;
        p.set((x + S) % S, (y + S) % S, jitter(dx + dy < -rad * 0.6 ? light : base, r, 0.04));
      }
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (r() < holes) p.clear(x, y);
}
function topLayer(p: Pix, r: R, top: RGB, edge: RGB, min = 3) {
  for (let x = 0; x < S; x++) {
    const depth = min + (r() < 0.5 ? 1 : 0) + (r() < 0.25 ? 1 : 0);
    for (let y = 0; y < depth; y++) p.set(x, y, jitter(y === 0 ? scale(top, 1.12) : y === depth - 1 ? edge : top, r, 0.06));
  }
}
function plant(p: Pix, r: R, petal: RGB | null, center: RGB | null) {
  const greens = [hex('#4f9a37'), hex('#6cbf45'), hex('#3b7a2a')];
  if (!petal || !center) {
    for (let i = 0; i < 7; i++) {
      const x = 2 + Math.floor(r() * 12);
      const h = 5 + Math.floor(r() * 8);
      const lean = r() < 0.5 ? -1 : 1;
      for (let k = 0; k < h; k++) p.set(x + (k > h * 0.6 ? lean : 0), 15 - k, greens[i % 3]);
    }
    return;
  }
  for (let y = 7; y < 16; y++) p.set(7, y, greens[0]);
  for (const [x, y] of [[6, 11], [5, 10], [8, 12], [9, 11]]) p.set(x, y, greens[1]);
  for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) p.set(7 + dx, 5 + dy, jitter(petal, r, 0.08));
  p.set(7, 5, center);
}

function orbTex(p: Pix, c: RGB, core: RGB) {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - 6, y - 6);
      p.set(x, y, d < 3 ? core : d < 9 ? c : scale(c, 0.75));
    }
}

const T: Record<string, Painter> = {};
const ore = (base: string, hi: string): Painter => (p, r) => {
  T.stone(p, r);
  blobs(p, r, hex(base), hex(hi), 4, 1.8);
};

Object.assign(T, {
  dirt: (p: Pix, r: R) => {
    fill(p, hex('#7a4f2d'), r);
    specks(p, r, hex('#5a3a20'), 10);
    specks(p, r, hex('#9a6b44'), 4, 2);
  },
  grass_top: (p: Pix, r: R) => {
    fill(p, hex('#56a23a'), r, 0.06);
    specks(p, r, hex('#6fc04a'), 14);
    specks(p, r, hex('#3f8030'), 12);
  },
  grass_side: (p: Pix, r: R) => {
    T.dirt(p, r);
    topLayer(p, r, hex('#56a23a'), hex('#3b7a2a'), 3);
  },
  stone: (p: Pix, r: R) => {
    fill(p, hex('#808289'), r, 0.06);
    specks(p, r, hex('#9da0a7'), 8, 2);
    cracks(p, r, hex('#5f6168'), 3);
  },
  sand: (p: Pix, r: R) => {
    fill(p, hex('#dfc07c'), r, 0.05);
    specks(p, r, hex('#c9a566'), 12);
    specks(p, r, hex('#f2dca0'), 8);
  },
  sandstone: (p: Pix, r: R) => {
    const bands = ['#d2a46a', '#c4945a', '#b98a50', '#d8ae74'].map(hex);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, jitter(bands[Math.floor(y / 4) % 4], r, 0.04));
    for (let x = 0; x < S; x++) if (r() < 0.7) p.set(x, 11, hex('#a57a45'));
  },
  sandstone_top: (p: Pix, r: R) => {
    fill(p, hex('#d8ae74'), r, 0.05);
    specks(p, r, hex('#c4945a'), 10);
  },
  snow: (p: Pix, r: R) => {
    fill(p, hex('#eef3fb'), r, 0.03);
    specks(p, r, hex('#cfdcef'), 10);
  },
  snow_side: (p: Pix, r: R) => {
    T.dirt(p, r);
    topLayer(p, r, hex('#eef3fb'), hex('#cfdcef'), 9);
  },
  ice: (p: Pix, r: R) => {
    fill(p, hex('#93cdea'), r, 0.04);
    for (let i = -16; i < 16; i += 7) for (let k = 0; k < 16; k++) if (r() < 0.75) p.set(k + i, k, hex('#d4f0ff'));
    specks(p, r, hex('#6fb0d6'), 5);
  },
  log_side: (p: Pix, r: R) => bark(p, r, hex('#7a5531'), hex('#573a20')),
  log_top: (p: Pix, r: R) => rings(p, r, hex('#c8915a'), hex('#a8743f'), hex('#573a20')),
  pine_side: (p: Pix, r: R) => bark(p, r, hex('#5a3d24'), hex('#3e2914')),
  pine_top: (p: Pix, r: R) => rings(p, r, hex('#b8844a'), hex('#9a6a38'), hex('#3e2914')),
  dead_side: (p: Pix, r: R) => bark(p, r, hex('#6a6058'), hex('#48413b')),
  dead_top: (p: Pix, r: R) => rings(p, r, hex('#8a8078'), hex('#6a6058'), hex('#48413b')),
  leaves: (p: Pix, r: R) => foliage(p, r, hex('#3e8a34'), hex('#2b6626'), hex('#5cad45')),
  pine_leaves: (p: Pix, r: R) => {
    foliage(p, r, hex('#2e6b47'), hex('#1f4d33'), hex('#3f8a5c'), 0.08);
    specks(p, r, hex('#e8f0ff'), 7);
  },
  planks: (p: Pix, r: R) => {
    const a = hex('#b07a42');
    const b = hex('#a26f3a');
    const seam = hex('#6a4524');
    for (let y = 0; y < S; y++) {
      const board = Math.floor(y / 4);
      const vs = (board * 7 + 3) % 16;
      for (let x = 0; x < S; x++) p.set(x, y, jitter(y % 4 === 3 || x === vs ? seam : board % 2 ? a : b, r, 0.05));
    }
  },
  coal_ore: ore('#23232a', '#4a4a55'),
  iron_ore: ore('#c99a74', '#ebc29c'),
  gold_ore: ore('#e5a91a', '#fff08a'),
  ember_ore: (p: Pix, r: R) => {
    fill(p, hex('#4a3536'), r, 0.1);
    blobs(p, r, hex('#ff6a1f'), hex('#ffd27a'), 5, 1.6);
    specks(p, r, hex('#fff1b8'), 3);
  },
  bedrock: (p: Pix, r: R) => {
    fill(p, hex('#2b2b33'), r, 0.25);
    specks(p, r, hex('#45454f'), 14, 2);
    specks(p, r, hex('#16161b'), 14, 2);
  },
  workbench_top: (p: Pix, r: R) => {
    T.planks(p, r);
    for (let x = 2; x <= 7; x++) p.set(x, 4, hex('#9aa3ad'));
    p.set(7, 5, hex('#6b4226'));
    p.set(7, 6, hex('#6b4226'));
    for (let x = 9; x <= 13; x++) p.set(x, 10, hex('#d8d0b8'));
    border(p, hex('#6a4524'));
  },
  workbench_side: (p: Pix, r: R) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, jitter(hex('#8d6239'), r, 0.05));
    for (let x = 0; x < S; x++) { p.set(x, 0, hex('#c8915a')); p.set(x, 1, hex('#b07a42')); p.set(x, 3, hex('#6a4524')); }
    for (let y = 4; y < S; y++) for (const x of [1, 2, 13, 14]) p.set(x, y, hex('#6a4524'));
    for (let y = 6; y < 13; y++) for (let x = 4; x < 12; x++) p.set(x, y, jitter(hex('#5a3d24'), r, 0.06));
    for (let x = 5; x < 11; x++) p.set(x, 8, hex('#9aa3ad'));
  },
  furnace_side: (p: Pix, r: R) => {
    T.stone(p, r);
    for (let i = 0; i < S; i++) { p.set(i, 0, hex('#5f6168')); p.set(i, 15, hex('#4b4d53')); }
  },
  furnace_top: (p: Pix, r: R) => {
    T.stone(p, r);
    for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) p.set(x, y, hex('#2a2a30'));
  },
  furnace_front: (p: Pix, r: R) => {
    T.furnace_side(p, r);
    for (let y = 7; y <= 13; y++)
      for (let x = 4; x <= 11; x++) p.set(x, y, y >= 12 ? hex('#ffb347') : y >= 11 ? hex('#ff7a1a') : hex('#1a1010'));
    for (let x = 3; x <= 12; x++) p.set(x, 6, hex('#4b4d53'));
  },
  water: (p: Pix, r: R) => {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) p.set(x, y, Math.sin(x * 0.8 + y * 0.6) > 0.85 ? hex('#6aa5f0') : jitter(hex('#2f6fd1'), r, 0.04));
  },
  lava: (p: Pix, r: R) => {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const n = Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2) + Math.cos(y * 0.8 + x * 0.3);
        p.set(x, y, jitter(n > 1 ? hex('#ffd23f') : n > 0 ? hex('#ff7a1a') : hex('#d8400f'), r, 0.06));
      }
  },
  cactus_side: (p: Pix, r: R) => {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const edge = x === 0 || x === 15;
        p.set(x, y, edge ? hex('#33702a') : x % 5 === 2 ? hex('#3b7a2b') : jitter(hex('#4f9a3a'), r, 0.05));
      }
    for (let y = 1; y < S; y += 3) p.set(1 + ((y * 7) % 13), y, hex('#f2e6b0'));
  },
  cactus_top: (p: Pix, r: R) => {
    fill(p, hex('#5aa844'), r, 0.05);
    border(p, hex('#33702a'));
    p.set(7, 7, hex('#ff8ab0'));
    p.set(8, 8, hex('#ff8ab0'));
  },
  tall_grass: (p: Pix, r: R) => plant(p, r, null, null),
  flower_red: (p: Pix, r: R) => plant(p, r, hex('#e04848'), hex('#ffd23f')),
  flower_yellow: (p: Pix, r: R) => plant(p, r, hex('#ffd23f'), hex('#b0601a')),
  dead_bush: (p: Pix) => {
    const c = hex('#8a6a3a');
    for (let y = 9; y < 16; y++) p.set(7, y, c);
    for (let k = 0; k < 5; k++) {
      p.set(7 - k, 10 - k, c);
      p.set(8 + k, 11 - k, c);
      p.set(6 - Math.floor(k / 2), 13 - k, c);
    }
  },
  bones: (p: Pix) => {
    const b = hex('#e8dcc0');
    const d = hex('#7a6a58');
    for (let x = 3; x < 13; x++) p.set(x, 14, b);
    for (const [x, y] of [[2, 13], [2, 15], [13, 13], [13, 15]]) p.set(x, y, b);
    for (let y = 7; y < 14; y++) for (let x = 5; x < 12; x++) if ((x - 8) ** 2 + (y - 10) ** 2 < 8) p.set(x, y, b);
    p.set(7, 10, d);
    p.set(9, 10, d);
    p.set(8, 12, d);
  },
  ash: (p: Pix, r: R) => {
    fill(p, hex('#4a4450'), r, 0.08);
    specks(p, r, hex('#615a69'), 10);
    specks(p, r, hex('#c0502a'), 1);
  },
  ashstone: (p: Pix, r: R) => {
    fill(p, hex('#3a3341'), r, 0.07);
    cracks(p, r, hex('#5c3f6e'), 3);
    specks(p, r, hex('#2a2430'), 8);
  },
  brick: (p: Pix, r: R) => bricks(p, r, hex('#8b8e98'), hex('#5b5d66')),
  mossy_stone: (p: Pix, r: R) => {
    T.stone(p, r);
    blobs(p, r, hex('#4f7a3a'), hex('#6f9a4a'), 5, 2.4);
  },
  mossy_stone_side: (p: Pix, r: R) => {
    T.stone(p, r);
    topLayer(p, r, hex('#4f7a3a'), hex('#3b5f2b'), 2);
  },
  mossy_brick: (p: Pix, r: R) => {
    bricks(p, r, hex('#8b8e98'), hex('#5b5d66'));
    blobs(p, r, hex('#4f7a3a'), hex('#6f9a4a'), 3, 2.2);
  },
  sandbrick: (p: Pix, r: R) => bricks(p, r, hex('#d6b072'), hex('#9c7a48')),
  frostbrick: (p: Pix, r: R) => bricks(p, r, hex('#bcd8ee'), hex('#6d8fae')),
  glass: (p: Pix) => {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (x === 0 || y === 0 || x === 15 || y === 15) p.set(x, y, hex('#d8ecff'));
        else if (x - y === 4 || x - y === 6) p.set(x, y, hex('#ffffff'));
      }
  },
  glowcap: (p: Pix) => {
    for (let y = 9; y < 16; y++) p.set(7, y, hex('#d8e8e0'));
    for (let y = 4; y < 9; y++)
      for (let x = 3; x <= 12; x++) {
        const d = ((x - 7.5) / 5) ** 2 + ((y - 9) / 5) ** 2;
        if (d <= 1) p.set(x, y, d < 0.35 ? hex('#9ffcf0') : hex('#3ef0d8'));
      }
    for (let y = 12; y < 16; y++) p.set(12, y, hex('#d8e8e0'));
    for (let x = 11; x <= 13; x++) p.set(x, 11, hex('#3ef0d8'));
  },
  orb_sun: (p: Pix) => orbTex(p, hex('#ff9a1a'), hex('#fff3b0')),
  orb_frost: (p: Pix) => orbTex(p, hex('#3ab8ff'), hex('#e0fbff')),
  orb_deep: (p: Pix) => orbTex(p, hex('#ff2d4a'), hex('#ffd0d8')),
  flame: (p: Pix, r: R) => {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) p.set(x, y, jitter(y < 5 ? hex('#fff1a0') : y < 10 ? hex('#ffb02e') : hex('#ff6a1a'), r, 0.08));
  },
  chest_side: (p: Pix, r: R) => {
    fill(p, hex('#8a5a2a'), r, 0.05);
    border(p, hex('#4a2c12'));
    for (let i = 0; i < S; i++) p.set(i, 6, hex('#4a2c12'));
    for (const x of [2, 13]) for (let y = 1; y < 15; y++) p.set(x, y, hex('#9aa3ad'));
  },
  chest_front: (p: Pix, r: R) => {
    T.chest_side(p, r);
    for (let y = 5; y < 9; y++) for (let x = 6; x < 10; x++) p.set(x, y, hex('#f5c542'));
    p.set(7, 7, hex('#1a1410'));
    p.set(8, 7, hex('#1a1410'));
  },
  chest_top: (p: Pix, r: R) => {
    fill(p, hex('#9a6a32'), r, 0.05);
    border(p, hex('#4a2c12'));
    for (let y = 1; y < 15; y++) for (const x of [2, 13]) p.set(x, y, hex('#9aa3ad'));
  },
  chest_open: (p: Pix, r: R) => {
    T.chest_top(p, r);
    for (let y = 2; y < 14; y++) for (let x = 3; x < 13; x++) p.set(x, y, hex('#2a1a0c'));
  },
});

export const atlas = { canvas: null as unknown as HTMLCanvasElement, cols: 16, rows: 0 };
const slots = new Map<string, number>();
const faces = new Map<string, HTMLCanvasElement>();
export const crackTex: HTMLCanvasElement[] = [];

/** UV rect [u0, v0, u1, v1] of a texture inside the atlas (v flipped for WebGL). */
export function uv(key: string): [number, number, number, number] {
  const i = slots.get(key) ?? 0;
  const c = i % atlas.cols;
  const r = Math.floor(i / atlas.cols);
  const e = 0.01;
  const W = atlas.canvas.width;
  const H = atlas.canvas.height;
  return [(c * S + e) / W, 1 - ((r + 1) * S - e) / H, ((c + 1) * S - e) / W, 1 - (r * S + e) / H];
}

export function faceTex(key: string): HTMLCanvasElement {
  return faces.get(key)!;
}

export function buildTextures() {
  const keys = Object.keys(T);
  atlas.rows = Math.ceil(keys.length / atlas.cols);
  const [c, ctx] = makeCanvas(atlas.cols * S, atlas.rows * S);
  atlas.canvas = c;
  keys.forEach((k, i) => {
    const p = new Pix(S, S);
    let h = 7;
    for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    T[k](p, mulberry32(h));
    const tex = p.toCanvas();
    faces.set(k, tex);
    slots.set(k, i);
    ctx.drawImage(tex, (i % atlas.cols) * S, Math.floor(i / atlas.cols) * S);
  });
  for (let stage = 0; stage < 5; stage++) {
    const p = new Pix(S, S);
    cracks(p, mulberry32(99 + stage), [20, 14, 10], 2 + stage * 3);
    crackTex[stage] = p.toCanvas();
  }
}
