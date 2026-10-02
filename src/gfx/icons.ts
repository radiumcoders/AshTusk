/**
 * Item icons (pixel-art maps + isometric mini-cubes for blocks) and the
 * dialogue portraits. Everything is generated at boot.
 */
import { ITEMS } from '../game/items';
import { BLOCKS } from '../world/blocks';
import { faceTex } from './textures';
import { fromMap, hex, makeCanvas, Pix, scale } from './pixel';

const HEAD_ORC = [
  '....hhh.....',
  '...hhHhh....',
  '..kkhhhkkk..',
  '..kgggggggk.',
  '.kgggggdddk.',
  'kGgggggeegk.',
  '.kgrrrgggggk',
  '..kgggggwgwk',
  '..kgggggwgwk',
  '..kGGgggggGk',
  '...kkkkkkkk.',
];

const ORC_PAL: Record<string, string> = {
  k: '#1a1410', g: '#5f8f3a', G: '#43692a', d: '#33521f', w: '#f2ead0', e: '#ffdd33',
  h: '#1d1a1a', H: '#3a3030', r: '#b3322a', f: '#b8a07a', F: '#8a7350', b: '#6b4226',
  B: '#4a2c18', m: '#d0b060', M: '#8a7030', p: '#3d3a4a', P: '#2a2836', o: '#3a2a1e', O: '#24180f',
};

const ICON_MAPS: Record<string, string[]> = {
  pick: [
    '................', '....kkkkkkk.....', '..kkaaaccaakk...', '.kaaAkkkkkAaak..',
    '.kak....khk.kak.', 'kak.....khk..kak', 'kk.....khk....kk', '......khk.......',
    '.....khk........', '....khk.........', '...khk..........', '..khk...........',
    '.khk............', 'kHk.............', 'kk..............', '................',
  ],
  cleaver: [
    '................', '......kkkkkkkk..', '.....kaaaaaacak.', '....kaaaaaaacak.',
    '...kaaaaaaaacak.', '...kAaaaaaaacak.', '...kAAaaaaaaak..', '....kkAAaaaak...',
    '......kkAAkk....', '.....khkkk......', '....khk.........', '...khk..........',
    '..khk...........', '.kHk............', 'kHk.............', 'kk..............',
  ],
  club: [
    '...........kkk..', '..........kaaak.', '.........kaacaak', '........kaacaaak',
    '.......kaacaaak.', '......kaacaak...', '.....kaacak.....', '....kaacak......',
    '...kaacak.......', '..kaaak.........', '.kaaak..........', 'kaAak...........',
    'kAAk............', 'kkk.............', '................', '................',
  ],
  axe: [
    '........kkk.....', '.......kaaak....', '......kaaccak...', '...kk.kaaaacak..',
    '..kaakkAaaaacak.', '..kaaaaAAaaaaak.', '...kaakhAAaaak..', '....kkhkkAAak...',
    '.....khk..kk....', '....khk.........', '...khk..........', '..khk...........',
    '.khk............', 'kHk.............', 'kk..............', '................',
  ],
  lump: [
    '................', '................', '................', '................',
    '.....kkkkk......', '....kaccaak.....', '...kaaaaAaak....', '..kaaAaaaaaAk...',
    '..kaaaaaAaaak...', '..kAaaaaaaaak...', '...kAAaaaaAk....', '....kkkkkkk.....',
  ],
  ingot: [
    '................', '................', '................', '................',
    '................', '................', '....kkkkkkkk....', '...kcccccccck...',
    '..kaaaaaaaaaak..', '..kaaaaaaaaaak..', '..kAAAAAAAAAAk..', '..kkkkkkkkkkkk..',
  ],
  crystal: [
    '................', '........k.......', '.......kck......', '......kccak.....',
    '......kcaak..k..', '.....kcaaAk.kck.', '.....kcaaAkkcak.', '..k..kcaaAkcaAk.',
    '.kck.kaaAAkcaAk.', '.kcak.kaAAkaAk..', '.kaAk.kaAkkAk...', '..kAAk.kakkk....',
    '...kkkkkkk......',
  ],
  meat: [
    '................', '................', '................', '......kkkkk.....',
    '.....kaaacak....', '....kaaaaaaak...', '...kaAaaaaaak...', '...kaaaaaaAak...',
    '...kAaaaaaaak...', '....kAAaaAak....', '.....kkkkkwwk...', '..........kwwk..',
    '...........kwwk.', '............kk..',
  ],
  apple: [
    '................', '................', '.......kk.......', '........kgg.....',
    '....kkkkkkkk....', '...kaacaaaaak...', '..kaacaaaaaaak..', '..kaaaaaaaaaak..',
    '..kaaaaaaaaaAk..', '..kaaaaaaaaaAk..', '...kaaaaaaaAk...', '....kAAkkAAk....',
    '.....kk..kk.....',
  ],
  bone: [
    '................', '................', '..kk............', '.kwwk...........',
    '.kwwwk..........', '..kwwwk.........', '...kwwwk........', '....kwwwk.......',
    '.....kwwwk......', '......kwwwk.....', '.......kwwwk....', '........kwwwk...',
    '.........kwwwk..', '..........kwwk..', '...........kk...',
  ],
  flask: [
    '................', '......kkkk......', '......kbbk......', '.......kk.......',
    '......kwwk......', '.....kwaawk.....', '....kaaaaaak....', '...kaacaaaaak...',
    '...kaaaaaaaak...', '...kaaaaaaaAk...', '....kAaaaaAk....', '.....kkkkkk.....',
  ],
  orb: [
    '................', '................', '......kkkk......', '....kkaaaakk....',
    '...kaacccaaak...', '...kaccwccaak...', '..kaacccccaaak..', '..kaaccccaaaak..',
    '..kaaaaaaaaaAk..', '...kaaaaaaaAk...', '...kAaaaaaAAk...', '....kkAAAAkk....',
    '......kkkk......',
  ],
  crown: [
    '................', '................', '................', '..k...k...k...k.',
    '.kyk.kyk.kyk.kyk', '.kyykyyykyyykyyk', '.kyyyyyyyyyyyyyk', '.kyyRyyyByyyRyyk',
    '.kyyyyyyyyyyyyyk', '.kYYYYYYYYYYYYYk', '.kkkkkkkkkkkkkkk',
  ],
  wood: [
    '................', '................', '................', '....kkkkkkkkk...',
    '...kbbbbbbbbbk..', '..kcbBbbbBbbbk..', '..kccbbbbbbBbk..', '..kcrcbBbbbbbk..',
    '..kccbbbbbBbbk..', '..kcbbbBbbbbbk..', '...kkkkkkkkkk...',
  ],
  dagger: [
    '................', '................', '............kk..', '...........kak..',
    '..........kack..', '.........kack...', '........kack....', '.......kack.....',
    '......kAak......', '....kkkAk.......', '.....khk........', '....khkk........',
    '...khk..........', '..kHk...........', '..kk............',
  ],
  spear: [
    '.............kk.', '............kcak', '...........kcaak', '..........kaaAk.',
    '.........khkkk..', '........khk.....', '.......khk......', '......khk.......',
    '.....khk........', '....khk.........', '...khk..........', '..khk...........',
    '.khk............', 'kHk.............', 'kk..............',
  ],
  hammer: [
    '........kkkkk...', '.......kcaaaak..', '......kcaaaaaAk.', '......kaaaaaaAk.',
    '......kaaaaaAAk.', '.......kaaaAAk..', '......khkkkkk...', '.....khk........',
    '....khk.........', '....khk.........', '...khk..........', '..khk...........',
    '.khk............', 'kHk.............', 'kk..............',
  ],
  bow: [
    '......kkk.......', '.....kbbk.......', '....kbk.s.......', '...kbk..s.......',
    '...kbk...s......', '..kbk....s......', '..kbk.....s.....', '..kBk.....s.....',
    '..kbk.....s.....', '..kbk....s......', '...kbk...s......', '...kbk..s.......',
    '....kbk.s.......', '.....kbbk.......', '......kkk.......',
  ],
  arrow: [
    '................', '............kk..', '...........kak..', '..........kaak..',
    '.........khkk...', '........khk.....', '.......khk......', '......khk.......',
    '.....khk........', '....khk.........', '..fkhk..........', '.ffhk...........',
    '..ff............',
  ],
  taxe: [
    '................', '................', '........kkk.....', '.......kaaak....',
    '......kaaccak...', '......kaaaacak..', '.....khkAaaak...', '....khk.kAAk....',
    '...khk...kk.....', '..khk...........', '.khk............', '.kk.............',
  ],
  staff: [
    '...........kkk..', '..........kcock.', '..........koook.', '...........kokk.',
    '..........khk...', '.........khk....', '........khk.....', '.......khk......',
    '......khk.......', '.....khk........', '....khk.........', '...khk..........',
    '..khk...........', '.khk............', '.kk.............',
  ],
  helm: [
    '................', 'w..............w', 'ww............ww', '.ww..kkkkkk..ww.',
    '..wwkaaaaaakww..', '...kaacaaaaak...', '..kaacaaaaaaak..', '..kaaaaaaaaaak..',
    '..kaAAAAAAAAak..', '..kak......kak..', '..kak......kak..', '..kkk......kkk..',
  ],
  chest: [
    '................', '...kkk....kkk...', '..kaaak..kaaak..', '.kaaaaakkaaaaak.',
    '.kaacaaaaaaaaak.', '.kkaacaaaaaaakk.', '..kaaaaaaaaaak..', '..kaaaAAAAaaak..',
    '..kaaaaaaaaaak..', '..kaAaaaaaaAak..', '..kaaaaaaaaaak..', '...kAAAAAAAAk...',
    '....kkkkkkkk....',
  ],
  boots: [
    '................', '................', '..kkkk....kkkk..', '..kaak....kaak..',
    '..kaak....kaak..', '..kaak....kaak..', '..kaak....kaak..', '..kaak....kaak..',
    '..kaaakk..kaaakk', '..kaaaaak.kaaaaak', '..kAAAAAk.kAAAAAk', '..kkkkkkk.kkkkkkk',
  ],
  amulet: [
    '................', '...kk......kk...', '....k......k....', '.....k....k.....',
    '......k..k......', '.......kk.......', '......kaak......', '.....kacaak.....',
    '....kacooaak....', '....kaooooak....', '....kaaooaak....', '.....kaaaak.....',
    '......kkkk......',
  ],
  hide: [
    '................', '................', '..kk........kk..', '..kakkkkkkkkak..',
    '...kaaaaaaaak...', '...kaAaaaaAak...', '..kaaaaaaaaaak..', '..kaaaAaaaaaak..',
    '..kaaaaaaAaaak..', '...kaaaaaaaak...', '...kaAaaaaAak...', '..kakkkkkkkkak..',
    '..kk........kk..',
  ],
  fang: [
    '................', '................', '.....kkkk.......', '....kwwwwk......',
    '....kwwwwk......', '.....kwwwk......', '.....kwwwk......', '......kwwk......',
    '......kwwk......', '.......kwk......', '.......kwk......', '........k.......',
  ],
  silk: [
    '................', '................', '.....kkkkk......', '....kssSssk.....',
    '...ksSssSssk....', '...kssSssSsk....', '...kSssSssSk....', '...ksSssSssk....',
    '....kssSssk.....', '.....kkkkk......', '......k.k.......', '.......k.k......',
  ],
  torch: [
    '................', '.......k........', '......kyk.......', '.....kyoyk......',
    '.....kyooyk.....', '.....koook......', '......khk.......', '......khk.......',
    '......khk.......', '......khk.......', '......khk.......', '......khk.......',
    '......kHk.......', '......kkk.......',
  ],
  campfire: [
    '................', '................', '.......k........', '......kyk.......',
    '.....kyoyk......', '.....kyoook.....', '....kooyoook....', '....kooooook....',
    '...kbbkoookbbk..', '..kbbbbkkkbbbbk.', '..kBBkbbbbbkBBk.', '...kkbbBBbbbkk..',
    '.....kkkkkkk....',
  ],
};

const HANDLE = { h: '#8a5f34', H: '#5a3d24', k: '#1a1410' };
const metal = (a: string, A: string, c: string) => ({ ...HANDLE, a, A, c });

const ICON_DEFS: Record<string, [string, Record<string, string>]> = {
  flint_pick: ['pick', metal('#6d6f76', '#46484e', '#9da0a7')],
  iron_pick: ['pick', metal('#c8ccd2', '#7d848d', '#ffffff')],
  gold_pick: ['pick', metal('#f5c542', '#b5851a', '#fff3b0')],
  bone_club: ['club', { k: '#1a1410', a: '#e8dcc0', A: '#b8a888', c: '#ffffff' }],
  stone_cleaver: ['cleaver', metal('#808289', '#55575d', '#b0b3ba')],
  iron_cleaver: ['cleaver', metal('#c8ccd2', '#7d848d', '#ffffff')],
  ember_axe: ['axe', metal('#ff6a1f', '#a83a10', '#fff1b8')],
  coal: ['lump', { k: '#0c0c10', a: '#2d2d33', A: '#1c1c22', c: '#55555f' }],
  iron_ore: ['lump', { k: '#2a2a30', a: '#808289', A: '#5f6168', c: '#e2b893' }],
  gold_ore: ['lump', { k: '#2a2a30', a: '#808289', A: '#5f6168', c: '#ffd34d' }],
  gel: ['lump', { k: '#1c1028', a: '#7a4fa0', A: '#4a2c66', c: '#c8a8f0' }],
  iron_bar: ['ingot', { k: '#2a2d33', a: '#b8bec6', A: '#7d848d', c: '#eef2f6' }],
  gold_bar: ['ingot', { k: '#5a3a08', a: '#f5c542', A: '#b5851a', c: '#fff3b0' }],
  ember_shard: ['crystal', { k: '#3a1008', a: '#ff6a1f', A: '#b83a10', c: '#ffe0a0' }],
  raw_meat: ['meat', { k: '#3a1010', a: '#c0505a', A: '#8a3038', c: '#f08a90', w: '#f2ead0' }],
  cooked_meat: ['meat', { k: '#2a1408', a: '#9a5428', A: '#6a3414', c: '#d08a4a', w: '#f2ead0' }],
  apple: ['apple', { k: '#3a0c0c', a: '#d83a3a', A: '#9a2020', c: '#ff9a8a', g: '#4f9a37' }],
  bone: ['bone', { k: '#2a2a30', w: '#e8ecf0' }],
  blood_tonic: ['flask', { k: '#1a1410', a: '#c0203a', A: '#801028', c: '#ff8090', b: '#8a5f34', w: '#cfe8ff' }],
  heart_sun: ['orb', { k: '#5a2a00', a: '#ff9a1a', A: '#c06000', c: '#ffe08a', w: '#ffffff' }],
  heart_frost: ['orb', { k: '#0a2a4a', a: '#4ac8ff', A: '#1a78b0', c: '#c8f4ff', w: '#ffffff' }],
  heart_deep: ['orb', { k: '#3a0010', a: '#ff3d5a', A: '#a01030', c: '#ffb0c0', w: '#ffffff' }],
  hollow_crown: ['crown', { k: '#1a1410', y: '#c8ccd2', Y: '#7d848d', R: '#5ff0ff', B: '#ff3d5a' }],
  wood: ['wood', { k: '#2a1a0c', b: '#7a5531', B: '#573a20', c: '#c8915a', r: '#8a5f34' }],
  bone_dagger: ['dagger', { k: '#1a1410', a: '#e8dcc0', A: '#b8a888', c: '#ffffff', h: '#5a3d24', H: '#3a2814' }],
  gold_cleaver: ['cleaver', metal('#f5c542', '#b5851a', '#fff3b0')],
  iron_spear: ['spear', metal('#c8ccd2', '#7d848d', '#ffffff')],
  rime_spear: ['spear', metal('#9fe0ff', '#4a9ac8', '#ffffff')],
  iron_warhammer: ['hammer', metal('#c8ccd2', '#7d848d', '#ffffff')],
  mountainbreaker: ['hammer', metal('#ff6a1f', '#8a2a10', '#fff1b8')],
  hunting_bow: ['bow', { k: '#1a1410', b: '#8a5f34', B: '#4a2c18', s: '#e8e0cc' }],
  orc_longbow: ['bow', { k: '#1a1410', b: '#5a3d24', B: '#c8ccd2', s: '#f0f0ff' }],
  arrow: ['arrow', { k: '#1a1410', a: '#c8ccd2', h: '#a8743f', f: '#e04848' }],
  throwing_axe: ['taxe', metal('#c8ccd2', '#7d848d', '#ffffff')],
  ember_staff: ['staff', { k: '#1a1410', h: '#5a3d24', o: '#ff7a1a', c: '#fff1b8' }],
  hide_helm: ['helm', { k: '#2a1a0c', a: '#8a5a34', A: '#5a3a20', c: '#b07a4a', w: '#e8dcc0' }],
  hide_vest: ['chest', { k: '#2a1a0c', a: '#8a5a34', A: '#5a3a20', c: '#b07a4a' }],
  hide_boots: ['boots', { k: '#2a1a0c', a: '#8a5a34', A: '#5a3a20' }],
  iron_helm: ['helm', { k: '#2a2d33', a: '#b8bec6', A: '#7d848d', c: '#eef2f6', w: '#e8dcc0' }],
  iron_chest: ['chest', { k: '#2a2d33', a: '#b8bec6', A: '#7d848d', c: '#eef2f6' }],
  iron_boots: ['boots', { k: '#2a2d33', a: '#b8bec6', A: '#7d848d' }],
  ember_helm: ['helm', { k: '#3a1008', a: '#ff7a2a', A: '#b83a10', c: '#ffe0a0', w: '#f5c542' }],
  ember_chest: ['chest', { k: '#3a1008', a: '#ff7a2a', A: '#b83a10', c: '#ffe0a0' }],
  ember_boots: ['boots', { k: '#3a1008', a: '#ff7a2a', A: '#b83a10' }],
  vesh_charm: ['amulet', { k: '#1a1410', a: '#f5c542', c: '#fff3b0', o: '#7fffd4' }],
  war_charm: ['amulet', { k: '#1a1410', a: '#c8ccd2', c: '#ffffff', o: '#e04848' }],
  swift_charm: ['amulet', { k: '#1a1410', a: '#e8dcc0', c: '#ffffff', o: '#5fb4ff' }],
  hide: ['hide', { k: '#2a1a0c', a: '#9a6a3a', A: '#6a4220' }],
  fang: ['fang', { k: '#2a2a30', w: '#f2ead0' }],
  silk: ['silk', { k: '#3a3a48', s: '#e8ecf5', S: '#a8b0c8' }],
  torch: ['torch', { k: '#1a1410', y: '#fff1a0', o: '#ff8a2a', h: '#8a5f34', H: '#5a3d24' }],
  campfire: ['campfire', { k: '#1a1410', y: '#fff1a0', o: '#ff8a2a', b: '#7a5531', B: '#4a2c18' }],
};

function buildBoss(): HTMLCanvasElement {
  const W = 56;
  const H = 62;
  const p = new Pix(W, H);
  const bone = hex('#d8dde6');
  const boneD = hex('#9aa3b0');
  const out = hex('#0d0f16');
  const iron = hex('#4a4f5a');
  const ironL = hex('#8a919c');
  // Skull dome
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x - 28) / 22;
      const dy = (y - 32) / 20;
      const d = dx * dx + dy * dy;
      if (d <= 1) p.set(x, y, d > 0.86 ? out : dy > 0.3 || dx > 0.45 ? boneD : bone);
    }
  // Jaw
  for (let y = 44; y < 58; y++)
    for (let x = 14; x < 42; x++) {
      const w = 14 - (y - 44) * 0.55;
      if (Math.abs(x - 28) <= w) p.set(x, y, Math.abs(x - 28) > w - 1.2 || y === 57 ? out : boneD);
    }
  // Teeth
  for (let x = 17; x < 40; x += 3)
    for (let y = 47; y < 52; y++) p.set(x, y, y === 51 ? out : hex('#f4f6fa')), p.set(x + 1, y, hex('#e0e4ea'));
  for (let x = 16; x < 41; x++) p.set(x, 46, out);
  // Eye sockets
  for (const ex of [19, 37])
    for (let y = 28; y < 40; y++)
      for (let x = ex - 7; x <= ex + 7; x++) {
        const d = ((x - ex) / 6.5) ** 2 + ((y - 34) / 5.5) ** 2;
        if (d <= 1) p.set(x, y, hex('#07080c'));
      }
  // Nose
  for (let y = 39; y < 45; y++) for (let x = 28 - (y - 39) / 2; x <= 28 + (y - 39) / 2; x++) p.set(Math.round(x), y, out);
  // Crack
  let cx = 33;
  for (let y = 12; y < 26; y++) {
    p.set(cx, y, out);
    if (y % 3 === 0) cx += 1;
  }
  // Crown
  for (let x = 8; x < 48; x++)
    for (let y = 2; y < 16; y++) {
      const spike = 14 - Math.abs(((x - 8) % 10) - 5) * 2.4;
      if (y >= 16 - Math.max(5, spike) || y >= 11) p.set(x, y, y >= 13 ? iron : x % 10 === 3 ? ironL : hex('#6a707b'));
    }
  for (let x = 8; x < 48; x++) p.set(x, 16, out);
  for (const gx of [16, 28, 40]) for (let y = 12; y < 15; y++) for (let x = gx - 1; x <= gx + 1; x++) p.set(x, y, hex('#5ff0ff'));
  return p.toCanvas();
}

function buildTotem(): HTMLCanvasElement {
  const W = 22;
  const H = 52;
  const p = new Pix(W, H);
  const wood = hex('#7a5531');
  const dark = hex('#4e341d');
  const red = hex('#b3322a');
  const bone = hex('#e8dcc0');
  const glow = hex('#7fffd4');
  for (let y = 8; y < H; y++)
    for (let x = 5; x <= 16; x++) {
      const edge = x === 5 || x === 16;
      p.set(x, y, edge ? dark : (x + y) % 7 === 0 ? scale(wood, 0.85) : wood);
    }
  for (let f = 0; f < 3; f++) {
    const fy = 12 + f * 13;
    for (let x = 5; x <= 16; x++) p.set(x, fy, dark);
    for (let x = 6; x <= 15; x++) p.set(x, fy + 1, f === 1 ? red : scale(wood, 1.15));
    for (const ex of [8, 13]) {
      p.set(ex, fy + 4, f === 0 ? glow : dark);
      p.set(ex + (ex === 8 ? 1 : -1), fy + 4, f === 0 ? glow : dark);
      p.set(ex, fy + 3, dark);
    }
    for (let x = 8; x <= 13; x++) p.set(x, fy + 8, dark);
    if (f === 0) for (const tx of [8, 13]) { p.set(tx, fy + 7, bone); p.set(tx, fy + 6, bone); }
    else for (let x = 9; x <= 12; x++) p.set(x, fy + 9, red);
  }
  // Horns
  for (let i = 0; i < 9; i++) {
    const y = 9 - i;
    const off = Math.round(i * 0.7);
    p.set(4 - off, y, bone);
    p.set(5 - off, y, bone);
    p.set(16 + off, y, bone);
    p.set(17 + off, y, bone);
  }
  for (let x = 6; x <= 15; x++) for (let y = 4; y < 8; y++) p.set(x, y, y === 4 ? dark : wood);
  // Feathers
  for (let y = 22; y < 32; y++) {
    p.set(3, y, y % 3 ? red : bone);
    p.set(18, y + 2, y % 3 ? red : bone);
  }
  return p.toCanvas();
}


const iconCache = new Map<string, HTMLCanvasElement>();
const iconUrlCache = new Map<string, string>();

/** Draws a block as a little isometric cube (top + two shaded sides), 32x32. */
function isoCube(top: HTMLCanvasElement, left: HTMLCanvasElement, right: HTMLCanvasElement): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(32, 32);
  const face = (img: HTMLCanvasElement, m: [number, number, number, number, number, number], shade: number) => {
    ctx.setTransform(...m);
    ctx.drawImage(img, 0, 0);
    if (shade > 0) {
      ctx.fillStyle = "rgba(0,0,0," + shade + ")";
      ctx.fillRect(0, 0, 16, 16);
    }
  };
  face(left, [15 / 16, 7.5 / 16, 0, 15 / 16, 1, 8.5], 0.18);
  face(right, [15 / 16, -7.5 / 16, 0, 15 / 16, 16, 16], 0.36);
  face(top, [15 / 16, -7.5 / 16, 15 / 16, 7.5 / 16, 1, 8.5], 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

function upscale(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(32, 32);
  ctx.drawImage(src, 0, 0, 32, 32);
  return c;
}

export function itemIcon(id: string): HTMLCanvasElement {
  let c = iconCache.get(id);
  if (c) return c;
  const def = ITEMS[id];
  if (ICON_DEFS[id]) c = upscale(fromMap(ICON_MAPS[ICON_DEFS[id][0]], ICON_DEFS[id][1]));
  else if (def?.place !== undefined) {
    const b = BLOCKS[def.place];
    if (b.model === 'cube') {
      const t = b.tex;
      c = isoCube(faceTex(t[0]), faceTex(t[1] ?? t[0]), faceTex(b.front ?? t[1] ?? t[0]));
    } else c = upscale(faceTex(b.tex[0]));
  } else c = makeCanvas(32, 32)[0];
  iconCache.set(id, c);
  return c;
}

export function itemIconUrl(id: string): string {
  let u = iconUrlCache.get(id);
  if (!u) {
    u = itemIcon(id).toDataURL();
    iconUrlCache.set(id, u);
  }
  return u;
}

export const PORTRAITS = {} as { urka: string; vesh: string; king: string };

export function buildPortraits() {
  PORTRAITS.urka = fromMap(HEAD_ORC, ORC_PAL).toDataURL();
  const totem = buildTotem();
  const [face, fctx] = makeCanvas(22, 26);
  fctx.drawImage(totem, 0, 0, 22, 26, 0, 0, 22, 26);
  PORTRAITS.vesh = face.toDataURL();
  PORTRAITS.king = buildBoss().toDataURL();
}
