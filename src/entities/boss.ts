import * as THREE from 'three';
import { audio } from '../engine/audio';
import { buildBoss } from '../gfx/models';
import type { Game } from '../game/game';
import { Hollow, HollowArcher, Mob } from './mobs';
import { Projectile } from './projectiles';

type State = 'intro' | 'hover' | 'volley' | 'ring' | 'slam' | 'dash';

/**
 * The Hollow King: a crowned skull with two floating hands.
 * Volleys of orbs, telegraphed hand slams, a charging dash, and it calls
 * its children at 66% and 33% health. Below half health it enrages.
 */
export class HollowKing extends Mob {
  private parts = buildBoss();
  private state: State = 'intro';
  private timer = 3.2;
  private shots = 0;
  private summoned = 0;
  private slamAt = new THREE.Vector3();
  private slamPhase = 0;
  private dashDir = new THREE.Vector2();
  private orbit = Math.random() * 6;

  constructor() {
    super();
    this.kind = 'king';
    this.name = 'The Hollow King';
    this.w = 1.7;
    this.h = 1.8;
    this.hp = this.maxHp = 1400;
    this.hostile = true;
    this.damage = 22;
    this.gravity = 0;
    this.noClip = true;
    this.knockResist = 1;
    this.despawnable = false;
    this.glow = 7;
    this.glowColor.set('#3fd0ff');
    this.blood = '#d8dde6';
    this.drops = [['hollow_crown', 1, 1, 1], ['ember_shard', 12, 16, 1], ['gold_bar', 5, 8, 1]];
    this.model = this.parts.m;
  }

  get enraged() { return this.hp < this.maxHp * 0.5; }

  update(dt: number, g: Game) {
    this.t += dt;
    this.timer -= dt;
    const p = g.player;
    const ground = g.world.top(Math.floor(p.x), Math.floor(p.z));
    this.orbit += dt * (this.enraged ? 0.7 : 0.45);
    const hx = p.x + Math.cos(this.orbit) * 6;
    const hz = p.z + Math.sin(this.orbit) * 6;
    const hy = Math.max(ground, p.y) + 3.6 + Math.sin(this.t * 1.7) * 0.4;

    const toward = (tx: number, ty: number, tz: number, k: number) => {
      this.vx += ((tx - this.x) * 2 - this.vx) * Math.min(1, dt * k);
      this.vy += ((ty - this.y) * 2 - this.vy) * Math.min(1, dt * k);
      this.vz += ((tz - this.z) * 2 - this.vz) * Math.min(1, dt * k);
    };

    switch (this.state) {
      case 'intro':
        toward(this.x, hy, this.z, 1);
        if (Math.random() < 0.5) g.particles.burst(this.x, this.y, this.z, '#1a1d24', 2, { speed: 1, grav: -1, life: 1.5, collide: false, size: 0.25 });
        if (this.timer <= 0) this.next();
        break;
      case 'hover':
        toward(hx, hy, hz, 3);
        if (this.timer <= 0) this.next();
        break;
      case 'volley':
        toward(hx, hy, hz, 3);
        if (this.timer <= 0) {
          if (this.shots-- > 0) {
            const tgt = new THREE.Vector3(p.x + (Math.random() - 0.5) * 1.5, p.y + 1, p.z + (Math.random() - 0.5) * 1.5);
            const v = tgt.sub(new THREE.Vector3(this.x, this.y + 0.6, this.z)).normalize().multiplyScalar(this.enraged ? 10 : 8);
            g.addEntity(new Projectile('orb', 'enemy', this.x, this.y + 0.6, this.z, v, 13, 5));
            audio.play('orb');
            this.timer = this.enraged ? 0.16 : 0.26;
          } else this.next();
        }
        break;
      case 'ring':
        this.vx *= 0.9;
        this.vy *= 0.9;
        this.vz *= 0.9;
        if (this.timer <= 0) {
          const n = 16;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + this.t;
            g.addEntity(new Projectile('orb', 'enemy', this.x, this.y + 0.4, this.z, new THREE.Vector3(Math.cos(a) * 6.5, -1.2, Math.sin(a) * 6.5), 12, 4));
          }
          audio.play('boss');
          this.state = 'hover';
          this.timer = 1.6;
        }
        break;
      case 'slam': {
        toward(hx, hy, hz, 2);
        // Phase 0: hand rises above the target (telegraph), 1: slams down
        if (this.slamPhase === 0 && this.timer <= 0) {
          this.slamPhase = 1;
          this.timer = 0.18;
        } else if (this.slamPhase === 1 && this.timer <= 0) {
          this.slamPhase = 2;
          this.timer = 0.9;
          audio.play('boom');
          g.shake(0.45);
          g.particles.burst(this.slamAt.x, this.slamAt.y + 0.2, this.slamAt.z, '#8a7a6a', 30, { speed: 6, size: 0.18, up: 4 });
          if (Math.hypot(p.x - this.slamAt.x, p.z - this.slamAt.z) < 2.4 && p.y - this.slamAt.y < 1.5) g.hurtPlayer(this.enraged ? 26 : 20, this.slamAt.x, this.slamAt.z, 2);
        } else if (this.slamPhase === 2 && this.timer <= 0) this.next();
        break;
      }
      case 'dash':
        if (this.timer > 0.9) {
          // windup: shudder and glare
          this.vx *= 0.85;
          this.vz *= 0.85;
          toward(this.x, p.y + 1.2, this.z, 2);
        } else {
          this.vx = this.dashDir.x * (this.enraged ? 15 : 12);
          this.vz = this.dashDir.y * (this.enraged ? 15 : 12);
          this.vy = (p.y + 0.9 - this.y) * 3;
          if (this.overlaps(p, 0.3)) g.hurtPlayer(this.damage, this.x, this.z, 2);
        }
        if (this.timer <= 0) {
          this.state = 'hover';
          this.timer = 1.2;
        }
        break;
    }

    const marks = [0.66, 0.33];
    if (this.summoned < marks.length && this.hp < this.maxHp * marks[this.summoned]) {
      this.summoned++;
      for (let i = 0; i < 4; i++) {
        const h = i === 3 ? new HollowArcher() : new Hollow('hollow', true);
        const a = (i / 4) * Math.PI * 2;
        h.x = p.x + Math.cos(a) * 5;
        h.z = p.z + Math.sin(a) * 5;
        h.y = g.world.top(Math.floor(h.x), Math.floor(h.z)) + 0.1;
        h.despawnable = false;
        g.addEntity(h);
        g.particles.burst(h.x, h.y + 1, h.z, '#5ff0ff', 24, { speed: 3 }, true);
      }
      g.say([{ who: 'vesh', text: 'He calls his children! Cut them down, Urka!' }]);
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    this.faceTo(Math.atan2(p.x - this.x, p.z - this.z), dt, 4);
    this.tick(dt, g);
    this.animate(g);
  }

  private next() {
    const r = Math.random();
    const p = this.enraged;
    if (r < 0.32) {
      this.state = 'volley';
      this.shots = p ? 10 : 6;
      this.timer = 0.4;
    } else if (r < 0.58) {
      this.state = 'slam';
      this.slamPhase = 0;
      this.timer = p ? 0.8 : 1.1;
    } else if (r < 0.8) {
      this.state = 'dash';
      this.timer = 1.6;
    } else if (r < 0.92 || !p) {
      this.state = p ? 'ring' : 'hover';
      this.timer = p ? 0.9 : 1.2;
    } else {
      this.state = 'ring';
      this.timer = 0.9;
    }
    if (this.state === 'dash') this.dashPrep = true;
  }

  private dashPrep = false;

  private animate(g: Game) {
    const p = g.player;
    if (this.dashPrep) {
      this.dashPrep = false;
      this.dashDir.set(p.x - this.x, p.z - this.z).normalize();
    }
    const { jaw, hands, body } = this.parts;
    jaw.rotation.x = this.state === 'volley' || this.state === 'ring' ? 0.35 + Math.sin(this.t * 20) * 0.1 : 0.08 + Math.sin(this.t * 2) * 0.05;
    body.position.y = Math.sin(this.t * 2) * 0.1;
    body.rotation.z = this.state === 'dash' && this.timer > 0.9 ? (Math.random() - 0.5) * 0.15 : 0;
    // Hands: idle float, or the slam hand tracks the target then drops.
    const local = (wx: number, wy: number, wz: number) => this.model!.root.worldToLocal(new THREE.Vector3(wx, wy, wz));
    hands.forEach((hnd, i) => {
      const s = i ? 1 : -1;
      if (this.state === 'slam' && i === 1) {
        if (this.slamPhase === 0) this.slamAt.set(p.x, g.world.top(Math.floor(p.x), Math.floor(p.z)), p.z);
        const y = this.slamPhase === 0 ? this.slamAt.y + 3 : this.slamAt.y + 0.1;
        const lp = local(this.slamAt.x, y, this.slamAt.z);
        hnd.position.lerp(lp, this.slamPhase === 0 ? 0.15 : 0.6);
        hnd.rotation.set(0, 0, 0);
      } else {
        hnd.position.lerp(new THREE.Vector3(s * 1.6, 0.2 + Math.sin(this.t * 2 + i) * 0.25, 0.5), 0.1);
        hnd.rotation.set(0.3, 0, s * 0.3);
      }
    });
  }

  onDeath(g: Game) {
    g.particles.burst(this.x, this.y + 0.8, this.z, '#d8dde6', 70, { speed: 7, life: 1.6, size: 0.2 });
    g.particles.burst(this.x, this.y + 0.8, this.z, '#5ff0ff', 70, { speed: 8, life: 1.6, grav: 0, collide: false }, true);
    super.onDeath(g);
  }
}
