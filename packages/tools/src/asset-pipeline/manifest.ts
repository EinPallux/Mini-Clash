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
  /** Animation-library files whose clips graft onto this model's rig (KayKit path). */
  mergeAnims?: string[];
}

/** KayKit Rig_Medium clip subset the champion state machine uses. */
const KAYKIT_CLIPS = [
  'Idle_A',
  'Idle_B',
  'Running_A',
  'Throw',
  'Use_Item',
  'Hit_A',
  'Hit_B',
  'Death_A',
  'Death_B',
  'Spawn_Ground',
  'Interact',
  'Jump_Full_Short',
];

const KAYKIT_SKELETON_ANIMS = [
  'KayKit_Skeletons_1.1_FREE/Animations/gltf/Rig_Medium/Rig_Medium_General.glb',
  'KayKit_Skeletons_1.1_FREE/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb',
];

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
  'attack-kick-right',
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

  // v0.2 champions — KayKit skeletons (clips grafted from the pack's animation library)
  {
    key: 'skeletons/mage',
    src: 'KayKit_Skeletons_1.1_FREE/characters/gltf/Skeleton_Mage.glb',
    group: 'champion',
    mergeAnims: KAYKIT_SKELETON_ANIMS,
    keepClips: KAYKIT_CLIPS,
  },
  {
    key: 'skeletons/rogue',
    src: 'KayKit_Skeletons_1.1_FREE/characters/gltf/Skeleton_Rogue.glb',
    group: 'champion',
    mergeAnims: KAYKIT_SKELETON_ANIMS,
    keepClips: KAYKIT_CLIPS,
  },
  {
    key: 'dungeon/character-orc',
    src: 'Kenney_Minidungeon/GLB format/character-orc.glb',
    group: 'champion',
    keepClips: CHAR_CLIPS,
  },
  {
    key: 'chars/character-female-d',
    src: 'Kenney_CuteCharacters/GLB format/character-female-d.glb',
    group: 'champion',
    keepClips: CHAR_CLIPS,
  },
  {
    key: 'weapons/staff-crystal',
    src: 'KayKit_FantasyWeaponsBits_1.0_FREE/Assets/gltf/staff_A.gltf',
    group: 'champion',
  },
  {
    key: 'weapons/staff-nature',
    src: 'KayKit_FantasyWeaponsBits_1.0_FREE/Assets/gltf/staff_B.gltf',
    group: 'champion',
  },
  {
    key: 'weapons/dagger',
    src: 'KayKit_FantasyWeaponsBits_1.0_FREE/Assets/gltf/dagger_A.gltf',
    group: 'champion',
  },
  {
    key: 'dungeon/weapon-spear',
    src: 'Kenney_Minidungeon/GLB format/weapon-spear.glb',
    group: 'champion',
  },
  {
    key: 'dungeon/shield-round',
    src: 'Kenney_Minidungeon/GLB format/shield-round.glb',
    group: 'champion',
  },
  {
    key: 'dungeon/skull',
    src: 'KayKit_Dungeon/Models/Characters/gltf/extra heads/skull.gltf.glb',
    group: 'match-core',
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
