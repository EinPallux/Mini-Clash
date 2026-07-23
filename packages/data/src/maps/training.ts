import type { MapDef, MapObstacle, MapProp } from '../types';

/**
 * The Training Grounds — a walled practice arena (Mini Arena + Nature dressing).
 * Playable area 40×28 inside a 44×32 wall ring; open center for skillshot practice.
 */

const W = 44;
const H = 32;
const IX = W / 2 - 2; // inner wall line x = ±20
const IZ = H / 2 - 2; // inner wall line z = ±14

const props: MapProp[] = [];
const obstacles: MapObstacle[] = [];

// Perimeter walls every 4u with corner towers.
for (let x = -IX + 4; x <= IX - 4; x += 4) {
  props.push({ model: 'arena/wall', position: [x, 0, -IZ], rotationDeg: 0, scale: 4 });
  props.push({ model: 'arena/wall', position: [x, 0, IZ], rotationDeg: 180, scale: 4 });
}
for (let z = -IZ + 4; z <= IZ - 4; z += 4) {
  props.push({ model: 'arena/wall', position: [-IX, 0, z], rotationDeg: 90, scale: 4 });
  props.push({ model: 'arena/wall', position: [IX, 0, z], rotationDeg: -90, scale: 4 });
}
for (const [cx, cz, rot] of [
  [-IX, -IZ, 0],
  [IX, -IZ, -90],
  [IX, IZ, 180],
  [-IX, IZ, 90],
] as const) {
  props.push({ model: 'arena/wall-corner', position: [cx, 0, cz], rotationDeg: rot, scale: 4 });
}
obstacles.push({ shape: { kind: 'box', x: 0, z: -IZ, w: W, d: 1.2 } });
obstacles.push({ shape: { kind: 'box', x: 0, z: IZ, w: W, d: 1.2 } });
obstacles.push({ shape: { kind: 'box', x: -IX, z: 0, w: 1.2, d: H } });
obstacles.push({ shape: { kind: 'box', x: IX, z: 0, w: 1.2, d: H } });

// Columns framing the dummy range (visual rhythm + pathing practice).
for (const [x, z] of [
  [-2, -9],
  [-2, 9],
  [16, -9],
  [16, 9],
] as const) {
  props.push({ model: 'arena/column', position: [x, 0, z], scale: 1.6 });
  obstacles.push({ shape: { kind: 'circle', x, z, r: 0.7 } });
}

// Spawn-side dressing: banners, weapon racks, statue, trophy.
props.push({ model: 'arena/banner', position: [-19, 0, -6], rotationDeg: 90, scale: 2.2 });
props.push({ model: 'arena/banner', position: [-19, 0, 6], rotationDeg: 90, scale: 2.2 });
props.push({ model: 'arena/weapon-rack', position: [-17.5, 0, -11], rotationDeg: 120, scale: 1.6 });
props.push({ model: 'arena/weapon-rack', position: [-17.5, 0, 11], rotationDeg: 60, scale: 1.6 });
props.push({ model: 'arena/statue', position: [-17.5, 0, 0], rotationDeg: 90, scale: 2.0 });
obstacles.push({ shape: { kind: 'circle', x: -17.5, z: 0, r: 0.9 } });
props.push({ model: 'arena/trophy', position: [19, 0, 0], rotationDeg: -90, scale: 1.8 });

// Nature accents just outside the walls (readable over the wall line).
for (const [x, z, s] of [
  [-23, -13, 2.6],
  [-23, 12, 3.0],
  [23, -12, 2.8],
  [23, 13, 2.6],
  [-10, -17.5, 2.8],
  [8, 17.5, 3.0],
  [14, -17.5, 2.4],
  [-6, 17.5, 2.6],
] as const) {
  props.push({ model: 'nature/tree', position: [x, 0, z], scale: s });
}

// Practice blocks near the south wall (poke targets around corners).
props.push({ model: 'arena/block', position: [6, 0, -11], scale: 1.8 });
obstacles.push({ shape: { kind: 'box', x: 6, z: -11, w: 1.8, d: 1.8 } });
props.push({ model: 'arena/bricks', position: [7.6, 0, -10.2], scale: 1.2 });

export const TRAINING_MAP: MapDef = {
  id: 'training',
  name: 'Training Grounds',
  width: W,
  height: H,
  navCell: 0.5,
  obstacles,
  props,
  floor: { tile: 'arena/floor', accentTile: 'arena/floor-detail', size: 2 },
  skybox: 'skybox-day',
  spawns: [{ team: 0, x: -14, z: 0, facingDeg: 0 }],
  dummies: [
    { unit: 'dummy_recruit', x: 6, z: -5 },
    { unit: 'dummy_soldier', x: 8, z: 0 },
    { unit: 'dummy_champion', x: 6, z: 5 },
    { unit: 'dummy_recruit', x: 13, z: 0 },
  ],
  lighting: {
    sunDir: [-0.55, -1, -0.4],
    sunColor: 0xfff1da,
    skyColor: 0xbfe0ff,
    groundColor: 0x9a8f78,
    sunIntensity: 2.6,
    ambientIntensity: 0.85,
  },
};
