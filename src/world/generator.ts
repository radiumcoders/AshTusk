/**
 * Deterministic 3D world generation. Everything is a pure function of
 * (seed, x, y, z) so chunks can be generated in any order and features that
 * cross chunk borders (trees, shrines, ruins) still line up.
 *
 * Geography: the Greenwood surrounds the Worldforge; the Sunscorch sands lie
 * west (-x), the Rimeback snows east (+x) and the Ashlands north (-z).
 */
import { createNoise2D, createNoise3D, type NoiseFunction2D, type NoiseFunction3D } from 'simplex-noise';
import { CHUNK, FORGE, HEIGHT, OLD_STAIR as STAIR, SEA, SHRINES, SURFACE, TOTEM } from '../config';
import { clamp, hash1, hash2, lerp, mulberry32, smoothstep } from '../engine/rng';
import { B, BLOCKS } from './blocks';
import { idx, VOL } from './chunk';

export type Biome = 'greenwood' | 'sunscorch' | 'rimeback' | 'ashlands';
export const BIOME_NAMES: Record<Biome, string> = {
  greenwood: 'The Greenwood',
  sunscorch: 'Sunscorch Wastes',
  rimeback: 'Rimeback Tundra',
  ashlands: 'The Ashlands',
};

const TREE_CELL = 7;
const BOULDER_CELL = 18;

type Put = (x: number, y: number, z: number, id: number, onlyAir?: boolean) => void;
interface Structure { x0: number; z0: number; x1: number; z1: number; build: (put: Put) => void }
interface Flat { x: number; z: number; r: number; h: number }

const RUIN_CELL = 72;

export class Generator {
  private n: Record<string, NoiseFunction2D> = {};
  private n3: Record<string, NoiseFunction3D> = {};
  private hCache = new Map<number, number>();
  private flats: Flat[];
  private fixed: Structure[];

  constructor(readonly seed: number) {
    const r = mulberry32(seed);
    for (const k of ['hill', 'ridge', 'warp', 'detail', 'ent', 'tree']) this.n[k] = createNoise2D(r);
    for (const k of ['caveA', 'caveB', 'cavern', 'ore']) this.n3[k] = createNoise3D(r);
    const flat = (x: number, z: number, r: number): Flat => ({ x, z, r, h: SURFACE + 1 });
    this.flats = [flat(FORGE.x, FORGE.z, 12), flat(SHRINES.sun.x, SHRINES.sun.z, 11), flat(SHRINES.frost.x, SHRINES.frost.z, 11)];
    this.fixed = [this.forgeRuins(), this.shrine('sun'), this.shrine('frost'), this.deepShrine(), this.oldStair()];
  }

  // ---------------------------------------------------------------- biomes + height

  weights(x: number, z: number) {
    const wx = x + this.n.warp(x / 260, z / 260) * 70;
    const wz = z + this.n.warp(z / 260 + 40, x / 260) * 70;
    const desert = smoothstep(-110, -170, wx);
    const tundra = smoothstep(110, 170, wx);
    const ash = smoothstep(-150, -210, wz) * (1 - desert) * (1 - tundra);
    return { desert, tundra, ash };
  }

  biomeAt(x: number, z: number): Biome {
    const w = this.weights(x, z);
    let best: Biome = 'greenwood';
    let v = 1 - w.desert - w.tundra - w.ash;
    if (w.desert > v) { best = 'sunscorch'; v = w.desert; }
    if (w.tundra > v) { best = 'rimeback'; v = w.tundra; }
    if (w.ash > v) best = 'ashlands';
    return best;
  }

  /** 0..1 lake strength: lakes are shallow basins, ringed by a sandy shore. */
  lakeAt(x: number, z: number): number {
    if (this.dryZone(x, z)) return 0;
    return smoothstep(0.52, 0.66, this.n.ridge(x / 72, z / 72));
  }

  /** No lakes around story locations: the forge, shrines and the Old Stair's entrance. */
  private dryZone(x: number, z: number): boolean {
    if (this.flats?.some((f) => Math.max(Math.abs(x - f.x), Math.abs(z - f.z)) < f.r + 22)) return true;
    return Math.abs(x - STAIR.x0) < 18 && Math.abs(z - STAIR.z) < 18;
  }

  /** Sandy rim around lakes. */
  private shoreAt(x: number, z: number): boolean {
    if (this.dryZone(x, z)) return false;
    return this.n.ridge(x / 72, z / 72) > 0.46;
  }

  /**
   * Terrain sits on just three terraces (SURFACE .. SURFACE+2) so the
   * isometric view stays readable. Lakes dip below the water line.
   */
  private rawHeight(x: number, z: number): number {
    const n = this.n.hill(x / 90, z / 90) * 0.9 + this.n.detail(x / 45, z / 45) * 0.1;
    const level = n < -0.22 ? 0 : n < 0.28 ? 1 : 2;
    const lake = this.lakeAt(x, z);
    if (lake > 0) return lake > 0.6 ? SEA - 2 : SEA - 1;
    return SURFACE + level;
  }

  /** y of the topmost terrain block in a column. */
  heightAt(x: number, z: number): number {
    const k = ((x & 0xffff) << 16) | (z & 0xffff);
    let s = this.hCache.get(k);
    if (s !== undefined) return s;
    let h = this.rawHeight(x, z);
    for (const f of this.flats) {
      const d = Math.max(Math.abs(x - f.x), Math.abs(z - f.z));
      const t = 1 - smoothstep(f.r, f.r + 14, d);
      if (t > 0) h = lerp(h, f.h, t);
    }
    s = Math.round(clamp(h, SEA - 2, SURFACE + 2));
    if (this.hCache.size > 200000) this.hCache.clear();
    this.hCache.set(k, s);
    return s;
  }

  private nearFlat(x: number, z: number, pad: number) {
    return this.flats.some((f) => Math.max(Math.abs(x - f.x), Math.abs(z - f.z)) < f.r + pad);
  }

  // ---------------------------------------------------------------- chunk

  generate(cx: number, cz: number): Uint8Array {
    const blocks = new Uint8Array(VOL);
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) this.column(blocks, x0 + lx, z0 + lz, lx, lz);

    const put: Put = (x, y, z, id, onlyAir) => {
      const lx = x - x0;
      const lz = z - z0;
      if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK || y < 1 || y >= HEIGHT) return;
      const i = idx(lx, y, lz);
      if (onlyAir) {
        const cur = BLOCKS[blocks[i]];
        if (blocks[i] !== B.AIR && !(cur.replaceable && !cur.liquid)) return;
      }
      blocks[i] = id;
    };
    for (let gz = Math.floor((z0 - 4) / TREE_CELL); gz <= Math.floor((z0 + CHUNK + 4) / TREE_CELL); gz++)
      for (let gx = Math.floor((x0 - 4) / TREE_CELL); gx <= Math.floor((x0 + CHUNK + 4) / TREE_CELL); gx++) this.tree(gx, gz, put);
    for (let gz = Math.floor((z0 - 3) / BOULDER_CELL); gz <= Math.floor((z0 + CHUNK + 3) / BOULDER_CELL); gz++)
      for (let gx = Math.floor((x0 - 3) / BOULDER_CELL); gx <= Math.floor((x0 + CHUNK + 3) / BOULDER_CELL); gx++) this.boulder(gx, gz, put);

    const overlaps = (s: Structure) => s.x1 >= x0 && s.x0 < x0 + CHUNK && s.z1 >= z0 && s.z0 < z0 + CHUNK;
    for (let rz = Math.floor((z0 - 12) / RUIN_CELL); rz <= Math.floor((z0 + CHUNK + 12) / RUIN_CELL); rz++)
      for (let rx = Math.floor((x0 - 12) / RUIN_CELL); rx <= Math.floor((x0 + CHUNK + 12) / RUIN_CELL); rx++) {
        const s = this.ruin(rx, rz);
        if (s && overlaps(s)) s.build(put);
      }
    for (const s of this.fixed) if (overlaps(s)) s.build(put);
    return blocks;
  }

  private column(b: Uint8Array, x: number, z: number, lx: number, lz: number) {
    const h = this.heightAt(x, z);
    const biome = this.biomeAt(x, z);
    const soil = 3 + Math.floor(hash2(x, z, this.seed + 1) * 2);
    const underwater = h < SEA;
    const entrance = !underwater && this.n.ent(x / 60, z / 60) > 0.55;
    for (let y = 0; y < HEIGHT; y++) {
      let id: number = B.AIR;
      if (y === 0 || (y <= 3 && hash2(x * 7 + y, z, this.seed) < 0.6 - y * 0.15)) id = B.BEDROCK;
      else if (y <= h) {
        const depth = h - y;
        id = this.ground(biome, depth, soil, underwater || this.lakeAt(x, z) > 0 || this.shoreAt(x, z));
        if (this.cave(x, y, z, depth, entrance, underwater)) id = y <= 5 ? B.LAVA : B.AIR;
        else if (id === B.STONE) id = this.ore(x, y, z, depth);
      } else if (y <= SEA) id = biome === 'rimeback' && y === SEA ? B.ICE : B.WATER;
      b[idx(lx, y, lz)] = id;
    }
    // Surface decoration
    if (h + 1 < HEIGHT && b[idx(lx, h + 1, lz)] === B.AIR) {
      const top = b[idx(lx, h, lz)];
      const r = hash2(x, z, this.seed + 7);
      let deco: number = B.AIR;
      if (top === B.GRASS) deco = r < 0.1 ? B.TALL_GRASS : r < 0.125 ? B.FLOWER_RED : r < 0.145 ? B.FLOWER_YELLOW : r < 0.175 ? B.PEBBLES : r < 0.185 ? B.ROCK : B.AIR;
      else if (top === B.SAND) deco = biome === 'sunscorch' && r < 0.02 ? B.DEAD_BUSH : r < 0.025 ? B.BONES : r < 0.05 ? B.PEBBLES : r < 0.058 ? B.ROCK : B.AIR;
      else if (top === B.SNOW) deco = r < 0.025 ? B.PEBBLES : r < 0.035 ? B.ROCK : B.AIR;
      else if (top === B.ASH) deco = r < 0.03 ? B.BONES : r < 0.06 ? B.DEAD_BUSH : r < 0.09 ? B.PEBBLES : r < 0.105 ? B.ROCK : B.AIR;
      if (deco) b[idx(lx, h + 1, lz)] = deco;
    }
    // Glowcaps on cave floors
    for (let y = 6; y < h - 6; y++) {
      const i = idx(lx, y, lz);
      if (b[i] === B.AIR && BLOCKS[b[idx(lx, y - 1, lz)]].solid && hash2(x * 31 + y, z, this.seed + 9) < 0.035) b[i] = B.GLOWCAP;
    }
  }

  private ground(biome: Biome, depth: number, soil: number, beach: boolean): number {
    switch (biome) {
      case 'sunscorch':
        return depth <= 3 ? B.SAND : depth <= 10 + soil ? B.SANDSTONE : B.STONE;
      case 'rimeback':
        return depth === 0 ? B.SNOW : depth <= soil ? B.DIRT : B.STONE;
      case 'ashlands':
        return depth <= soil ? B.ASH : depth <= 14 ? B.ASHSTONE : B.STONE;
      default:
        if (beach && depth <= 2) return B.SAND;
        return depth === 0 ? B.GRASS : depth <= soil ? B.DIRT : B.STONE;
    }
  }

  private cave(x: number, y: number, z: number, depth: number, entrance: boolean, underwater: boolean): boolean {
    if (y <= 2) return false;
    if (depth < (underwater ? 7 : entrance ? 1 : 5)) return false;
    const a = this.n3.caveA(x / 26, y / 16, z / 26);
    const b = this.n3.caveB(x / 26, y / 16, z / 26);
    if (a * a + b * b < 0.016) return true;
    if (depth > 8 && y < 26 && this.n3.cavern(x / 34, y / 18, z / 34) > 0.6 - (y < 14 ? 0.08 : 0)) return true;
    return false;
  }

  private ore(x: number, y: number, z: number, depth: number): number {
    const n = this.n3.ore;
    if (y < 14 && n(x / 3.5 + 900, y / 3.5, z / 3.5) > 0.78) return B.EMBER_ORE;
    if (y < 22 && n(x / 4 + 500, y / 4, z / 4) > 0.75) return B.GOLD_ORE;
    if (depth > 4 && n(x / 4.5 + 200, y / 4.5, z / 4.5) > 0.7) return B.IRON_ORE;
    if (depth > 2 && n(x / 5 - 300, y / 5, z / 5) > 0.64) return B.COAL_ORE;
    return B.STONE;
  }

  // ---------------------------------------------------------------- trees

  private tree(gx: number, gz: number, put: Put) {
    const x = gx * TREE_CELL + 1 + Math.floor(hash2(gx, gz, this.seed + 3) * (TREE_CELL - 2));
    const z = gz * TREE_CELL + 1 + Math.floor(hash2(gz, gx, this.seed + 4) * (TREE_CELL - 2));
    if (this.nearFlat(x, z, 3) || this.ruinNear(x, z)) return;
    const biome = this.biomeAt(x, z);
    // Trees gather in groves; most of the land is open meadow.
    const grove = this.n.tree(x / 70, z / 70);
    const base = { greenwood: 0.34, rimeback: 0.26, sunscorch: 0.07, ashlands: 0.14 }[biome];
    const chance = base * (grove > 0.35 ? 1.25 : grove > 0 ? 0.4 : 0.06);
    if (hash2(gx, gz, this.seed + 5) > chance) return;
    const h = this.heightAt(x, z);
    if (h <= SEA) return;
    const r = hash2(gx, gz, this.seed + 6);
    const y0 = h + 1;

    if (biome === 'greenwood') {
      const big = r > 0.88;
      const th = big ? 7 + Math.floor(r * 3) : 4 + Math.floor(r * 3);
      const rad = big ? 3.4 : 2.3 + r * 0.6;
      const cy = y0 + th - (big ? 1 : 0);
      for (let dy = -3; dy <= 3; dy++)
        for (let dz = -4; dz <= 4; dz++)
          for (let dx = -4; dx <= 4; dx++) {
            const d = dx * dx + dz * dz + (dy * 1.4) ** 2;
            if (d <= rad * rad + hash2(x + dx * 13 + dy, z + dz, this.seed) * 2.2) put(x + dx, cy + dy, z + dz, B.LEAVES, true);
          }
      for (let y = y0; y < y0 + th; y++) put(x, y, z, B.LOG);
    } else if (biome === 'rimeback') {
      const th = 6 + Math.floor(r * 4);
      for (let k = 0; k < th; k++) {
        const y = y0 + 2 + k;
        const rad = Math.max(0, Math.min(2.2, (th - k) * 0.32) - (k % 2) * 0.4);
        for (let dz = -3; dz <= 3; dz++)
          for (let dx = -3; dx <= 3; dx++) if (dx * dx + dz * dz <= rad * rad + 0.3) put(x + dx, y, z + dz, B.PINE_LEAVES, true);
      }
      put(x, y0 + th + 2, z, B.PINE_LEAVES, true);
      for (let y = y0; y < y0 + th; y++) put(x, y, z, B.PINE_LOG);
    } else if (biome === 'sunscorch') {
      if (this.ground(biome, 0, 3, false) !== B.SAND) return;
      const th = 2 + Math.floor(r * 3);
      for (let y = y0; y < y0 + th; y++) put(x, y, z, B.CACTUS);
    } else {
      const th = 3 + Math.floor(r * 4);
      for (let y = y0; y < y0 + th; y++) put(x, y, z, B.DEADWOOD);
      put(x + 1, y0 + th - 2, z, B.DEADWOOD, true);
      put(x - 1, y0 + th - 1, z, B.DEADWOOD, true);
      put(x, y0 + th - 1, z + 1, B.DEADWOOD, true);
    }
  }

  /** Mossy boulders: small 1-2 block high rock piles scattered over the land. */
  private boulder(gx: number, gz: number, put: Put) {
    const r = hash2(gx, gz, this.seed + 40);
    const x = gx * BOULDER_CELL + 2 + Math.floor(hash2(gx, gz, this.seed + 41) * (BOULDER_CELL - 4));
    const z = gz * BOULDER_CELL + 2 + Math.floor(hash2(gz, gx, this.seed + 42) * (BOULDER_CELL - 4));
    const biome = this.biomeAt(x, z);
    const chance = { greenwood: 0.4, rimeback: 0.45, sunscorch: 0.3, ashlands: 0.5 }[biome];
    if (r > chance || this.nearFlat(x, z, 4) || this.ruinNear(x, z) || this.lakeAt(x, z) > 0) return;
    const stone = biome === 'sunscorch' ? B.SANDSTONE : biome === 'ashlands' ? B.ASHSTONE : B.STONE;
    const mossy = biome === 'greenwood' ? B.MOSSY_STONE : stone;
    const big = r < chance * 0.45;
    const base: [number, number][] = big ? [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]] : [[0, 0], [1, 0], [0, 1]];
    const tops: [number, number][] = big ? [[0, 0], [1, 0], [0, 1]] : [[0, 0]];
    const placed = new Set<string>();
    base.forEach(([dx, dz], i) => {
      if (i > 2 && hash2(x + dx * 7, z + dz * 13, this.seed + 43) < 0.35) return;
      const top = hash2(x + dx, z + dz, this.seed + 44) < 0.3;
      put(x + dx, this.heightAt(x + dx, z + dz) + 1, z + dz, top ? mossy : stone, true);
      placed.add(`${dx},${dz}`);
    });
    for (const [dx, dz] of tops)
      if (placed.has(`${dx},${dz}`) && (dx === 0 && dz === 0 || hash2(x - dx, z - dz, this.seed + 47) < 0.6))
        put(x + dx, this.heightAt(x + dx, z + dz) + 2, z + dz, mossy, true);
    // A scatter of pebbles around the boulder
    for (let k = 0; k < 4; k++) {
      const px = x + Math.floor((hash2(x, k, this.seed + 45) - 0.5) * 6);
      const pz = z + Math.floor((hash2(z, k, this.seed + 46) - 0.5) * 6);
      put(px, this.heightAt(px, pz) + 1, pz, B.PEBBLES, true);
    }
  }

  // ---------------------------------------------------------------- structures

  private forgeRuins(): Structure {
    const R = 8;
    return {
      x0: FORGE.x - 12, z0: FORGE.z - 12, x1: FORGE.x + 12, z1: FORGE.z + 12,
      build: (put) => {
        const h = this.flats[0].h;
        for (let z = -12; z <= 12; z++)
          for (let x = -12; x <= 12; x++) {
            const wx = FORGE.x + x;
            const wz = FORGE.z + z;
            for (let y = h + 1; y < h + 14; y++) put(wx, y, wz, B.AIR);
            const plat = Math.max(Math.abs(x), Math.abs(z)) <= R - 1;
            put(wx, h, wz, plat ? (hash2(wx, wz, this.seed + 12) < 0.2 ? B.MOSSY_BRICK : B.BRICK) : B.GRASS);
            if (plat) for (let y = h - 2; y < h; y++) put(wx, y, wz, B.BRICK);
            // Broken outer wall
            if (Math.max(Math.abs(x), Math.abs(z)) === R) {
              const gate = Math.min(Math.abs(x), Math.abs(z)) <= 1;
              const wh = gate ? 0 : Math.floor(hash2(wx, wz, this.seed + 13) * 4);
              for (let y = h; y <= h + wh; y++) put(wx, y, wz, hash2(wx, y, this.seed + wz) < 0.3 ? B.MOSSY_BRICK : B.BRICK);
            }
          }
        // Corner pillars with braziers
        for (const [px, pz] of [[-R, -R], [R, -R], [-R, R], [R, R]]) {
          for (let y = h; y <= h + 4; y++) put(FORGE.x + px, y, FORGE.z + pz, B.BRICK);
          put(FORGE.x + px, h + 5, FORGE.z + pz, B.TORCH);
        }
        // Solid footprint under the forge model
        for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) put(FORGE.x + x, h + 1, FORGE.z + z, B.BRICK);
        // Starter campfire beside the totem
        put(TOTEM.x + 2, h + 1, TOTEM.z + 2, B.CAMPFIRE);
      },
    };
  }

  private shrine(key: 'sun' | 'frost'): Structure {
    const s = SHRINES[key];
    const brick = key === 'sun' ? B.SANDBRICK : B.FROSTBRICK;
    const R = 6;
    return {
      x0: s.x - 10, z0: s.z - 10, x1: s.x + 10, z1: s.z + 10,
      build: (put) => {
        const h = this.flats[key === 'sun' ? 1 : 2].h;
        for (let z = -10; z <= 10; z++)
          for (let x = -10; x <= 10; x++) {
            const wx = s.x + x;
            const wz = s.z + z;
            for (let y = h + 1; y < h + 16; y++) put(wx, y, wz, B.AIR);
            const m = Math.max(Math.abs(x), Math.abs(z));
            if (m <= R + 1) for (let y = h - 3; y <= h; y++) put(wx, y, wz, brick);
            if (m === R) {
              const door = Math.min(Math.abs(x), Math.abs(z)) <= 1;
              for (let y = h + 1; y <= h + 6; y++) if (!(door && y <= h + 3)) put(wx, y, wz, brick);
            }
            if (m <= R) put(wx, h + 7, wz, m === R || (Math.abs(x) + Math.abs(z)) % 3 ? brick : B.GLASS);
            if (m <= R - 2) put(wx, h + 8, wz, brick);
            if (m <= 1) put(wx, h + 9, wz, brick);
          }
        for (const [px, pz] of [[-R, -R], [R, -R], [-R, R], [R, R]]) for (let y = h + 1; y <= h + 9; y++) put(s.x + px, y, s.z + pz, brick);
        put(s.x, h + 1, s.z, key === 'sun' ? B.PEDESTAL_SUN : B.PEDESTAL_FROST);
        for (const [tx, tz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) put(s.x + tx, h + 1, s.z + tz, B.TORCH);
        put(s.x - 4, h + 1, s.z, B.CHEST);
        put(s.x + 4, h + 1, s.z, B.CHEST);
      },
    };
  }

  private deepShrine(): Structure {
    const s = SHRINES.deep;
    return {
      x0: s.x - 10, z0: s.z - 10, x1: s.x + 10, z1: s.z + 10,
      build: (put) => {
        const fl = s.y - 1;
        for (let z = -10; z <= 10; z++)
          for (let x = -10; x <= 10; x++) {
            const wx = s.x + x;
            const wz = s.z + z;
            const m = Math.max(Math.abs(x), Math.abs(z));
            for (let y = fl - 1; y <= fl + 8; y++) {
              if (m > 9) {
                if (hash2(wx * 3 + y, wz, this.seed + 21) < 0.12) put(wx, y, wz, B.EMBER_ORE);
                continue;
              }
              const shell = m === 9 || y === fl - 1 || y === fl || y === fl + 8;
              put(wx, y, wz, shell ? (hash2(wx + y, wz, this.seed + 22) < 0.35 ? B.MOSSY_BRICK : B.BRICK) : B.AIR);
            }
            if (m === 7 && Math.min(Math.abs(x), Math.abs(z)) >= 3) put(wx, fl, wz, B.LAVA);
          }
        // East doorway towards the Old Stair
        for (let y = fl + 1; y <= fl + 3; y++) for (const dz of [0, 1]) put(s.x + 9, y, s.z + dz, B.AIR);
        put(s.x, fl + 1, s.z, B.PEDESTAL_DEEP);
        for (const [tx, tz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) put(s.x + tx, fl + 1, s.z + tz, B.TORCH);
        put(s.x, fl + 1, s.z - 6, B.CHEST);
        put(s.x - 6, fl + 1, s.z, B.CHEST);
      },
    };
  }

  /** A carved staircase from the surface down to the Deep Shrine. */
  private oldStair(): Structure {
    return {
      x0: STAIR.x1 - 1, z0: STAIR.z - 2, x1: STAIR.x0 + 2, z1: STAIR.z + 3,
      build: (put) => {
        const bottom = SHRINES.deep.y;
        const steps = STAIR.x0 - STAIR.x1;
        const startY = this.heightAt(STAIR.x0, STAIR.z) + 1;
        for (let i = 0; i <= steps; i++) {
          const x = STAIR.x0 - i;
          const y = Math.max(bottom, startY - i);
          for (const z of [STAIR.z, STAIR.z + 1]) {
            put(x, y - 1, z, B.BRICK);
            for (let k = 0; k < 4; k++) put(x, y + k, z, B.AIR);
          }
          for (const z of [STAIR.z - 1, STAIR.z + 2]) for (let k = -1; k < 3; k++) put(x, y + k, z, B.BRICK);
          if (i % 5 === 2) put(x, y, STAIR.z - 1, B.TORCH);
        }
      },
    };
  }

  private ruinNear(x: number, z: number): boolean {
    const s = this.ruin(Math.floor(x / RUIN_CELL), Math.floor(z / RUIN_CELL));
    return !!s && x >= s.x0 - 2 && x <= s.x1 + 2 && z >= s.z0 - 2 && z <= s.z1 + 2;
  }

  /** Small abandoned orc camps scattered through the world, each with a chest. */
  private ruin(rx: number, rz: number): Structure | null {
    if (hash2(rx, rz, this.seed + 30) > 0.6) return null;
    const x = rx * RUIN_CELL + 12 + Math.floor(hash2(rx, rz, this.seed + 31) * (RUIN_CELL - 24));
    const z = rz * RUIN_CELL + 12 + Math.floor(hash2(rz, rx, this.seed + 32) * (RUIN_CELL - 24));
    if (this.nearFlat(x, z, 16) || Math.hypot(x - SHRINES.deep.x, z - SHRINES.deep.z) < 20) return null;
    if (x > STAIR.x1 - 10 && x < STAIR.x0 + 10 && Math.abs(z - STAIR.z) < 10) return null;
    const h = this.heightAt(x, z);
    if (h <= SEA) return null;
    const biome = this.biomeAt(x, z);
    const brick = biome === 'sunscorch' ? B.SANDBRICK : biome === 'rimeback' ? B.FROSTBRICK : biome === 'ashlands' ? B.ASHSTONE : B.MOSSY_BRICK;
    return {
      x0: x - 4, z0: z - 4, x1: x + 4, z1: z + 4,
      build: (put) => {
        for (let dz = -4; dz <= 4; dz++)
          for (let dx = -4; dx <= 4; dx++) {
            const wx = x + dx;
            const wz = z + dz;
            for (let y = h + 1; y < h + 8; y++) put(wx, y, wz, B.AIR);
            const m = Math.max(Math.abs(dx), Math.abs(dz));
            put(wx, h, wz, m <= 3 ? brick : B.DIRT);
            for (let y = h - 3; y < h; y++) put(wx, y, wz, B.STONE, true);
            if (m === 3 && hash1(wx * 5 + wz, this.seed + 33) < 0.65) {
              const wh = 1 + Math.floor(hash2(wx, wz, this.seed + 34) * 3);
              for (let y = h + 1; y <= h + wh; y++) put(wx, y, wz, brick);
            }
          }
        put(x, h + 1, z, B.CHEST);
        put(x + 1, h + 1, z + 1, B.BONES);
        put(x - 2, h + 1, z + 1, B.TORCH);
      },
    };
  }

  /** Where ruins are, so the game can show them on the map and theme loot. */
  ruinAt(x: number, z: number) {
    return this.ruin(Math.floor(x / RUIN_CELL), Math.floor(z / RUIN_CELL));
  }
}
