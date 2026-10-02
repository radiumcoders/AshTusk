/** Item drops and the two story props (the totem and the Worldforge). */
import * as THREE from 'three';
import { audio } from '../engine/audio';
import { itemIcon } from '../gfx/icons';
import { buildForge, buildTotem } from '../gfx/models';
import type { Game } from '../game/game';
import { Entity, physics } from './entity';

const spriteMats = new Map<string, THREE.SpriteMaterial>();
function spriteMat(id: string) {
  let m = spriteMats.get(id);
  if (!m) {
    const t = new THREE.CanvasTexture(itemIcon(id));
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map: t, alphaTest: 0.4, fog: false });
    spriteMats.set(id, m);
  }
  return m;
}

export class ItemDrop extends Entity {
  private age = 0;
  private sprite: THREE.Sprite;
  readonly root = new THREE.Group();

  constructor(readonly id: string, public n: number, x: number, y: number, z: number, gentle = false) {
    super();
    this.w = 0.3;
    this.h = 0.3;
    this.x = x;
    this.y = y;
    this.z = z;
    const a = Math.random() * Math.PI * 2;
    const s = gentle ? 0.4 : 1.6;
    this.vx = Math.cos(a) * s;
    this.vz = Math.sin(a) * s;
    this.vy = gentle ? 1 : 5;
    this.canStep = false;
    this.sprite = new THREE.Sprite(spriteMat(id));
    this.sprite.scale.set(0.5, 0.5, 0.5);
    this.root.add(this.sprite);
  }

  get obj() { return this.root; }

  hurt(): boolean {
    return false;
  }

  update(dt: number, g: Game) {
    this.age += dt;
    const p = g.player;
    const dx = p.x - this.x;
    const dy = p.y + 0.8 - this.y;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dy, dz);
    if (this.age > 0.5 && d < 2.6 && !p.dead && g.inventory.canFit(this.id)) {
      this.noClip = true;
      this.gravity = 0;
      const k = 26 * dt;
      this.vx += (dx / d) * k * 3;
      this.vy += (dy / d) * k * 3;
      this.vz += (dz / d) * k * 3;
      this.vx *= 0.88;
      this.vy *= 0.88;
      this.vz *= 0.88;
      if (d < 0.6) {
        const left = g.inventory.add(this.id, this.n);
        if (left < this.n) {
          audio.play('pickup');
          g.ui.pickup(this.id, this.n - left);
          g.onPickup(this.id, this.n - left);
        }
        this.n = left;
        if (!left) this.dead = true;
      }
    } else {
      this.noClip = false;
      this.gravity = 1;
      if (this.onGround) {
        this.vx *= 0.85;
        this.vz *= 0.85;
      }
    }
    physics(this, g.world, dt);
    if (this.age > 300) this.dead = true;
  }

  sync(_dt: number, g: Game) {
    this.root.position.set(this.x, this.y + 0.3 + Math.sin(this.age * 3) * 0.08, this.z);
    const l = g.world.light(Math.floor(this.x), Math.floor(this.y + 0.3), Math.floor(this.z));
    const b = Math.max(0.25, Math.pow(0.8, 15 - Math.max(l >> 4, l & 15)));
    this.sprite.material.color.setScalar(1);
    this.sprite.scale.setScalar(0.5 + Math.sin(this.age * 4) * 0.02);
    this.sprite.material.opacity = 1;
    this.sprite.material.color.setScalar(b);
  }

  dispose() {
    this.root.removeFromParent();
  }
}

export interface Interactable {
  prompt(g: Game): string;
  interact(g: Game): void;
}

export class Totem extends Entity implements Interactable {
  private t = 0;
  constructor(x: number, y: number, z: number) {
    super();
    this.x = x + 0.5;
    this.y = y;
    this.z = z + 0.5;
    this.w = 0.8;
    this.h = 3;
    this.gravity = 0;
    this.noClip = true;
    this.glow = 5;
    this.glowColor.set('#5fffc4');
    this.model = buildTotem().m;
    this.yaw = Math.PI / 4;
  }
  hurt(): boolean { return false; }
  prompt() { return 'Speak with Old Mother Vesh'; }
  interact(g: Game) { g.story.talkToTotem(); }
  update(dt: number, g: Game) {
    this.t += dt;
    this.glow = 5 + Math.sin(this.t * 2) * 0.6;
    if (Math.random() < dt * 4)
      g.particles.burst(this.x + (Math.random() - 0.5) * 0.8, this.y + 2.6, this.z + (Math.random() - 0.5) * 0.8, '#7fffd4', 1, { speed: 0.2, up: 0.6, grav: -0.5, life: 1.8, collide: false }, true);
  }
}

export class Worldforge extends Entity implements Interactable {
  private t = 0;
  private parts = buildForge();
  constructor(x: number, y: number, z: number) {
    super();
    this.x = x + 0.5;
    this.y = y;
    this.z = z + 0.5;
    this.w = 3.2;
    this.h = 2.2;
    this.gravity = 0;
    this.noClip = true;
    this.model = this.parts.m;
    this.glowColor.set('#ff8a30');
  }
  hurt(): boolean { return false; }

  prompt(g: Game) {
    if (g.story.flags.forgeLit) return 'The Worldforge burns (legendary crafting station)';
    return g.story.hasAllHearts() ? 'Set the Ember Hearts into the Worldforge' : 'The Worldforge is cold';
  }
  interact(g: Game) { g.story.useForge(); }

  update(dt: number, g: Game) {
    this.t += dt;
    const lit = g.story.flags.forgeLit;
    this.glow = lit ? 11 + Math.sin(this.t * 6) * 0.6 : 0;
    const { flames, fl, coals, sockets } = this.parts;
    flames.visible = lit;
    const coalMat = coals.material as THREE.MeshLambertMaterial;
    coalMat.color.set(lit ? '#ff7a1a' : '#3a3a40');
    coalMat.emissive.set(lit ? '#ff5a10' : '#000000');
    coalMat.userData.baseEmissive = coalMat.emissive.clone();
    const cols = ['#ff9a1a', '#ff3d5a', '#4ac8ff'];
    sockets.forEach((s, i) => {
      const m = s.material as THREE.MeshLambertMaterial;
      if (lit && m.color.getHexString() !== cols[i].slice(1)) {
        s.material = this.parts.m.mat(cols[i], cols[i]);
      }
    });
    if (lit) {
      fl.forEach((f, i) => {
        f.scale.y = 0.7 + Math.sin(this.t * 9 + i * 1.7) * 0.35;
        f.position.y = 1.9 + f.scale.y * 0.3;
      });
      if (Math.random() < dt * 30)
        g.particles.burst(this.x + (Math.random() - 0.5) * 2, this.y + 2.2, this.z + (Math.random() - 0.5) * 2, Math.random() < 0.5 ? '#ffd23f' : '#ff7a1a', 1, { speed: 0.5, up: 3, grav: -1, life: 1.2, collide: false }, true);
    }
  }
}
