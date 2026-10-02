/** Item registry: everything that can sit in an inventory slot. */
import { B } from '../world/blocks';

export type ItemKind = 'block' | 'tool' | 'weapon' | 'armor' | 'charm' | 'ammo' | 'material' | 'food' | 'relic';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type WeaponType = 'swing' | 'dagger' | 'thrust' | 'smash' | 'bow' | 'throw' | 'staff';
export type ArmorSlot = 'head' | 'chest' | 'feet';
export type Charm = 'regen' | 'might' | 'swift';

export interface WeaponStats {
  type: WeaponType;
  damage: number;
  speed: number; // seconds per attack (draw time for bows)
  range: number; // blocks (melee) or projectile speed (ranged)
  arc: number; // degrees, 360 = all around
  knock: number;
  burn?: boolean;
  slow?: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  desc: string;
  stack: number;
  place?: number;
  mine?: { power: number; tier: number };
  weapon?: WeaponStats;
  armor?: { slot: ArmorSlot; defense: number; fireproof?: boolean };
  charm?: Charm;
  heal?: number;
  light?: number;
}

const list: ItemDef[] = [];
const add = (d: Partial<ItemDef> & Pick<ItemDef, 'id' | 'name' | 'kind' | 'desc'>) =>
  list.push({ rarity: 'common', stack: 1, ...d });
const block = (id: string, name: string, place: number, desc = 'A sturdy building block.') =>
  add({ id, name, kind: 'block', desc, stack: 999, place });
const mat = (id: string, name: string, desc: string, rarity: Rarity = 'common') =>
  add({ id, name, kind: 'material', desc, stack: 999, rarity });
const w = (type: WeaponType, damage: number, speed: number, range: number, arc: number, knock: number, extra: Partial<WeaponStats> = {}): WeaponStats =>
  ({ type, damage, speed, range, arc, knock, ...extra });

// Blocks
block('dirt', 'Dirt', B.DIRT, 'Soil of the old world. Smells like rain.');
block('stone', 'Stone', B.STONE);
block('sand', 'Sand', B.SAND, 'Smelt it into glass.');
block('sandstone', 'Sandstone', B.SANDSTONE);
block('snow', 'Snow', B.SNOW);
block('ice', 'Ice', B.ICE);
block('wood', 'Wood', B.LOG, 'Felled from trees. The start of everything.');
block('planks', 'Planks', B.PLANKS);
block('ash', 'Ash', B.ASH, 'What the Hollow leave behind.');
block('ashstone', 'Hollowstone', B.ASHSTONE, 'Cold to the touch. Always.');
block('brick', 'Stone Brick', B.BRICK);
block('sandbrick', 'Sun Brick', B.SANDBRICK);
block('frostbrick', 'Frost Brick', B.FROSTBRICK);
block('glass', 'Glass', B.GLASS);
block('cactus', 'Cactus', B.CACTUS, 'Prickly. Like your uncle.');
block('torch', 'Torch', B.TORCH, 'The Hollow hate light. Placed on solid ground.');
block('campfire', 'Campfire', B.CAMPFIRE, 'Cooks meat. Rest beside one to make it your respawn point.');
block('workbench', 'Workbench', B.WORKBENCH, 'Crafting station for tools, weapons and armor.');
block('furnace', 'Furnace', B.FURNACE, 'Smelts ores and cooks meat.');
block('glowcap', 'Glowcap', B.GLOWCAP, 'A softly glowing cave mushroom.');

// Materials
mat('coal', 'Coal', 'The black bones of old forests.');
mat('iron_ore', 'Iron Ore', 'Smelt in a furnace with coal.');
mat('gold_ore', 'Gold Ore', 'Smelt in a furnace with coal.', 'uncommon');
mat('iron_bar', 'Iron Bar', 'Good orc iron.', 'uncommon');
mat('gold_bar', 'Gold Bar', 'Soft, shiny and suspiciously valuable.', 'rare');
mat('ember_shard', 'Ember Shard', 'A splinter of the falling star that lit the Worldforge.', 'epic');
mat('gel', 'Blight Gel', 'Sticky. Burns surprisingly well.');
mat('bone', 'Hollow Bone', 'Pale and weightless. Nothing lives in it.');
mat('hide', 'Boar Hide', 'Thick and stubborn. Good for armor.');
mat('fang', 'Ash Wolf Fang', 'Still warm.', 'uncommon');
mat('silk', 'Gloom Silk', 'Spider silk. Makes a fine bowstring.', 'uncommon');

// Tools
add({ id: 'flint_pick', name: 'Flint Pick', kind: 'tool', desc: 'Your old pick. Breaks stone, coal and iron.', mine: { power: 1, tier: 1 }, weapon: w('swing', 5, 0.32, 1.9, 60, 0.6) });
add({ id: 'iron_pick', name: 'Iron Pick', kind: 'tool', rarity: 'uncommon', desc: 'Faster. Breaks gold and hollowstone.', mine: { power: 1.8, tier: 2 }, weapon: w('swing', 8, 0.28, 1.9, 60, 0.7) });
add({ id: 'gold_pick', name: 'Goldtusk Pick', kind: 'tool', rarity: 'rare', desc: 'Breaks ember crystal deep below.', mine: { power: 2.7, tier: 3 }, weapon: w('swing', 10, 0.24, 1.9, 60, 0.7) });

// Weapons
add({ id: 'bone_club', name: 'Bone Club', kind: 'weapon', desc: 'A thighbone of something large.', weapon: w('swing', 8, 0.44, 2, 70, 1) });
add({ id: 'bone_dagger', name: 'Bone Dagger', kind: 'weapon', desc: 'Quick little stabs. Many of them.', weapon: w('dagger', 6, 0.2, 1.7, 45, 0.4) });
add({ id: 'stone_cleaver', name: 'Stone Cleaver', kind: 'weapon', desc: 'Crude, heavy, honest.', weapon: w('swing', 12, 0.42, 2.1, 75, 1) });
add({ id: 'iron_cleaver', name: 'Iron Cleaver', kind: 'weapon', rarity: 'uncommon', desc: 'The Hollow respect this.', weapon: w('swing', 19, 0.38, 2.2, 80, 1.1) });
add({ id: 'iron_spear', name: 'Iron Spear', kind: 'weapon', rarity: 'uncommon', desc: 'Long reach. Keep the Hollow at arm’s length — and then some.', weapon: w('thrust', 17, 0.46, 3.3, 24, 1) });
add({ id: 'iron_warhammer', name: 'Iron Warhammer', kind: 'weapon', rarity: 'uncommon', desc: 'Slow. Hits everything around you. Sends them flying.', weapon: w('smash', 30, 0.85, 2.5, 360, 2.4) });
add({ id: 'gold_cleaver', name: 'Goldtusk Cleaver', kind: 'weapon', rarity: 'rare', desc: 'Balanced, bright and bloodthirsty.', weapon: w('swing', 25, 0.34, 2.3, 85, 1.1) });
add({ id: 'rime_spear', name: 'Rimefang Spear', kind: 'weapon', rarity: 'rare', desc: 'Frost clings to the tip. Slows what it pierces.', weapon: w('thrust', 26, 0.44, 3.6, 24, 1.1, { slow: true }) });
add({ id: 'ember_axe', name: 'Emberfang', kind: 'weapon', rarity: 'epic', desc: 'A war-axe with a star inside it. Sets foes ablaze and mines anything.', weapon: w('swing', 34, 0.34, 2.4, 90, 1.3, { burn: true }), mine: { power: 3.2, tier: 3 }, light: 9 });
add({ id: 'mountainbreaker', name: 'Mountainbreaker', kind: 'weapon', rarity: 'legendary', desc: 'Forged in the relit Worldforge. The ground remembers every swing.', weapon: w('smash', 60, 0.95, 3.1, 360, 3.2, { burn: true }), light: 6 });
add({ id: 'hunting_bow', name: 'Hunting Bow', kind: 'weapon', desc: 'Hold to draw, release to loose. Uses arrows.', weapon: w('bow', 12, 0.55, 22, 0, 0.6) });
add({ id: 'orc_longbow', name: 'Orc Longbow', kind: 'weapon', rarity: 'rare', desc: 'Pulls like a mule. Hits like one too.', weapon: w('bow', 24, 0.7, 30, 0, 0.9) });
add({ id: 'throwing_axe', name: 'Throwing Axe', kind: 'weapon', stack: 24, desc: 'Spin it at something. Consumed on throw (pick it back up).', weapon: w('throw', 16, 0.5, 18, 0, 1) });
add({ id: 'ember_staff', name: 'Ember Staff', kind: 'weapon', rarity: 'epic', desc: 'Hurls bursting fireballs. No ammo needed.', weapon: w('staff', 22, 0.65, 16, 0, 1.2, { burn: true }), light: 8 });
add({ id: 'arrow', name: 'Arrow', kind: 'ammo', stack: 99, desc: 'Fired by bows.' });

// Armor
const armor = (id: string, name: string, slot: 'head' | 'chest' | 'feet', defense: number, rarity: Rarity, desc: string, fireproof = false) =>
  add({ id, name, kind: 'armor', rarity, desc, armor: { slot, defense, fireproof } });
armor('hide_helm', 'Boarhide Cap', 'head', 1, 'common', 'Smells like boar. Protects like boar.');
armor('hide_vest', 'Boarhide Vest', 'chest', 2, 'common', 'Thick leather stitched with sinew.');
armor('hide_boots', 'Boarhide Boots', 'feet', 1, 'common', 'Warm. Quiet. Stylish, for an orc.');
armor('iron_helm', 'Iron Helm', 'head', 2, 'uncommon', 'Horned, naturally.');
armor('iron_chest', 'Iron Cuirass', 'chest', 4, 'uncommon', 'Hammered from good orc iron.');
armor('iron_boots', 'Iron Greaves', 'feet', 2, 'uncommon', 'Loud on stone. Nobody argues.');
armor('ember_helm', 'Ember Crown-Helm', 'head', 3, 'epic', 'The star-fire hums in your skull. Fireproof.', true);
armor('ember_chest', 'Ember Plate', 'chest', 6, 'epic', 'Worldforge-tempered. Lava cannot touch you.', true);
armor('ember_boots', 'Ember Treads', 'feet', 3, 'epic', 'Leave smouldering footprints. Fireproof.', true);

// Charms
add({ id: 'vesh_charm', name: 'Charm of Old Mother', kind: 'charm', rarity: 'rare', desc: 'Doubles health regeneration. She is still nagging.', charm: 'regen' });
add({ id: 'war_charm', name: 'Warband Charm', kind: 'charm', rarity: 'rare', desc: '+20% damage with every weapon.', charm: 'might' });
add({ id: 'swift_charm', name: 'Wolfrunner Charm', kind: 'charm', rarity: 'rare', desc: '+18% movement speed and faster rolls.', charm: 'swift' });

// Food
add({ id: 'raw_meat', name: 'Raw Boar', kind: 'food', stack: 99, desc: 'Eat raw (+6) or cook it at a campfire (+30).', heal: 6 });
add({ id: 'cooked_meat', name: 'Roast Boar', kind: 'food', stack: 99, desc: 'A proper orc meal.', heal: 30 });
add({ id: 'apple', name: 'Apple', kind: 'food', stack: 99, desc: 'Crunchy.', heal: 12 });
add({ id: 'blood_tonic', name: 'Blood Tonic', kind: 'food', rarity: 'uncommon', stack: 99, desc: 'Old Mother Vesh’s recipe.', heal: 55 });

// Relics
add({ id: 'heart_sun', name: 'Sun Heart', kind: 'relic', rarity: 'legendary', desc: 'It remembers summer.', light: 10 });
add({ id: 'heart_frost', name: 'Frost Heart', kind: 'relic', rarity: 'legendary', desc: 'It burns cold, like the stars.', light: 10 });
add({ id: 'heart_deep', name: 'Deep Heart', kind: 'relic', rarity: 'legendary', desc: 'It beats. Slowly.', light: 10 });
add({ id: 'hollow_crown', name: 'Hollow Crown', kind: 'relic', rarity: 'legendary', desc: 'Taken from a king who was only hunger.' });

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((i) => [i.id, i]));
export const item = (id: string): ItemDef => ITEMS[id];

/** Stats of the empty hand. */
export const HAND = { mine: { power: 0.6, tier: 0 }, weapon: { type: 'swing', damage: 3, speed: 0.3, range: 1.7, arc: 60, knock: 0.6 } as WeaponStats };

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#e8e0cc',
  uncommon: '#7dd36a',
  rare: '#5fb4ff',
  epic: '#c07aff',
  legendary: '#ffb02e',
};
