import type { MapDef, MapObstacle, MapProp } from '../types';

/**
 * The Shatterbridge (GAME_DESIGN §6): 120u fractured sky-bridge, 18u deck,
 * two Watchtowers + Clash Core per side, brush pockets, orb pads at the
 * 30u marks. Team 0 = west (−x), team 1 = east (+x).
 */

const LEN = 120; // playfield end to end
const W = 132; // navgrid width incl. fountain plates
/**
 * Navgrid depth. The *deck* is 18 u (§6) and never changes; the grid is much
 * taller because the Flank Isles float in the void north and south of it (§9,
 * "event space"). Their cells have to exist in the grid before they can be
 * opened, so the world extends to z ∈ [−19, 19] and everything beyond the deck
 * rails is closed void until an event carves a platform out of it.
 */
const H = 38;
const DECK_HALF = 9; // deck z ∈ [−9, 9]
const CORE_X = LEN / 2 - 6; // 54
const INNER_X = CORE_X - 20; // 34
const OUTER_X = CORE_X - 38; // 16
const GATE_X = CORE_X - 2; // 52
const FOUNTAIN_X = LEN / 2 + 3; // 63 (raised plate behind the core)

const props: MapProp[] = [];
const obstacles: MapObstacle[] = [];

// Deck edge rails (block movement, low walls) + the void beyond them. Stamping the
// void keeps every nav cell outside the rails closed, so clicks past the rail
// clamp back to the deck instead of resolving to an unreachable open pocket.
obstacles.push({ shape: { kind: 'box', x: 0, z: -(DECK_HALF + 0.8), w: W, d: 1.6 } });
obstacles.push({ shape: { kind: 'box', x: 0, z: DECK_HALF + 0.8, w: W, d: 1.6 } });
const voidHalf = (H / 2 - (DECK_HALF + 1.6)) / 2 + 0.5;
obstacles.push({
  shape: { kind: 'box', x: 0, z: -(DECK_HALF + 1.6 + voidHalf), w: W, d: voidHalf * 2 + 1 },
});
obstacles.push({
  shape: { kind: 'box', x: 0, z: DECK_HALF + 1.6 + voidHalf, w: W, d: voidHalf * 2 + 1 },
});
// Wall segments are 1u wide at scale 1 — stretch to the 2u step for a continuous
// low rail (wide + deep without growing tall).
for (let x = -LEN / 2; x <= LEN / 2; x += 2) {
  props.push({
    model: 'arena/wall',
    position: [x, 0, -(DECK_HALF + 0.6)],
    rotationDeg: 0,
    scale: [2.05, 1.3, 1.6],
  });
  props.push({
    model: 'arena/wall',
    position: [x, 0, DECK_HALF + 0.6],
    rotationDeg: 180,
    scale: [2.05, 1.3, 1.6],
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

// Underdeck: bridge pillars + drifting rock shards sell the sky-bridge silhouette.
for (const x of [-50, -30, -10, 10, 30, 50]) {
  props.push({ model: 'castle/bridge-pillar', position: [x, -3.4, -10.8], scale: 3 });
  props.push({ model: 'castle/bridge-pillar', position: [x, -3.4, 10.8], scale: 3 });
}
for (const [x, z, s, rot] of [
  [-38, -13.5, 1.6, 40],
  [-14, 14, 2.1, 160],
  [22, -14.5, 1.8, 220],
  [44, 13.8, 1.5, 80],
  [60, -13, 1.9, 300],
  [-60, 13.6, 1.7, 10],
] as const) {
  props.push({ model: 'castle/rocks-large', position: [x, -2.6, z], scale: s, rotationDeg: rot });
}
// Far drifting islets — the void needs depth in every over-the-rail glance.
for (const [x, z, y, s, rot] of [
  [-52, -19, -5.5, 3.2, 70],
  [-28, -17, -4, 2.6, 190],
  [-4, -20, -6, 3.6, 320],
  [18, -16.5, -4.5, 2.4, 110],
  [40, -19.5, -5, 3, 250],
  [58, -16, -3.8, 2.2, 20],
  [-44, 18, -5, 3, 140],
  [-16, 20, -6, 3.4, 40],
  [10, 17, -4.2, 2.5, 280],
  [34, 19.5, -5.5, 3.1, 200],
  [56, 17.5, -4.4, 2.6, 90],
] as const) {
  props.push({ model: 'castle/rocks-large', position: [x, y, z], scale: s, rotationDeg: rot });
}
for (const [x, z, y, s] of [
  [-34, -18, -3.4, 2.8],
  [4, 18.5, -3.8, 3.1],
  [28, -18.5, -3.2, 2.7],
  [-58, 19, -3.6, 2.9],
  [50, 18, -3.5, 2.6],
] as const) {
  props.push({ model: 'nature/tree', position: [x, y, z], scale: s });
}

// Brush pockets: layered bushes + grass inside each concealment rect (visual only —
// brush stays walkable; concealment is sim-side).
const BRUSH_GREEN = 0x69b34c;
for (const b of [
  { x: -9, z: -5.5 },
  { x: -9, z: 5.5 },
  { x: 9, z: -5.5 },
  { x: 9, z: 5.5 },
] as const) {
  props.push({
    model: 'nature/bush-large',
    position: [b.x - 1.2, 0, b.z - 0.5],
    scale: 5.5,
    tint: BRUSH_GREEN,
    rotationDeg: 20,
  });
  props.push({
    model: 'nature/bush-large',
    position: [b.x + 1.1, 0, b.z + 0.4],
    scale: 5,
    tint: BRUSH_GREEN,
    rotationDeg: 130,
  });
  props.push({
    model: 'nature/bush',
    position: [b.x, 0, b.z],
    scale: 3.6,
    tint: 0x7dc45c,
    rotationDeg: 75,
  });
  props.push({
    model: 'nature/grass',
    position: [b.x - 1.6, 0, b.z + 0.8],
    scale: 3.2,
    tint: BRUSH_GREEN,
  });
  props.push({
    model: 'nature/grass',
    position: [b.x + 1.7, 0, b.z - 0.7],
    scale: 2.8,
    tint: BRUSH_GREEN,
  });
}

// Health-orb pads at the ±30 marks.
for (const p of [
  { x: -30, z: 0 },
  { x: 30, z: 0 },
] as const) {
  props.push({ model: 'td/spawn-pad', position: [p.x, 0.02, p.z], scale: 4.4, tint: 0x8fe0a8 });
}

// Gate lines: team flags flank where the spawn barrier stands until 0:20.
const TEAM_TINT = [0x3ba7ff, 0xff5a49] as const;
for (const sign of [-1, 1] as const) {
  const tint = TEAM_TINT[sign < 0 ? 0 : 1];
  for (const z of [-DECK_HALF + 0.7, DECK_HALF - 0.7]) {
    props.push({
      model: 'castle/flag',
      position: [sign * GATE_X, 0, z],
      scale: 2.6,
      tint,
      rotationDeg: sign > 0 ? 90 : -90,
    });
  }
  // Fountain plate + banners behind each core.
  props.push({
    model: 'td/spawn-pad',
    position: [sign * (FOUNTAIN_X - 1.5), 0.02, 0],
    scale: 6.5,
    tint,
  });
  props.push({
    model: 'castle/flag-banner',
    position: [sign * (CORE_X + 2.5), 0, -7.5],
    scale: 2.2,
    tint,
    rotationDeg: sign > 0 ? -90 : 90,
  });
  props.push({
    model: 'castle/flag-banner',
    position: [sign * (CORE_X + 2.5), 0, 7.5],
    scale: 2.2,
    tint,
    rotationDeg: sign > 0 ? -90 : 90,
  });
  // Old battle wreckage near each outer tower approach.
  props.push({
    model: 'castle/siege-ram-broken',
    position: [sign * (OUTER_X + 9), 0, sign * -6.4],
    scale: 1.1,
    rotationDeg: sign > 0 ? 205 : 25,
  });
  props.push({
    model: 'castle/rocks-small',
    position: [sign * (OUTER_X + 7), 0, sign * 5.6],
    scale: 1.6,
    rotationDeg: sign > 0 ? 140 : 320,
  });
}

export const SHATTERBRIDGE_MAP: MapDef = {
  id: 'shatterbridge',
  name: 'The Shatterbridge',
  width: W,
  height: H,
  navCell: 0.5,
  obstacles,
  props,
  floor: {
    tile: 'arena/floor',
    accentTile: 'arena/floor-detail',
    size: 2,
    deckHalf: 11,
    frayEnds: true,
  },
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
