/**
 * Chunk lighting + meshing.
 *
 * Lighting is a Minecraft-style two-channel flood fill (sky + block light)
 * over the chunk plus a 14-block margin, so light crosses chunk borders.
 * Meshing emits only visible faces, with smooth per-vertex light and ambient
 * occlusion sampled from the same padded region.
 */
import { CHUNK, HEIGHT } from '../config';
import { uv } from '../gfx/textures';
import { B, BLOCKS, type BlockDef } from './blocks';
import { type Chunk, idx } from './chunk';
import type { World } from './world';

const M = 14;
const W = CHUNK + M * 2;
const AREA = W * W;
const N = AREA * HEIGHT;
const ids = new Uint8Array(N);
const sky = new Uint8Array(N);
const blk = new Uint8Array(N);
const queue = new Int32Array(N * 2);

const OPAQ = new Uint8Array(256);
const COST = new Uint8Array(256);
const EMIT = new Uint8Array(256);
for (let i = 0; i < BLOCKS.length; i++) {
  const d = BLOCKS[i];
  OPAQ[i] = d.opaque ? 1 : 0;
  COST[i] = d.liquid || i === B.LEAVES || i === B.PINE_LEAVES ? 2 : 1;
  EMIT[i] = d.light;
}
/** Light level (0..15) to brightness. */
const CURVE = Array.from({ length: 16 }, (_, l) => (l === 0 ? 0 : Math.pow(0.8, 15 - l)));

const ri = (x: number, y: number, z: number) => (y * W + z) * W + x;

export interface Geo { pos: number[]; nrm: number[]; uv: number[]; col: number[]; lit: number[]; idx: number[] }
export interface ChunkMesh { solid: Geo; cutout: Geo; plant: Geo; water: Geo; lava: Geo }
const geo = (): Geo => ({ pos: [], nrm: [], uv: [], col: [], lit: [], idx: [] });

function fillRegion(world: World, c: Chunk) {
  const tops = new Uint8Array(AREA);
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const n = world.chunk(c.cx + dx, c.cz + dz);
      for (let z = 0; z < CHUNK; z++) {
        const rz = dz * CHUNK + z + M;
        if (rz < 0 || rz >= W) continue;
        for (let x = 0; x < CHUNK; x++) {
          const rx = dx * CHUNK + x + M;
          if (rx < 0 || rx >= W) continue;
          tops[rz * W + rx] = n.top[z * CHUNK + x];
          for (let y = 0; y < HEIGHT; y++) ids[ri(rx, y, rz)] = n.blocks[idx(x, y, z)];
        }
      }
    }
  return tops;
}

function flood(arr: Uint8Array, count: number) {
  const cap = queue.length;
  let head = 0;
  let tail = count;
  while (head !== tail) {
    const i = queue[head];
    head = (head + 1) % cap;
    const l = arr[i];
    if (l <= 1) continue;
    const x = i % W;
    const z = ((i / W) | 0) % W;
    const y = (i / AREA) | 0;
    const push = (j: number) => {
      const id = ids[j];
      if (OPAQ[id]) return;
      const nl = l - COST[id];
      if (nl > arr[j]) {
        arr[j] = nl;
        queue[tail] = j;
        tail = (tail + 1) % cap;
      }
    };
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (z > 0) push(i - W);
    if (z < W - 1) push(i + W);
    if (y > 0) push(i - AREA);
    if (y < HEIGHT - 1) push(i + AREA);
  }
}

function computeLight(tops: Uint8Array) {
  sky.fill(0);
  blk.fill(0);
  let q = 0;
  for (let z = 0; z < W; z++)
    for (let x = 0; x < W; x++) {
      const t = tops[z * W + x];
      let hi = t;
      if (x > 0) hi = Math.max(hi, tops[z * W + x - 1]);
      if (x < W - 1) hi = Math.max(hi, tops[z * W + x + 1]);
      if (z > 0) hi = Math.max(hi, tops[(z - 1) * W + x]);
      if (z < W - 1) hi = Math.max(hi, tops[(z + 1) * W + x]);
      for (let y = t; y < HEIGHT; y++) {
        const i = ri(x, y, z);
        sky[i] = 15;
        if (y < hi) queue[q++] = i;
      }
    }
  flood(sky, q);
  q = 0;
  for (let i = 0; i < N; i++) {
    const e = EMIT[ids[i]];
    if (e) {
      blk[i] = e;
      queue[q++] = i;
    }
  }
  flood(blk, q);
}

// Face tables: for each direction, the normal and four corners (CCW from outside).
interface Face { n: [number, number, number]; c: [number, number, number][]; u: number; v: number; dir: number }
const FACES: Face[] = [];
for (let a = 0; a < 3; a++)
  for (const s of [1, -1]) {
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    const n: [number, number, number] = [0, 0, 0];
    n[a] = s;
    const corners: [number, number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([cu, cv]) => {
      const p: [number, number, number] = [0, 0, 0];
      p[a] = s > 0 ? 1 : 0;
      p[u] = cu;
      p[v] = cv;
      return p;
    });
    const e1 = corners[1].map((k, i) => k - corners[0][i]);
    const e2 = corners[2].map((k, i) => k - corners[0][i]);
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[a] * s < 0) corners.reverse();
    FACES.push({ n, c: corners, u, v, dir: a * 2 + (s > 0 ? 0 : 1) });
  }
// dir: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z
const SHADE = [0.82, 0.82, 1, 0.6, 0.9, 0.9];
const AO = [0.5, 0.68, 0.84, 1];

function texFor(def: BlockDef, dir: number): string {
  const t = def.tex;
  if (dir === 2) return t[0];
  if (dir === 3) return t[2] ?? t[1] ?? t[0];
  if (dir === 4 && def.front) return def.front;
  return t[1] ?? t[0];
}

function quad(g: Geo, verts: number[][], nrm: number[], tex: string, uvs: number[][], cols: number[], lits: number[][], flip: boolean) {
  const base = g.pos.length / 3;
  const [u0, v0, u1, v1] = uv(tex);
  for (let k = 0; k < 4; k++) {
    g.pos.push(verts[k][0], verts[k][1], verts[k][2]);
    g.nrm.push(nrm[0], nrm[1], nrm[2]);
    g.uv.push(u0 + (u1 - u0) * uvs[k][0], v0 + (v1 - v0) * uvs[k][1]);
    g.col.push(cols[k], cols[k], cols[k]);
    g.lit.push(lits[k][0], lits[k][1]);
  }
  if (flip) g.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  else g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Axis-aligned box (for small models) lit from its own cell. */
function box(g: Geo, ox: number, oy: number, oz: number, min: number[], max: number[], tex: string | string[], light: [number, number], glow = false) {
  const L: [number, number] = glow ? [light[0], 1] : light;
  for (const f of FACES) {
    const verts = f.c.map((c) => [ox + (c[0] ? max[0] : min[0]), oy + (c[1] ? max[1] : min[1]), oz + (c[2] ? max[2] : min[2])]);
    const uvs = f.c.map((c) => (f.dir === 2 || f.dir === 3 ? [c[0], c[2]] : [f.dir < 2 ? c[2] : c[0], c[1]]));
    const t = Array.isArray(tex) ? tex[f.dir] ?? tex[0] : tex;
    quad(g, verts, f.n, t, uvs, [SHADE[f.dir], SHADE[f.dir], SHADE[f.dir], SHADE[f.dir]], [L, L, L, L], false);
  }
}

export function buildChunk(world: World, c: Chunk): ChunkMesh {
  const tops = fillRegion(world, c);
  computeLight(tops);

  // Store the chunk's own light for entity shading and spawning rules.
  for (let y = 0; y < HEIGHT; y++)
    for (let z = 0; z < CHUNK; z++)
      for (let x = 0; x < CHUNK; x++) {
        const i = ri(x + M, y, z + M);
        c.light[idx(x, y, z)] = (sky[i] << 4) | blk[i];
      }
  c.lit = true;

  const out: ChunkMesh = { solid: geo(), cutout: geo(), plant: geo(), water: geo(), lava: geo() };
  const emitters: number[] = [];
  const ox = c.cx * CHUNK;
  const oz = c.cz * CHUNK;
  // Below the world counts as air so the bedrock floor gets faces (they cap the cutaway view).
  const at = (x: number, y: number, z: number) => (y < 0 || y >= HEIGHT ? B.AIR : ids[ri(x + M, y, z + M)]);
  const lightAt = (x: number, y: number, z: number): [number, number] => {
    if (y >= HEIGHT) return [1, 0];
    if (y < 0) return [0, 0];
    const i = ri(x + M, y, z + M);
    return [CURVE[sky[i]], CURVE[blk[i]]];
  };

  for (let y = 0; y < HEIGHT; y++)
    for (let z = 0; z < CHUNK; z++)
      for (let x = 0; x < CHUNK; x++) {
        const id = at(x, y, z);
        if (!id) continue;
        const def = BLOCKS[id];
        const wx = ox + x;
        const wz = oz + z;
        if (def.light >= 8) emitters.push(wx, y, wz, id);

        if (def.model === 'cube') {
          const g = def.cutout ? out.cutout : out.solid;
          for (const f of FACES) {
            const nx = x + f.n[0];
            const ny = y + f.n[1];
            const nz = z + f.n[2];
            const nid = at(nx, ny, nz);
            const nd = BLOCKS[nid];
            if (nd.opaque) continue;
            if (nid === id && def.cutout) continue;
            if (nd.model === 'cube' && nd.cutout && def.cutout) continue;
            const verts: number[][] = [];
            const uvs: number[][] = [];
            const cols: number[] = [];
            const lits: number[][] = [];
            const aos: number[] = [];
            for (const cnr of f.c) {
              verts.push([wx + cnr[0], y + cnr[1], wz + cnr[2]]);
              uvs.push(f.dir === 2 || f.dir === 3 ? [cnr[0], cnr[2]] : [f.dir < 2 ? cnr[2] : cnr[0], cnr[1]]);
              // Neighbour-layer samples for AO + smooth light
              const du = [0, 0, 0];
              const dv = [0, 0, 0];
              du[f.u] = cnr[f.u] ? 1 : -1;
              dv[f.v] = cnr[f.v] ? 1 : -1;
              const s1 = [nx + du[0], ny + du[1], nz + du[2]];
              const s2 = [nx + dv[0], ny + dv[1], nz + dv[2]];
              const sc = [nx + du[0] + dv[0], ny + du[1] + dv[1], nz + du[2] + dv[2]];
              const o1 = OPAQ[at(s1[0], s1[1], s1[2])];
              const o2 = OPAQ[at(s2[0], s2[1], s2[2])];
              const oc = OPAQ[at(sc[0], sc[1], sc[2])];
              const ao = o1 && o2 ? 0 : 3 - o1 - o2 - oc;
              aos.push(ao);
              cols.push(AO[ao] * SHADE[f.dir]);
              let ls = 0;
              let lb = 0;
              let cnt = 0;
              for (const [p, o] of [[[nx, ny, nz], 0], [s1, o1], [s2, o2], [sc, oc]] as [number[], number][]) {
                if (o) continue;
                const l = lightAt(p[0], p[1], p[2]);
                ls += l[0];
                lb += l[1];
                cnt++;
              }
              lits.push([ls / cnt, lb / cnt]);
            }
            quad(g, verts, f.n, texFor(def, f.dir), uvs, cols, lits, aos[0] + aos[2] < aos[1] + aos[3]);
          }
        } else if (def.model === 'cross') {
          const l = lightAt(x, y, z);
          const t = def.tex[0];
          const j = ((wx * 7 + wz * 13) % 5) * 0.03;
          for (const [a, b] of [[[0.15 + j, 0.15], [0.85 + j, 0.85]], [[0.85, 0.15 + j], [0.15, 0.85 + j]]]) {
            const verts = [
              [wx + a[0], y, wz + a[1]], [wx + b[0], y, wz + b[1]],
              [wx + b[0], y + 0.95, wz + b[1]], [wx + a[0], y + 0.95, wz + a[1]],
            ];
            quad(out.plant, verts, [0, 1, 0], t, [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 1, 1, 1], [l, l, l, l], false);
          }
        } else if (def.model === 'torch') {
          const l = lightAt(x, y, z);
          box(out.solid, wx, y, wz, [0.44, 0, 0.44], [0.56, 0.6, 0.56], 'planks', l);
          box(out.solid, wx, y, wz, [0.41, 0.58, 0.41], [0.59, 0.8, 0.59], 'flame', l, true);
        } else if (def.model === 'campfire') {
          const l = lightAt(x, y, z);
          box(out.solid, wx, y, wz, [0.08, 0, 0.38], [0.92, 0.2, 0.62], 'log_side', l);
          box(out.solid, wx, y, wz, [0.38, 0, 0.08], [0.62, 0.2, 0.92], 'log_side', l);
          box(out.solid, wx, y, wz, [0.32, 0.15, 0.32], [0.68, 0.45, 0.68], 'flame', l, true);
          box(out.solid, wx, y, wz, [0.42, 0.4, 0.42], [0.58, 0.7, 0.58], 'flame', l, true);
        } else if (def.model === 'pebbles' || def.model === 'rock') {
          const l = lightAt(x, y, z);
          const j = (((wx * 73856093) ^ (wz * 19349663)) >>> 0) % 4;
          const t = def.tex[0];
          const ground = at(x, y - 1, z);
          const tex = ground === B.SAND || ground === B.SANDSTONE ? 'sandstone_top' : ground === B.ASH ? 'ashstone' : t;
          if (def.model === 'pebbles') {
            const spots = [[0.15, 0.2, 0.16], [0.55, 0.5, 0.14], [0.35, 0.7, 0.11], [0.68, 0.18, 0.1], [0.2, 0.58, 0.09]];
            for (let k = 0; k < 4; k++) {
              const [px, pz, sz] = spots[(k + j) % spots.length];
              box(out.solid, wx, y, wz, [px, 0, pz], [px + sz, sz * 0.65, pz + sz * 0.85], tex, l);
            }
          } else {
            const o = j * 0.04;
            box(out.solid, wx, y, wz, [0.18 + o, 0, 0.22], [0.82, 0.42, 0.78 - o], tex, l);
            box(out.solid, wx, y, wz, [0.28 + o, 0.38, 0.3], [0.7, 0.58, 0.66], tex, l);
            box(out.solid, wx, y, wz, [0.66, 0, 0.12 + o], [0.9, 0.2, 0.36 + o], tex, l);
          }
        } else if (def.model === 'pedestal') {
          const l = lightAt(x, y + 1, z);
          box(out.solid, wx, y, wz, [0.15, 0, 0.15], [0.85, 0.5, 0.85], 'brick', l);
          box(out.solid, wx, y, wz, [0.08, 0.5, 0.08], [0.92, 0.62, 0.92], 'brick', l);
          if (def.heart) box(out.solid, wx, y, wz, [0.32, 0.74, 0.32], [0.68, 1.1, 0.68], `orb_${def.heart}`, l, true);
        } else if (def.model === 'liquid') {
          const g = id === B.WATER ? out.water : out.lava;
          const above = at(x, y + 1, z);
          const topH = above === id ? 1 : 0.875;
          const l = lightAt(x, y + (above === id ? 0 : 1), z);
          const L: [number, number] = id === B.LAVA ? [l[0], 1] : l;
          for (const f of FACES) {
            const nid = at(x + f.n[0], y + f.n[1], z + f.n[2]);
            if (nid === id || (BLOCKS[nid].opaque && f.dir !== 2)) continue;
            if (f.dir === 2 && above === id) continue;
            const verts = f.c.map((cn) => [wx + cn[0], y + cn[1] * topH, wz + cn[2]]);
            const uvs = f.c.map((cn) => (f.dir === 2 || f.dir === 3 ? [cn[0], cn[2]] : [f.dir < 2 ? cn[2] : cn[0], cn[1]]));
            const s = SHADE[f.dir];
            quad(g, verts, f.n, def.tex[0], uvs, [s, s, s, s], [L, L, L, L], false);
          }
        }
      }
  c.emitters = emitters;
  c.dirty = false;
  return out;
}
