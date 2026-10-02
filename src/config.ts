/** Global tuning. World units are blocks (1 block = 1 unit = 16 texels). */
export const CHUNK = 16;
export const HEIGHT = 64;
export const SEA = 35; // lakes fill up to here; dry land sits on 3 levels above it (36-38)
export const SURFACE = 36;

export const LOAD_RADIUS = 4; // chunks generated + meshed around the player
export const KEEP_RADIUS = 7; // chunks kept in memory
export const MESH_BUDGET_MS = 7; // max time per frame spent building chunk meshes

export const REACH = 6.5;
export const DAY_LENGTH = 600;
export const DAY_PORTION = 0.62;
export const GRAVITY = 30;

export const SAVE_KEY = 'ashtusk.iso.v3';

/** Story locations, in block coordinates. West = -x, east = +x, north = -z. */
export const SHRINES = {
  sun: { x: -230, z: 12, name: 'Sun Shrine', dir: 'west' },
  frost: { x: 236, z: -18, name: 'Frost Shrine', dir: 'east' },
  deep: { x: 34, y: 9, z: 44, name: 'Deep Shrine', dir: 'below' },
} as const;
export type HeartKey = keyof typeof SHRINES;
export const FORGE = { x: 0, z: 0 };
/** The Old Stair: a one-block-per-step tunnel from the surface down to the Deep Shrine's east door. */
export const OLD_STAIR = { x0: 92, x1: 43, z: 44 };
export const TOTEM = { x: -7, z: 4 };
