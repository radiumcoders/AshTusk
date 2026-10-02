/** DOM overlay UI: HUD, tabbed menu (pack / crafting / journal), dialogue and screens. */
import * as THREE from 'three';
import { audio } from '../engine/audio';
import { itemIconUrl, PORTRAITS } from '../gfx/icons';
import type { Game } from '../game/game';
import { HOTBAR, INV_SIZE, type Stack } from '../game/inventory';
import { type ItemDef, ITEMS, RARITY_COLOR } from '../game/items';
import { CATEGORIES, type Category, RECIPES, type Recipe, STATION_NAMES } from '../game/recipes';
import { INTRO_CARDS, type Line, type Speaker } from '../game/story';
import { B, BLOCKS } from '../world/blocks';
import { BIOME_NAMES } from '../world/generator';

type Tab = 'pack' | 'craft' | 'journal';
type Screen = 'title' | 'intro' | 'pause' | 'death' | 'credits' | null;

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};

const SPEAKERS: Record<Speaker, { name: string; cls: string }> = {
  vesh: { name: 'Old Mother Vesh', cls: 'vesh' },
  urka: { name: 'Urka Ashtusk', cls: 'urka' },
  narrator: { name: '', cls: 'narrator' },
  king: { name: 'The Hollow King', cls: 'king' },
};

const BESTIARY: [kind: string, name: string, desc: string][] = [
  ['boar', 'Boar', 'Grumpy and delicious. Drops meat and hide for armor.'],
  ['blightling', 'Blightling', 'Hollow-tainted gel that hops at anything warm.'],
  ['hollow', 'Hollow', 'Hunger in a borrowed shape. Withers in sunlight.'],
  ['archer', 'Hollow Archer', 'Keeps its distance. Roll through its bolts.'],
  ['wolf', 'Ash Wolf', 'Hunts in packs across the Ashlands. Circles, then pounces.'],
  ['spider', 'Gloomcrawler', 'Cave spider. Its bite slows you down.'],
  ['bat', 'Gloom Bat', 'Erratic cave flier. More annoying than dangerous.'],
  ['warden', 'Shrine Warden', 'Ancient guardians of the Ember Hearts. They never sleep.'],
  ['king', 'The Hollow King', 'The hunger that wears a crown.'],
];

const CONTROLS = `
  <div class="controls">
    <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</div><div><kbd>Space</kbd> jump / swim</div>
    <div><kbd>Shift</kbd> dodge roll</div><div><kbd>Q</kbd><kbd>E</kbd> rotate view</div>
    <div><kbd>LMB</kbd> attack · mine (hold)</div><div><kbd>RMB</kbd> place · use · eat · equip</div>
    <div><kbd>1</kbd>–<kbd>9</kbd> / wheel hotbar</div><div><kbd>Ctrl</kbd>+wheel zoom</div>
    <div><kbd>Tab</kbd> pack · <kbd>C</kbd> craft</div><div><kbd>J</kbd> journal · <kbd>F</kbd> interact</div>
  </div>`;

interface Floater { el: HTMLElement; x: number; y: number; z: number; life: number }

export class UI {
  dialogueOpen = false;
  panelOpen: Tab | null = null;
  screen: Screen = 'title';

  private root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private screens: Record<string, HTMLElement> = {};
  private minimap!: HTMLCanvasElement;
  private mapT = 0;
  private floaters: Floater[] = [];
  private lines: Line[] = [];
  private lineDone?: () => void;
  private typed = 0;
  private invVersion = -1;
  private hotbarVersion = -1;
  private itemNameT = 0;
  private lastSelected = -1;
  private introI = 0;
  private onIntroDone?: () => void;
  private cat: Category | 'all' = 'all';
  private selRecipe: Recipe | null = null;
  private tipFor: string | null = null;

  constructor(private g: Game) {
    this.root = document.getElementById('ui')!;
    this.build();
  }

  // ---------------------------------------------------------------- build

  private build() {
    const r = this.root;
    const add = (key: string, el: HTMLElement) => {
      this.els[key] = el;
      r.append(el);
      return el;
    };

    add('tl', h('div', 'hud hud-tl', `
      <div class="portrait-frame"><img src="${PORTRAITS.urka}"></div>
      <div class="vitals">
        <div class="hp"><div class="hp-fill"></div><span class="hp-text"></span></div>
        <div class="subbar"><span class="def"></span><span class="roll"><i></i>ROLL</span></div>
        <div class="clock"></div>
      </div>`));

    const tr = add('tr', h('div', 'hud hud-tr'));
    const mapWrap = h('div', 'map-wrap', '<canvas width="96" height="96"></canvas><div class="map-n">N</div><div class="map-me"></div>');
    this.minimap = mapWrap.querySelector('canvas')!;
    this.els.quest = h('div', 'quest');
    tr.append(mapWrap, this.els.quest);

    const hb = add('hotbar', h('div', 'hud hotbar'));
    for (let i = 0; i < HOTBAR; i++) {
      const s = h('div', 'slot', `<span class="key">${i + 1}</span>`);
      s.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.g.inventory.selected = i;
        this.g.inventory.changed();
      });
      hb.append(s);
    }
    add('itemName', h('div', 'hud item-name'));
    add('prompt', h('div', 'hud prompt'));
    add('marker', h('div', 'hud marker', '<div class="arrow"></div><div class="label"></div>'));
    add('pickups', h('div', 'hud pickups'));
    add('toasts', h('div', 'hud toasts'));
    add('boss', h('div', 'hud boss', '<div class="boss-name">The Hollow King</div><div class="boss-bar"><div></div></div>'));
    add('floaters', h('div', 'floaters'));

    const dlg = add('dlg', h('div', 'dialogue', '<div class="portrait"></div><div class="body"><div class="who"></div><div class="text"></div><div class="next">Space ▸</div></div>'));
    dlg.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.advanceDialogue();
    });

    this.buildMenu();
    this.buildScreens();

    add('cursor', h('div', 'cursor-stack'));
    add('tooltip', h('div', 'tooltip'));
    add('flash', h('div', 'damage-flash'));
    r.append(h('div', 'vignette'));
    window.addEventListener('mousemove', (e) => {
      this.els.cursor.style.transform = `translate(${e.clientX - 20}px, ${e.clientY - 20}px)`;
      const tw = this.els.tooltip.offsetWidth;
      const x = e.clientX + 18 + tw > window.innerWidth ? e.clientX - tw - 12 : e.clientX + 18;
      this.els.tooltip.style.transform = `translate(${x}px, ${Math.min(e.clientY + 12, window.innerHeight - this.els.tooltip.offsetHeight - 8)}px)`;
    });
    document.getElementById('game')!.addEventListener('mousedown', () => {
      if (this.panelOpen === 'pack' && this.g.inventory.cursor) this.g.dropCursor();
    });
  }

  private buildMenu() {
    const m = h('div', 'menu-win');
    m.innerHTML = `
      <div class="tabs">
        <button data-tab="pack">Pack <kbd>Tab</kbd></button>
        <button data-tab="craft">Crafting <kbd>C</kbd></button>
        <button data-tab="journal">Journal <kbd>J</kbd></button>
        <button class="x" data-close="1">✕</button>
      </div>
      <div class="tab-body pack">
        <div class="doll">
          <div class="doll-top"><img class="doll-face" src="${PORTRAITS.urka}"><div><b>Urka Ashtusk</b><small>Last of the forge-keepers</small></div></div>
          <div class="equip"></div>
          <div class="stats"></div>
        </div>
        <div class="pack-col">
          <div class="grid"></div>
          <p class="tip">Click to move · Right-click to split · Shift-click to equip or quick-move · Click outside to throw</p>
        </div>
      </div>
      <div class="tab-body craft">
        <div class="cats"></div>
        <div class="rgrid"></div>
        <div class="detail"></div>
      </div>
      <div class="tab-body journal"></div>`;
    m.addEventListener('mousedown', (e) => e.stopPropagation());
    m.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
      b.addEventListener('click', () => (b.dataset.close ? this.closePanels() : this.togglePanel(b.dataset.tab as Tab, true))),
    );

    const grid = m.querySelector('.pack .grid')!;
    for (let i = 0; i < INV_SIZE; i++) {
      const s = h('div', 'slot');
      if (i < HOTBAR) s.classList.add('hot');
      s.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const inv = this.g.inventory;
        if (e.button === 2) inv.rightClickSlot(i);
        else if (e.shiftKey && inv.slots[i]) {
          if (!inv.equipFrom(i)) this.quickMove(i);
          else audio.play('equip');
        } else inv.clickSlot(i);
        audio.play('ui');
      });
      s.addEventListener('dblclick', () => this.g.inventory.equipFrom(i) && audio.play('equip'));
      s.addEventListener('mouseenter', () => this.showTip(this.g.inventory.slots[i]?.id));
      s.addEventListener('mouseleave', () => this.showTip());
      grid.append(s);
    }
    const eq = m.querySelector('.equip')!;
    for (const [slot, label] of [['head', 'Head'], ['chest', 'Chest'], ['feet', 'Feet'], ['charm', 'Charm']] as const) {
      const row = h('div', 'eq-row', `<div class="slot eq ${slot}"></div><span>${label}</span>`);
      const s = row.querySelector('.slot') as HTMLElement;
      s.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (this.g.inventory.clickEquip(slot)) audio.play('equip');
        else this.toast(`That doesn't go on your ${label.toLowerCase()}.`);
      });
      s.addEventListener('mouseenter', () => this.showTip(this.g.inventory.equip[slot]?.id));
      s.addEventListener('mouseleave', () => this.showTip());
      eq.append(row);
    }
    this.els.menu = m;
    this.root.append(m);
  }

  private quickMove(i: number) {
    const inv = this.g.inventory;
    const range = i < HOTBAR ? [HOTBAR, INV_SIZE] : [0, HOTBAR];
    for (let j = range[0]; j < range[1]; j++)
      if (!inv.slots[j]) {
        inv.slots[j] = inv.slots[i];
        inv.slots[i] = null;
        inv.changed();
        return;
      }
  }

  private buildScreens() {
    const title = h('div', 'screen title');
    title.innerHTML = `
      <div class="logo"><img class="face" src="${PORTRAITS.urka}" alt=""><h1>ASHTUSK</h1><div class="sub">Embers of the Old Clan</div></div>
      <div class="menu">
        <button data-a="continue" class="primary">Continue Saga</button>
        <button data-a="new">New Saga</button>
        <label class="seed">Seed <input type="text" placeholder="random" maxlength="24"></label>
        <button data-a="controls" class="ghost">Controls</button>
      </div>
      <div class="ctrl-box hidden">${CONTROLS}</div>
      <div class="foot">An isometric open-world voxel saga · every block, beast and sound generated in code</div>`;
    title.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (!a) return;
      audio.init();
      audio.play('ui');
      if (a === 'continue') this.g.continueGame();
      if (a === 'new') {
        const seed = (title.querySelector('input') as HTMLInputElement).value.trim();
        if (this.g.hasSave() && !confirm('Start a new saga? Your current world will be overwritten.')) return;
        this.g.newGame(seed);
      }
      if (a === 'controls') title.querySelector('.ctrl-box')!.classList.toggle('hidden');
    });

    const intro = h('div', 'screen intro', '<p class="card"></p><div class="hint">Click or press Space</div><button class="ghost skip">Skip</button>');
    intro.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).classList.contains('skip')) this.finishIntro();
      else this.nextCard();
    });
    window.addEventListener('keydown', (e) => {
      if (this.screen === 'intro' && (e.code === 'Space' || e.code === 'Enter')) this.nextCard();
    });

    const pause = h('div', 'screen pause');
    pause.innerHTML = `<h2>Resting by the fire</h2><div class="menu">
      <button data-a="resume" class="primary">Resume</button><button data-a="save">Save</button>
      <button data-a="pixel">Pixel size: 2×</button><button data-a="shadows">Shadows: on</button>
      <button data-a="music">Music: on</button><button data-a="title" class="ghost">Save & Quit to Title</button></div>${CONTROLS}`;
    pause.addEventListener('mousedown', (e) => e.stopPropagation());
    pause.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const a = el.dataset.a;
      if (!a) return;
      audio.play('ui');
      const sc = this.g.scene;
      if (a === 'resume') this.setScreen(null);
      if (a === 'save') {
        this.g.save();
        this.toast('Saga saved.');
      }
      if (a === 'music') el.textContent = `Music: ${audio.toggleMusic() ? 'on' : 'off'}`;
      if (a === 'pixel') sc.setPixelScale(sc.pixelScale >= 3 ? 1 : sc.pixelScale + 1);
      if (a === 'shadows') sc.setShadows(!sc.renderer.shadowMap.enabled);
      if (a === 'title') this.g.quitToTitle();
      this.syncPause();
    });

    const death = h('div', 'screen death', '<h2>You fell.</h2><p>The ancestors carry you home...</p><button class="primary">Rise again</button>');
    death.querySelector('button')!.addEventListener('click', () => this.g.respawn());
    const credits = h('div', 'screen credits');
    credits.addEventListener('mousedown', (e) => e.stopPropagation());

    this.screens = { title, intro, pause, death, credits };
    this.root.append(title, intro, pause, death, credits);
    this.setScreen('title');
  }

  private syncPause() {
    const p = this.screens.pause;
    const sc = this.g.scene;
    (p.querySelector('[data-a="pixel"]') as HTMLElement).textContent = `Pixel size: ${sc.pixelScale}×`;
    (p.querySelector('[data-a="shadows"]') as HTMLElement).textContent = `Shadows: ${sc.renderer.shadowMap.enabled ? 'on' : 'off'}`;
  }

  // ---------------------------------------------------------------- screens

  setScreen(s: Screen) {
    this.screen = s;
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('show', k === s);
    this.root.classList.toggle('in-menu', s === 'title' || s === 'intro');
    if (s === 'title') (this.screens.title.querySelector('[data-a="continue"]') as HTMLElement).style.display = this.g.hasSave() ? '' : 'none';
    if (s === 'pause') this.syncPause();
  }

  playIntro(done: () => void) {
    this.introI = -1;
    this.onIntroDone = done;
    this.setScreen('intro');
    this.nextCard();
  }

  nextCard() {
    this.introI++;
    if (this.introI >= INTRO_CARDS.length) return this.finishIntro();
    const card = this.screens.intro.querySelector('.card') as HTMLElement;
    card.classList.remove('in');
    void card.offsetWidth;
    card.textContent = INTRO_CARDS[this.introI];
    card.classList.add('in');
  }

  private finishIntro() {
    if (this.screen !== 'intro') return;
    this.setScreen(null);
    this.onIntroDone?.();
  }

  showDeath() {
    this.setScreen('death');
  }

  showCredits() {
    const s = this.g.story.stats;
    const el = this.screens.credits;
    el.innerHTML = `
      <h1>The Forge Burns Again</h1>
      <p class="epitaph">Urka Ashtusk, last of the forge-keepers, relit the Worldforge and broke the Hollow King.</p>
      <div class="stats"><div><b>${this.g.day}</b>days</div><div><b>${s.kills}</b>foes felled</div><div><b>${s.chests}</b>chests looted</div><div><b>${Object.values(s.crafted).reduce((a, b) => a + b, 0)}</b>things crafted</div></div>
      <p class="thanks">The lit Worldforge now crafts legendary gear. Thank you for playing ASHTUSK.</p>
      <button class="primary">Keep exploring</button>`;
    el.querySelector('button')!.addEventListener('click', () => this.setScreen(null));
    this.setScreen('credits');
  }

  // ---------------------------------------------------------------- dialogue

  say(lines: Line[], done?: () => void) {
    if (this.dialogueOpen) {
      this.lines.push(...lines);
      const prev = this.lineDone;
      this.lineDone = () => {
        prev?.();
        done?.();
      };
      return;
    }
    this.closePanels();
    this.lines = [...lines];
    this.lineDone = done;
    this.dialogueOpen = true;
    this.showLine();
  }

  private showLine() {
    const l = this.lines[0];
    const sp = SPEAKERS[l.who];
    const dlg = this.els.dlg;
    dlg.className = `dialogue show ${sp.cls}`;
    dlg.querySelector('.who')!.textContent = sp.name;
    const src = l.who === 'vesh' ? PORTRAITS.vesh : l.who === 'urka' ? PORTRAITS.urka : l.who === 'king' ? PORTRAITS.king : '';
    (dlg.querySelector('.portrait') as HTMLElement).style.backgroundImage = src ? `url(${src})` : 'none';
    this.typed = 0;
  }

  advanceDialogue() {
    if (!this.dialogueOpen) return;
    const l = this.lines[0];
    if (this.typed < l.text.length) {
      this.typed = l.text.length;
      return;
    }
    this.lines.shift();
    if (this.lines.length) return this.showLine();
    this.dialogueOpen = false;
    this.els.dlg.classList.remove('show');
    const cb = this.lineDone;
    this.lineDone = undefined;
    cb?.();
  }

  // ---------------------------------------------------------------- menu

  togglePanel(tab: Tab, force = false) {
    const open = force || this.panelOpen !== tab;
    this.panelOpen = open ? tab : null;
    const m = this.els.menu;
    m.classList.toggle('show', open);
    m.dataset.tab = tab;
    m.querySelectorAll<HTMLElement>('.tabs button[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (!open) {
      const rest = this.g.inventory.stowCursor();
      if (rest) this.g.spawnDrop(this.g.player.x, this.g.player.y + 1, this.g.player.z, rest.id, rest.n, true);
      this.showTip();
    }
    if (tab === 'journal' && open) this.renderJournal();
    this.invVersion = -1;
    audio.play('ui');
  }

  closePanels() {
    if (this.panelOpen) this.togglePanel(this.panelOpen);
  }

  private slotHtml(s: Stack | null | undefined) {
    if (!s) return '';
    const d = ITEMS[s.id];
    return `<img src="${itemIconUrl(s.id)}">${s.n > 1 ? `<b>${s.n}</b>` : ''}<i class="rar" style="background:${RARITY_COLOR[d.rarity]}"></i>`;
  }

  private renderPack() {
    const inv = this.g.inventory;
    const m = this.els.menu;
    m.querySelectorAll<HTMLElement>('.pack .grid .slot').forEach((el, i) => {
      el.classList.toggle('sel', i === inv.selected);
      el.innerHTML = this.slotHtml(inv.slots[i]);
    });
    for (const slot of ['head', 'chest', 'feet', 'charm'] as const) {
      const el = m.querySelector(`.eq.${slot}`) as HTMLElement;
      el.innerHTML = this.slotHtml(inv.equip[slot]);
      el.classList.toggle('empty', !inv.equip[slot]);
    }
    const held = inv.held ? ITEMS[inv.held.id] : null;
    const w = held?.weapon;
    const def = inv.defense();
    const charm = inv.charm();
    m.querySelector('.stats')!.innerHTML = `
      <div><span>Health</span><b>${Math.ceil(this.g.player.hp)} / ${this.g.player.maxHp}</b></div>
      <div><span>Defense</span><b>${def} <small>(−${Math.round(Math.min(0.6, def * 0.035) * 100)}% dmg)</small></b></div>
      <div><span>Attack</span><b>${w ? `${Math.round(w.damage * (charm === 'might' ? 1.2 : 1))} · ${(1 / w.speed).toFixed(1)}/s` : '3'}</b></div>
      <div><span>Speed</span><b>${charm === 'swift' ? '118%' : '100%'}</b></div>
      <div><span>Fireproof</span><b>${inv.fireproof() ? 'yes' : 'no'}</b></div>`;
    this.syncCursor();
  }

  private syncCursor() {
    const c = this.g.inventory.cursor;
    this.els.cursor.style.display = c ? 'block' : 'none';
    if (c) this.els.cursor.innerHTML = `<img src="${itemIconUrl(c.id)}">${c.n > 1 ? `<b>${c.n}</b>` : ''}`;
  }

  private canCraft(r: Recipe, stations: Set<string>) {
    const inv = this.g.inventory;
    return r.cost.every(([id, n]) => inv.count(id) >= n) && (!r.station || stations.has(r.station));
  }

  private renderCraft() {
    const m = this.els.menu;
    const stations = this.g.nearStations();
    const cats = m.querySelector('.craft .cats')!;
    cats.innerHTML = '';
    for (const c of CATEGORIES) {
      const list = RECIPES.filter((r) => c.id === 'all' || r.cat === c.id);
      const ready = list.filter((r) => this.canCraft(r, stations)).length;
      const b = h('button', `cat ${this.cat === c.id ? 'on' : ''}`, `${c.label}${ready ? `<em>${ready}</em>` : ''}`);
      b.addEventListener('click', () => {
        this.cat = c.id;
        this.invVersion = -1;
        audio.play('ui');
      });
      cats.append(b);
    }
    cats.append(
      h('div', 'stations', `<small>Nearby</small>${(['workbench', 'furnace', 'worldforge'] as const)
        .map((s) => `<span class="${stations.has(s) ? 'on' : ''}">${STATION_NAMES[s]}</span>`)
        .join('')}`),
    );

    const grid = m.querySelector('.craft .rgrid')!;
    grid.innerHTML = '';
    const list = RECIPES.filter((r) => this.cat === 'all' || r.cat === this.cat).sort(
      (a, b) => Number(this.canCraft(b, stations)) - Number(this.canCraft(a, stations)),
    );
    if (!this.selRecipe || !list.includes(this.selRecipe)) this.selRecipe = list[0] ?? null;
    for (const r of list) {
      const ok = this.canCraft(r, stations);
      const d = ITEMS[r.out];
      const tile = h('div', `rtile ${ok ? 'ok' : ''} ${this.selRecipe === r ? 'sel' : ''}`,
        `<img src="${itemIconUrl(r.out)}">${r.n > 1 ? `<b>${r.n}</b>` : ''}<i class="rar" style="background:${RARITY_COLOR[d.rarity]}"></i>`);
      tile.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.selRecipe = r;
        this.invVersion = -1;
        audio.play('ui');
      });
      tile.addEventListener('dblclick', () => ok && this.g.craft(r));
      tile.addEventListener('mouseenter', () => this.showTip(r.out));
      tile.addEventListener('mouseleave', () => this.showTip());
      grid.append(tile);
    }

    const det = m.querySelector('.craft .detail')!;
    const r = this.selRecipe;
    if (!r) {
      det.innerHTML = '';
      return;
    }
    const d = ITEMS[r.out];
    const inv = this.g.inventory;
    const ok = this.canCraft(r, stations);
    const maxTimes = Math.max(0, Math.min(99, ...r.cost.map(([id, n]) => Math.floor(inv.count(id) / n))));
    det.innerHTML = `
      <div class="d-head"><img src="${itemIconUrl(r.out)}"><div><b style="color:${RARITY_COLOR[d.rarity]}">${d.name}${r.n > 1 ? ` ×${r.n}` : ''}</b><small>${d.rarity} ${d.kind}</small></div></div>
      <p class="d-desc">${d.desc}</p>
      <div class="d-stats">${this.statLines(d).map((s) => `<span>${s}</span>`).join('')}</div>
      <div class="d-cost">${r.cost
        .map(([id, n]) => {
          const have = inv.count(id);
          return `<div class="${have >= n ? 'have' : 'miss'}"><img src="${itemIconUrl(id)}"><span>${ITEMS[id].name}</span><b>${have}/${n}</b></div>`;
        })
        .join('')}
      ${r.station ? `<div class="${stations.has(r.station) ? 'have' : 'miss'} st"><span>Needs: ${STATION_NAMES[r.station]}</span><b>${stations.has(r.station) ? '✓' : '✗'}</b></div>` : ''}</div>
      <div class="d-btns"><button class="primary" data-n="1" ${ok ? '' : 'disabled'}>Craft</button><button data-n="5" ${ok && maxTimes >= 2 ? '' : 'disabled'}>×5</button><button data-n="${maxTimes}" ${ok && maxTimes >= 2 ? '' : 'disabled'}>Max (${maxTimes})</button></div>`;
    det.querySelectorAll<HTMLButtonElement>('.d-btns button').forEach((b) =>
      b.addEventListener('click', () => {
        this.g.craft(r, Number(b.dataset.n));
        this.invVersion = -1;
      }),
    );
  }

  private statLines(d: ItemDef): string[] {
    const s: string[] = [];
    const w = d.weapon;
    if (w && d.kind !== 'tool') {
      const typeName = { swing: 'Cleave', dagger: 'Quick stab', thrust: 'Long thrust', smash: 'Area smash', bow: 'Bow · uses arrows', throw: 'Thrown', staff: 'Bursting fireball' }[w.type];
      s.push(typeName);
      s.push(`${w.damage} damage`);
      s.push(w.type === 'bow' ? `${w.speed}s full draw` : `${(1 / w.speed).toFixed(1)} attacks/s`);
      if (['swing', 'dagger', 'thrust', 'smash'].includes(w.type)) s.push(`${w.range} reach`);
      if (w.burn) s.push('Sets foes ablaze');
      if (w.slow) s.push('Slows foes');
    }
    if (d.mine) s.push(`Mining power ${d.mine.power} · tier ${d.mine.tier}`);
    if (d.armor) s.push(`+${d.armor.defense} defense (${d.armor.slot})`);
    if (d.armor?.fireproof) s.push('Fireproof with 2+ pieces');
    if (d.heal) s.push(`Heals ${d.heal}`);
    if (d.place !== undefined && BLOCKS[d.place].light) s.push('Emits light');
    return s;
  }

  private renderJournal() {
    const st = this.g.story;
    const o = st.objective();
    const hearts = (['sun', 'frost', 'deep'] as const)
      .map((k) => `<div class="heart ${st.flags.hearts[k] ? 'got' : ''}"><img src="${itemIconUrl(`heart_${k}`)}"><span>${ITEMS[`heart_${k}`].name}</span></div>`)
      .join('');
    const beasts = BESTIARY.map(([k, name, desc]) => {
      const n = st.stats.bestiary[k] ?? 0;
      return `<div class="beast ${n ? 'known' : ''}"><b>${n ? name : '???'}</b><span>${n ? desc : 'Not yet encountered.'}</span><em>${n ? `${n} slain` : ''}</em></div>`;
    }).join('');
    this.els.menu.querySelector('.tab-body.journal')!.innerHTML = `
      <div class="j-left">
        <div class="jq"><h3>${o.title}</h3><p class="goal">${o.text}</p><p class="hint">${o.hint}</p></div>
        <h3>Ember Hearts</h3><div class="hearts">${hearts}</div>
        <h3>The Saga So Far</h3>${INTRO_CARDS.map((c) => `<p class="lore">${c.replace(/\n/g, '<br>')}</p>`).join('')}
      </div>
      <div class="j-right"><h3>Bestiary</h3><div class="bestiary">${beasts}</div></div>`;
  }

  private showTip(id?: string) {
    const t = this.els.tooltip;
    this.tipFor = id ?? null;
    if (!id) {
      t.style.display = 'none';
      return;
    }
    const d = ITEMS[id];
    t.innerHTML = `<b style="color:${RARITY_COLOR[d.rarity]}">${d.name}</b><i>${d.rarity} ${d.kind}</i>${this.statLines(d).map((s) => `<em>${s}</em>`).join('')}<p>${d.desc}</p>`;
    t.style.display = 'block';
  }

  // ---------------------------------------------------------------- feedback

  toast(text: string, kind = '') {
    const t = h('div', `toast ${kind}`);
    t.textContent = text;
    this.els.toasts.append(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
    while (this.els.toasts.children.length > 4) this.els.toasts.firstElementChild!.remove();
  }

  pickup(id: string, n: number) {
    const box = this.els.pickups;
    const last = box.lastElementChild as HTMLElement | null;
    if (last && last.dataset.id === id && !last.classList.contains('out')) {
      const total = Number(last.dataset.n) + n;
      last.dataset.n = String(total);
      last.querySelector('b')!.textContent = `+${total}`;
      return;
    }
    const d = ITEMS[id];
    const p = h('div', 'pick', `<img src="${itemIconUrl(id)}"><b>+${n}</b> <span style="color:${RARITY_COLOR[d.rarity]}">${d.name}</span>`);
    p.dataset.id = id;
    p.dataset.n = String(n);
    box.append(p);
    setTimeout(() => p.classList.add('out'), 2200);
    setTimeout(() => p.remove(), 2800);
    while (box.children.length > 6) box.firstElementChild!.remove();
  }

  damageFlash() {
    const f = this.els.flash;
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  floatText(x: number, y: number, z: number, text: string, color: string) {
    const el = h('div', 'floater');
    el.textContent = text;
    el.style.color = color;
    this.els.floaters.append(el);
    this.floaters.push({ el, x: x + (Math.random() - 0.5) * 0.4, y, z, life: 0.9 });
  }

  // ---------------------------------------------------------------- per-frame

  update(dt: number) {
    const g = this.g;
    const playing = g.state === 'play';
    this.root.classList.toggle('playing', playing);
    this.updateFloaters(dt);
    if (!playing) return;

    const p = g.player;
    const inv = g.inventory;
    const fill = this.root.querySelector('.hp-fill') as HTMLElement;
    fill.style.width = `${(p.hp / p.maxHp) * 100}%`;
    fill.classList.toggle('low', p.hp < p.maxHp * 0.3);
    (this.root.querySelector('.hp-text') as HTMLElement).textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    (this.root.querySelector('.subbar .def') as HTMLElement).innerHTML = `<i class="shield"></i>${inv.defense()}`;
    (this.root.querySelector('.subbar .roll') as HTMLElement).classList.toggle('ready', p.rollCd <= 0);
    const bx = Math.floor(p.x);
    const bz = Math.floor(p.z);
    const biome = BIOME_NAMES[g.world.gen.biomeAt(bx, bz)];
    const depth = g.world.gen.heightAt(bx, bz) - Math.floor(p.y);
    (this.root.querySelector('.clock') as HTMLElement).innerHTML =
      `<i class="${g.isDay() ? 'sun' : 'moon'}"></i>Day ${g.day} · ${g.covered && depth > 4 ? `${depth}m deep · ` : ''}${biome}`;

    const o = g.story.objective();
    this.els.quest.innerHTML = `<div class="qt">${o.title}</div><div class="qg">${o.text}</div>`;

    // Objective marker: over the target, or clamped to the screen edge.
    const t = g.story.target();
    const mk = this.els.marker;
    mk.style.display = t ? 'flex' : 'none';
    if (t) {
      const s = g.scene.project(new THREE.Vector3(t.x, t.y, t.z));
      const dist = Math.round(Math.hypot(t.x - p.x, t.z - p.z));
      const pad = 70;
      let x = s.x;
      let y = s.y;
      const off = !s.visible || x < pad || y < pad || x > innerWidth - pad || y > innerHeight - pad;
      if (off) {
        const cx = innerWidth / 2;
        const cy = innerHeight / 2;
        const dx = x - cx;
        const dy = y - cy;
        const k = Math.min((cx - pad) / Math.abs(dx || 1), (cy - pad) / Math.abs(dy || 1));
        x = cx + dx * k;
        y = cy + dy * k;
        (mk.firstElementChild as HTMLElement).style.transform = `rotate(${Math.atan2(dy, dx) - Math.PI / 2}rad)`;
      } else (mk.firstElementChild as HTMLElement).style.transform = 'rotate(0deg)';
      mk.classList.toggle('edge', off);
      mk.style.transform = `translate(${x}px, ${y}px)`;
      mk.querySelector('.label')!.textContent = `${t.label} · ${dist}m`;
    }

    // Hotbar
    if (this.hotbarVersion !== inv.version) {
      this.hotbarVersion = inv.version;
      this.els.hotbar.querySelectorAll<HTMLElement>('.slot').forEach((el, i) => {
        el.classList.toggle('sel', i === inv.selected);
        el.innerHTML = `<span class="key">${i + 1}</span>${this.slotHtml(inv.slots[i])}`;
      });
      if (this.panelOpen === 'pack') this.syncCursor();
    }
    if (inv.selected !== this.lastSelected) {
      this.lastSelected = inv.selected;
      this.itemNameT = 1.8;
    }
    this.itemNameT -= dt;
    const held = inv.held;
    const bow = held && ITEMS[held.id].weapon?.type === 'bow';
    this.els.itemName.innerHTML = held ? `<span style="color:${RARITY_COLOR[ITEMS[held.id].rarity]}">${ITEMS[held.id].name}</span>${bow ? ` · ${inv.count('arrow')} arrows` : ''}` : '';
    this.els.itemName.style.opacity = (this.itemNameT > 0 || bow) && !this.dialogueOpen ? '1' : '0';

    if (this.panelOpen && this.panelOpen !== 'journal') {
      const key = inv.version + g.stationsKey() + (this.panelOpen === 'craft' ? 0.5 : 0);
      if (this.invVersion !== key) {
        this.invVersion = key;
        if (this.panelOpen === 'pack') this.renderPack();
        else this.renderCraft();
        if (this.tipFor) this.showTip(this.tipFor);
      }
    }

    // Interaction prompt anchored above the object
    const it = g.nearestInteractable();
    const pr = this.els.prompt;
    pr.style.display = it && !this.dialogueOpen && !this.panelOpen ? 'block' : 'none';
    if (it) {
      const s = g.scene.project(new THREE.Vector3(it.x, it.y, it.z));
      pr.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      pr.innerHTML = `<kbd>F</kbd> ${it.label}`;
    }

    const boss = g.bossEntity();
    this.els.boss.classList.toggle('show', !!boss);
    if (boss) (this.els.boss.querySelector('.boss-bar div') as HTMLElement).style.width = `${(boss.hp / boss.maxHp) * 100}%`;

    if (this.dialogueOpen) {
      const l = this.lines[0];
      const el = this.els.dlg.querySelector('.text')!;
      if (this.typed < l.text.length) {
        this.typed = Math.min(l.text.length, this.typed + dt * 55);
        el.textContent = l.text.slice(0, Math.floor(this.typed));
      } else el.textContent = l.text;
    }

    if ((this.mapT -= dt) <= 0) {
      this.mapT = 0.35;
      this.drawMinimap();
    }
    const rot = g.scene.yaw;
    (this.minimap as HTMLElement).style.transform = `rotate(${rot}rad)`;
    (this.minimap.parentElement!.querySelector('.map-n') as HTMLElement).style.transform =
      `translate(-50%, -50%) rotate(${rot}rad) translateY(-58px) rotate(${-rot}rad)`;
  }

  private updateFloaters(dt: number) {
    const sc = this.g.scene;
    const v = new THREE.Vector3();
    this.floaters = this.floaters.filter((f) => {
      f.life -= dt;
      f.y += dt * 1.2;
      if (f.life <= 0) {
        f.el.remove();
        return false;
      }
      const s = sc.project(v.set(f.x, f.y, f.z));
      f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${1 + Math.max(0, f.life - 0.7) * 2})`;
      f.el.style.opacity = String(Math.min(1, f.life * 2.5));
      return true;
    });
  }

  private drawMinimap() {
    const g = this.g;
    const ctx = this.minimap.getContext('2d')!;
    const N = this.minimap.width;
    const img = ctx.createImageData(N, N);
    const px = Math.floor(g.player.x);
    const pz = Math.floor(g.player.z);
    const py = Math.floor(g.player.y);
    const cache = new Map<number, number[]>();
    const col = (id: number) => {
      let c = cache.get(id);
      if (!c) {
        const n = parseInt(BLOCKS[id].color.slice(1), 16);
        cache.set(id, (c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]));
      }
      return c;
    };
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = px - N / 2 + i;
        const z = pz - N / 2 + j;
        const o = (j * N + i) * 4;
        if (!g.world.peek(x >> 4, z >> 4)) continue;
        if (g.covered) {
          // Underground: a slice at the player's level
          const id = g.world.get(x, py, z);
          const c = BLOCKS[id].liquid ? col(id) : BLOCKS[id].solid ? [38, 34, 44] : [120, 108, 96];
          img.data[o] = c[0];
          img.data[o + 1] = c[1];
          img.data[o + 2] = c[2];
          img.data[o + 3] = 255;
          continue;
        }
        let y = 62;
        let id = 0;
        while (y > 0 && ((id = g.world.get(x, y, z)) === B.AIR || (BLOCKS[id].model !== 'cube' && !BLOCKS[id].liquid))) y--;
        const c = col(id);
        const shade = 0.7 + (y - 30) * 0.014;
        img.data[o] = c[0] * shade;
        img.data[o + 1] = c[1] * shade;
        img.data[o + 2] = c[2] * shade;
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    const t = g.story.target();
    if (t) {
      const cx = Math.max(3, Math.min(N - 3, t.x - px + N / 2));
      const cz = Math.max(3, Math.min(N - 3, t.z - pz + N / 2));
      ctx.fillStyle = '#ffb02e';
      ctx.fillRect(cx - 2, cz - 2, 5, 5);
      ctx.fillStyle = '#1a0e04';
      ctx.fillRect(cx - 1, cz - 1, 3, 3);
    }
  }
}
