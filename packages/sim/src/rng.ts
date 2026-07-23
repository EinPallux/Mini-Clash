/**
 * PCG32 — deterministic PRNG. All simulation randomness flows through named streams
 * derived from the match seed. No Math.random anywhere in the sim (CLAUDE.md rules).
 */
export class Pcg32 {
  private hi: number;
  private lo: number;
  private incHi: number;
  private incLo: number;

  constructor(seed: number, streamId = 0) {
    // 64-bit state via two 32-bit halves (JS-safe).
    this.hi = 0;
    this.lo = 0;
    this.incHi = (streamId >>> 16) ^ 0x14057b7e;
    this.incLo = ((streamId << 1) | 1) >>> 0;
    this.next();
    this.lo = (this.lo + (seed >>> 0)) >>> 0;
    this.hi = (this.hi + ((seed / 0x100000000) | 0)) >>> 0;
    this.next();
  }

  /** Uniform uint32. */
  next(): number {
    // state = state * 6364136223846793005 + inc  (64-bit multiply in 16-bit limbs)
    const mLo = 0x4c957f2d;
    const mHi = 0x5851f42d;
    const a0 = this.lo & 0xffff;
    const a1 = this.lo >>> 16;
    const b0 = mLo & 0xffff;
    const b1 = mLo >>> 16;

    let c0 = a0 * b0;
    let c1 = (c0 >>> 16) + a1 * b0 + a0 * b1;
    c0 &= 0xffff;
    const newLo = ((c1 << 16) | c0) >>> 0;
    let carryHi = (a1 * b1 + (c1 >>> 16)) >>> 0;
    carryHi = (carryHi + Math.imul(this.lo, mHi) + Math.imul(this.hi, mLo)) >>> 0;

    let lo = (newLo + this.incLo) >>> 0;
    let carry = lo < this.incLo ? 1 : 0;
    let hi = (carryHi + this.incHi + carry) >>> 0;
    this.lo = lo;
    this.hi = hi;

    // XSH-RR output
    const xored = ((this.hi ^ (this.hi >>> 13)) ^ (this.lo >>> 27)) >>> 0;
    const rot = this.hi >>> 27;
    return ((xored >>> rot) | (xored << ((32 - rot) & 31))) >>> 0;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.next() / 0x100000000;
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    return this.next() % n;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.float() * (max - min);
  }
}
