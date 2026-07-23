/**
 * The shippable asset subset for v0.1 (ASSET_CATALOG §5): logical key → source file.
 * The pipeline optimizes each entry into packages/client/public/game-assets/.
 */

export interface AssetEntry {
  /** Logical key referenced by content data, e.g. 'arena/character-soldier'. */
  key: string;
  /** Path relative to repo assets/. */
  src: string;
  group: 'boot' | 'match-core' | 'champion';
  /** Keep only these animation clips (characters); omit = keep all. */
  keepClips?: string[];
}

const CHAR_CLIPS = [
  'idle',
  'walk',
  'sprint',
  'die',
  'jump',
  'pick-up',
  'emote-yes',
  'emote-no',
  'holding-right',
  'holding-both',
  'holding-right-shoot',
  'attack-melee-right',
  'attack-melee-left',
  'interact-right',
  'interact-left',
  'static',
];

export const ASSET_MANIFEST: AssetEntry[] = [
  // Champions + weapons
  {
    key: 'arena/character-soldier',
    src: 'Kenney_MiniArena/GLB format/character-soldier.glb',
    group: 'champion',
    keepClips: CHAR_CLIPS,
  },
  {
    key: 'chars/character-female-b',
    src: 'Kenney_CuteCharacters/GLB format/character-female-b.glb',
    group: 'champion',
    keepClips: CHAR_CLIPS,
  },
  {
    key: 'arena/weapon-sword',
    src: 'Kenney_MiniArena/GLB format/weapon-sword.glb',
    group: 'champion',
  },
  {
    key: 'dungeon/shield-rectangle',
    src: 'Kenney_Minidungeon/GLB format/shield-rectangle.glb',
    group: 'champion',
  },

  // Dummy body
  {
    key: 'chars-blocky/character-r',
    src: 'Kenney_BlockyCharacters/GLB format/character-r.glb',
    group: 'match-core',
    keepClips: ['static', 'idle', 'die'],
  },

  // Fathom kit props
  { key: 'pirate/barrel', src: 'Kenney_PirateKit/GLB format/barrel.glb', group: 'match-core' },
  {
    key: 'pirate/cannon-ball',
    src: 'Kenney_PirateKit/GLB format/cannon-ball.glb',
    group: 'match-core',
  },
  {
    key: 'pirate/ship-ghost',
    src: 'Kenney_PirateKit/GLB format/ship-ghost.glb',
    group: 'match-core',
  },

  // Training arena
  { key: 'arena/floor', src: 'Kenney_MiniArena/GLB format/floor.glb', group: 'match-core' },
  {
    key: 'arena/floor-detail',
    src: 'Kenney_MiniArena/GLB format/floor-detail.glb',
    group: 'match-core',
  },
  { key: 'arena/wall', src: 'Kenney_MiniArena/GLB format/wall.glb', group: 'match-core' },
  {
    key: 'arena/wall-corner',
    src: 'Kenney_MiniArena/GLB format/wall-corner.glb',
    group: 'match-core',
  },
  { key: 'arena/column', src: 'Kenney_MiniArena/GLB format/column.glb', group: 'match-core' },
  { key: 'arena/banner', src: 'Kenney_MiniArena/GLB format/banner.glb', group: 'match-core' },
  {
    key: 'arena/weapon-rack',
    src: 'Kenney_MiniArena/GLB format/weapon-rack.glb',
    group: 'match-core',
  },
  { key: 'arena/statue', src: 'Kenney_MiniArena/GLB format/statue.glb', group: 'match-core' },
  { key: 'arena/trophy', src: 'Kenney_MiniArena/GLB format/trophy.glb', group: 'match-core' },
  { key: 'arena/block', src: 'Kenney_MiniArena/GLB format/block.glb', group: 'match-core' },
  { key: 'arena/bricks', src: 'Kenney_MiniArena/GLB format/bricks.glb', group: 'match-core' },
  { key: 'nature/tree', src: 'Kenney_MiniArena/GLB format/tree.glb', group: 'match-core' },

  // Rook W wall chunk (rendered rampart)
  {
    key: 'dungeon/wall-half',
    src: 'Kenney_Minidungeon/GLB format/wall-half.glb',
    group: 'match-core',
  },

  // Skybox
  { key: 'skybox-day', src: 'Kenney_Skyboxes/Skyboxes/skybox-day.png', group: 'match-core' },
];
