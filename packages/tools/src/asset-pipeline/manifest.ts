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
  /**
   * Recenter the scene on its horizontal footprint, base at y = 0. Some packs
   * (SpaceKit) author meshes at their position in a showcase grid rather than at
   * the origin, which would place every instance metres away from where the game
   * puts it. Opt-in so already-tuned centered models never shift.
   */
  recenter?: boolean;
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

/** Mini crowd bodies keep only the states their actor drives (bytes matter ×30 on screen). */
const MINI_CLIPS = ['idle', 'walk', 'attack-melee-right', 'holding-right-shoot', 'die'];

/** CubePets ship 8 clips; Chomp and the stampede herd only ever drive these four. */
const PET_CLIPS = ['idle', 'walk', 'run', 'eat'];

/**
 * STAMPEDE! (Piper R) trades on species variety — the joke is that the whole
 * menagerie answers the whistle. Eight big, silhouette-distinct animals carry it
 * at ~8× the byte cost of one; the full 24-model pack is a post-launch nicety,
 * not worth 3 MB of match-core payload for a single ultimate.
 */
const STAMPEDE_SPECIES = [
  'giraffe',
  'elephant',
  'panda',
  'cow',
  'pig',
  'deer',
  'tiger',
  'hog',
] as const;

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
  // Mortis W grave marker (fx timeline prop)
  {
    key: 'graveyard/gravestone',
    src: 'Kenney_GraveyardKit/GLB format/gravestone-bevel.glb',
    group: 'champion',
  },

  // v0.4 champions — Boltz (astronaut dress on the Kenney-Skinned rig) + Wisp (ghost)
  {
    key: 'chars/character-male-c',
    src: 'Kenney_CuteCharacters/GLB format/character-male-c.glb',
    group: 'champion',
    keepClips: CHAR_CLIPS,
  },
  {
    key: 'graveyard/ghost',
    src: 'Kenney_GraveyardKit/GLB format/character-ghost.glb',
    group: 'champion',
    keepClips: CHAR_CLIPS,
  },
  // SpaceKit meshes are authored at their showcase-grid position, not the origin.
  {
    key: 'space/weapon-gun',
    src: 'Kenney_SpaceKit/GLTF format/weapon_gun.glb',
    group: 'champion',
    recenter: true,
  },
  // Boltz R bunker: the droppod that lands, shields, then launches away.
  {
    key: 'space/rocket-pod',
    src: 'Kenney_SpaceKit/GLTF format/rocket_baseA.glb',
    group: 'champion',
    recenter: true,
  },

  // v0.5 champions — Piper (+ Chomp the fox) and Vex
  {
    key: 'chars/character-female-a',
    src: 'Kenney_CuteCharacters/GLB format/character-female-a.glb',
    group: 'champion',
    keepClips: CHAR_CLIPS,
  },
  {
    key: 'graveyard/vampire',
    src: 'Kenney_GraveyardKit/GLB format/character-vampire.glb',
    group: 'champion',
    keepClips: CHAR_CLIPS,
  },
  {
    key: 'weapons/rapier',
    src: 'KayKit_FantasyWeaponsBits_1.0_FREE/Assets/gltf/sword_C.gltf',
    group: 'champion',
  },
  // Piper's W snack: a plate the fox will absolutely eat if nobody claims it.
  {
    key: 'dungeon/plate-full',
    src: 'KayKit_Dungeon/Models/gltf/plateFull.gltf.glb',
    group: 'champion',
  },
  // Chomp — a persistent companion, so he carries his own clip set.
  {
    key: 'pets/fox',
    src: 'Kenney_CubePets/GLB format/animal-fox.glb',
    group: 'champion',
    keepClips: PET_CLIPS,
  },
  // Two Good Boys (Piper signature) adds a second pet to the rotation.
  {
    key: 'pets/dog',
    src: 'Kenney_CubePets/GLB format/animal-dog.glb',
    group: 'champion',
    keepClips: PET_CLIPS,
  },
  // STAMPEDE! draws its waves from this menagerie (seeded per wave).
  ...STAMPEDE_SPECIES.map((s) => ({
    key: `pets/${s}`,
    src: `Kenney_CubePets/GLB format/animal-${s}.glb`,
    group: 'champion' as const,
    keepClips: PET_CLIPS,
  })),

  // Dummy body
  {
    key: 'chars-blocky/character-r',
    src: 'Kenney_BlockyCharacters/GLB format/character-r.glb',
    group: 'match-core',
    keepClips: ['static', 'idle', 'die'],
  },

  // Mini bodies (ASSET_CATALOG: BlockyCharacters = all Minis, team-palette tints)
  {
    key: 'chars-blocky/character-d',
    src: 'Kenney_BlockyCharacters/GLB format/character-d.glb',
    group: 'match-core',
    keepClips: MINI_CLIPS,
  },
  {
    key: 'chars-blocky/character-p',
    src: 'Kenney_BlockyCharacters/GLB format/character-p.glb',
    group: 'match-core',
    keepClips: MINI_CLIPS,
  },
  {
    key: 'castle/siege-ram',
    src: 'Kenney_CastleKit/GLB format/siege-ram.glb',
    group: 'match-core',
  },
  {
    key: 'castle/siege-ram-broken',
    src: 'Kenney_CastleKit/GLB format/siege-ram-demolished.glb',
    group: 'match-core',
  },

  // Watchtower stack (Castle bodies per ASSET_CATALOG) + TD ballista on top
  {
    key: 'castle/tower-base',
    src: 'Kenney_CastleKit/GLB format/tower-hexagon-base.glb',
    group: 'match-core',
  },
  {
    key: 'castle/tower-mid',
    src: 'Kenney_CastleKit/GLB format/tower-hexagon-mid.glb',
    group: 'match-core',
  },
  {
    key: 'castle/tower-top',
    src: 'Kenney_CastleKit/GLB format/tower-hexagon-top-wood.glb',
    group: 'match-core',
  },
  {
    key: 'castle/tower-roof',
    src: 'Kenney_CastleKit/GLB format/tower-hexagon-roof.glb',
    group: 'match-core',
  },
  {
    key: 'td/weapon-ballista',
    src: 'Kenney_TDKit/GLB format/weapon-ballista.glb',
    group: 'match-core',
  },

  // Clash Core: castle plinth + floating crystal
  {
    key: 'castle/core-base',
    src: 'Kenney_CastleKit/GLB format/tower-square-base.glb',
    group: 'match-core',
  },
  {
    key: 'td/crystal',
    src: 'Kenney_TDKit/GLB format/detail-crystal-large.glb',
    group: 'match-core',
  },

  // Battlefield dressing: orb/fountain pads, void pillars, rubble, team flags
  { key: 'td/spawn-pad', src: 'Kenney_TDKit/GLB format/spawn-round.glb', group: 'match-core' },
  {
    key: 'castle/bridge-pillar',
    src: 'Kenney_CastleKit/GLB format/bridge-straight-pillar.glb',
    group: 'match-core',
  },
  {
    key: 'castle/rocks-large',
    src: 'Kenney_CastleKit/GLB format/rocks-large.glb',
    group: 'match-core',
  },
  {
    key: 'castle/rocks-small',
    src: 'Kenney_CastleKit/GLB format/rocks-small.glb',
    group: 'match-core',
  },
  { key: 'castle/flag', src: 'Kenney_CastleKit/GLB format/flag.glb', group: 'match-core' },
  // Living Bridge events (§9): Coin Rain pickups, and the stone the Clash Golem
  // and the collapsing deck are built from.
  { key: 'dungeon/coin', src: 'Kenney_Minidungeon/GLB format/coin.glb', group: 'match-core' },
  { key: 'dungeon/rocks', src: 'Kenney_Minidungeon/GLB format/rocks.glb', group: 'match-core' },
  {
    key: 'castle/wall-corner-half',
    src: 'Kenney_CastleKit/GLB format/wall-corner-half.glb',
    group: 'match-core',
  },
  {
    key: 'castle/flag-banner',
    src: 'Kenney_CastleKit/GLB format/flag-banner-long.glb',
    group: 'match-core',
  },

  // Brush pockets + Sylva flowers (NatureKit)
  {
    key: 'nature/bush-large',
    src: 'Kenney_NatureKit/GLTF format/plant_bushLarge.glb',
    group: 'match-core',
  },
  {
    key: 'nature/bush',
    src: 'Kenney_NatureKit/GLTF format/plant_bushDetailed.glb',
    group: 'match-core',
  },
  { key: 'nature/grass', src: 'Kenney_NatureKit/GLTF format/grass_large.glb', group: 'match-core' },
  {
    key: 'nature/flower-purple',
    src: 'Kenney_NatureKit/GLTF format/flower_purpleA.glb',
    group: 'match-core',
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
