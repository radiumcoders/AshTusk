export type Station = 'workbench' | 'furnace' | 'fire' | 'worldforge';
export type Category = 'tools' | 'weapons' | 'armor' | 'charms' | 'building' | 'smelting' | 'food';

export const CATEGORIES: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'tools', label: 'Tools' },
  { id: 'armor', label: 'Armor' },
  { id: 'charms', label: 'Charms' },
  { id: 'building', label: 'Building' },
  { id: 'smelting', label: 'Smelting' },
  { id: 'food', label: 'Food' },
];

export const STATION_NAMES: Record<Station, string> = {
  workbench: 'Workbench',
  furnace: 'Furnace',
  fire: 'Campfire or Furnace',
  worldforge: 'The lit Worldforge',
};

export interface Recipe {
  out: string;
  n: number;
  cost: [string, number][];
  cat: Category;
  station?: Station;
}

const r = (cat: Category, out: string, n: number, cost: [string, number][], station?: Station): Recipe => ({ out, n, cost, cat, station });

export const RECIPES: Recipe[] = [
  // Building
  r('building', 'workbench', 1, [['wood', 10]]),
  r('building', 'planks', 4, [['wood', 1]]),
  r('building', 'torch', 4, [['wood', 1], ['coal', 1]]),
  r('building', 'torch', 3, [['wood', 1], ['gel', 1]]),
  r('building', 'campfire', 1, [['wood', 5], ['coal', 1]]),
  r('building', 'furnace', 1, [['stone', 20], ['coal', 2]], 'workbench'),
  r('building', 'brick', 2, [['stone', 2]], 'furnace'),
  r('building', 'glass', 1, [['sand', 2]], 'furnace'),
  r('building', 'sandbrick', 2, [['sandstone', 2]], 'furnace'),
  r('building', 'frostbrick', 2, [['ice', 2]], 'furnace'),
  // Smelting
  r('smelting', 'iron_bar', 1, [['iron_ore', 2], ['coal', 1]], 'furnace'),
  r('smelting', 'gold_bar', 1, [['gold_ore', 2], ['coal', 1]], 'furnace'),
  // Tools
  r('tools', 'flint_pick', 1, [['wood', 3], ['stone', 4]]),
  r('tools', 'iron_pick', 1, [['iron_bar', 6], ['wood', 3]], 'workbench'),
  r('tools', 'gold_pick', 1, [['gold_bar', 8], ['iron_bar', 2]], 'workbench'),
  // Weapons
  r('weapons', 'bone_dagger', 1, [['bone', 4], ['wood', 1]]),
  r('weapons', 'stone_cleaver', 1, [['wood', 3], ['stone', 8]], 'workbench'),
  r('weapons', 'hunting_bow', 1, [['wood', 6], ['hide', 2]], 'workbench'),
  r('weapons', 'arrow', 6, [['wood', 1], ['bone', 1]]),
  r('weapons', 'iron_cleaver', 1, [['iron_bar', 7], ['wood', 2]], 'workbench'),
  r('weapons', 'iron_spear', 1, [['iron_bar', 5], ['wood', 4]], 'workbench'),
  r('weapons', 'iron_warhammer', 1, [['iron_bar', 12], ['wood', 3]], 'workbench'),
  r('weapons', 'throwing_axe', 4, [['iron_bar', 2], ['wood', 2]], 'workbench'),
  r('weapons', 'gold_cleaver', 1, [['gold_bar', 8], ['iron_bar', 3]], 'workbench'),
  r('weapons', 'orc_longbow', 1, [['wood', 8], ['iron_bar', 3], ['silk', 4]], 'workbench'),
  r('weapons', 'rime_spear', 1, [['iron_bar', 6], ['ice', 8], ['frostbrick', 4]], 'workbench'),
  r('weapons', 'ember_axe', 1, [['gold_bar', 6], ['ember_shard', 8], ['bone', 5]], 'worldforge'),
  r('weapons', 'ember_staff', 1, [['gold_bar', 4], ['ember_shard', 6], ['glowcap', 2]], 'worldforge'),
  r('weapons', 'mountainbreaker', 1, [['iron_bar', 16], ['gold_bar', 6], ['ember_shard', 12]], 'worldforge'),
  // Armor
  r('armor', 'hide_helm', 1, [['hide', 4]], 'workbench'),
  r('armor', 'hide_vest', 1, [['hide', 7]], 'workbench'),
  r('armor', 'hide_boots', 1, [['hide', 3]], 'workbench'),
  r('armor', 'iron_helm', 1, [['iron_bar', 5]], 'workbench'),
  r('armor', 'iron_chest', 1, [['iron_bar', 8]], 'workbench'),
  r('armor', 'iron_boots', 1, [['iron_bar', 4]], 'workbench'),
  r('armor', 'ember_helm', 1, [['gold_bar', 3], ['ember_shard', 4]], 'worldforge'),
  r('armor', 'ember_chest', 1, [['gold_bar', 5], ['ember_shard', 7]], 'worldforge'),
  r('armor', 'ember_boots', 1, [['gold_bar', 3], ['ember_shard', 4]], 'worldforge'),
  // Charms
  r('charms', 'vesh_charm', 1, [['gold_bar', 2], ['glowcap', 3], ['bone', 3]], 'workbench'),
  r('charms', 'war_charm', 1, [['fang', 4], ['bone', 4], ['iron_bar', 2]], 'workbench'),
  r('charms', 'swift_charm', 1, [['fang', 3], ['silk', 3], ['gold_bar', 1]], 'workbench'),
  // Food
  r('food', 'cooked_meat', 1, [['raw_meat', 1]], 'fire'),
  r('food', 'blood_tonic', 1, [['gel', 2], ['glowcap', 1]], 'workbench'),
];
