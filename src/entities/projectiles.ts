import * as THREE from 'three';
import { audio } from '../engine/audio';
import { buildProjectile } from '../gfx/models';
import type { Game } from '../game/game';
import { BLOCKS } from '../world/blocks';
import { Entity } from './entity';

export type ProjKind = 'arrow' | 'bolt' | 'orb' | 'fireball' | 'axe';

export class Projectile extends Entity {
  private life = 6;
  private stuck = 0;
  private spin = 0;
  burnHit = false;
  slowHit = false;
  knock = 0.8;
  private parts: ReturnType<typeof buildProjectile>;

  constructor(
    readonly kind: ProjKind,
    readonly owner: 'player' | 'enemy',
    x: number, y: number, z: number, v: THREE.Vector3,
    public damage: number,
    life = 6,
  ) {
    super();
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = v.x;
    this.vy = v.y;
    this.vz = v.z;
    this.w = kind === 'orb' || kind === 'fireball' ? 0.4 : 0.25;
    this.h = this.w;
    this.life = life;
    this.gravity = kind === 'arrow' || kind === 'bolt' ? 0.35 : kind === 'axe' ? 0.6 : 0;
    this.noClip = true;
    this.hostile = owner === 'enemy';
    this.parts = buildProjectile(kind === 'axe' ? 'axe' : kind);
    this.model = this.parts.m;
    if (kind === 'orb') { this.glow = 4; this.glowColor.set('#3fd0ff'); }
    if (kind === 'fireball') { this.glow = 6; this.glowColor.set('#ff7a1a'); }
  }

  hurt(): boolean {
    return false;
  }

  update(dt: number, g: Game) {
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    if (this.stuck > 0) {
      this.stuck -= dt;
      if (this.stuck <= 0) this.dead = true;
      return;
    }
    this.vy -= 30 * this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    this.spin += dt * 20;

    if (this.kind === 'fireball' && Math.random() < 0.8)
      g.particles.burst(this.x, this.y, this.z, Math.random() < 0.5 ? '#ffb02e' : '#ff5a10', 1, { speed: 0.6, up: 0.5, grav: -1, life: 0.4, collide: false, size: 0.14 }, true);
    if (this.kind === 'orb' && Math.random() < 0.5)
      g.particles.burst(this.x, this.y, this.z, '#5ff0ff', 1, { speed: 0.3, up: 0, grav: 0, life: 0.4, collide: false }, true);

    // Entity hits
    const targets: Entity[] = this.owner === 'enemy' ? [g.player] : g.entities.filter((e) => e.hostile || e.name === 'Boar');
    for (const e of targets) {
      if (e.dead || e instanceof Projectile) continue;
      if (Math.hypot(e.x - this.x, e.z - this.z) < e.w / 2 + this.w && this.y > e.y - 0.2 && this.y < e.y + e.h + 0.2) {
        if (this.owner === 'enemy') {
          g.hurtPlayer(this.damage, this.x - this.vx, this.z - this.vz, this.knock);
          this.hitSomething(g, null);
        } else this.hitSomething(g, e);
        return;
      }
    }
    const id = g.world.get(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
    if (BLOCKS[id].solid) this.hitSomething(g, null, true);
  }

  private hitSomething(g: Game, e: Entity | null, wall = false) {
    if (this.kind === 'fireball') {
      audio.play('boom');
      g.particles.burst(this.x, this.y, this.z, '#ffb02e', 26, { speed: 5, life: 0.5, grav: 2, collide: false, size: 0.16 }, true);
      g.particles.burst(this.x, this.y, this.z, '#3a3030', 10, { speed: 2, life: 1, grav: -1, collide: false, size: 0.2 });
      for (const t of g.entities) {
        if (!t.hostile && t.name !== 'Boar') continue;
        const d = Math.hypot(t.x - this.x, t.y + t.h / 2 - this.y, t.z - this.z);
        if (d < 2.2 && g.damageMob(t, this.damage * (d < 1 ? 1 : 0.7), this.x - this.vx, this.z - this.vz, this.knock)) t.burn = 3;
      }
      g.shake(0.15);
      this.dead = true;
      return;
    }
    if (e) {
      if (g.damageMob(e, this.damage, this.x - this.vx * 0.1, this.z - this.vz * 0.1, this.knock)) {
        if (this.burnHit) e.burn = 3;
        if (this.slowHit) e.slow = 2;
      }
      audio.play('hit');
    }
    if (this.kind === 'axe') {
      g.spawnDrop(this.x - this.vx * 0.02, this.y + 0.2, this.z - this.vz * 0.02, 'throwing_axe', 1, true);
      this.dead = true;
      return;
    }
    if (this.kind === 'orb') {
      g.particles.burst(this.x, this.y, this.z, '#5ff0ff', 12, { speed: 3, life: 0.4, collide: false }, true);
      this.dead = true;
      return;
    }
    if (wall && (this.kind === 'arrow' || this.kind === 'bolt')) {
      this.stuck = 4;
      this.x -= this.vx * 0.012;
      this.y -= this.vy * 0.012;
      this.z -= this.vz * 0.012;
      audio.play('thunk');
      if (this.kind === 'arrow' && Math.random() < 0.5) {
        this.dead = true;
        g.spawnDrop(this.x, this.y, this.z, 'arrow', 1, true);
      }
      return;
    }
    this.dead = true;
  }

  sync(dt: number, g: Game) {
    super.sync(dt, g);
    const r = this.model!.root;
    r.position.set(this.x, this.y, this.z);
    if (this.stuck > 0) return;
    const hz = Math.hypot(this.vx, this.vz);
    r.rotation.set(0, 0, 0);
    r.rotation.y = Math.atan2(this.vx, this.vz);
    this.parts.g.rotation.x = this.kind === 'axe' ? this.spin : -Math.atan2(this.vy, hz);
    if (this.kind === 'orb' || this.kind === 'fireball') this.parts.g.rotation.set(this.spin * 0.3, this.spin * 0.5, 0);
  }
}
