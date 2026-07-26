import type { MapDef } from '@mini-clash/data';

/**
 * Navigation grid: A* over inflated obstacle cells + line-walk smoothing.
 * Cells are blocked with a 0.5u clearance inflation (unit radius), so paths are
 * valid for standard-radius units. Temporary walls (Rook W) stamp cells and bump
 * `version`; movers re-path when their cached version is stale.
 */

const CLEARANCE = 0.5;

/** Receipt from `openRegion` — the cells touched and what they were before. */
export interface RegionPatch {
  cells: number[];
  prev: number[];
}

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly originX: number;
  readonly originZ: number;
  /** 0 = open; 1 = static blocked; >=2 = wall stamp count + 1. */
  private blocked: Uint8Array;
  version = 1;

  constructor(map: MapDef) {
    this.cell = map.navCell;
    this.cols = Math.ceil(map.width / this.cell);
    this.rows = Math.ceil(map.height / this.cell);
    this.originX = -map.width / 2;
    this.originZ = -map.height / 2;
    this.blocked = new Uint8Array(this.cols * this.rows);

    for (const ob of map.obstacles) {
      const s = ob.shape;
      if (s.kind === 'box') {
        this.stampBox(s.x, s.z, s.w / 2 + CLEARANCE, s.d / 2 + CLEARANCE);
      } else {
        this.stampCircle(s.x, s.z, s.r + CLEARANCE);
      }
    }
    // Border safety ring.
    for (let c = 0; c < this.cols; c++) {
      this.set(c, 0, 1);
      this.set(c, this.rows - 1, 1);
    }
    for (let r = 0; r < this.rows; r++) {
      this.set(0, r, 1);
      this.set(this.cols - 1, r, 1);
    }
  }

  private idx(c: number, r: number): number {
    return r * this.cols + c;
  }
  private set(c: number, r: number, v: number): void {
    if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) this.blocked[this.idx(c, r)] = v;
  }

  toCol(x: number): number {
    return Math.floor((x - this.originX) / this.cell);
  }
  toRow(z: number): number {
    return Math.floor((z - this.originZ) / this.cell);
  }
  colX(c: number): number {
    return this.originX + (c + 0.5) * this.cell;
  }
  rowZ(r: number): number {
    return this.originZ + (r + 0.5) * this.cell;
  }

  isBlockedCell(c: number, r: number): boolean {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return true;
    return this.blocked[this.idx(c, r)] !== 0;
  }

  isBlockedAt(x: number, z: number): boolean {
    return this.isBlockedCell(this.toCol(x), this.toRow(z));
  }

  /** Static blocker (init only). */
  private stampBox(cx: number, cz: number, hw: number, hd: number): void {
    const c0 = this.toCol(cx - hw);
    const c1 = this.toCol(cx + hw);
    const r0 = this.toRow(cz - hd);
    const r1 = this.toRow(cz + hd);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        this.set(c, r, 1);
      }
    }
  }

  /** Static blocker (init only). */
  private stampCircle(cx: number, cz: number, rad: number): void {
    const c0 = this.toCol(cx - rad);
    const c1 = this.toCol(cx + rad);
    const r0 = this.toRow(cz - rad);
    const r1 = this.toRow(cz + rad);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const dx = this.colX(c) - cx;
        const dz = this.rowZ(r) - cz;
        if (dx * dx + dz * dz <= rad * rad) this.set(c, r, 1);
      }
    }
  }

  /** Stamp a temporary wall segment (center, unit facing, length, thickness). Returns stamped cell indices. */
  stampWall(
    cx: number,
    cz: number,
    fx: number,
    fz: number,
    length: number,
    thickness: number,
  ): number[] {
    const cells: number[] = [];
    const half = length / 2;
    const ht = thickness / 2 + CLEARANCE;
    const step = this.cell * 0.5;
    for (let a = -half; a <= half; a += step) {
      for (let t = -ht; t <= ht; t += step) {
        // Wall runs PERPENDICULAR to facing (a rampart across the cast direction).
        const px = cx + -fz * a + fx * t;
        const pz = cz + fx * a + fz * t;
        const c = this.toCol(px);
        const r = this.toRow(pz);
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) continue;
        const i = this.idx(c, r);
        if (this.blocked[i] === 1) continue;
        this.blocked[i] = this.blocked[i] === 0 ? 2 : this.blocked[i] + 1;
        cells.push(i);
      }
    }
    this.version++;
    return cells;
  }

  /** Stamp a temporary circular obstacle (Boltz's droppod bunker). Returns cell indices; reverse with unstampWall. */
  stampDisc(cx: number, cz: number, rad: number): number[] {
    const cells: number[] = [];
    const r = rad + CLEARANCE;
    const c0 = this.toCol(cx - r);
    const c1 = this.toCol(cx + r);
    const r0 = this.toRow(cz - r);
    const r1 = this.toRow(cz + r);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) continue;
        const dx = this.colX(col) - cx;
        const dz = this.rowZ(row) - cz;
        if (dx * dx + dz * dz > r * r) continue;
        const i = this.idx(col, row);
        if (this.blocked[i] === 1) continue; // never disturb static blockers
        this.blocked[i] = this.blocked[i] === 0 ? 2 : this.blocked[i] + 1;
        cells.push(i);
      }
    }
    this.version++;
    return cells;
  }

  /**
   * Stamp an annulus of blocked cells (Castle Drop's standing crater rim).
   * Same lifecycle as stampDisc — reverse with unstampWall.
   */
  stampRing(cx: number, cz: number, rad: number, thickness: number): number[] {
    const outer = this.stampDisc(cx, cz, rad);
    const inner = new Set(this.stampDisc(cx, cz, Math.max(0, rad - thickness)));
    const ring: number[] = [];
    for (const cell of outer) {
      if (inner.has(cell)) continue;
      ring.push(cell);
    }
    // The inner disc was stamped only to compute the hole — give it back.
    this.unstampWall([...inner]);
    return ring;
  }

  unstampWall(cells: number[]): void {
    for (const i of cells) {
      const v = this.blocked[i];
      if (v >= 2) this.blocked[i] = v === 2 ? 0 : v - 1;
    }
    this.version++;
  }

  /**
   * Open a rectangle that is currently *statically* blocked — the Flank Isles
   * rising out of the void (GAME_DESIGN §9). Stamping cannot express this:
   * `stampDisc` deliberately never disturbs static blockers, because a wall
   * that could erase the map edge would be a hole in the world. So this saves
   * the exact prior value of every cell it touches and hands back a receipt.
   *
   * Pair every call with `restoreRegion`. Nothing else may write these cells
   * while the region is open, or the receipt is a lie.
   */
  openRegion(cx: number, cz: number, w: number, d: number): RegionPatch {
    const cells: number[] = [];
    const prev: number[] = [];
    const c0 = this.toCol(cx - w / 2);
    const c1 = this.toCol(cx + w / 2);
    const r0 = this.toRow(cz - d / 2);
    const r1 = this.toRow(cz + d / 2);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        // The border safety ring stays shut: it is what stops pathing from
        // walking off the array.
        if (col <= 0 || col >= this.cols - 1 || row <= 0 || row >= this.rows - 1) continue;
        const i = this.idx(col, row);
        // ONLY static geometry (1) opens. Cells carrying a live stamp (>= 2)
        // are somebody's wall or bunker and are left exactly as they are.
        //
        // This is not a nicety, it is the correctness condition. Restoring a
        // stamped value later would resurrect an obstacle whose owner has since
        // unstamped it — the count leaks, the cell never reopens, and the deck
        // slowly walls itself off until pathing fails everywhere. Measured:
        // 259 leaked cells over one match, and 155 of 171 Minis frozen.
        if (this.blocked[i] !== 1) continue;
        cells.push(i);
        prev.push(1);
        this.blocked[i] = 0;
      }
    }
    this.version++;
    return { cells, prev };
  }

  /**
   * Close a rectangle permanently as *static* geometry — the deck edges falling
   * into the void during the Bridge Collapse. Unlike a stamp this cannot be
   * lifted, which is the point: the bridge does not grow back.
   */
  closeRegion(cx: number, cz: number, w: number, d: number): void {
    const c0 = this.toCol(cx - w / 2);
    const c1 = this.toCol(cx + w / 2);
    const r0 = this.toRow(cz - d / 2);
    const r1 = this.toRow(cz + d / 2);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) continue;
        this.blocked[this.idx(col, row)] = 1;
      }
    }
    this.version++;
  }

  /** Put an `openRegion` back exactly as it was. */
  restoreRegion(patch: RegionPatch): void {
    for (let i = 0; i < patch.cells.length; i++) {
      this.blocked[patch.cells[i]] = patch.prev[i];
    }
    this.version++;
  }

  /** Straight-line walkability (sampled). */
  lineWalkable(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const d = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.isBlockedAt(ax + dx * t, az + dz * t)) return false;
    }
    return true;
  }

  /** Nearest open cell center to a (possibly blocked) point. */
  nearestOpen(x: number, z: number): [number, number] {
    const c = this.toCol(x);
    const r = this.toRow(z);
    if (!this.isBlockedCell(c, r)) return [x, z];
    for (let ring = 1; ring < 30; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          if (!this.isBlockedCell(c + dc, r + dr)) return [this.colX(c + dc), this.rowZ(r + dr)];
        }
      }
    }
    return [x, z];
  }

  /**
   * A* path from a→b with string-pull smoothing. Returns waypoints (excluding start),
   * or a direct segment when line-walkable. Deterministic: fixed neighbor order, integer keys.
   */
  findPath(ax: number, az: number, bx: number, bz: number): [number, number][] {
    [bx, bz] = this.nearestOpen(bx, bz);
    if (this.lineWalkable(ax, az, bx, bz)) return [[bx, bz]];

    const startC = this.toCol(ax);
    const startR = this.toRow(az);
    const goalC = this.toCol(bx);
    const goalR = this.toRow(bz);
    const n = this.cols * this.rows;
    const gScore = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
    const from = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const startI = this.idx(startC, startR);
    const goalI = this.idx(goalC, goalR);
    gScore[startI] = 0;

    // Binary heap of [f, idx]
    const heap: number[] = [];
    const hIdx: number[] = [];
    const push = (f: number, i: number): void => {
      heap.push(f);
      hIdx.push(i);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p] <= heap[k]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        [hIdx[p], hIdx[k]] = [hIdx[k], hIdx[p]];
        k = p;
      }
    };
    const pop = (): number => {
      const top = hIdx[0];
      const lastF = heap.pop()!;
      const lastI = hIdx.pop()!;
      if (heap.length > 0) {
        heap[0] = lastF;
        hIdx[0] = lastI;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l] < heap[m]) m = l;
          if (r < heap.length && heap[r] < heap[m]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          [hIdx[m], hIdx[k]] = [hIdx[k], hIdx[m]];
          k = m;
        }
      }
      return top;
    };
    const hDist = (c: number, r: number): number => {
      const dc = Math.abs(c - goalC);
      const dr = Math.abs(r - goalR);
      return (Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr)) * this.cell;
    };
    push(hDist(startC, startR), startI);

    const DIRS = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2],
    ] as const;

    let found = false;
    let guard = 0;
    while (heap.length > 0 && guard++ < 20000) {
      const cur = pop();
      if (cur === goalI) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % this.cols;
      const cr = (cur / this.cols) | 0;
      for (const [dc, dr, cost] of DIRS) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (this.isBlockedCell(nc, nr)) continue;
        // No diagonal corner-cutting.
        if (
          dc !== 0 &&
          dr !== 0 &&
          (this.isBlockedCell(cc + dc, cr) || this.isBlockedCell(cc, cr + dr))
        )
          continue;
        const ni = this.idx(nc, nr);
        if (closed[ni]) continue;
        const g = gScore[cur] + cost * this.cell;
        if (g < gScore[ni]) {
          gScore[ni] = g;
          from[ni] = cur;
          push(g + hDist(nc, nr), ni);
        }
      }
    }
    if (!found) return [];

    // Reconstruct + string pull.
    const cellsRev: number[] = [];
    for (let i = goalI; i !== -1; i = from[i]) cellsRev.push(i);
    cellsRev.reverse();
    const pts: [number, number][] = cellsRev.map((i) => [
      this.colX(i % this.cols),
      this.rowZ((i / this.cols) | 0),
    ]);
    pts[pts.length - 1] = [bx, bz];

    const out: [number, number][] = [];
    let anchorX = ax;
    let anchorZ = az;
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i; j--) {
        if (this.lineWalkable(anchorX, anchorZ, pts[j][0], pts[j][1])) break;
      }
      out.push(pts[j]);
      [anchorX, anchorZ] = pts[j];
      i = j + (j === i ? 1 : 0);
      if (j === pts.length - 1) break;
    }
    if (out.length === 0) out.push(pts[pts.length - 1]);
    return out;
  }
}
