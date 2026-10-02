import * as THREE from 'three';
import { audio } from '../engine/audio';
import { buildOrc, type Humanoid, setArmor, weaponModel } from '../gfx/models';
import type { Game } from '../game/game';
import type { WeaponType } from '../game/items';
import { B, BLOCKS } from '../world/blocks';
import { Entity, physics } from './entity';

export type ActionType = WeaponType | 'mine' | 'use';

interface Action { type: ActionType; t: number; dur: number; hitAt: number; hit?: () => void; done: boolean }

export class Player extends Entity {
  readonly body: Humanoid;
  private inner = new THREE.Group();
  action: Action | null = null;
  /** Bow draw progress 0..1 while holding the button. */
  draw = -1;
  roll = 0;
  rollCd = 0;
  private rollDir = new THREE.Vector2();
  private walk = 0;
  private coyote = 0;
  private regenDelay = 0;
  private hurtTick = 0;
  private heldId: string | null = '__';
  private armorKey = '';
  private moveYaw = 0;
  aimYaw = 0;
  aiming = false;

  constructor() {
    super();
    this.w = 0.6;
    this.h = 1.8;
    this.hp = this.maxHp = 100;
    this.knockResist = 0.3;
    this.glow = 4;
    this.glowColor.setRGB(0.9, 0.6, 0.35);
    this.body = buildOrc();
    this.model = this.body.m;
    // Re-parent the parts around the body centre so the dodge roll spins nicely.
    const r = this.model.root;
    const off = new THREE.Group();
    off.position.y = -0.9;
    while (r.children.length) off.add(r.children[0]);
    this.inner.position.y = 0.9;
    this.inner.add(off);
    r.add(this.inner);
  }

  get busy() {
    return !!this.action && !this.action.done;
  }

  startAction(type: ActionType, dur: number, hitFrac: number, hit?: () => void) {
    this.action = { type, t: 0, dur, hitAt: dur * hitFrac, hit, done: false };
    if (type !== 'bow' && type !== 'use') audio.play('swing');
  }

  update(dt: number, g: Game) {
    const inp = g.input;
    const live = g.acceptsGameInput();
    const inv = g.inventory;
    const speedMul = (inv.charm() === 'swift' ? 1.18 : 1) * (this.slow > 0 ? 0.55 : 1) * (this.draw >= 0 ? 0.5 : 1);

    // Movement intent, relative to the camera
    let mx = 0;
    let mz = 0;
    if (live) {
      const { f, r } = g.scene.axes();
      const fw = (inp.down('KeyW', 'ArrowUp') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown') ? 1 : 0);
      const rt = (inp.down('KeyD', 'ArrowRight') ? 1 : 0) - (inp.down('KeyA', 'ArrowLeft') ? 1 : 0);
      mx = f.x * fw + r.x * rt;
      mz = f.y * fw + r.y * rt;
      const l = Math.hypot(mx, mz);
      if (l > 0) {
        mx /= l;
        mz /= l;
      }
    }

    if (this.rollCd > 0) this.rollCd -= dt;
    if (live && inp.hit('ShiftLeft', 'ShiftRight') && this.roll <= 0 && this.rollCd <= 0 && this.onGround) {
      this.roll = 0.42;
      this.rollCd = inv.charm() === 'swift' ? 0.6 : 0.85;
      const dir = mx || mz ? new THREE.Vector2(mx, mz) : new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
      this.rollDir.copy(dir.normalize());
      this.invuln = Math.max(this.invuln, 0.42);
      this.draw = -1;
      audio.play('roll');
    }

    const maxV = (this.liquid ? 2.6 : 4.8) * speedMul;
    if (this.roll > 0) {
      this.roll -= dt;
      this.vx = this.rollDir.x * 10;
      this.vz = this.rollDir.y * 10;
    } else {
      const k = Math.min(1, dt * (this.onGround ? 14 : 5));
      this.vx += (mx * maxV - this.vx) * k;
      this.vz += (mz * maxV - this.vz) * k;
    }

    if (mx || mz) this.moveYaw = Math.atan2(mx, mz);
    const wantYaw = this.aiming || this.busy ? this.aimYaw : this.roll > 0 ? Math.atan2(this.rollDir.x, this.rollDir.y) : this.moveYaw;
    let d = wantYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * (this.aiming || this.busy ? 25 : 12));

    this.coyote = this.onGround ? 0.1 : this.coyote - dt;
    if (live && inp.hit('Space') && this.coyote > 0 && !this.liquid) {
      this.vy = 9.2;
      this.coyote = 0;
      audio.play('jump');
    }
    if (this.liquid && live && inp.down('Space')) this.vy = Math.min(this.vy + 40 * dt, 4);

    physics(this, g.world, dt);

    if (this.impact > 16) g.hurtPlayer((this.impact - 16) * 3, this.x, this.z, 0);
    this.impact = 0;

    // Environmental damage: lava and cactus
    this.hurtTick -= dt;
    if (this.hurtTick <= 0) {
      const fireproof = inv.fireproof();
      let dmg = 0;
      if (this.liquid === B.LAVA && !fireproof) {
        dmg = 12;
        this.burn = 3;
      }
      const hw = this.w / 2 + 0.08;
      for (const [ox, oz] of [[hw, 0], [-hw, 0], [0, hw], [0, -hw]]) {
        const id = g.world.get(Math.floor(this.x + ox), Math.floor(this.y + 0.5), Math.floor(this.z + oz));
        if (BLOCKS[id].hurts && id !== B.LAVA) dmg = Math.max(dmg, BLOCKS[id].hurts!);
      }
      if (dmg) {
        g.hurtPlayer(dmg, this.x - this.vx, this.z - this.vz, 0.3);
        this.hurtTick = 0.4;
      }
    }
    if (this.liquid === B.LAVA && inv.fireproof()) this.burn = 0;

    // Action timeline
    const a = this.action;
    if (a && !a.done) {
      const prev = a.t;
      a.t += dt;
      if (prev < a.hitAt && a.t >= a.hitAt) a.hit?.();
      if (a.t >= a.dur) a.done = true;
    }

    this.walk += Math.hypot(this.vx, this.vz) * dt * 2.2;
    this.tick(dt, g);

    this.regenDelay -= dt;
    if (this.regenDelay <= 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + (inv.charm() === 'regen' ? 5 : 2.5) * dt);

    // Visual state
    this.refreshGear(g);
    const held = inv.held;
    const hl = held ? (g.inventory.def(held.id).light ?? 0) : 0;
    this.glow = hl ? 8 + Math.sin(g.clock * 13) * 0.25 + Math.sin(g.clock * 7) * 0.2 : 4.5;
    this.animate(dt, g.clock);
  }

  private refreshGear(g: Game) {
    const held = g.inventory.held;
    const id = held && ['tool', 'weapon', 'relic'].includes(g.inventory.def(held.id).kind) ? held.id : held?.id === 'torch' ? 'torch' : null;
    if (id !== this.heldId) {
      this.heldId = id;
      const hand = this.body.hand;
      while (hand.children.length) hand.remove(hand.children[0]);
      hand.add(weaponModel(this.body.m, id));
    }
    const eq = g.inventory.equip;
    const key = `${eq.head?.id}|${eq.chest?.id}|${eq.feet?.id}`;
    if (key !== this.armorKey) {
      this.armorKey = key;
      setArmor(this.body, 'head', eq.head?.id ?? null);
      setArmor(this.body, 'chest', eq.chest?.id ?? null);
      setArmor(this.body, 'feet', eq.feet?.id ?? null);
    }
  }

  hurt(amount: number, fromX: number, fromZ: number, g: Game, knock = 1): boolean {
    if (this.invuln > 0 || this.dead) return false;
    const ok = super.hurt(amount, fromX, fromZ, g, knock);
    if (ok) {
      this.invuln = 0.6;
      this.regenDelay = 6;
      this.draw = -1;
      audio.play('hurt');
      g.shake(0.25);
      g.ui.damageFlash();
    }
    return ok;
  }

  onDeath(g: Game) {
    g.onPlayerDeath();
  }

  private animate(dt: number, clock: number) {
    const h = this.body;
    const moving = Math.hypot(this.vx, this.vz) > 0.4 && this.onGround;
    const s = Math.sin(this.walk);
    const k = Math.min(1, dt * 14);
    const ease = (cur: number, to: number) => cur + (to - cur) * k;
    let legL = 0;
    let armR = -0.2;
    let armL = 0.1;
    let twist = 0;
    let lean = 0;
    let bob = Math.sin(clock * 2.2) * 0.012;
    if (moving) {
      legL = s * 0.8;
      armR = -s * 0.6 - 0.2;
      armL = s * 0.6;
      bob = Math.abs(Math.cos(this.walk)) * 0.06;
      lean = 0.08;
    } else if (!this.onGround && !this.liquid) {
      legL = 0.5;
      armR = -1;
      armL = -0.8;
    }

    const a = this.action;
    if (a && !a.done) {
      const p = a.t / a.dur;
      const e = 1 - Math.pow(1 - Math.min(1, p / 0.55), 3);
      switch (a.type) {
        case 'swing':
        case 'mine':
          armR = -2.9 + e * 2.6;
          twist = 0.5 - e * 1.0;
          break;
        case 'dagger':
          armR = -1.2 - Math.sin(p * Math.PI) * 0.5;
          twist = -Math.sin(p * Math.PI) * 0.3;
          break;
        case 'thrust':
          armR = -1.57;
          lean = 0.15 + Math.sin(p * Math.PI) * 0.25;
          twist = -0.3;
          break;
        case 'smash': {
          const wind = Math.min(1, p / 0.45);
          const slam = Math.max(0, (p - 0.45) / 0.2);
          armR = armL = -3.1 + Math.min(1, slam) * 2.6 - (1 - wind) * 0.2;
          lean = Math.min(1, slam) * 0.35;
          break;
        }
        case 'throw':
          armR = -3.0 + e * 2.4;
          twist = 0.4 - e * 0.8;
          break;
        case 'staff':
          armR = -1.9 - Math.sin(p * Math.PI) * 0.4;
          break;
        case 'use':
          armR = -1.2;
          break;
      }
    }
    if (this.draw >= 0) {
      armL = -1.57;
      armR = -1.45;
      twist = -0.35 * Math.min(1, this.draw);
    }
    h.legL.rotation.x = ease(h.legL.rotation.x, legL);
    h.legR.rotation.x = ease(h.legR.rotation.x, -legL);
    h.armR.rotation.x = a && !a.done ? armR : ease(h.armR.rotation.x, armR);
    h.armL.rotation.x = ease(h.armL.rotation.x, armL);
    h.body.rotation.y = ease(h.body.rotation.y, twist);
    h.body.rotation.x = ease(h.body.rotation.x, lean);
    h.body.position.y = 0.72 + bob;
    this.inner.rotation.x = this.roll > 0 ? (1 - this.roll / 0.42) * Math.PI * 2 : 0;
    this.inner.position.y = 0.9 - (this.roll > 0 ? 0.35 : 0);
  }
}
