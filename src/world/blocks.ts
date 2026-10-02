/** Block registry. Block ids are bytes stored in chunk arrays. */

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, SANDSTONE: 5, SNOW: 6, ICE: 7,
  LOG: 8, LEAVES: 9, PINE_LOG: 10, PINE_LEAVES: 11, PLANKS: 12,
  COAL_ORE: 13, IRON_ORE: 14, GOLD_ORE: 15, EMBER_ORE: 16, BEDROCK: 17,
  TORCH: 18, WORKBENCH: 19, FURNACE: 20, CAMPFIRE: 21, WATER: 22, CACTUS: 23,
  TALL_GRASS: 24, FLOWER_RED: 25, FLOWER_YELLOW: 26, ASH: 27, ASHSTONE: 28,
  BRICK: 29, SANDBRICK: 30, FROSTBRICK: 31, GLASS: 32, DEADWOOD: 33, GLOWCAP: 34,
  PEDESTAL_SUN: 35, PEDESTAL_FROST: 36, PEDESTAL_DEEP: 37, PEDESTAL_EMPTY: 38,
  LAVA: 39, CHEST: 40, CHEST_OPEN: 41, MOSSY_BRICK: 42, BONES: 43, DEAD_BUSH: 44,
  PEBBLES: 45, ROCK: 46, MOSSY_STONE: 47,
} as const;

export type Sound = 'dirt' | 'stone' | 'wood' | 'leaf' | 'glass' | 'sand' | 'none';
export type Model = 'cube' | 'cross' | 'torch' | 'pedestal' | 'liquid' | 'campfire' | 'pebbles' | 'rock' | 'none';

export interface BlockDef {
  name: string;
  /** Texture keys: [top, side, bottom] (one key = all faces). */
  tex: string[];
  model: Model;
  solid: boolean; // collides with entities
  opaque: boolean; // blocks light and hides neighbouring faces
  cutout?: boolean; // alpha-tested (leaves, glass)
  hardness: number; // seconds to mine at power 1
  tier: number; // minimum tool tier
  drop: string | null;
  light: number; // emitted light 0..15
  color: string; // particles + minimap
  sound: Sound;
  liquid?: boolean;
  replaceable?: boolean;
  needsGround?: boolean;
  station?: 'workbench' | 'furnace';
  heart?: 'sun' | 'frost' | 'deep';
  tree?: boolean;
  hurts?: number; // damage per second when touched
  front?: string; // texture for the "front" (+z) face of furnaces/chests
}

const d = (o: Partial<BlockDef> & Pick<BlockDef, 'name' | 'color' | 'tex'>): BlockDef => ({
  model: 'cube', solid: true, opaque: true, hardness: 0.5, tier: 0, drop: null, light: 0, sound: 'stone', ...o,
});
const deco = (name: string, color: string, tex: string): BlockDef =>
  d({ name, color, tex: [tex], model: 'cross', solid: false, opaque: false, replaceable: true, needsGround: true, hardness: 0.02, sound: 'leaf' });
const pedestal = (name: string, color: string, heart?: 'sun' | 'frost' | 'deep'): BlockDef =>
  d({ name, color, tex: ['brick'], model: 'pedestal', solid: true, opaque: false, hardness: Infinity, light: heart ? 13 : 0, heart });

export const BLOCKS: BlockDef[] = [];
BLOCKS[B.AIR] = d({ name: 'Air', color: '#000', tex: [], model: 'none', solid: false, opaque: false, replaceable: true, hardness: 0, sound: 'none' });
BLOCKS[B.GRASS] = d({ name: 'Grass', color: '#5a9e3a', tex: ['grass_top', 'grass_side', 'dirt'], hardness: 0.45, drop: 'dirt', sound: 'dirt' });
BLOCKS[B.DIRT] = d({ name: 'Dirt', color: '#7a4f2d', tex: ['dirt'], hardness: 0.4, drop: 'dirt', sound: 'dirt' });
BLOCKS[B.STONE] = d({ name: 'Stone', color: '#808289', tex: ['stone'], hardness: 0.9, tier: 1, drop: 'stone' });
BLOCKS[B.SAND] = d({ name: 'Sand', color: '#dfc07c', tex: ['sand'], hardness: 0.35, drop: 'sand', sound: 'sand' });
BLOCKS[B.SANDSTONE] = d({ name: 'Sandstone', color: '#c4945a', tex: ['sandstone_top', 'sandstone'], hardness: 0.7, tier: 1, drop: 'sandstone' });
BLOCKS[B.SNOW] = d({ name: 'Snow', color: '#eef3fb', tex: ['snow', 'snow_side', 'dirt'], hardness: 0.3, drop: 'snow', sound: 'sand' });
BLOCKS[B.ICE] = d({ name: 'Ice', color: '#93cdea', tex: ['ice'], hardness: 0.6, tier: 1, drop: 'ice', sound: 'glass' });
BLOCKS[B.LOG] = d({ name: 'Oak Log', color: '#7a5531', tex: ['log_top', 'log_side'], hardness: 0.8, drop: 'wood', sound: 'wood', tree: true });
BLOCKS[B.LEAVES] = d({ name: 'Leaves', color: '#3e8a34', tex: ['leaves'], opaque: false, cutout: true, hardness: 0.12, sound: 'leaf', tree: true });
BLOCKS[B.PINE_LOG] = d({ name: 'Pine Log', color: '#5a3d24', tex: ['pine_top', 'pine_side'], hardness: 0.8, drop: 'wood', sound: 'wood', tree: true });
BLOCKS[B.PINE_LEAVES] = d({ name: 'Pine Needles', color: '#2e6b47', tex: ['pine_leaves'], opaque: false, cutout: true, hardness: 0.12, sound: 'leaf', tree: true });
BLOCKS[B.PLANKS] = d({ name: 'Planks', color: '#a8743f', tex: ['planks'], hardness: 0.6, drop: 'planks', sound: 'wood' });
BLOCKS[B.COAL_ORE] = d({ name: 'Coal Ore', color: '#2d2d33', tex: ['coal_ore'], hardness: 1.1, tier: 1, drop: 'coal' });
BLOCKS[B.IRON_ORE] = d({ name: 'Iron Ore', color: '#c99a74', tex: ['iron_ore'], hardness: 1.4, tier: 1, drop: 'iron_ore' });
BLOCKS[B.GOLD_ORE] = d({ name: 'Gold Ore', color: '#f5c542', tex: ['gold_ore'], hardness: 1.8, tier: 2, drop: 'gold_ore' });
BLOCKS[B.EMBER_ORE] = d({ name: 'Ember Crystal', color: '#ff6a1f', tex: ['ember_ore'], hardness: 2.2, tier: 3, drop: 'ember_shard', light: 10 });
BLOCKS[B.BEDROCK] = d({ name: 'Bedrock', color: '#2b2b33', tex: ['bedrock'], hardness: Infinity, tier: 99 });
BLOCKS[B.TORCH] = d({ name: 'Torch', color: '#ffb347', tex: ['planks'], model: 'torch', solid: false, opaque: false, hardness: 0.05, drop: 'torch', light: 14, needsGround: true, sound: 'wood' });
BLOCKS[B.WORKBENCH] = d({ name: 'Workbench', color: '#b07a42', tex: ['workbench_top', 'workbench_side', 'planks'], hardness: 0.6, drop: 'workbench', station: 'workbench', sound: 'wood' });
BLOCKS[B.FURNACE] = d({ name: 'Furnace', color: '#6d6f76', tex: ['furnace_top', 'furnace_side'], front: 'furnace_front', hardness: 1, tier: 1, drop: 'furnace', station: 'furnace', light: 9 });
BLOCKS[B.CAMPFIRE] = d({ name: 'Campfire', color: '#ff8a2a', tex: ['log_side'], model: 'campfire', solid: false, opaque: false, hardness: 0.4, drop: 'campfire', light: 15, needsGround: true, sound: 'wood' });
BLOCKS[B.WATER] = d({ name: 'Water', color: '#2f6fd1', tex: ['water'], model: 'liquid', solid: false, opaque: false, hardness: Infinity, liquid: true, replaceable: true, sound: 'none' });
BLOCKS[B.CACTUS] = d({ name: 'Cactus', color: '#4f9a3a', tex: ['cactus_top', 'cactus_side'], opaque: false, cutout: true, hardness: 0.4, drop: 'cactus', sound: 'leaf', tree: true, hurts: 6 });
BLOCKS[B.TALL_GRASS] = deco('Tall Grass', '#5aa844', 'tall_grass');
BLOCKS[B.FLOWER_RED] = deco('Bloodbloom', '#e04848', 'flower_red');
BLOCKS[B.FLOWER_YELLOW] = deco('Sunpetal', '#ffd23f', 'flower_yellow');
BLOCKS[B.ASH] = d({ name: 'Ash', color: '#4a4450', tex: ['ash'], hardness: 0.45, drop: 'ash', sound: 'sand' });
BLOCKS[B.ASHSTONE] = d({ name: 'Hollowstone', color: '#3a3341', tex: ['ashstone'], hardness: 1.2, tier: 2, drop: 'ashstone' });
BLOCKS[B.BRICK] = d({ name: 'Stone Brick', color: '#8b8e98', tex: ['brick'], hardness: 1.2, tier: 1, drop: 'brick' });
BLOCKS[B.SANDBRICK] = d({ name: 'Sun Brick', color: '#d6b072', tex: ['sandbrick'], hardness: 1.2, tier: 1, drop: 'sandbrick' });
BLOCKS[B.FROSTBRICK] = d({ name: 'Frost Brick', color: '#bcd8ee', tex: ['frostbrick'], hardness: 1.2, tier: 1, drop: 'frostbrick' });
BLOCKS[B.GLASS] = d({ name: 'Glass', color: '#cfe8ff', tex: ['glass'], opaque: false, cutout: true, hardness: 0.3, drop: 'glass', sound: 'glass' });
BLOCKS[B.DEADWOOD] = d({ name: 'Deadwood', color: '#6a6058', tex: ['dead_top', 'dead_side'], hardness: 0.6, drop: 'wood', sound: 'wood', tree: true });
BLOCKS[B.GLOWCAP] = d({ ...deco('Glowcap', '#3ef0d8', 'glowcap'), replaceable: false, hardness: 0.1, drop: 'glowcap', light: 8 });
BLOCKS[B.PEDESTAL_SUN] = pedestal('Sun Heart Cradle', '#ffb02e', 'sun');
BLOCKS[B.PEDESTAL_FROST] = pedestal('Frost Heart Cradle', '#5fd8ff', 'frost');
BLOCKS[B.PEDESTAL_DEEP] = pedestal('Deep Heart Cradle', '#ff3d5a', 'deep');
BLOCKS[B.PEDESTAL_EMPTY] = pedestal('Empty Cradle', '#8b8e98');
BLOCKS[B.LAVA] = d({ name: 'Lava', color: '#ff5a1a', tex: ['lava'], model: 'liquid', solid: false, opaque: false, hardness: Infinity, liquid: true, replaceable: true, light: 15, hurts: 40, sound: 'none' });
BLOCKS[B.CHEST] = d({ name: 'Clan Chest', color: '#8a5a2a', tex: ['chest_top', 'chest_side'], front: 'chest_front', hardness: Infinity, sound: 'wood' });
BLOCKS[B.CHEST_OPEN] = d({ name: 'Empty Chest', color: '#6a4520', tex: ['chest_open', 'chest_side'], front: 'chest_front', hardness: 0.8, drop: 'planks', sound: 'wood' });
BLOCKS[B.MOSSY_BRICK] = d({ name: 'Mossy Brick', color: '#6f8a62', tex: ['mossy_brick'], hardness: 1.2, tier: 1, drop: 'brick' });
BLOCKS[B.BONES] = d({ ...deco('Old Bones', '#e8dcc0', 'bones'), drop: 'bone', hardness: 0.1 });
BLOCKS[B.DEAD_BUSH] = deco('Dead Bush', '#8a6a3a', 'dead_bush');
BLOCKS[B.PEBBLES] = d({ ...deco('Pebbles', '#8a8c92', 'stone'), model: 'pebbles', drop: 'stone', hardness: 0.05, sound: 'stone' });
BLOCKS[B.ROCK] = d({ ...deco('Rock', '#7d7f86', 'stone'), model: 'rock', replaceable: false, drop: 'stone', hardness: 0.3, sound: 'stone' });
BLOCKS[B.MOSSY_STONE] = d({ name: 'Mossy Stone', color: '#6f8062', tex: ['mossy_stone', 'mossy_stone_side', 'stone'], hardness: 0.9, tier: 1, drop: 'stone' });

export const isSolid = (id: number) => BLOCKS[id].solid;
export const isOpaque = (id: number) => BLOCKS[id].opaque;
