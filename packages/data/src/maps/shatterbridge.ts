import type { MapDef, MapObstacle, MapProp } from '../types';

/**
 * The Shatterbridge (GAME_DESIGN §6): 120u fractured sky-bridge, 18u deck,
 * two Watchtowers + Clash Core per side, brush pockets, orb pads at the
 * 30u marks. Team 0 = west (−x), team 1 = east (+x).
 */

const LEN = 120; // playfield end to end
const W = 132; // navgrid width incl. fountain plates
const H = 26;
const DECK_HALF = 9; // deck z ∈ [−9, 9]
const CORE_X = LEN / 2 - 6; // 54
const INNER_X = CORE_X - 20; // 34
const OUTER_X = CORE_X - 38; // 16
const GATE_X = CORE_X - 2; // 52
const FOUNTAIN_X = LEN / 2 + 3; // 63 (raised plate behind the core)

const props: MapProp[] = [];
const obstacles: MapObstacle[] = [];

// Deck edge rails (block movement, low walls).
obstacles.push({ shape: { kind: 'box', x: 0, z: -(DECK_HALF + 0.8), w: W, d: 1.6 } });
obstacles.push({ shape: { kind: 'box', x: 0, z: DECK_HALF + 0.8, w: W, d: 1.6 } });
for (let x = -LEN / 2; x <= LEN / 2; x += 2) {
  props.push({
    model: 'arena/wall',
    position: [x, 0, -(DECK_HALF + 0.6)],
    rotationDeg: 0,
    scale: 1.4,
  });
  props.push({
    model: 'arena/wall',
    position: [x, 0, DECK_HALF + 0.6],
    rotationDeg: 180,
    scale: 1.4,
  });
}

// Center altar ring (Clash Golem home from v0.6; decorative until then).
props.push({ model: 'arena/floor-detail', position: [0, 0.02, 0], scale: 6 });
props.push({ model: 'arena/column', position: [-4.5, 0, -6.5], scale: 1.5 });
props.push({ model: 'arena/column', position: [4.5, 0, 6.5], scale: 1.5 });
obstacles.push({ shape: { kind: 'circle', x: -4.5, z: -6.5, r: 0.65 } });
obstacles.push({ shape: { kind: 'circle', x: 4.5, z: 6.5, r: 0.65 } });

// Statues flanking each fountain approach + banners along the deck.
for (const sign of [-1, 1] as const) {
  props.push({
    model: 'arena/statue',
    position: [sign * (CORE_X + 4), 0, -5],
    rotationDeg: sign > 0 ? -90 : 90,
    scale: 1.9,
  });
  props.push({
    model: 'arena/statue',
    position: [sign * (CORE_X + 4), 0, 5],
    rotationDeg: sign > 0 ? -90 : 90,
    scale: 1.9,
  });
  obstacles.push({ shape: { kind: 'circle', x: sign * (CORE_X + 4), z: -5, r: 0.8 } });
  obstacles.push({ shape: { kind: 'circle', x: sign * (CORE_X + 4), z: 5, r: 0.8 } });
  for (const bx of [OUTER_X - 6, INNER_X - 6]) {
    props.push({ model: 'arena/banner', position: [sign * bx, 0, -(DECK_HALF - 0.6)], scale: 1.9 });
    props.push({
      model: 'arena/banner',
      position: [sign * bx, 0, DECK_HALF - 0.6],
      rotationDeg: 180,
      scale: 1.9,
    });
  }
  // Broken-bridge dressing near the ends.
  props.push({ model: 'arena/bricks', position: [sign * (OUTER_X + 7), 0, -6.5], scale: 1.4 });
  props.push({ model: 'arena/block', position: [sign * (INNER_X + 6), 0, 6.8], scale: 1.5 });
  obstacles.push({ shape: { kind: 'box', x: sign * (INNER_X + 6), z: 6.8, w: 1.5, d: 1.5 } });
}

// Trees floating just past the rails (silhouette dressing over the void).
for (const [x, z, s] of [
  [-44, -12.5, 2.6],
  [-20, 12.5, 2.9],
  [8, -12.5, 2.7],
  [30, 12.5, 2.5],
  [50, -12.5, 2.8],
  [-58, 12.5, 2.4],
] as const) {
  props.push({ model: 'nature/tree', position: [x, -0.6, z], scale: s });
}

export const SHATTERBRIDGE_MAP: MapDef = {
  id: 'shatterbridge',
  name: 'The Shatterbridge',
  width: W,
  height: H,
  navCell: 0.5,
  obstacles,
  props,
  floor: { tile: 'arena/floor', accentTile: 'arena/floor-detail', size: 2 },
  skybox: 'skybox-day',
  spawns: [
    { team: 0, x: -FOUNTAIN_X + 1.5, z: 0, facingDeg: 0 },
    { team: 1, x: FOUNTAIN_X - 1.5, z: 0, facingDeg: 180 },
  ],
  dummies: [],
  battle: {
    towers: [
      { team: 0, x: -OUTER_X, z: 0, tier: 'outer' },
      { team: 0, x: -INNER_X, z: 0, tier: 'inner' },
      { team: 1, x: OUTER_X, z: 0, tier: 'outer' },
      { team: 1, x: INNER_X, z: 0, tier: 'inner' },
    ],
    cores: [
      { team: 0, x: -CORE_X, z: 0 },
      { team: 1, x: CORE_X, z: 0 },
    ],
    gates: [
      { team: 0, x: -GATE_X, z: 0 },
      { team: 1, x: GATE_X, z: 0 },
    ],
    // Waypoints sit between structures (towers at ±16/±34 block the lane cells).
    lane: [
      [-GATE_X, 0],
      [-INNER_X + 4, 0],
      [-OUTER_X + 4, 0],
      [0, 0],
      [OUTER_X - 4, 0],
      [INNER_X - 4, 0],
      [GATE_X, 0],
    ],
    orbPads: [
      { x: -30, z: 0 },
      { x: 30, z: 0 },
    ],
    brush: [
      { x: -9, z: -5.5, w: 4, d: 2.6 },
      { x: -9, z: 5.5, w: 4, d: 2.6 },
      { x: 9, z: -5.5, w: 4, d: 2.6 },
      { x: 9, z: 5.5, w: 4, d: 2.6 },
    ],
    barrierUntil: 20,
    firstWaveAt: 35,
    waveEvery: 25,
    orbEvery: 45,
    firstOrbAt: 90,
  },
  lighting: {
    sunDir: [-0.55, -1, -0.4],
    sunColor: 0xfff1da,
    skyColor: 0xbfe0ff,
    groundColor: 0x9a8f78,
    sunIntensity: 2.6,
    ambientIntensity: 0.85,
  },
};
