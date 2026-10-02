import * as THREE from 'three';
import { audio } from '../engine/audio';
import { buildBat, buildBoar, buildHollow, buildSlime, buildSpider, buildWolf, type HollowKind, type Humanoid, weaponModel } from '../gfx/models';
import type { Game } from '../game/game';
import { Entity, physics } from './entity';
import { Projectile } from './projectiles';

type Drop = [id: string, min: number, max: number, chance: number];

export abstract class Mob extends Entity {
  /** Bestiary key. */
  kind = 'mob';
  drops: Drop[] = [];
  blood = '#8a8f99';
  damage = 0;
  protected t = Math.random() * 10;
  protected attackCd = 0;
  protected windup = 0;

  constructor() {
    super();
    this.despawnable = true;
  }

  onDeath(g: Game) {
    for (const [id, min, max, chance] of this.drops) {
      if (Math.random() > chance) continue;
      const n = min + Math.floor(Math.random() * (max - min + 1));
      if (n > 0) g.spawnDrop(this.x, this.y + 0.5, this.z, id, n);
    }
    g.particles.burst(this.x, this.y + this.h / 2, this.z, this.blood, 22, { speed: 4, size: 0.12 });
    audio.play('kill');
    g.onMobKilled(this);
  }

  protected toPlayer(g: Game) {
    const p = g.player;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const dist = Math.hypot(dx, dz);
    return { dx, dz, dist, dy: p.y - this.y, yaw: Math.atan2(dx, dz) };
  }

  protected faceTo(yaw: number, dt: number, rate = 10) {
    let d = yaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * rate);
  }

  protected steer(dirX: number, dirZ: number, speed: number, dt: number, accel = 8) {
    const s = speed * (this.slow > 0 ? 0.45 : 1);
    this.vx += (dirX * s - this.vx) * Math.min(1, dt * accel);
    this.vz += (dirZ * s - this.vz) * Math.min(1, dt * accel);
  }

  /** Melee with a visible windup; returns true on the frame the blow lands. */
  protected melee(g: Game, dt: number, range: number, windup: number, cooldown: number): boolean {
    const p = this.toPlayer(g);
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) {
        this.attackCd = cooldown;
        if (p.dist < range + 0.4 && Math.abs(p.dy) < 1.6 && !g.player.dead) {
          g.hurtPlayer(this.damage, this.x, this.z, 1);
          return true;
        }
      }
    } else if (this.attackCd <= 0 && p.dist < range && Math.abs(p.dy) < 1.6) {
      this.windup = windup;
    }
    return false;
  }
}

// ------------------------------------------------------------------ Boar

export class Boar extends Mob {
  private parts = buildBoar();
  private dir = new THREE.Vector2();
  private wander = 0;
  private flee = 0;
  constructor() {
    super();
    this.kind = 'boar';
    this.name = 'Boar';
    this.w = 0.7;
    this.h = 0.9;
    this.hp = this.maxHp = 28;
    this.drops = [['raw_meat', 1, 2, 1], ['hide', 1, 2, 0.85]];
    this.blood = '#a0303a';
    this.model = this.parts.m;
  }

  hurt(a: number, fx: number, fz: number, g: Game, k = 1) {
    const ok = super.hurt(a, fx, fz, g, k);
    if (ok) this.flee = 3;
    return ok;
  }

  update(dt: number, g: Game) {
    this.t += dt;
    let speed = 1.4;
    if (this.flee > 0) {
      this.flee -= dt;
      const p = this.toPlayer(g);
      this.dir.set(-p.dx, -p.dz).normalize();
      speed = 5.5;
    } else if ((this.wander -= dt) <= 0) {
      this.wander = 2 + Math.random() * 3;
      if (Math.random() < 0.35) this.dir.set(0, 0);
      else this.dir.set(Math.random() - 0.5, Math.random() - 0.5).normalize();
    }
    this.steer(this.dir.x, this.dir.y, speed, dt);
    if (this.dir.lengthSq() > 0) this.faceTo(Math.atan2(this.dir.x, this.dir.y), dt, 6);
    if (this.hitWall && this.onGround) this.vy = 8;
    physics(this, g.world, dt);
    this.tick(dt, g);
    const sp = Math.hypot(this.vx, this.vz);
    this.parts.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.t * sp * 3 + (i % 2) * Math.PI) * 0.6 * Math.min(1, sp)));
    this.parts.head.rotation.x = sp < 0.3 ? Math.sin(this.t * 1.5) * 0.2 + 0.2 : 0;
  }
}

// ------------------------------------------------------------------ Blightling

export class Blightling extends Mob {
  private parts = buildSlime();
  private hop = 1;
  constructor() {
    super();
    this.kind = 'blightling';
    this.name = 'Blightling';
    this.w = 0.7;
    this.h = 0.6;
    this.hp = this.maxHp = 22;
    this.hostile = true;
    this.damage = 9;
    this.drops = [['gel', 1, 2, 1]];
    this.blood = '#9a6ad0';
    this.model = this.parts.m;
  }

  update(dt: number, g: Game) {
    this.t += dt;
    const p = this.toPlayer(g);
    if (this.onGround) {
      this.vx *= Math.pow(0.001, dt);
      this.vz *= Math.pow(0.001, dt);
      if ((this.hop -= dt) <= 0) {
        const chase = p.dist < 16;
        const a = chase ? p.yaw : Math.random() * Math.PI * 2;
        const sp = chase ? 4 + Math.random() * 1.5 : 2;
        this.vx = Math.sin(a) * sp;
        this.vz = Math.cos(a) * sp;
        this.vy = 7 + Math.random() * 2;
        this.yaw = a;
        this.hop = 0.8 + Math.random() * 1.2;
      }
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.attackCd <= 0 && this.overlaps(g.player, 0.1)) {
      g.hurtPlayer(this.damage, this.x, this.z, 1);
      this.attackCd = 0.8;
    }
    physics(this, g.world, dt);
    this.tick(dt, g);
    const sy = this.onGround ? 0.85 + Math.sin(this.t * 6) * 0.05 : 1.18;
    this.parts.body.scale.set(2 - sy, sy, 2 - sy);
  }
}

// ------------------------------------------------------------------ Hollow (+ shrine wardens)

export class Hollow extends Mob {
  protected parts: Humanoid;
  protected walk = 0;
  protected speed: number;
  constructor(readonly variant: HollowKind = 'hollow', readonly guardian = false) {
    super();
    const strong = variant !== 'hollow';
    this.kind = strong ? 'warden' : 'hollow';
    this.name = strong ? `${variant[0].toUpperCase()}${variant.slice(1)} Warden` : 'Hollow';
    this.parts = buildHollow(variant, strong ? 1.15 : 1);
    this.model = this.parts.m;
    this.w = 0.6;
    this.h = strong ? 2 : 1.8;
    this.hp = this.maxHp = strong ? 110 : 45;
    this.hostile = true;
    this.damage = strong ? 18 : 12;
    this.speed = strong ? 3.6 : 3;
    this.glow = 2.2;
    this.glowColor.set(strong ? '#ff9a50' : '#3fc8e8');
    this.blood = strong ? '#e8dcc0' : '#c9cfd8';
    this.drops = strong
      ? [['bone', 2, 4, 1], ['iron_bar', 1, 3, 0.7], ['gold_bar', 1, 2, 0.4], ['blood_tonic', 1, 1, 0.5]]
      : [['bone', 1, 2, 0.75], ['coal', 1, 2, 0.3], ['arrow', 1, 3, 0.2]];
    if (guardian) this.despawnable = false;
    if (strong) this.parts.hand.add(weaponModel(this.parts.m, variant === 'frost' ? 'rime_spear' : 'iron_cleaver'));
  }

  update(dt: number, g: Game) {
    this.t += dt;
    const p = this.toPlayer(g);
    const chase = p.dist < 24 && !g.player.dead;
    if (chase && this.windup <= 0) {
      if (p.dist > 1.1) this.steer(p.dx / p.dist, p.dz / p.dist, this.speed, dt);
      else this.steer(0, 0, 0, dt);
      this.faceTo(p.yaw, dt);
    } else if (!chase) this.steer(Math.sin(this.t * 0.3), Math.cos(this.t * 0.3), 0.8, dt);
    else this.steer(0, 0, 0, dt);
    if (this.hitWall && this.onGround) this.vy = 8.5;
    if (this.melee(g, dt, 1.5, 0.38, 1.1)) audio.play('hit');
    physics(this, g.world, dt);
    this.walk += Math.hypot(this.vx, this.vz) * dt * 2.2;
    this.tick(dt, g);
    this.sunburn(dt, g);
    this.pose();
  }

  protected sunburn(dt: number, g: Game) {
    if (this.guardian || g.sunlightAt(this.x, this.y + 1.6, this.z) < 0.6) return;
    this.hp -= 16 * dt;
    if (Math.random() < dt * 12) g.particles.burst(this.x, this.y + 1.7, this.z, '#3a3a40', 1, { speed: 0.4, up: 1.5, grav: -1, life: 1.2, collide: false });
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      g.particles.burst(this.x, this.y + 1, this.z, '#55555f', 26, { speed: 1.5, grav: -1, life: 1.4 });
    }
  }

  protected pose() {
    const h = this.parts;
    const s = Math.sin(this.walk);
    h.legL.rotation.x = s * 0.7;
    h.legR.rotation.x = -s * 0.7;
    const strike = this.windup > 0 ? -2.6 : this.attackCd > 0.8 ? -0.6 : -1.45;
    h.armR.rotation.x = strike + Math.sin(this.t * 3) * 0.08;
    h.armL.rotation.x = -1.35 + Math.cos(this.t * 3) * 0.08;
    h.head.rotation.z = Math.sin(this.t * 1.3) * 0.1;
  }
}

export class HollowArcher extends Hollow {
  private shootCd = 1.5;
  constructor() {
    super('hollow');
    this.kind = 'archer';
    this.name = 'Hollow Archer';
    this.hp = this.maxHp = 34;
    this.drops = [['bone', 1, 2, 0.7], ['arrow', 2, 5, 0.8]];
    this.parts.hand.add(weaponModel(this.parts.m, 'hunting_bow'));
  }

  update(dt: number, g: Game) {
    this.t += dt;
    const p = this.toPlayer(g);
    const chase = p.dist < 26 && !g.player.dead;
    if (chase) {
      this.faceTo(p.yaw, dt);
      const want = p.dist < 6 ? -1 : p.dist > 11 ? 1 : 0;
      this.steer((p.dx / p.dist) * want, (p.dz / p.dist) * want, 2.6, dt);
      if ((this.shootCd -= dt) <= 0 && p.dist < 18) {
        this.shootCd = 2 + Math.random();
        const t = p.dist / 16;
        const tx = g.player.x + g.player.vx * t;
        const tz = g.player.z + g.player.vz * t;
        const ty = g.player.y + 1.1;
        const sx = this.x + Math.sin(this.yaw) * 0.5;
        const sz = this.z + Math.cos(this.yaw) * 0.5;
        const sy = this.y + 1.4;
        const d = Math.hypot(tx - sx, tz - sz);
        const v = new THREE.Vector3(tx - sx, ty - sy + d * 0.08, tz - sz).normalize().multiplyScalar(16);
        g.addEntity(new Projectile('bolt', 'enemy', sx, sy, sz, v, 10, 6));
        audio.play('bow');
      }
    } else this.steer(0, 0, 0, dt);
    if (this.hitWall && this.onGround) this.vy = 8.5;
    physics(this, g.world, dt);
    this.walk += Math.hypot(this.vx, this.vz) * dt * 2.2;
    this.tick(dt, g);
    this.sunburn(dt, g);
    const h = this.parts;
    const s = Math.sin(this.walk);
    h.legL.rotation.x = s * 0.7;
    h.legR.rotation.x = -s * 0.7;
    h.armR.rotation.x = chase ? -1.5 : -0.2;
    h.armL.rotation.x = chase ? -1.5 : 0.1;
  }
}

// ------------------------------------------------------------------ Ash wolf

export class AshWolf extends Mob {
  private parts = buildWolf();
  private lunge = 0;
  constructor() {
    super();
    this.kind = 'wolf';
    this.name = 'Ash Wolf';
    this.w = 0.6;
    this.h = 0.9;
    this.hp = this.maxHp = 36;
    this.hostile = true;
    this.damage = 11;
    this.glow = 1.5;
    this.glowColor.set('#ff7a2a');
    this.drops = [['fang', 1, 1, 0.6], ['raw_meat', 1, 1, 0.5], ['hide', 1, 1, 0.4]];
    this.blood = '#6a2a2a';
    this.model = this.parts.m;
  }

  update(dt: number, g: Game) {
    this.t += dt;
    const p = this.toPlayer(g);
    if (this.attackCd > 0) this.attackCd -= dt;
    if (p.dist < 26 && !g.player.dead) {
      this.faceTo(p.yaw, dt, 12);
      if (this.lunge > 0) {
        this.lunge -= dt;
        if (this.overlaps(g.player, 0.2) && this.attackCd <= 0) {
          g.hurtPlayer(this.damage, this.x, this.z, 1);
          this.attackCd = 1.2;
          audio.play('bite');
        }
      } else {
        // Circle in, then pounce
        const side = Math.sin(this.t * 0.9 + this.x) > 0 ? 1 : -1;
        const tang = p.dist > 6 ? 0 : 0.6 * side;
        const dx = p.dx / p.dist;
        const dz = p.dz / p.dist;
        this.steer(dx - dz * tang, dz + dx * tang, 6.4, dt);
        if (p.dist < 4 && this.attackCd <= 0 && this.onGround) {
          this.lunge = 0.6;
          this.vx = dx * 11;
          this.vz = dz * 11;
          this.vy = 6;
          audio.play('growl');
        }
      }
    } else this.steer(0, 0, 0, dt);
    if (this.hitWall && this.onGround) this.vy = 8.5;
    physics(this, g.world, dt);
    this.tick(dt, g);
    const sp = Math.hypot(this.vx, this.vz);
    this.parts.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.t * 14 + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.6) * 0.8 * Math.min(1, sp / 3)));
    this.parts.tail.rotation.y = Math.sin(this.t * 8) * 0.4;
    this.parts.body.rotation.x = this.lunge > 0 ? -0.3 : 0;
  }
}

// ------------------------------------------------------------------ Gloomcrawler spider

export class Spider extends Mob {
  private parts = buildSpider();
  constructor() {
    super();
    this.kind = 'spider';
    this.name = 'Gloomcrawler';
    this.w = 0.9;
    this.h = 0.7;
    this.hp = this.maxHp = 30;
    this.hostile = true;
    this.damage = 9;
    this.drops = [['silk', 1, 2, 0.9]];
    this.blood = '#5a8a3a';
    this.model = this.parts.m;
  }

  update(dt: number, g: Game) {
    this.t += dt;
    const p = this.toPlayer(g);
    if (p.dist < 20 && !g.player.dead) {
      this.faceTo(p.yaw, dt, 8);
      if (p.dist > 1.2) this.steer(p.dx / p.dist, p.dz / p.dist, 5, dt);
      if (this.onGround && p.dist < 3.5 && this.attackCd <= 0 && Math.random() < dt * 3) {
        this.vy = 7;
        this.vx = (p.dx / p.dist) * 8;
        this.vz = (p.dz / p.dist) * 8;
      }
    } else this.steer(0, 0, 0, dt);
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.attackCd <= 0 && this.overlaps(g.player, 0.15)) {
      g.hurtPlayer(this.damage, this.x, this.z, 0.8);
      g.player.slow = 1.5;
      this.attackCd = 1;
      audio.play('bite');
    }
    if (this.hitWall && this.onGround) this.vy = 9;
    physics(this, g.world, dt);
    this.tick(dt, g);
    const sp = Math.min(1, Math.hypot(this.vx, this.vz) / 3);
    this.parts.legs.forEach((l, i) => (l.rotation.y = Math.sin(this.t * 18 + i * 1.3) * 0.35 * sp));
  }
}

// ------------------------------------------------------------------ Gloom bat

export class Bat extends Mob {
  private parts = buildBat();
  constructor() {
    super();
    this.kind = 'bat';
    this.name = 'Gloom Bat';
    this.w = 0.5;
    this.h = 0.4;
    this.hp = this.maxHp = 14;
    this.hostile = true;
    this.damage = 6;
    this.gravity = 0;
    this.canStep = false;
    this.drops = [['gel', 0, 1, 0.5]];
    this.blood = '#5a4070';
    this.model = this.parts.m;
  }

  update(dt: number, g: Game) {
    this.t += dt;
    const p = this.toPlayer(g);
    const near = p.dist < 18;
    const tx = near ? (p.dx / (p.dist || 1)) * 4.5 : Math.sin(this.t * 0.7) * 2;
    const tz = near ? (p.dz / (p.dist || 1)) * 4.5 : Math.cos(this.t * 0.5) * 2;
    const ty = (near ? (g.player.y + 1.4 - this.y) * 2 : 0) + Math.sin(this.t * 6) * 2.5;
    this.vx += (tx - this.vx) * Math.min(1, dt * 2.5);
    this.vz += (tz - this.vz) * Math.min(1, dt * 2.5);
    this.vy += (ty - this.vy) * Math.min(1, dt * 3);
    physics(this, g.world, dt);
    if (this.hitWall) {
      this.vx = -this.vx;
      this.vz = -this.vz;
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.attackCd <= 0 && this.overlaps(g.player, 0.1)) {
      g.hurtPlayer(this.damage, this.x, this.z, 0.5);
      this.attackCd = 1;
    }
    this.faceTo(Math.atan2(this.vx, this.vz), dt);
    this.tick(dt, g);
    const flap = Math.sin(this.t * 22) * 0.8;
    this.parts.wings[0].rotation.z = flap;
    this.parts.wings[1].rotation.z = -flap;
    this.parts.body.position.y = 0.2;
  }
}
