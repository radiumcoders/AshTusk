import * as THREE from 'three';
import { GRAVITY } from '../config';
import type { Game } from '../game/game';
import { BLOCKS } from '../world/blocks';
import type { World } from '../world/world';
import type { Model } from '../gfx/models';

const LIGHT_CURVE = (l: number) => (l === 0 ? 0 : Math.pow(0.8, 15 - l));

export abstract class Entity {
  /** Feet centre. */
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  w = 0.6;
  h = 1.8;
  yaw = 0;
  onGround = false;
  liquid = 0; // block id of the liquid we're standing in, 0 if none
  hitWall = false;
  impact = 0;
  stepSmooth = 0;

  hp = 10;
  maxHp = 10;
  dead = false;
  invuln = 0;
  knockResist = 0;
  burn = 0;
  slow = 0;
  gravity = 1;
  noClip = false;
  canStep = true;
  hostile = false;
  despawnable = false;
  /** Dynamic light radius (0 = none) and colour. */
  glow = 0;
  glowColor = new THREE.Color(1, 0.6, 0.3);
  model: Model | null = null;
  name = '';

  /** Scene object for this entity. */
  get obj(): THREE.Object3D | null { return this.model?.root ?? null; }
  get cx() { return this.x; }
  get cy() { return this.y + this.h / 2; }

  abstract update(dt: number, g: Game): void;

  /** Copies simulation state onto the 3D model. */
  sync(dt: number, g: Game) {
    if (!this.model) return;
    const r = this.model.root;
    r.position.set(this.x, this.y + this.stepSmooth, this.z);
    r.rotation.y = this.yaw;
    // Sample at the feet and just above the head (props may sit inside their own footprint).
    const bx = Math.floor(this.x);
    const bz = Math.floor(this.z);
    const a = g.world.light(bx, Math.floor(this.y + 0.5), bz);
    const b = g.world.light(bx, Math.floor(this.y + this.h + 0.3), bz);
    const sky = Math.max(a >> 4, b >> 4);
    const blk = Math.max(a & 15, b & 15);
    this.model.update(dt, LIGHT_CURVE(sky), Math.max(LIGHT_CURVE(blk), this.burn > 0 ? 0.6 : 0));
  }

  hurt(amount: number, fromX: number, fromZ: number, g: Game, knock = 1): boolean {
    if (this.invuln > 0 || this.dead) return false;
    this.hp -= amount;
    this.invuln = 0.18;
    this.model?.flash();
    const dx = this.x - fromX;
    const dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const k = (1 - this.knockResist) * knock;
    this.vx = (dx / d) * 7 * k;
    this.vz = (dz / d) * 7 * k;
    if (this.gravity && k > 0) this.vy = Math.max(this.vy, 4.5 * Math.min(1.4, k));
    g.ui.floatText(this.x, this.y + this.h + 0.2, this.z, String(Math.round(amount)), this.hostile ? '#ffdd66' : '#ff6666');
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.onDeath(g);
    }
    return true;
  }

  onDeath(_g: Game) {}

  overlaps(o: Entity, pad = 0): boolean {
    const r1 = this.w / 2 + pad;
    const r2 = o.w / 2;
    return Math.abs(this.x - o.x) < r1 + r2 && Math.abs(this.z - o.z) < r1 + r2 && this.y < o.y + o.h && this.y + this.h > o.y;
  }

  dist(o: { x: number; z: number }) {
    return Math.hypot(this.x - o.x, this.z - o.z);
  }

  tick(dt: number, g: Game) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.slow > 0) this.slow -= dt;
    if (this.burn > 0) {
      this.burn -= dt;
      if (Math.random() < dt * 10) g.particles.burst(this.x, this.y + this.h * 0.6, this.z, '#ff7a1a', 1, { speed: 0.5, up: 1.5, grav: -2, life: 0.6, collide: false }, true);
      if (Math.floor((this.burn + dt) * 2) !== Math.floor(this.burn * 2) && !this.dead) {
        this.hp -= 3;
        if (this.hp <= 0) {
          this.hp = 0;
          this.dead = true;
          this.onDeath(g);
        }
      }
    }
    this.stepSmooth *= Math.pow(0.0005, dt);
    if (Math.abs(this.stepSmooth) < 0.01) this.stepSmooth = 0;
  }

  dispose() {
    this.model?.dispose();
  }
}

function boxFree(world: World, x: number, y: number, z: number, hw: number, h: number): boolean {
  for (let by = Math.floor(y); by <= Math.floor(y + h - 0.001); by++)
    for (let bz = Math.floor(z - hw); bz <= Math.floor(z + hw - 0.001); bz++)
      for (let bx = Math.floor(x - hw); bx <= Math.floor(x + hw - 0.001); bx++) if (world.solid(bx, by, bz)) return false;
  return true;
}

/** Axis-separated AABB vs voxel physics with Minecraft-Dungeons-style auto step. */
export function physics(e: Entity, world: World, dt: number) {
  const here = world.get(Math.floor(e.x), Math.floor(e.y + 0.3), Math.floor(e.z));
  e.liquid = BLOCKS[here].liquid ? here : 0;
  if (e.gravity) {
    e.vy -= GRAVITY * e.gravity * (e.liquid ? 0.3 : 1) * dt;
    const max = e.liquid ? 3 : 40;
    if (e.vy < -max) e.vy = -max;
  }
  if (e.noClip) {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.z += e.vz * dt;
    return;
  }
  const hw = e.w / 2;
  e.hitWall = false;
  const wasGround = e.onGround;

  const moveH = (axis: 'x' | 'z', v: number) => {
    if (!v) return;
    const nx = axis === 'x' ? e.x + v * dt : e.x;
    const nz = axis === 'z' ? e.z + v * dt : e.z;
    if (boxFree(world, nx, e.y, nz, hw, e.h)) {
      e.x = nx;
      e.z = nz;
      return;
    }
    // Auto-step up one block
    const sy = Math.floor(e.y) + 1;
    if (e.canStep && wasGround && sy - e.y <= 1.01 && boxFree(world, nx, sy, nz, hw, e.h)) {
      e.stepSmooth += e.y - sy;
      e.y = sy;
      e.x = nx;
      e.z = nz;
      return;
    }
    e.hitWall = true;
    if (axis === 'x') e.vx = 0;
    else e.vz = 0;
  };
  moveH('x', e.vx);
  moveH('z', e.vz);

  const ny = e.y + e.vy * dt;
  e.onGround = false;
  if (boxFree(world, e.x, ny, e.z, hw, e.h)) e.y = ny;
  else {
    if (e.vy < 0) {
      e.y = Math.floor(ny) + 1;
      e.impact = -e.vy;
      e.onGround = true;
    } else e.y = Math.floor(ny + e.h) - e.h - 0.001;
    e.vy = 0;
  }
}
