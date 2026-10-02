import * as THREE from 'three';
import { CHUNK, DAY_LENGTH, DAY_PORTION, FORGE, type HeartKey, REACH, SAVE_KEY, SHRINES, TOTEM } from '../config';
import { audio } from '../engine/audio';
import { Input } from '../engine/input';
import { hash2, seedFromString } from '../engine/rng';
import { HollowKing } from '../entities/boss';
import type { Entity } from '../entities/entity';
import { AshWolf, Bat, Blightling, Boar, Hollow, HollowArcher, Mob, Spider } from '../entities/mobs';
import { Player } from '../entities/player';
import { Projectile } from '../entities/projectiles';
import { ItemDrop, Totem, Worldforge } from '../entities/props';
import { Particles } from '../gfx/particles';
import { MAX_LIGHTS, Scene3D, U } from '../gfx/scene';
import { UI } from '../ui/ui';
import { B, BLOCKS } from '../world/blocks';
import { World } from '../world/world';
import { Inventory } from './inventory';
import { HAND, ITEMS, type WeaponStats } from './items';
import type { Recipe, Station } from './recipes';
import { type Flags, type Line, type Stats, Story } from './story';

type State = 'title' | 'intro' | 'play' | 'dead';

interface SaveData {
  v: 2;
  seed: number;
  player: { x: number; y: number; z: number; hp: number };
  spawn: { x: number; y: number; z: number } | null;
  inventory: ReturnType<Inventory['serialize']>;
  dayTime: number;
  day: number;
  story: { index: number; flags: Flags; stats: Stats };
  chunks: Record<string, string>;
  settings?: { pixel: number; shadows: boolean };
}

export interface Pick { x: number; y: number; z: number; nx: number; ny: number; nz: number }

export class Game {
  readonly input: Input;
  readonly scene: Scene3D;
  readonly ui: UI;
  readonly particles: Particles;

  world!: World;
  player!: Player;
  inventory = new Inventory();
  story!: Story;
  entities: Entity[] = [];
  totem!: Totem;
  forge!: Worldforge;

  state: State = 'title';
  clock = 0;
  dayTime = 0.08;
  day = 1;
  eclipse = 0;
  shakeAmt = 0;
  private hitstop = 0;
  mining: { x: number; y: number; z: number; progress: number; soundT: number } | null = null;
  pick: Pick | null = null;
  readonly aim = new THREE.Vector3();
  spawnPoint: { x: number; y: number; z: number } | null = null;
  covered = false;

  private spawnT = 0;
  private saveT = 0;
  private unloadT = 0;
  private placeT = 0;
  private warnT = 0;
  private triumphT = 0;
  private emberT = 0;
  private guardians = new Set<HeartKey>();
  private loading = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.input = new Input(canvas);
    this.scene = new Scene3D(canvas);
    this.particles = new Particles(this.scene.scene);
    const save = this.loadSave();
    if (save?.settings) {
      this.scene.setPixelScale(save.settings.pixel);
      this.scene.renderer.shadowMap.enabled = save.settings.shadows;
    }
    this.setupWorld(save?.seed ?? (Math.random() * 2 ** 32) >>> 0, save);
    this.ui = new UI(this);
    window.addEventListener('beforeunload', () => this.save());
  }

  // ---------------------------------------------------------------- lifecycle

  private setupWorld(seed: number, save?: SaveData | null) {
    for (const e of this.entities) this.removeEntityObject(e);
    this.player?.obj?.removeFromParent();
    this.scene.clearChunks();
    this.world = new World(seed, save?.chunks);
    const g = this.world.gen;
    const fh = g.heightAt(FORGE.x, FORGE.z);
    this.totem = new Totem(TOTEM.x, g.heightAt(TOTEM.x, TOTEM.z) + 1, TOTEM.z);
    this.forge = new Worldforge(FORGE.x, fh + 1, FORGE.z);
    this.entities = [];
    this.addEntity(this.forge);
    this.addEntity(this.totem);
    this.player = new Player();
    this.scene.scene.add(this.player.obj!);
    this.inventory = new Inventory();
    this.story = new Story(this);
    this.guardians.clear();
    this.mining = null;
    this.eclipse = 0;
    this.triumphT = 0;
    this.spawnPoint = save?.spawn ?? null;
    if (save) {
      Object.assign(this.player, { x: save.player.x, y: save.player.y, z: save.player.z });
      this.player.hp = Math.max(25, save.player.hp);
      this.inventory.load(save.inventory);
      this.story.load(save.story);
      this.dayTime = save.dayTime;
      this.day = save.day;
    } else {
      this.placeAtSpawn();
      for (const [id, n] of [['bone_club', 1], ['flint_pick', 1], ['apple', 3], ['torch', 4]] as [string, number][]) this.inventory.add(id, n);
      this.dayTime = 0.08;
      this.day = 1;
    }
    this.scene.target.set(this.player.x, this.player.y, this.player.z);
    this.loading = 1;
  }

  private placeAtSpawn() {
    const s = this.spawnPoint ?? { x: TOTEM.x + 3.5, y: 0, z: TOTEM.z + 0.5 };
    const tx = Math.floor(s.x);
    const tz = Math.floor(s.z);
    this.player.x = s.x;
    this.player.z = s.z;
    this.player.y = this.spawnPoint ? s.y : this.world.top(tx, tz);
    this.player.vx = this.player.vy = this.player.vz = 0;
  }

  newGame(seedText: string) {
    const seed = seedText ? seedFromString(seedText) : (Math.random() * 2 ** 32) >>> 0;
    localStorage.removeItem(SAVE_KEY);
    this.setupWorld(seed, null);
    this.state = 'intro';
    this.ui.playIntro(() => {
      this.state = 'play';
      this.story.begin();
      this.save();
    });
  }

  continueGame() {
    const save = this.loadSave();
    if (!save) return this.newGame('');
    this.setupWorld(save.seed, save);
    this.state = 'play';
    this.ui.setScreen(null);
    this.ui.toast(`Day ${this.day}. The saga continues.`);
  }

  quitToTitle() {
    this.save();
    this.ui.closePanels();
    this.state = 'title';
    this.ui.setScreen('title');
  }

  hasSave() {
    return !!localStorage.getItem(SAVE_KEY);
  }

  private loadSave(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const d = raw ? (JSON.parse(raw) as SaveData) : null;
      return d?.v === 2 ? d : null;
    } catch {
      return null;
    }
  }

  save() {
    if (this.state !== 'play' && this.state !== 'dead') return;
    const p = this.player;
    const data: SaveData = {
      v: 2,
      seed: this.world.seed,
      player: { x: p.x, y: p.y, z: p.z, hp: p.dead ? p.maxHp : p.hp },
      spawn: this.spawnPoint,
      inventory: this.inventory.serialize(),
      dayTime: this.dayTime,
      day: this.day,
      story: this.story.serialize(),
      chunks: this.world.serialize(),
      settings: { pixel: this.scene.pixelScale, shadows: this.scene.renderer.shadowMap.enabled },
    };
    if (p.dead) Object.assign(data.player, this.spawnPoint ?? { x: TOTEM.x + 3.5, y: this.world.top(TOTEM.x + 3, TOTEM.z), z: TOTEM.z + 0.5 });
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      this.ui.toast('Could not save: browser storage is full.');
    }
  }

  // ---------------------------------------------------------------- queries

  daylight(): number {
    const t = this.dayTime;
    let l = 1;
    if (t < 0.04) l = 0.3 + 0.7 * (t / 0.04);
    else if (t > DAY_PORTION - 0.05 && t < DAY_PORTION) l = 1 - 0.7 * ((t - (DAY_PORTION - 0.05)) / 0.05);
    else if (t >= DAY_PORTION) l = 0.3;
    return l * (1 - this.eclipse * 0.7);
  }

  isDay() {
    return this.dayTime < DAY_PORTION;
  }

  /** Direct sunlight (0..1) reaching a point. The Ashlands' veil halves it. */
  sunlightAt(x: number, y: number, z: number): number {
    if (!this.isDay()) return 0;
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    if (y < this.world.top(bx, bz)) return 0;
    return this.daylight() * (this.world.gen.biomeAt(bx, bz) === 'ashlands' ? 0.5 : 1);
  }

  acceptsGameInput() {
    return this.state === 'play' && !this.ui.dialogueOpen && this.ui.screen === null;
  }

  nearStations(): Set<Station> {
    const s = new Set<Station>();
    const p = this.player;
    const px = Math.floor(p.x);
    const py = Math.floor(p.y);
    const pz = Math.floor(p.z);
    for (let y = py - 2; y <= py + 2; y++)
      for (let z = pz - 4; z <= pz + 4; z++)
        for (let x = px - 4; x <= px + 4; x++) {
          const id = this.world.get(x, y, z);
          const st = BLOCKS[id].station;
          if (st) s.add(st);
          if (id === B.FURNACE || id === B.CAMPFIRE) s.add('fire');
        }
    if (this.story.flags.forgeLit && p.dist(this.forge) < 6) {
      s.add('workbench');
      s.add('furnace');
      s.add('fire');
      s.add('worldforge');
    }
    return s;
  }

  stationsKey(): number {
    const s = this.nearStations();
    let k = 0;
    (['workbench', 'furnace', 'fire', 'worldforge'] as Station[]).forEach((st, i) => s.has(st) && (k += 1 << i));
    return k * 1e7;
  }

  bossEntity(): HollowKing | null {
    for (const e of this.entities) if (e instanceof HollowKing && !e.dead) return e;
    return null;
  }

  nearestInteractable(): { label: string; x: number; y: number; z: number; act: () => void } | null {
    const p = this.player;
    if (p.dead) return null;
    for (const e of [this.totem, this.forge]) {
      if (p.dist(e) < e.w / 2 + 1.8 && Math.abs(p.y - e.y) < 3)
        return { label: e.prompt(this), x: e.x, y: e.y + e.h + 0.4, z: e.z, act: () => e.interact(this) };
    }
    const px = Math.floor(p.x);
    const py = Math.floor(p.y);
    const pz = Math.floor(p.z);
    let best: { label: string; x: number; y: number; z: number; act: () => void } | null = null;
    let bd = 9;
    for (let y = py - 1; y <= py + 2; y++)
      for (let z = pz - 2; z <= pz + 2; z++)
        for (let x = px - 2; x <= px + 2; x++) {
          const id = this.world.get(x, y, z);
          const def = BLOCKS[id];
          let label = '';
          let act: (() => void) | null = null;
          if (def.heart) {
            const key = def.heart;
            label = `Take the ${ITEMS[`heart_${key}`].name}`;
            act = () => this.takeHeart(x, y, z, key);
          } else if (id === B.CHEST) {
            label = 'Open the clan chest';
            act = () => this.openChest(x, y, z);
          } else if (id === B.CAMPFIRE) {
            label = 'Rest by the fire (set respawn)';
            act = () => this.restAt(x, y, z);
          }
          if (!act) continue;
          const d = (x + 0.5 - p.x) ** 2 + (z + 0.5 - p.z) ** 2;
          if (d < bd) {
            bd = d;
            best = { label, x: x + 0.5, y: y + 1.3, z: z + 0.5, act };
          }
        }
    return best;
  }

  // ---------------------------------------------------------------- entities + events

  say(lines: Line[], done?: () => void) {
    this.ui.say(lines, done);
  }

  shake(n: number) {
    this.shakeAmt = Math.max(this.shakeAmt, n);
  }

  addEntity(e: Entity) {
    this.entities.push(e);
    const o = e.obj;
    if (o) this.scene.scene.add(o);
  }

  private removeEntityObject(e: Entity) {
    e.dispose();
    e.obj?.removeFromParent();
  }

  spawnDrop(x: number, y: number, z: number, id: string, n: number, gentle = false) {
    this.addEntity(new ItemDrop(id, n, x, y, z, gentle));
  }

  /** Player-sourced damage to a mob, with hit feedback. */
  damageMob(e: Entity, amount: number, fromX: number, fromZ: number, knock: number): boolean {
    if (!e.hurt(amount, fromX, fromZ, this, knock)) return false;
    this.particles.burst(e.x, e.y + e.h * 0.6, e.z, (e as Mob).blood ?? '#ccc', 7, { speed: 3, size: 0.09 });
    this.hitstop = Math.max(this.hitstop, e.dead ? 0.08 : 0.045);
    return true;
  }

  hurtPlayer(amount: number, fromX: number, fromZ: number, knock = 1) {
    const def = this.inventory.defense();
    const dmg = amount * (1 - Math.min(0.6, def * 0.035));
    this.player.hurt(dmg, fromX, fromZ, this, knock * 0.6);
  }

  onPickup(id: string, n: number) {
    const g = this.story.stats.gathered;
    g[id] = (g[id] ?? 0) + n;
  }

  onMobKilled(m: Mob) {
    const st = this.story.stats;
    st.kills++;
    st.bestiary[m.kind] = (st.bestiary[m.kind] ?? 0) + 1;
    if (m instanceof HollowKing) {
      this.triumphT = 150;
      this.shake(0.8);
      for (const e of this.entities) if (e instanceof Projectile || (e instanceof Hollow && e.guardian)) e.dead = true;
      this.story.onBossDefeated();
      this.save();
    }
  }

  onPlayerDeath() {
    this.state = 'dead';
    this.mining = null;
    audio.play('death');
    const p = this.player;
    this.particles.burst(p.x, p.y + 1, p.z, '#5f8f3a', 40, { speed: 5, size: 0.14 });
    p.obj!.visible = false;
    this.ui.closePanels();
    setTimeout(() => this.ui.showDeath(), 1000);
  }

  respawn() {
    const p = this.player;
    p.dead = false;
    p.hp = p.maxHp;
    p.invuln = 2.5;
    p.burn = 0;
    p.obj!.visible = true;
    this.placeAtSpawn();
    this.state = 'play';
    this.ui.setScreen(null);
    const boss = this.bossEntity();
    if (boss) {
      boss.dead = true;
      this.story.flags.bossSpawned = false;
      for (const e of this.entities) if (e instanceof Projectile || (e instanceof Hollow && e.guardian)) e.dead = true;
    }
    this.scene.target.set(p.x, p.y, p.z);
    this.story.onDeath();
  }

  spawnBoss() {
    if (this.bossEntity()) return;
    const b = new HollowKing();
    b.x = this.forge.x;
    b.z = this.forge.z - 3;
    b.y = this.forge.y + 9;
    this.addEntity(b);
    this.story.flags.bossSpawned = true;
    audio.play('boss');
    this.shake(0.5);
  }

  private takeHeart(x: number, y: number, z: number, key: HeartKey) {
    this.world.set(x, y, z, B.PEDESTAL_EMPTY);
    this.particles.burst(x + 0.5, y + 1, z + 0.5, '#fff3b0', 50, { speed: 4, grav: 0, life: 1.2, collide: false }, true);
    this.story.takeHeart(key);
  }

  private restAt(x: number, y: number, z: number) {
    this.spawnPoint = { x: x + 1.5, y: y, z: z + 0.5 };
    if (this.world.solid(x + 1, y, z)) this.spawnPoint = { x: x + 0.5, y: y + 1, z: z + 0.5 };
    this.player.hp = this.player.maxHp;
    audio.play('fire');
    this.particles.burst(x + 0.5, y + 0.6, z + 0.5, '#ffb02e', 20, { speed: 2, up: 3, grav: -1, life: 1, collide: false }, true);
    this.ui.toast('You rest by the fire. Wounds mended, respawn point set.');
    this.save();
  }

  /** Loot depends on where the chest is: shrines are rich, camps follow their biome. */
  private openChest(x: number, y: number, z: number) {
    this.world.set(x, y, z, B.CHEST_OPEN);
    const r = (k: number) => hash2(x * 31 + k, z * 17 + y, this.world.seed);
    const biome = this.world.gen.biomeAt(x, z);
    const shrine = Object.values(SHRINES).some((s) => Math.hypot(s.x - x, s.z - z) < 12);
    const loot: [string, number][] = [];
    const roll = (id: string, min: number, max: number, chance: number, k: number) => {
      if (r(k) < chance) loot.push([id, min + Math.floor(r(k + 50) * (max - min + 1))]);
    };
    if (shrine) {
      roll('gold_bar', 2, 4, 1, 1);
      roll('iron_bar', 3, 6, 1, 2);
      roll('blood_tonic', 1, 3, 0.9, 3);
      roll('arrow', 8, 16, 0.8, 4);
      roll('ember_shard', 1, 3, 0.6, 5);
      roll(['war_charm', 'swift_charm', 'vesh_charm'][Math.floor(r(6) * 3)], 1, 1, 0.45, 7);
      roll(['iron_spear', 'iron_warhammer', 'orc_longbow', 'gold_cleaver'][Math.floor(r(8) * 4)], 1, 1, 0.7, 9);
    } else {
      roll('apple', 1, 3, 0.6, 1);
      roll('torch', 3, 8, 0.7, 2);
      roll('arrow', 4, 10, 0.6, 3);
      roll('coal', 2, 6, 0.6, 4);
      roll('iron_bar', 1, 3, 0.5, 5);
      roll('cooked_meat', 1, 2, 0.4, 6);
      if (biome === 'sunscorch') { roll('gold_bar', 1, 3, 0.6, 10); roll('throwing_axe', 3, 6, 0.5, 11); }
      if (biome === 'rimeback') { roll('hide_vest', 1, 1, 0.4, 10); roll('iron_helm', 1, 1, 0.3, 11); roll('ice', 4, 8, 0.5, 12); }
      if (biome === 'ashlands') { roll('ember_shard', 1, 2, 0.6, 10); roll('war_charm', 1, 1, 0.15, 11); roll('bone', 3, 6, 0.8, 12); }
      if (biome === 'greenwood') { roll('hunting_bow', 1, 1, 0.3, 10); roll('hide', 2, 4, 0.5, 11); roll('bone_dagger', 1, 1, 0.3, 12); }
      roll('blood_tonic', 1, 1, 0.25, 13);
    }
    if (!loot.length) loot.push(['apple', 2]);
    for (const [id, n] of loot) this.spawnDrop(x + 0.5, y + 1, z + 0.5, id, n);
    this.story.stats.chests++;
    audio.play('chest');
    this.particles.burst(x + 0.5, y + 1, z + 0.5, '#f5c542', 30, { speed: 3, up: 3, life: 1, collide: false }, true);
    this.ui.toast(shrine ? 'A shrine hoard!' : 'You pry open the old chest.', 'quest');
  }

  /** Dev/console helper: spawn a creature next to the player. */
  debugSpawn(kind: 'hollow' | 'archer' | 'blightling' | 'wolf' | 'spider' | 'bat' | 'boar' | 'warden', dx = 3, dz = 0): Mob {
    const make: Record<string, () => Mob> = {
      hollow: () => new Hollow(), archer: () => new HollowArcher(), blightling: () => new Blightling(), wolf: () => new AshWolf(),
      spider: () => new Spider(), bat: () => new Bat(), boar: () => new Boar(), warden: () => new Hollow('frost', true),
    };
    const m = make[kind]();
    m.x = this.player.x + dx;
    m.z = this.player.z + dz;
    m.y = this.world.top(Math.floor(m.x), Math.floor(m.z));
    this.addEntity(m);
    return m;
  }

  craft(r: Recipe, times = 1) {
    const inv = this.inventory;
    let made = 0;
    for (let i = 0; i < times; i++) {
      if (!r.cost.every(([id, n]) => inv.count(id) >= n)) break;
      if (r.station && !this.nearStations().has(r.station)) break;
      for (const [id, n] of r.cost) inv.remove(id, n);
      const left = inv.add(r.out, r.n);
      if (left) this.spawnDrop(this.player.x, this.player.y + 1, this.player.z, r.out, left, true);
      made += r.n;
    }
    if (!made) return;
    const c = this.story.stats.crafted;
    c[r.out] = (c[r.out] ?? 0) + made;
    audio.play('craft');
    this.ui.pickup(r.out, made);
  }

  dropCursor() {
    const c = this.inventory.cursor;
    if (!c) return;
    const p = this.player;
    const d = new ItemDrop(c.id, c.n, p.x + Math.sin(p.yaw) * 0.8, p.y + 1.2, p.z + Math.cos(p.yaw) * 0.8);
    d.vx = Math.sin(p.yaw) * 4;
    d.vz = Math.cos(p.yaw) * 4;
    this.addEntity(d);
    this.inventory.cursor = null;
    this.inventory.changed();
  }

  // ---------------------------------------------------------------- update

  update(dt: number) {
    this.clock += dt;
    this.shakeAmt *= Math.pow(0.003, dt);
    const inp = this.input;

    if (this.state === 'title' || this.state === 'intro') {
      this.dayTime = (this.dayTime + dt / 160) % 1;
      const s = this.world.gen.heightAt(FORGE.x, FORGE.z);
      this.scene.yawTarget = this.scene.yaw = Math.PI / 4 + this.clock * 0.05;
      this.scene.target.set(FORGE.x + Math.sin(this.clock * 0.05) * 6, s + 1, FORGE.z + 2);
      this.totem.update(dt, this);
      this.forge.update(dt, this);
      this.particles.update(dt, this.world);
      audio.mood = this.isDay() ? 'day' : 'night';
      return;
    }

    if (this.ui.dialogueOpen) {
      if (inp.hit('Space', 'Enter', 'KeyF', 'Escape') || inp.mouse.leftPressed) this.ui.advanceDialogue();
      return;
    }
    if (inp.hit('Escape')) {
      if (this.ui.panelOpen) this.ui.closePanels();
      else if (this.ui.screen === 'pause') this.ui.setScreen(null);
      else if (this.ui.screen === null && this.state === 'play') {
        this.ui.setScreen('pause');
        this.save();
      }
    }
    if (this.ui.screen === 'pause' || this.ui.screen === 'credits') return;
    if (this.state === 'play') {
      if (inp.hit('Tab', 'KeyI')) this.ui.togglePanel('pack');
      if (inp.hit('KeyC')) this.ui.togglePanel('craft');
      if (inp.hit('KeyJ')) this.ui.togglePanel('journal');
      if (inp.hit('KeyM')) this.ui.toast(`Music ${audio.toggleMusic() ? 'on' : 'off'}`);
    }

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }

    const wasDay = this.isDay();
    this.dayTime += dt / DAY_LENGTH;
    if (this.dayTime >= 1) {
      this.dayTime -= 1;
      this.day++;
      this.ui.toast(`Dawn of day ${this.day}`);
    }
    if (wasDay && !this.isDay() && this.state === 'play') this.story.onNightfall();
    const boss = this.bossEntity();
    this.eclipse += ((boss ? 1 : 0) - this.eclipse) * Math.min(1, dt * 0.7);

    const p = this.player;
    if (this.state === 'play') {
      this.actions(dt);
      p.update(dt, this);
    }

    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      // Freeze far-away entities in unloaded terrain
      if (e.despawnable && Math.abs(e.x - p.x) > 70) continue;
      e.update(dt, this);
    }
    this.entities = this.entities.filter((e) => {
      if (!e.dead) return true;
      this.removeEntityObject(e);
      return false;
    });

    this.spawner(dt);
    this.particles.update(dt, this.world);
    this.story.update(dt);
    this.ambient(dt);

    const f = this.story.flags;
    if (f.forgeLit && !f.bossDefeated && !f.bossSpawned && p.dist(this.forge) < 22 && this.state === 'play') {
      f.bossSpawned = true;
      this.say([{ who: 'king', text: 'KEEPER. YOU RETURN TO DIE.' }], () => this.spawnBoss());
    }

    const depth = this.world.gen.heightAt(Math.floor(p.x), Math.floor(p.z)) - p.y;
    this.triumphT -= dt;
    audio.mood = boss ? 'boss' : this.triumphT > 0 ? 'triumph' : depth > 10 && this.covered ? 'cave' : this.isDay() ? 'day' : 'night';

    if ((this.saveT += dt) > 45) {
      this.saveT = 0;
      this.save();
    }
    if ((this.unloadT += dt) > 4) {
      this.unloadT = 0;
      this.world.unloadFar(Math.floor(p.x / CHUNK), Math.floor(p.z / CHUNK), (c) => this.scene.removeChunk(c));
    }
  }

  /** Embers from torches and campfires near the player. */
  private ambient(dt: number) {
    if ((this.emberT -= dt) > 0) return;
    this.emberT = 0.08;
    const pcx = Math.floor(this.player.x / CHUNK);
    const pcz = Math.floor(this.player.z / CHUNK);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.world.peek(pcx + dx, pcz + dz);
        if (!c) continue;
        const em = c.emitters;
        for (let i = 0; i < em.length; i += 4) {
          const id = em[i + 3];
          if ((id !== B.TORCH && id !== B.CAMPFIRE && id !== B.LAVA) || Math.random() > (id === B.LAVA ? 0.01 : 0.12)) continue;
          if (em[i + 1] > U.uCutY.value) continue;
          const y = em[i + 1] + (id === B.TORCH ? 0.85 : id === B.LAVA ? 1 : 0.6);
          this.particles.burst(em[i] + 0.5, y, em[i + 2] + 0.5, Math.random() < 0.5 ? '#ffd23f' : '#ff7a1a', 1, { speed: 0.3, up: 1.4, grav: -0.5, life: 0.9, collide: false, size: 0.06 }, true);
        }
      }
  }

  // ---------------------------------------------------------------- input -> actions

  /** Amanatides-Woo voxel walk along the mouse ray. */
  private pickBlock(ray: THREE.Ray): Pick | null {
    const o = ray.origin;
    const d = ray.direction;
    let x = Math.floor(o.x);
    let y = Math.floor(o.y);
    let z = Math.floor(o.z);
    const sx = Math.sign(d.x);
    const sy = Math.sign(d.y);
    const sz = Math.sign(d.z);
    const tdx = Math.abs(1 / d.x);
    const tdy = Math.abs(1 / d.y);
    const tdz = Math.abs(1 / d.z);
    let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx;
    let ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy;
    let tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    const cut = U.uCutY.value;
    const pl = U.uPlayer.value;
    const cd = U.uCamDir.value;
    // Blocks dithered away by the see-through effect can't be picked either.
    const hidden = (bx: number, by: number, bz: number) => {
      const vx = bx + 0.5 - pl.x;
      const vy = by + 0.5 - pl.y;
      const vz = bz + 0.5 - pl.z;
      const t = vx * cd.x + vy * cd.y + vz * cd.z;
      if (t <= 0.9 || by + 0.5 < pl.y - 0.25) return false;
      return Math.hypot(vx - t * cd.x, vy - t * cd.y, vz - t * cd.z) < 2.0;
    };
    for (let i = 0; i < 500; i++) {
      if (y < 0) return null;
      if (y < cut - 0.5 && !hidden(x, y, z)) {
        const id = this.world.get(x, y, z);
        if (id && !BLOCKS[id].liquid) return { x, y, z, nx, ny, nz };
      }
      if (tx < ty && tx < tz) {
        x += sx;
        tx += tdx;
        nx = -sx; ny = 0; nz = 0;
      } else if (ty < tz) {
        y += sy;
        ty += tdy;
        nx = 0; ny = -sy; nz = 0;
      } else {
        z += sz;
        tz += tdz;
        nx = 0; ny = 0; nz = -sz;
      }
    }
    return null;
  }

  private actions(dt: number) {
    const p = this.player;
    if (p.dead) return;
    const inp = this.input;
    const m = inp.mouse;
    const inv = this.inventory;
    this.warnT -= dt;
    this.placeT -= dt;

    for (let i = 0; i < 9; i++) if (inp.hit(`Digit${i + 1}`)) { inv.selected = i; inv.changed(); }
    if (m.wheel && !this.ui.panelOpen) {
      if (inp.down('ControlLeft', 'ControlRight')) this.zoom(-m.wheel * 0.1);
      else { inv.selected = (inv.selected + m.wheel + 9) % 9; inv.changed(); }
    }
    if (inp.hit('Equal', 'NumpadAdd')) this.zoom(0.15);
    if (inp.hit('Minus', 'NumpadSubtract')) this.zoom(-0.15);
    if (inp.hit('KeyQ')) this.scene.yawTarget -= Math.PI / 2;
    if (inp.hit('KeyE')) this.scene.yawTarget += Math.PI / 2;

    const ray = this.scene.ray(m.x, m.y);
    const live = this.acceptsGameInput() && !this.ui.panelOpen;
    this.pick = live ? this.pickBlock(ray) : null;
    // Aim point on the horizontal plane at chest height
    const planeY = p.y + 1;
    const t = (planeY - ray.origin.y) / ray.direction.y;
    this.aim.copy(ray.origin).addScaledVector(ray.direction, t);
    // Soft aim-assist: snap to a creature under (or very near) the cursor.
    let best = 46 * 46;
    for (const e of this.entities) {
      if (!(e instanceof Mob) || e.dead || p.dist(e) > 26) continue;
      const sp = this.scene.project(new THREE.Vector3(e.x, e.y + e.h * 0.5, e.z));
      const d = (sp.x - m.x) ** 2 + (sp.y - m.y) ** 2;
      if (d < best) {
        best = d;
        this.aim.set(e.x, e.y + e.h * 0.5, e.z);
      }
    }
    p.aimYaw = Math.atan2(this.aim.x - p.x, this.aim.z - p.z);
    if (!live) {
      this.mining = null;
      p.aiming = false;
      p.draw = -1;
      return;
    }
    if (inp.hit('KeyF')) this.nearestInteractable()?.act();

    const held = inv.held;
    const def = held ? ITEMS[held.id] : null;
    const w: WeaponStats = def?.weapon ?? HAND.weapon;
    const mine = def?.mine ?? (def?.weapon ? null : HAND.mine);

    // --- Bows: hold to draw, release to loose
    if (w.type === 'bow') {
      if (m.left) {
        if (p.draw < 0) {
          if (inv.count('arrow') > 0) {
            p.draw = 0;
            audio.play('draw');
          } else if (m.leftPressed) this.ui.toast('No arrows! Craft them from wood and bone.');
        } else p.draw = Math.min(1.25, p.draw + dt / w.speed);
      } else if (p.draw >= 0) {
        if (p.draw > 0.2 && inv.remove('arrow', 1)) this.fireArrow(w, Math.min(1, p.draw));
        p.draw = -1;
      }
      p.aiming = p.draw >= 0;
      this.mining = null;
    } else {
      p.draw = -1;
      p.aiming = m.left;
      if (m.left) this.primary(dt, w, mine, def?.kind === 'weapon');
      else this.mining = null;
    }

    if (m.rightPressed || (m.right && this.placeT <= 0)) {
      this.placeT = 0.16;
      this.secondary(m.rightPressed);
    }
  }

  private zoom(d: number) {
    this.scene.zoom = THREE.MathUtils.clamp(this.scene.zoom + d, 0.55, 1.9);
    this.scene.updateCamera();
  }

  private inReach(x: number, y: number, z: number) {
    const p = this.player;
    return Math.hypot(x + 0.5 - p.x, y + 0.5 - (p.y + 1.2), z + 0.5 - p.z) <= REACH;
  }

  private primary(dt: number, w: WeaponStats, mine: { power: number; tier: number } | null, isWeapon: boolean) {
    const p = this.player;
    const pk = this.pick;
    // Tools prefer mining unless an enemy is right in front of you.
    const enemyNear = this.entities.some((e) => e.hostile && e instanceof Mob && p.dist(e) < w.range + 0.6);
    const mineMode = !!mine && !!pk && this.inReach(pk.x, pk.y, pk.z) && (!isWeapon || w.type === 'swing') && !(enemyNear && isWeapon) && !(enemyNear && !mine);

    if (!p.busy) {
      if (w.type === 'throw') {
        p.startAction('throw', w.speed, 0.35, () => this.throwAxe(w));
      } else if (w.type === 'staff') {
        p.startAction('staff', w.speed, 0.3, () => this.castFireball(w));
      } else if (mineMode && !enemyNear) {
        p.startAction('mine', Math.max(0.24, w.speed * 0.9), 0.5);
      } else {
        const frac = w.type === 'smash' ? 0.62 : w.type === 'dagger' ? 0.4 : 0.35;
        p.startAction(w.type, w.speed, frac, () => this.melee(w));
      }
    }
    if (mineMode && mine && pk) this.mineTile(dt, pk, mine);
    else this.mining = null;
  }

  private melee(w: WeaponStats) {
    const p = this.player;
    const mult = this.inventory.charm() === 'might' ? 1.2 : 1;
    let hits = 0;
    for (const e of this.entities) {
      if (!(e instanceof Mob) || e.dead) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz) - e.w / 2;
      if (d > w.range || Math.abs(e.y + e.h / 2 - (p.y + 0.9)) > 1.4 + e.h / 2) continue;
      if (w.arc < 360) {
        let a = Math.atan2(dx, dz) - p.yaw;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.abs(a) > THREE.MathUtils.degToRad(w.arc / 2) && d > 0.4) continue;
      }
      const dmg = w.damage * mult * (0.9 + Math.random() * 0.2);
      if (this.damageMob(e, dmg, p.x, p.z, w.knock)) {
        hits++;
        if (w.burn) e.burn = 3;
        if (w.slow) e.slow = 2;
      }
    }
    if (w.type === 'smash') {
      this.shake(0.25);
      audio.play('boom');
      const gy = p.y + 0.05;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        this.particles.burst(p.x + Math.sin(a) * w.range * 0.7, gy, p.z + Math.cos(a) * w.range * 0.7, w.burn ? '#ff7a1a' : '#9a8a7a', 2, { speed: 1.5, up: 3, size: 0.12 }, !!w.burn);
      }
    }
    if (hits) audio.play('hit');
  }

  private fireArrow(w: WeaponStats, power: number) {
    const p = this.player;
    const sx = p.x + Math.sin(p.yaw) * 0.5;
    const sz = p.z + Math.cos(p.yaw) * 0.5;
    const sy = p.y + 1.35;
    const dist = Math.hypot(this.aim.x - sx, this.aim.z - sz);
    const v = new THREE.Vector3(this.aim.x - sx, this.aim.y - sy + dist * 0.06, this.aim.z - sz).normalize().multiplyScalar(w.range * (0.55 + 0.45 * power));
    const pr = new Projectile('arrow', 'player', sx, sy, sz, v, w.damage * (0.35 + 0.65 * power) * (this.inventory.charm() === 'might' ? 1.2 : 1), 5);
    pr.knock = w.knock;
    this.addEntity(pr);
    p.startAction('use', 0.15, 0);
    audio.play('bow');
  }

  private throwAxe(w: WeaponStats) {
    const p = this.player;
    if (!this.inventory.held || this.inventory.held.id !== 'throwing_axe') return;
    this.inventory.takeHeld();
    const sx = p.x + Math.sin(p.yaw) * 0.5;
    const sz = p.z + Math.cos(p.yaw) * 0.5;
    const sy = p.y + 1.4;
    const dist = Math.hypot(this.aim.x - sx, this.aim.z - sz);
    const v = new THREE.Vector3(this.aim.x - sx, this.aim.y - sy + dist * 0.12, this.aim.z - sz).normalize().multiplyScalar(w.range);
    const pr = new Projectile('axe', 'player', sx, sy, sz, v, w.damage * (this.inventory.charm() === 'might' ? 1.2 : 1), 4);
    pr.knock = w.knock;
    this.addEntity(pr);
  }

  private castFireball(w: WeaponStats) {
    const p = this.player;
    const sx = p.x + Math.sin(p.yaw) * 0.7;
    const sz = p.z + Math.cos(p.yaw) * 0.7;
    const sy = p.y + 1.5;
    const v = new THREE.Vector3(this.aim.x - sx, this.aim.y - sy, this.aim.z - sz).normalize().multiplyScalar(w.range);
    const pr = new Projectile('fireball', 'player', sx, sy, sz, v, w.damage * (this.inventory.charm() === 'might' ? 1.2 : 1), 3);
    pr.knock = w.knock;
    this.addEntity(pr);
    audio.play('fire');
  }

  private mineTile(dt: number, pk: Pick, mine: { power: number; tier: number }) {
    const id = this.world.get(pk.x, pk.y, pk.z);
    const def = BLOCKS[id];
    if (!id || def.liquid || def.hardness === Infinity) {
      this.mining = null;
      if ((def.heart || id === B.CHEST) && this.warnT <= 0) {
        this.ui.toast('Right-click or press F to use it.');
        this.warnT = 3;
      }
      return;
    }
    if (mine.tier < def.tier) {
      if (this.warnT <= 0) {
        const need = ['your hands', 'a flint pick', 'an iron pick', 'a goldtusk pick'][def.tier] ?? 'something stronger';
        this.ui.toast(`${def.name} needs ${need}.`);
        this.warnT = 2;
      }
      this.mining = null;
      return;
    }
    const mg = this.mining;
    if (!mg || mg.x !== pk.x || mg.y !== pk.y || mg.z !== pk.z) {
      this.mining = { x: pk.x, y: pk.y, z: pk.z, progress: 0, soundT: 0 };
      return;
    }
    mg.progress += (dt * mine.power) / def.hardness;
    if ((mg.soundT -= dt) <= 0) {
      mg.soundT = 0.18;
      audio.play('dig', def.sound);
      this.particles.burst(pk.x + 0.5 + pk.nx * 0.5, pk.y + 0.5 + pk.ny * 0.5, pk.z + 0.5 + pk.nz * 0.5, def.color, 3, { speed: 2, size: 0.08, light: this.lightMul(pk.x + pk.nx, pk.y + pk.ny, pk.z + pk.nz) });
    }
    if (mg.progress >= 1) {
      this.breakBlock(pk.x, pk.y, pk.z);
      this.mining = null;
    }
  }

  private lightMul(x: number, y: number, z: number) {
    const l = this.world.light(x, y, z);
    const sky = Math.pow(0.8, 15 - (l >> 4)) * this.daylight();
    const blk = Math.pow(0.8, 15 - (l & 15));
    return Math.max(0.15, Math.min(1, Math.max(sky, blk)));
  }

  breakBlock(x: number, y: number, z: number) {
    const id = this.world.get(x, y, z);
    const def = BLOCKS[id];
    this.world.set(x, y, z, B.AIR);
    this.dropFor(def, x, y, z);
    this.particles.burst(x + 0.5, y + 0.5, z + 0.5, def.color, 14, { speed: 3, size: 0.12, light: this.lightMul(x, y + 1, z) });
    audio.play('break', def.sound);
    if (def.tree) this.fellTree(x, y, z, id);
    this.checkSupport(x, y + 1, z);
  }

  private dropFor(def: (typeof BLOCKS)[number], x: number, y: number, z: number) {
    if (def.drop) this.spawnDrop(x + 0.5, y + 0.5, z + 0.5, def.drop, 1);
    else if (def === BLOCKS[B.LEAVES] && Math.random() < 0.05) this.spawnDrop(x + 0.5, y + 0.5, z + 0.5, 'apple', 1);
  }

  /** Felling a trunk brings down the logs and leaves above it. */
  private fellTree(x0: number, y0: number, z0: number, id: number) {
    const trunkIds = new Set([B.LOG, B.PINE_LOG, B.DEADWOOD, B.CACTUS]);
    if (!trunkIds.has(id as never)) return;
    // Take the stump below the cut too, so the whole tree comes down.
    let base = y0;
    while (base > 0 && this.world.get(x0, base - 1, z0) === id) {
      base--;
      this.world.set(x0, base, z0, B.AIR);
      this.dropFor(BLOCKS[id], x0, base, z0);
    }
    const seen = new Set<string>();
    const stack: [number, number, number][] = [[x0, y0 + 1, z0]];
    let count = 0;
    while (stack.length && count < 220) {
      const [x, y, z] = stack.pop()!;
      const k = `${x},${y},${z}`;
      if (seen.has(k) || y < y0 || Math.abs(x - x0) > 5 || Math.abs(z - z0) > 5 || y - y0 > 16) continue;
      seen.add(k);
      const bid = this.world.get(x, y, z);
      const def = BLOCKS[bid];
      if (!def.tree) continue;
      count++;
      this.world.set(x, y, z, B.AIR);
      this.dropFor(def, x, y, z);
      if (count % 3 === 0) this.particles.burst(x + 0.5, y + 0.5, z + 0.5, def.color, 3, { speed: 2, size: 0.1 });
      stack.push([x, y + 1, z], [x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1]);
    }
    if (count > 3) this.shake(0.12);
  }

  private checkSupport(x: number, y: number, z: number) {
    const def = BLOCKS[this.world.get(x, y, z)];
    if (!def.needsGround || this.world.solid(x, y - 1, z)) return;
    this.world.set(x, y, z, B.AIR);
    this.dropFor(def, x, y, z);
  }

  private secondary(fresh: boolean) {
    const p = this.player;
    const pk = this.pick;
    if (fresh && pk && this.inReach(pk.x, pk.y, pk.z)) {
      const id = this.world.get(pk.x, pk.y, pk.z);
      const def = BLOCKS[id];
      if (def.heart) return this.takeHeart(pk.x, pk.y, pk.z, def.heart);
      if (id === B.CHEST) return this.openChest(pk.x, pk.y, pk.z);
      if (id === B.CAMPFIRE) return this.restAt(pk.x, pk.y, pk.z);
    }
    if (fresh)
      for (const e of [this.totem, this.forge])
        if (Math.hypot(this.aim.x - e.x, this.aim.z - e.z) < e.w / 2 + 0.6 && p.dist(e) < 6) return e.interact(this);

    const held = this.inventory.held;
    if (!held) return;
    const def = ITEMS[held.id];
    if (def.heal && fresh) {
      if (p.hp >= p.maxHp) return this.ui.toast('You are not hungry.');
      p.hp = Math.min(p.maxHp, p.hp + def.heal);
      this.inventory.takeHeld();
      audio.play('eat');
      this.ui.floatText(p.x, p.y + 2.2, p.z, `+${def.heal}`, '#7dff8a');
      p.startAction('use', 0.3, 0);
      return;
    }
    if ((def.armor || def.charm) && fresh) {
      this.inventory.equipFrom(this.inventory.selected);
      audio.play('equip');
      this.ui.toast(`Equipped ${def.name}`);
      return;
    }
    if (def.place !== undefined && pk) {
      const tx = pk.x + pk.nx;
      const ty = pk.y + pk.ny;
      const tz = pk.z + pk.nz;
      if (this.inReach(tx, ty, tz)) this.place(tx, ty, tz, def.place);
    }
  }

  private place(x: number, y: number, z: number, id: number): boolean {
    const w = this.world;
    const cur = BLOCKS[w.get(x, y, z)];
    if (!cur.replaceable) return false;
    const def = BLOCKS[id];
    if (def.needsGround && !w.solid(x, y - 1, z)) return false;
    if (def.solid) {
      const hits = (e: Entity) => Math.abs(e.x - (x + 0.5)) < e.w / 2 + 0.5 && Math.abs(e.z - (z + 0.5)) < e.w / 2 + 0.5 && e.y < y + 1 && e.y + e.h > y;
      if (hits(this.player) || this.entities.some((e) => e instanceof Mob && hits(e))) return false;
    }
    w.set(x, y, z, id);
    this.inventory.takeHeld();
    audio.play('place');
    this.player.startAction('use', 0.18, 0);
    this.particles.burst(x + 0.5, y + 0.5, z + 0.5, def.color, 6, { speed: 1.5, size: 0.08 });
    if (id === B.WORKBENCH) this.story.flags.placedWorkbench = true;
    return true;
  }

  // ---------------------------------------------------------------- spawning

  private spawner(dt: number) {
    if ((this.spawnT -= dt) > 0) return;
    this.spawnT = 0.7;
    const p = this.player;
    for (const e of this.entities) if (e.despawnable && p.dist(e) > 64) e.dead = true;
    if (p.dead) return;

    for (const key of ['sun', 'frost', 'deep'] as HeartKey[]) {
      if (this.story.flags.hearts[key] || this.guardians.has(key)) continue;
      const s = SHRINES[key];
      const sy = 'y' in s ? s.y : this.world.gen.heightAt(s.x, s.z) + 1;
      if (Math.hypot(p.x - s.x, p.z - s.z) > 16 || Math.abs(p.y - sy) > 10) continue;
      this.guardians.add(key);
      for (const [ox, oz] of [[-3, -3], [3, 3], [3, -3]]) {
        const h = new Hollow(key, true);
        h.x = s.x + ox + 0.5;
        h.z = s.z + oz + 0.5;
        h.y = sy;
        this.addEntity(h);
        this.particles.burst(h.x, h.y + 1, h.z, '#ffffff', 16, { speed: 2 });
      }
      this.ui.toast(`The wardens of the ${s.name} stir...`, 'danger');
    }

    let hostiles = 0;
    let boars = 0;
    for (const e of this.entities) {
      if (e.hostile && e.despawnable && p.dist(e) < 40) hostiles++;
      if (e instanceof Boar) boars++;
    }
    const px = Math.floor(p.x);
    const pz = Math.floor(p.z);
    const underground = p.y < this.world.top(px, pz) - 3 && p.y < this.world.gen.heightAt(px, pz) - 5;
    const night = !this.isDay();
    const biome = this.world.gen.biomeAt(px, pz);
    const calm = this.story.flags.bossDefeated ? 0.6 : 1;
    const cap = Math.round((underground ? 6 : night ? 9 : biome === 'ashlands' ? 6 : 3) * calm);
    if (hostiles < cap && Math.random() < (night || underground || biome === 'ashlands' ? 0.55 : 0.18)) this.trySpawn(underground, night, biome);
    if (!underground && !night && boars < 5 && biome === 'greenwood' && Math.random() < 0.15) this.trySpawnBoar();
  }

  private trySpawn(underground: boolean, night: boolean, biome: string) {
    const p = this.player;
    const w = this.world;
    for (let attempt = 0; attempt < 14; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const d = 16 + Math.random() * 14;
      const x = Math.floor(p.x + Math.cos(a) * d);
      const z = Math.floor(p.z + Math.sin(a) * d);
      if (Math.hypot(x - TOTEM.x, z - TOTEM.z) < 22 && !underground) continue; // the totem wards the ruins
      if (this.story.flags.forgeLit && Math.hypot(x - FORGE.x, z - FORGE.z) < 36) continue;
      if (this.spawnPoint && Math.hypot(x - this.spawnPoint.x, z - this.spawnPoint.z) < 10) continue;
      let y: number;
      if (underground) {
        y = Math.floor(p.y) + Math.floor((Math.random() - 0.5) * 12);
        if (y < 2) continue;
        if (w.get(x, y, z) !== B.AIR || w.get(x, y + 1, z) !== B.AIR || !w.solid(x, y - 1, z)) continue;
        const l = w.light(x, y, z);
        if ((l & 15) > 5 || l >> 4 > 6) continue;
      } else {
        y = w.top(x, z);
        if (BLOCKS[w.get(x, y - 1, z)].liquid || w.solid(x, y, z) || w.solid(x, y + 1, z)) continue;
        if ((w.light(x, y, z) & 15) > 7) continue;
      }
      const r = Math.random();
      const group: Mob[] = [];
      if (underground) group.push(r < 0.3 ? new Hollow() : r < 0.55 ? new Spider() : r < 0.8 ? new Bat() : y < 18 ? new HollowArcher() : new Blightling());
      else if (biome === 'ashlands') {
        if (r < 0.5) for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) group.push(new AshWolf());
        else group.push(r < 0.8 ? new Hollow() : new HollowArcher());
      } else if (night) group.push(r < 0.45 ? new Hollow() : r < 0.65 ? new HollowArcher() : r < 0.88 ? new Blightling() : new Spider());
      else group.push(new Blightling());
      group.forEach((e, i) => {
        e.x = x + 0.5 + (i % 2) * 1.2;
        e.z = z + 0.5 + Math.floor(i / 2) * 1.2;
        e.y = y + (e instanceof Bat ? 1 : 0);
        this.addEntity(e);
      });
      return;
    }
  }

  private trySpawnBoar() {
    const p = this.player;
    const a = Math.random() * Math.PI * 2;
    const x = Math.floor(p.x + Math.cos(a) * 24);
    const z = Math.floor(p.z + Math.sin(a) * 24);
    const y = this.world.top(x, z);
    if (BLOCKS[this.world.get(x, y - 1, z)].liquid || this.world.solid(x, y, z)) return;
    const b = new Boar();
    b.x = x + 0.5;
    b.z = z + 0.5;
    b.y = y;
    this.addEntity(b);
  }

  // ---------------------------------------------------------------- render

  render(dt: number) {
    const sc = this.scene;
    const p = this.player;
    const playing = this.state === 'play' || this.state === 'dead';
    const focus = playing ? new THREE.Vector3(p.x, p.y + 0.9, p.z) : sc.target.clone();

    // Stream terrain: synchronous on first load, budgeted afterwards.
    if (this.loading > 0) {
      sc.buildAll(this.world, focus.x, focus.z);
      this.loading = 0;
      if (playing && !p.dead) {
        const top = this.world.top(Math.floor(p.x), Math.floor(p.z));
        if (this.world.solid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) p.y = top;
      }
    } else sc.updateChunks(this.world, focus.x, focus.z);

    if (playing) {
      sc.follow(focus, dt);
      if (this.shakeAmt > 0.01) {
        sc.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
        sc.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      }
    } else sc.follow(sc.target, 1);
    sc.setTime(this.dayTime, this.eclipse);

    for (const e of this.entities) e.sync(dt, this);
    p.sync(dt, this);

    // Cutaway: hide everything above the player's head only when there's a real roof
    // (rock, a ceiling) directly overhead. Tree trunks and nearby walls don't count.
    const bx = Math.floor(p.x);
    const bz = Math.floor(p.z);
    const head = Math.floor(p.y + 2);
    let covered = false;
    if (playing && !p.dead)
      for (let y = head; y < head + 16 && !covered; y++) {
        const d = BLOCKS[this.world.get(bx, y, bz)];
        if (d.opaque && !d.tree) covered = true;
      }
    this.covered = covered;
    U.uCutY.value = covered ? Math.floor(p.y) + 2.95 : 999;
    U.uPlayer.value.set(p.x, p.y + 0.9, p.z);
    U.uSee.value = playing && !p.dead ? 1 : 0;

    // Dynamic point glows, nearest first.
    const lights: Entity[] = (playing && !p.dead ? [p as Entity] : []).concat(this.entities).filter((e) => e.glow > 0 && !e.dead && Math.abs(e.x - p.x) < 34 && Math.abs(e.z - p.z) < 34);
    lights.sort((a, b) => p.dist(a) - p.dist(b));
    const n = Math.min(MAX_LIGHTS, lights.length);
    for (let i = 0; i < n; i++) {
      const e = lights[i];
      U.uLights.value[i].set(e.x, e.y + (e === p ? 1.3 : e.h * 0.6), e.z, e.glow);
      const c = e.glowColor;
      const k = e === p ? 0.7 : 1;
      U.uLightCols.value[i].set(c.r * k, c.g * k, c.b * k);
    }
    U.uLightN.value = n;

    // Block highlight + crack overlay
    const pk = this.pick;
    sc.highlight.visible = !!pk && playing && this.inReach(pk.x, pk.y, pk.z);
    if (pk) sc.highlight.position.set(pk.x + 0.5, pk.y + 0.5, pk.z + 0.5);
    const mg = this.mining;
    sc.crack.visible = !!mg && mg.progress > 0;
    if (mg) {
      sc.crack.position.set(mg.x + 0.5, mg.y + 0.5, mg.z + 0.5);
      sc.setCrack(Math.floor(mg.progress * 5));
    }
    sc.render();
  }
}
