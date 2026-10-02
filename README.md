# ASHTUSK — Embers of the Old Clan

An isometric, open-world voxel sandbox for the browser. You play **Urka Ashtusk**, the last orc forge-keeper, sent to recover three Ember Hearts and relight the Worldforge before the Hollow eat the colour out of the world.

Every block texture, creature, weapon, icon, sound effect and music note is generated in code. The project ships no asset files.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve the production build
```

## Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move (relative to the camera) |
| `Space` | Jump · swim up |
| `Shift` | Dodge roll (brief invulnerability) |
| `Q` / `E` | Rotate the view 90° |
| Hold `LMB` | Attack · mine (tools mine, weapons fight) · draw a bow |
| `RMB` | Place block · eat · equip · open chests · use |
| `F` | Interact (totem, forge, chests, heart cradles, campfires) |
| `1`–`9` / wheel | Hotbar · `Ctrl`+wheel or `+`/`-` zoom |
| `Tab` / `I` | Pack (equipment + inventory) |
| `C` | Crafting |
| `J` | Journal (quest, hearts, bestiary, lore) |
| `M` | Music · `Esc` pause & settings (pixel size, shadows) |

## The story

> Before the clans, before the names, there was the Worldforge — a fire beneath the mountain, struck by the first orc from the heart of a falling star. For a thousand winters the Ashtusk kept it burning, and while it burned, the Hollow slept. Then the fire went out.

The spirit of **Old Mother Vesh** speaks through a totem beside the cold forge and guides you through the quests:

1. **Bark and Bone**: fell trees for wood.
2. **The Clan Table**: craft and place a workbench.
3. **Fire in the Dark**: dig for coal and make torches.
4. **Iron Blood**: build a furnace, smelt iron and forge a cleaver.
5. **The Three Hearts**: find the **Sun Heart** in the Sunscorch shrine to the west, the **Frost Heart** in the Rimeback shrine to the east, and the **Deep Heart** at the bottom of the Old Stair. Shrine Wardens guard all three.
6. **Relight the Worldforge**: the sun goes black.
7. **The Hollow King**: a crowned skull with slamming hands, orb volleys, dashes and summons.
8. **The World Is Yours**: the lit forge now crafts legendary gear.

## Features

- **Isometric voxel world.** It is infinite in every direction and generated from a seed. The Greenwood sits in the centre, the Sunscorch Wastes lie west, the Rimeback Tundra east and the Ashlands north. Dry land sits on just three height levels so the view stays readable, with shallow lakes and sandy shores below. Trees grow in groves between open meadows, and pebbles, rocks and mossy boulders dot the ground. Underground there are caves, caverns, lava and ores.
- **Minecraft-style lighting.** Sky light and torch light are flood-filled across chunk borders. Each vertex gets smooth light and ambient occlusion. The sun and moon cast shadows, and a day/night cycle and a blood eclipse change the scene.
- **Cutaway and see-through.** Under a roof or underground, everything above your head is hidden. The inside of solid rock renders as a dark cross-section. Trees and walls between the camera and the orc dither away.
- **Combat.** There are cleavers, daggers, spears, warhammers (area smash), bows with draw strength, recoverable throwing axes and a fireball staff. You also get a dodge roll, hit-stop, knockback, burning and slowing, and soft aim-assist.
- **Gear.** Three armor tiers (hide, iron, ember) show on the orc's model. Charms give regeneration, damage or speed. Ember armor makes you fireproof.
- **Creatures.** Boars, Blightlings, Hollows (they burn in sunlight), Hollow Archers, Ash Wolf packs, Gloomcrawler spiders, Gloom Bats, Shrine Wardens and the Hollow King.
- **Exploration.** Ruined clan camps with biome-specific loot chests, shrine hoards, campfires that set your respawn point, and the Old Stair.
- **UI.** A tabbed menu: a pack with an equipment paper-doll and live stats; crafting by category with a details pane and Craft/×5/Max buttons; and a journal with a bestiary. The HUD has a rotating minimap, an on-screen objective marker, world-anchored prompts and floating damage numbers.
- **Saving.** The world autosaves to `localStorage`. Only modified chunks are stored, run-length encoded.

## Tech

- **TypeScript + Vite**, with **three.js** for rendering and **simplex-noise** for terrain.
- An orthographic isometric camera renders at a lower resolution and is scaled up with `image-rendering: pixelated` for a crisp pixel-art look. The pixel size is adjustable.
- Lambert materials are patched with a small shader extension (`src/gfx/scene.ts`). It adds baked light, 8 dynamic glows, the cutaway, back-face rock capping and see-through dithering.
- A Web Audio synthesizer (`src/engine/audio.ts`) produces every sound effect plus generative ambient music for day, night, cave, boss and triumph moods.
- The DOM overlay UI uses the Pixelify Sans font.

```
src/
  config.ts            world constants, story locations
  engine/              input, synthesized audio, seeded RNG
  world/               blocks, chunk storage, generator (biomes/caves/structures), lighting + mesher
  gfx/                 three.js scene + shader patch, voxel models, particles, textures atlas, icons
  entities/            physics base, player, mobs, boss, projectiles, props (drops, totem, forge)
  game/                game loop & rules, items, recipes, inventory, story/quests
  ui/                  HUD, menus, dialogue, screens, styles
```

## Dev tips

In the browser console, `ashtusk` is the live game object:

```js
ashtusk.debugSpawn('wolf', 4, 0)        // hollow | archer | blightling | wolf | spider | bat | boar | warden
ashtusk.inventory.add('mountainbreaker', 1)
ashtusk.dayTime = 0.8                   // jump to night
```
