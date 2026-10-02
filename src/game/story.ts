/**
 * ASHTUSK — the story.
 *
 * The Worldforge, struck by the first orc from the heart of a falling star,
 * kept the Hollow asleep for a thousand winters. Now it is cold. Urka
 * Ashtusk, last of the forge-keepers, is woken by the spirit of Old Mother
 * Vesh and sent to recover the three Ember Hearts and relight the forge.
 */
import { FORGE, type HeartKey, OLD_STAIR, SHRINES } from '../config';
import { audio } from '../engine/audio';
import type { Game } from './game';

export type Speaker = 'vesh' | 'urka' | 'narrator' | 'king';
export interface Line { who: Speaker; text: string }

const V = (text: string): Line => ({ who: 'vesh', text });
const U = (text: string): Line => ({ who: 'urka', text });
const N = (text: string): Line => ({ who: 'narrator', text });
const K = (text: string): Line => ({ who: 'king', text });

export const INTRO_CARDS = [
  'Before the clans, before the names, there was the Worldforge — a fire beneath the mountain, struck by the first orc from the heart of a falling star.',
  'For a thousand winters the Ashtusk clan kept it burning. And while it burned, the Hollow slept: a pale hunger in the deep that eats colour, warmth and memory.',
  'Then came the Long Frost. The forge-keepers grew few. The fire grew small. And one night, it went out.',
  'The Hollow woke. The clan scattered to ash and wind. Only one forge-keeper remains.\n\nYou are Urka Ashtusk. The ancestors are not finished with you.',
];

export interface Flags {
  hearts: Record<HeartKey, boolean>;
  forgeLit: boolean;
  bossSpawned: boolean;
  bossDefeated: boolean;
  placedWorkbench: boolean;
  seenNight: boolean;
  diedOnce: boolean;
}

export interface Stats {
  gathered: Record<string, number>;
  crafted: Record<string, number>;
  kills: number;
  bestiary: Record<string, number>;
  chests: number;
}

interface Quest {
  title: string;
  hint: string;
  start: Line[];
  goal(g: Game): { text: string; done: boolean };
}

const progress = (n: number, of: number) => `${Math.min(n, of)}/${of}`;

const QUESTS: Quest[] = [
  {
    title: 'Bark and Bone',
    hint: 'Hold LEFT CLICK on a tree trunk. Felling the trunk brings down the whole tree.',
    start: [
      V('Urka. Urka Ashtusk. Wake, child of ash.'),
      U('...Old Mother Vesh? You have been dead for forty winters.'),
      V('And yet here I am, nagging you through a carved stick. Death is less final than the shamans claim.'),
      V('Look beside you. The Worldforge — cold. For a thousand winters our clan kept it burning, and while it burned, the Hollow slept.'),
      V('Now the fire is out. At night the Hollow walk, and they eat the colour out of the world. You are the last forge-keeper left.'),
      V('A forge-keeper with empty hands is only a corpse with ambitions. Fell trees in the Greenwood. Bring me twelve wood.'),
    ],
    goal: (g) => {
      const n = g.story.stats.gathered.wood ?? 0;
      return { text: `Gather wood (${progress(n, 12)})`, done: n >= 12 };
    },
  },
  {
    title: 'The Clan Table',
    hint: 'Press C to open crafting. Make a Workbench, select it on the hotbar and RIGHT CLICK the ground to place it.',
    start: [
      V('Good. Your hands remember.'),
      V('Now build a workbench. Every great orc clan began at a table. Usually arguing.'),
    ],
    goal: (g) => ({ text: 'Craft and place a Workbench', done: g.story.flags.placedWorkbench }),
  },
  {
    title: 'Fire in the Dark',
    hint: 'Coal is black-speckled stone. Dig into a hillside or a cave mouth. 1 wood + 1 coal = 4 torches.',
    start: [
      V('Night comes quickly in these broken days, and the Hollow hate the light.'),
      V('Dig into the stone. Find coal — the black bones of old forests — and make torches. Eight will keep the dark honest.'),
    ],
    goal: (g) => {
      const n = g.story.stats.crafted.torch ?? 0;
      return { text: `Craft torches (${progress(n, 8)})`, done: n >= 8 };
    },
  },
  {
    title: 'Iron Blood',
    hint: 'Craft a Furnace near your workbench. Iron ore is tan-speckled stone, a little deeper. Smelt bars at the furnace, forge at the bench.',
    start: [
      V('Fire you have. Now, iron.'),
      V('Build a furnace. Smelt iron ore into bars, and forge yourself a proper cleaver. The Hollow do not respect a club.'),
      U('I am quite fond of the club.'),
      V('So was your grandfather. We buried what was left of him in a very small box.'),
    ],
    goal: (g) => {
      const has = (g.story.stats.crafted.iron_cleaver ?? 0) > 0 || g.inventory.count('iron_cleaver') > 0;
      return { text: 'Forge an Iron Cleaver', done: has };
    },
  },
  {
    title: 'The Three Hearts',
    hint: 'Follow the ember marker. For the Deep Heart, find the Old Stair east of the forge and descend. Q/E turns the view.',
    start: [
      V('Now you are ready to hear the rest.'),
      V('When the forge died, its fire split into three Ember Hearts, and each fled to an old shrine of the clans.'),
      V('The Sun Heart lies WEST, past the Greenwood, in the burning sands of Sunscorch.'),
      V('The Frost Heart lies EAST, in the Rimeback snows.'),
      V('And the Deep Heart... lies BELOW. The clan cut an Old Stair into the earth, east of here. Follow it down to where the stone grows warm.'),
      V('The shrines are guarded by wardens who never sleep. Follow the ember marker, and take torches.'),
    ],
    goal: (g) => {
      const n = g.story.heartCount();
      return { text: `Recover the Ember Hearts (${n}/3)`, done: n >= 3 };
    },
  },
  {
    title: 'Relight the Worldforge',
    hint: 'Return to the Worldforge at the clan ruins and press F beside it.',
    start: [
      V('All three. I can feel them singing in your pack, like a war-drum heard through a mountain.'),
      V('Return to the Worldforge and set them in its cradle. And Urka... the Hollow will not let it burn quietly.'),
    ],
    goal: (g) => ({ text: 'Set the hearts into the Worldforge', done: g.story.flags.forgeLit }),
  },
  {
    title: 'The Hollow King',
    hint: 'SHIFT to roll through orbs and slams. Watch for the raised hand. Eat food to heal.',
    start: [],
    goal: (g) => ({ text: 'Defeat the Hollow King', done: g.story.flags.bossDefeated }),
  },
  {
    title: 'The World Is Yours',
    hint: 'The lit Worldforge crafts legendary gear. The Ashlands lie north. Ruined camps hide chests everywhere.',
    start: [],
    goal: () => ({ text: 'Explore. Build. Live.', done: false }),
  },
];

const FORGE_LIT_LINES: Line[] = [
  N('The three hearts drop into the cradle. For a moment, nothing.'),
  N('Then the Worldforge ROARS.'),
  V('Yes! YES! Feel that, child? A thousand winters of fire, coming home!'),
  N('Overhead, the sun goes black.'),
  K('LITTLE. KEEPER.'),
  K('I ATE YOUR CLAN ONE EMBER AT A TIME. I WILL SAVOUR YOU.'),
  V('The Hollow King — the hunger that wears a crown. Stand your ground, forge-keeper!'),
];

const ENDING_LINES: Line[] = [
  N('The Hollow King comes apart like ash on the wind. The sun returns — and with it, colour.'),
  V('It is done. A thousand orcs could not do what you did, Urka. You lit a fire that will not go out.'),
  V('The Hollow are not gone. Hunger never is. But they are leaderless now, and they will be few.'),
  V('Rest. Build. Wander. The world beyond the shrines is wide, and for the first time in a long while... it is yours.'),
  U('Will you stay, Old Mother?'),
  V('Someone has to nag you.'),
];

const LORE: Line[][] = [
  [V('Wolves of ash prowl the north. Their fangs make fine charms, if you can keep your fingers.')],
  [V('The clan buried supplies in camps all over these lands. Look for broken walls and old chests.')],
  [V('The first orc struck the Worldforge from the heart of a falling star. Or so the story goes. The first orc also claimed to have wrestled a mountain.')],
  [V('The Hollow are not evil, exactly. They are hunger without a body. That is worse.')],
  [V('Boar is best roasted. Raw boar is a cry for help.')],
  [V('Your mother had your tusks. Crooked. Magnificent.')],
  [V('Ember crystal grows only in the deepest stone. A goldtusk pick will cut it. Bring some to a furnace with gold and bone... and see what you make.')],
];

const HEART_LINES: Record<HeartKey, string> = {
  sun: 'The Sun Heart! It remembers summer.',
  frost: 'The Frost Heart. It burns cold, like the stars.',
  deep: 'The Deep Heart... it beats. Slowly. Like something asleep.',
};

export class Story {
  index = 0;
  flags: Flags = {
    hearts: { sun: false, frost: false, deep: false },
    forgeLit: false,
    bossSpawned: false,
    bossDefeated: false,
    placedWorkbench: false,
    seenNight: false,
    diedOnce: false,
  };
  stats: Stats = { gathered: {}, crafted: {}, kills: 0, bestiary: {}, chests: 0 };
  private checkT = 0;
  private loreI = 0;

  constructor(private g: Game) {}

  get quest() { return QUESTS[this.index]; }

  begin() {
    this.g.say(this.quest.start);
  }

  objective() {
    return { title: this.quest.title, ...this.quest.goal(this.g), hint: this.quest.hint };
  }

  heartCount() {
    return Object.values(this.flags.hearts).filter(Boolean).length;
  }

  hasAllHearts() {
    return (['sun', 'frost', 'deep'] as HeartKey[]).every((k) => this.g.inventory.count(`heart_${k}`) > 0);
  }

  /** Objective marker in world coordinates. */
  target(): { x: number; y: number; z: number; label: string } | null {
    const g = this.g;
    const p = g.player;
    if (this.index === 4) {
      let best: { x: number; y: number; z: number; label: string } | null = null;
      let bd = Infinity;
      for (const k of ['sun', 'frost', 'deep'] as HeartKey[]) {
        if (this.flags.hearts[k]) continue;
        const sh = SHRINES[k];
        let t: { x: number; y: number; z: number; label: string } = 'y' in sh ? { x: sh.x, y: sh.y, z: sh.z, label: sh.name } : { x: sh.x, y: g.world.gen.heightAt(sh.x, sh.z) + 2, z: sh.z, label: sh.name };
        if (k === 'deep' && p.y >= g.world.gen.heightAt(Math.floor(p.x), Math.floor(p.z)) - 2) t = { x: OLD_STAIR.x0, y: g.world.gen.heightAt(OLD_STAIR.x0, OLD_STAIR.z) + 2, z: OLD_STAIR.z + 1, label: 'The Old Stair' };
        const d = Math.hypot(t.x - p.x, t.z - p.z);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      return best;
    }
    if (this.index === 5) return { x: FORGE.x + 0.5, y: g.world.gen.heightAt(FORGE.x, FORGE.z) + 3, z: FORGE.z + 0.5, label: 'Worldforge' };
    return null;
  }

  update(dt: number) {
    if ((this.checkT -= dt) > 0 || this.g.ui.dialogueOpen) return;
    this.checkT = 0.25;
    const q = this.quest;
    if (this.index >= 6 || !q.goal(this.g).done) return;
    this.advance();
  }

  private advance() {
    const done = this.quest.title;
    this.index++;
    audio.play('quest');
    this.g.ui.toast(`Quest complete: ${done}`, 'quest');
    if (this.quest.start.length) this.g.say(this.quest.start);
  }

  talkToTotem() {
    const q = this.quest;
    const lines: Line[] = [V(`${q.title}. ${q.goal(this.g).text}.`), V(q.hint)];
    if (this.index >= 7 || Math.random() < 0.5) lines.push(...LORE[this.loreI++ % LORE.length]);
    this.g.say(lines);
  }

  onNightfall() {
    if (this.flags.seenNight) return;
    this.flags.seenNight = true;
    this.g.say([V('Night falls. Stay near the light, child. The Hollow fear flame — and they wither in the sun.')]);
  }

  onDeath() {
    if (this.flags.diedOnce) return;
    this.flags.diedOnce = true;
    this.g.say([V('Up, Urka. The ancestors carried you back this time. Do not make a habit of it.')]);
  }

  takeHeart(key: HeartKey) {
    if (this.flags.hearts[key]) return;
    this.flags.hearts[key] = true;
    this.g.inventory.add(`heart_${key}`, 1);
    this.g.ui.pickup(`heart_${key}`, 1);
    audio.play('heart');
    const left = 3 - this.heartCount();
    const tail = left === 2 ? 'Two more.' : left === 1 ? 'One more, Urka.' : 'That is all three!';
    this.g.say([V(`${HEART_LINES[key]} ${tail}`)]);
  }

  useForge() {
    const g = this.g;
    if (this.flags.forgeLit) {
      g.ui.toast('The Worldforge burns. It works as a furnace and workbench.');
      return;
    }
    if (!this.hasAllHearts()) {
      const n = (['sun', 'frost', 'deep'] as HeartKey[]).filter((k) => g.inventory.count(`heart_${k}`) > 0).length;
      g.say([V(`The Worldforge is cold. It needs all three Ember Hearts. You carry ${n} of 3.`)]);
      return;
    }
    for (const k of ['sun', 'frost', 'deep']) g.inventory.remove(`heart_${k}`, 1);
    this.flags.forgeLit = true;
    audio.play('forge');
    g.shake(0.6);
    g.particles.burst(g.forge.x, g.forge.y + 2, g.forge.z, '#ffd23f', 90, { speed: 9, life: 1.4, grav: 2, collide: false }, true);
    this.index = 6;
    this.g.ui.toast('Quest complete: Relight the Worldforge', 'quest');
    g.say(FORGE_LIT_LINES, () => g.spawnBoss());
  }

  onBossDefeated() {
    this.flags.bossDefeated = true;
    this.index = 7;
    audio.play('quest');
    this.g.say(ENDING_LINES, () => this.g.ui.showCredits());
  }

  serialize() {
    return { index: this.index, flags: this.flags, stats: this.stats };
  }

  load(d: { index: number; flags: Flags; stats: Stats }) {
    this.index = Math.min(d.index, QUESTS.length - 1);
    this.flags = { ...this.flags, ...d.flags, hearts: { ...this.flags.hearts, ...d.flags.hearts } };
    this.stats = { gathered: d.stats?.gathered ?? {}, crafted: d.stats?.crafted ?? {}, kills: d.stats?.kills ?? 0, bestiary: d.stats?.bestiary ?? {}, chests: d.stats?.chests ?? 0 };
    // A boss fight interrupted by a reload restarts from the lit forge.
    if (this.flags.forgeLit && !this.flags.bossDefeated) this.flags.bossSpawned = false;
  }
}
