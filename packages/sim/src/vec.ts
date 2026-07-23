/**
 * 2D vector math on plain numbers. The sim never uses trig at tick time:
 * facings are unit vectors, cones use dot-product thresholds (cosines cached
 * once from data-constant angles at init) — see TECH §4 determinism contract.
 */

export function len(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

export function distSq(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

/** Returns [nx, nz]; falls back to +X for zero vectors. */
export function norm(x: number, z: number): [number, number] {
  const l = Math.sqrt(x * x + z * z);
  if (l < 1e-9) return [1, 0];
  return [x / l, z / l];
}

export function dot(ax: number, az: number, bx: number, bz: number): number {
  return ax * bx + az * bz;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Point-in-cone: origin o, facing f (unit), half-angle cosine, radius; target point + its radius. */
export function inCone(
  ox: number,
  oz: number,
  fx: number,
  fz: number,
  cosHalf: number,
  radius: number,
  px: number,
  pz: number,
  pr: number,
): boolean {
  const dx = px - ox;
  const dz = pz - oz;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > radius + pr) return false;
  if (d < 0.35 + pr) return true; // point-blank always hits
  return (dx / d) * fx + (dz / d) * fz >= cosHalf;
}

/** Point-vs-oriented-rect: rect starts at origin, extends `length` along facing, `width` across. */
export function inRect(
  ox: number,
  oz: number,
  fx: number,
  fz: number,
  length: number,
  width: number,
  px: number,
  pz: number,
  pr: number,
): boolean {
  const dx = px - ox;
  const dz = pz - oz;
  const along = dx * fx + dz * fz;
  const across = dx * -fz + dz * fx;
  return along >= -pr && along <= length + pr && Math.abs(across) <= width / 2 + pr;
}

/** Segment-vs-circle sweep: does segment a→b pass within r of point p? */
export function segHitsCircle(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  px: number,
  pz: number,
  r: number,
): boolean {
  const abx = bx - ax;
  const abz = bz - az;
  const l2 = abx * abx + abz * abz;
  let t = 0;
  if (l2 > 1e-12) t = clamp(((px - ax) * abx + (pz - az) * abz) / l2, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return distSq(cx, cz, px, pz) <= r * r;
}
