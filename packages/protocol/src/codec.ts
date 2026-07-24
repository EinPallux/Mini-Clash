import type {
  CastSnap,
  ChampionSnap,
  EntitySnap,
  MatchStateSnap,
  SimEvent,
  Snapshot,
} from './index';

/**
 * Binary delta-snapshot codec (TECH §6): 20 Hz frames over a reliable ordered
 * transport. Positions quantize to 0.01 u, timers to 0.1 s. Every entity
 * carries a per-block dirty mask (position / vitals / progress / cooldowns /
 * state / buffs / passive / rare-JSON) and only dirty blocks travel; a frame
 * lists only dirty entities. Baselines (self-contained keyframes, string table
 * included) go out every ~2 s and whenever a client (re)joins. Damage and fx
 * events — the teamfight firehose — encode binary; other events ride JSON.
 * Budget: ≤ 12 KB/s per client at teamfight peak (enforced by test).
 */

export const BASELINE_EVERY = 40; // frames ≈ 2 s at 20 Hz

const KINDS = [
  'champion',
  'dummy',
  'keg',
  'wall',
  'projectile',
  'mini',
  'tower',
  'core',
  'orb',
  'flower',
  'zone',
] as const;
type Kind = (typeof KINDS)[number];
const KIND_INDEX = new Map<string, number>(KINDS.map((k, i) => [k, i]));

const CAST_KINDS = ['q', 'w', 'r', 'aa', 'recast'] as const;
const SLOTS = ['q', 'w', 'r'] as const;
const MINI_KINDS = ['bruiser', 'zapper', 'ram'] as const;
const TIERS = ['outer', 'inner'] as const;
const CC_KINDS = [undefined, 'knockup', 'slow'] as const;

/* Blocks (bit positions in the per-entity mask). */
const B_POS = 1;
const B_VITAL = 2;
const B_PROGRESS = 4;
const B_CD = 8;
const B_STATE = 16;
const B_BUFFS = 32;
const B_PASSIVE = 64;
const B_RARE = 128;

/* State flags (champion STATE block). */
const F_DEAD = 1;
const F_BRUSH = 2;
const F_DANCING = 4;
const F_CASTING = 8;
const F_RECAST = 16;
const F_AIRBORNE = 32;

const NONE16 = 0xffff;

/* ------------------------------ byte helpers ------------------------------ */

class Writer {
  private buf = new Uint8Array(4096);
  private view = new DataView(this.buf.buffer);
  len = 0;

  private grow(n: number): void {
    if (this.len + n <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.len + n));
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): void {
    this.grow(1);
    this.view.setUint8(this.len, v);
    this.len += 1;
  }
  u16(v: number): void {
    this.grow(2);
    this.view.setUint16(this.len, v);
    this.len += 2;
  }
  i16(v: number): void {
    this.grow(2);
    this.view.setInt16(this.len, v);
    this.len += 2;
  }
  i8(v: number): void {
    this.grow(1);
    this.view.setInt8(this.len, v);
    this.len += 1;
  }
  u32(v: number): void {
    this.grow(4);
    this.view.setUint32(this.len, v);
    this.len += 4;
  }
  i32(v: number): void {
    this.grow(4);
    this.view.setInt32(this.len, v);
    this.len += 4;
  }
  bytes(b: Uint8Array): void {
    this.grow(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }
  /** Length-prefixed utf8 (u16). */
  str(s: string): void {
    const b = new TextEncoder().encode(s);
    this.u16(b.length);
    this.bytes(b);
  }
  take(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

class Reader {
  private view: DataView;
  pos = 0;
  constructor(private buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  get left(): number {
    return this.buf.length - this.pos;
  }
  u8(): number {
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }
  u16(): number {
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  i16(): number {
    const v = this.view.getInt16(this.pos);
    this.pos += 2;
    return v;
  }
  i8(): number {
    const v = this.view.getInt8(this.pos);
    this.pos += 1;
    return v;
  }
  u32(): number {
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }
  i32(): number {
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }
  str(): string {
    const n = this.u16();
    const s = new TextDecoder().decode(this.buf.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }
}

/* quantization */
const q100 = (v: number): number => Math.round(v * 100);
const q10 = (v: number): number => Math.round(v * 10);
const clampU8 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const clampU16 = (v: number): number => Math.max(0, Math.min(65535, Math.round(v)));

/* ------------------------------ block encoders ----------------------------- */
/** Encode one block of an entity into standalone bytes (compared for dirt). */

function encPos(w: Writer, e: EntitySnap): void {
  w.i16(q100(e.x));
  w.i16(q100(e.z));
  w.i8(Math.round(e.fx * 127));
  w.i8(Math.round(e.fz * 127));
  if (e.kind === 'champion') w.u8(clampU8(e.speed * 10));
}

function encVital(w: Writer, e: EntitySnap): void {
  switch (e.kind) {
    case 'champion':
      w.u16(clampU16(e.hp));
      w.u16(clampU16(e.shield));
      w.u8(clampU8(e.energy));
      break;
    case 'mini':
      w.u16(clampU16(e.hp));
      w.u8(e.attacking ? 1 : 0);
      break;
    case 'projectile':
      w.u8(clampU8(e.travelFrac * 200));
      break;
    case 'tower':
      w.u16(clampU16(e.hp));
      w.u8(clampU8(e.ramp * 50));
      w.u16(e.aggro === null ? NONE16 : e.aggro);
      w.u8((e.invulnerable ? 1 : 0) | (e.dead ? 2 : 0));
      break;
    case 'core':
      w.u16(clampU16(e.hp));
      w.u8(e.invulnerable ? 1 : 0);
      break;
    case 'keg':
      w.u8(clampU8(e.fuseLeft * 10));
      w.u8(clampU8((e.tossPhase ?? 0) * 200));
      break;
    case 'wall':
    case 'flower':
    case 'zone':
      w.u16(clampU16(q10(e.tLeft)));
      break;
    case 'dummy':
      w.u16(clampU16(e.hp));
      w.u16(clampU16(e.dps));
      w.u8((e.windowActive ? 1 : 0) | ((CC_KINDS.indexOf(e.ccKind) << 1) & 6));
      w.u8(clampU8(e.hitPulse * 100));
      break;
    case 'orb':
      w.u16(clampU16(e.hp));
      break;
  }
}

function encProgress(w: Writer, c: ChampionSnap): void {
  w.u8(c.level);
  w.u16(clampU16(c.gold));
  w.u8(clampU8(c.kills));
  w.u8(clampU8(c.deaths));
  w.u8(clampU8(c.assists));
  w.u16(clampU16(c.hpMax));
  w.u8(clampU8(c.respawnIn * 10));
  w.u16(clampU16(c.stats.ad));
  w.u16(clampU16(c.stats.attackSpeed * 100));
  w.u16(clampU16(c.stats.moveSpeed * 100));
  w.u16(clampU16(c.stats.armor));
  w.u16(clampU16(c.stats.ward));
}

function encCd(w: Writer, c: ChampionSnap): void {
  w.u16(clampU16(q10(c.cooldowns.q)));
  w.u16(clampU16(q10(c.cooldowns.w)));
  w.u16(clampU16(q10(c.cooldowns.r)));
  w.u16(c.relic ? clampU16(q10(c.relic.cd)) : NONE16);
}

function encState(w: Writer, c: ChampionSnap): void {
  let flags = 0;
  if (c.dead) flags |= F_DEAD;
  if (c.inBrush) flags |= F_BRUSH;
  if (c.dancing) flags |= F_DANCING;
  if (c.casting) flags |= F_CASTING;
  if (c.recast) flags |= F_RECAST;
  if (c.airborne !== undefined) flags |= F_AIRBORNE;
  w.u8(flags);
  if (c.casting) {
    w.u8(CAST_KINDS.indexOf(c.casting.kind));
    w.u8(clampU8(c.casting.progress * 200));
    w.i16(q100(c.casting.aimX));
    w.i16(q100(c.casting.aimZ));
  }
  if (c.recast) {
    w.u8(SLOTS.indexOf(c.recast.slot));
    w.u8(clampU8(c.recast.tLeft * 10));
  }
  if (c.airborne !== undefined) w.u8(clampU8(c.airborne * 200));
}

function encBuffs(w: Writer, c: ChampionSnap, intern: (s: string) => number): void {
  w.u8(Math.min(255, c.buffs.length));
  for (const b of c.buffs.slice(0, 255)) {
    w.u8(intern(b.id));
    w.u8(clampU8(b.stacks));
    w.u16(clampU16(q10(b.tLeft)));
  }
}

function encPassive(w: Writer, c: ChampionSnap, intern: (s: string) => number): void {
  const keys = Object.keys(c.passive);
  w.u8(Math.min(255, keys.length));
  for (const k of keys.slice(0, 255)) {
    w.u8(intern(k));
    w.i32(q100(c.passive[k]));
  }
}

/** Everything slow-changing, JSON'd and only re-sent when the string changes. */
function rareJson(e: EntitySnap): string {
  switch (e.kind) {
    case 'champion':
      return JSON.stringify({
        player: e.player,
        championId: e.championId,
        bot: e.bot,
        name: e.name,
        team: e.team,
        radius: e.radius,
        items: e.items,
        relic: e.relic ? { id: e.relic.id, cdMax: e.relic.cdMax } : null,
        cooldownMax: e.cooldownMax,
        // Death recap: appears at death, static while dead — one resend each.
        recap: e.recap ?? null,
      });
    case 'mini':
      return JSON.stringify({
        unitId: e.unitId,
        miniKind: MINI_KINDS.indexOf(e.miniKind),
        team: e.team,
        radius: e.radius,
        hpMax: e.hpMax,
      });
    case 'projectile':
      return JSON.stringify({
        projId: e.projId,
        style: e.style,
        color: e.color,
        size: e.size,
        team: e.team,
        radius: e.radius,
        hp: e.hp,
        hpMax: e.hpMax,
      });
    case 'tower':
      return JSON.stringify({
        tier: TIERS.indexOf(e.tier),
        team: e.team,
        x: e.x,
        z: e.z,
        fx: e.fx,
        fz: e.fz,
        radius: e.radius,
        hpMax: e.hpMax,
      });
    case 'core':
    case 'orb':
      return JSON.stringify({
        team: e.team,
        x: e.x,
        z: e.z,
        fx: e.fx,
        fz: e.fz,
        radius: e.radius,
        hpMax: e.hpMax,
        hp: e.kind === 'orb' ? e.hp : undefined,
      });
    case 'wall':
      return JSON.stringify({
        team: e.team,
        x: e.x,
        z: e.z,
        fx: e.fx,
        fz: e.fz,
        radius: e.radius,
        hp: e.hp,
        hpMax: e.hpMax,
        length: e.length,
        duration: e.duration,
      });
    case 'flower':
    case 'zone':
      return JSON.stringify({
        team: e.team,
        x: e.x,
        z: e.z,
        fx: e.fx,
        fz: e.fz,
        radius: e.radius,
        hp: e.hp,
        hpMax: e.hpMax,
        duration: e.kind === 'zone' ? e.duration : undefined,
      });
    case 'keg':
      return JSON.stringify({
        unitId: e.unitId,
        team: e.team,
        radius: e.radius,
        hp: e.hp,
        hpMax: e.hpMax,
      });
    case 'dummy':
      return JSON.stringify({
        unitId: e.unitId,
        team: e.team,
        radius: e.radius,
        hpMax: e.hpMax,
      });
  }
}

/** Which blocks exist for a kind (POS for movers, VITAL for almost all…). */
function blocksFor(kind: Kind): number {
  switch (kind) {
    case 'champion':
      return B_POS | B_VITAL | B_PROGRESS | B_CD | B_STATE | B_BUFFS | B_PASSIVE | B_RARE;
    case 'mini':
    case 'projectile':
    case 'keg':
    case 'dummy':
      return B_POS | B_VITAL | B_RARE;
    case 'tower':
    case 'core':
    case 'wall':
    case 'flower':
    case 'zone':
      return B_VITAL | B_RARE;
    case 'orb':
      return B_VITAL | B_RARE;
  }
}

function encodeBlock(
  block: number,
  e: EntitySnap,
  intern: (s: string) => number,
): Uint8Array | string {
  if (block === B_RARE) return rareJson(e);
  const w = new Writer();
  switch (block) {
    case B_POS:
      encPos(w, e);
      break;
    case B_VITAL:
      encVital(w, e);
      break;
    case B_PROGRESS:
      encProgress(w, e as ChampionSnap);
      break;
    case B_CD:
      encCd(w, e as ChampionSnap);
      break;
    case B_STATE:
      encState(w, e as ChampionSnap);
      break;
    case B_BUFFS:
      encBuffs(w, e as ChampionSnap, intern);
      break;
    case B_PASSIVE:
      encPassive(w, e as ChampionSnap, intern);
      break;
    default:
      break;
  }
  return w.take();
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* -------------------------------- encoder --------------------------------- */

interface PrevEntity {
  kind: Kind;
  blocks: Map<number, Uint8Array | string>;
}

export class SnapshotEncoder {
  private prev = new Map<number, PrevEntity>();
  private prevMatch = '';
  private table: string[] = [];
  private tableIndex = new Map<string, number>();
  private pendingStrings: string[] = [];
  private seq = 0;
  private sinceBaseline = Infinity; // first frame is always a baseline

  private intern = (s: string): number => {
    const found = this.tableIndex.get(s);
    if (found !== undefined) return found;
    const idx = this.table.length;
    if (idx > 255) throw new Error('codec string table overflow');
    this.table.push(s);
    this.tableIndex.set(s, idx);
    this.pendingStrings.push(s);
    return idx;
  };

  /** Force the next frame to be a self-contained baseline (client joined). */
  forceBaseline(): void {
    this.sinceBaseline = Infinity;
  }

  encode(snap: Snapshot): Uint8Array {
    const baseline = this.sinceBaseline >= BASELINE_EVERY;
    if (baseline) {
      this.prev.clear();
      this.prevMatch = '';
      this.sinceBaseline = 0;
    }
    this.sinceBaseline++;

    // Match state (minus the ticking fields carried in the header).
    const matchJson = JSON.stringify({ ...snap.match, time: 0, nextOrbIn: null });
    const matchDirty = matchJson !== this.prevMatch;
    this.prevMatch = matchJson;

    // Pre-encode entities AND events first so every string interned along the
    // way lands in this frame's table section (written before both payloads).
    this.pendingStrings = baseline ? [...this.table] : [];
    const seen = new Set<number>();
    const encoded: {
      id: number;
      kindIdx: number;
      mask: number;
      blocks: (Uint8Array | string)[];
    }[] = [];
    for (const e of snap.entities) {
      if (e.id > 0xfffe) throw new Error('entity id exceeds codec range');
      seen.add(e.id);
      const kind = e.kind as Kind;
      let prev = this.prev.get(e.id);
      if (prev && prev.kind !== kind) prev = undefined; // id reuse across kinds
      const fresh: PrevEntity = prev ?? { kind, blocks: new Map() };
      let mask = 0;
      const blocks: (Uint8Array | string)[] = [];
      const available = blocksFor(kind);
      for (let bit = 1; bit <= 128; bit <<= 1) {
        if (!(available & bit)) continue;
        const now = encodeBlock(bit, e, this.intern);
        const before = fresh.blocks.get(bit);
        const dirty =
          before === undefined ||
          (typeof now === 'string'
            ? now !== before
            : typeof before === 'string' || !bytesEqual(now, before));
        if (dirty) {
          mask |= bit;
          blocks.push(now);
          fresh.blocks.set(bit, now);
        }
      }
      this.prev.set(e.id, fresh);
      if (mask !== 0) {
        encoded.push({ id: e.id, kindIdx: KIND_INDEX.get(kind) ?? 0, mask, blocks });
      }
    }

    // Removals (left the view: death cleanup, brush concealment…).
    const removed: number[] = [];
    for (const id of this.prev.keys()) {
      if (!seen.has(id)) removed.push(id);
    }
    for (const id of removed) this.prev.delete(id);

    const ew = new Writer();
    this.encodeEvents(ew, snap.events);

    const w = new Writer();
    w.u8(baseline ? 1 : 2);
    w.u16(this.seq++ & 0xffff);
    w.i32(-1); // ack — patched per client at offset 3
    w.u32(snap.tick >>> 0);
    w.u16(clampU16(q10(snap.time)));
    w.i16(snap.match.nextOrbIn === null ? -1 : q10(snap.match.nextOrbIn));
    w.u8(matchDirty ? 1 : 0);

    // String table additions (baselines carry the whole table).
    w.u8(this.pendingStrings.length);
    for (const s of this.pendingStrings) {
      const b = new TextEncoder().encode(s);
      w.u8(b.length);
      w.bytes(b);
    }
    this.pendingStrings = [];

    if (matchDirty) w.str(matchJson);

    w.u16(removed.length);
    for (const id of removed) w.u16(id);

    w.u16(encoded.length);
    for (const e of encoded) {
      w.u16(e.id);
      w.u8(e.kindIdx);
      w.u8(e.mask);
      for (const b of e.blocks) {
        if (typeof b === 'string') w.str(b);
        else w.bytes(b); // fixed/self-describing layouts — no length prefix
      }
    }

    w.bytes(ew.take());
    return w.take();
  }

  private encodeEvents(w: Writer, events: SimEvent[]): void {
    w.u16(events.length);
    for (const ev of events) {
      if (ev.t === 'damage') {
        w.u8(0);
        w.u16(ev.target > 0xfffe ? NONE16 : ev.target);
        w.u16(clampU16(ev.amount));
        w.u8(ev.dtype === 'physical' ? 0 : 1);
        w.i16(q100(ev.x));
        w.i16(q100(ev.z));
      } else if (ev.t === 'fx') {
        w.u8(1);
        w.u8(this.intern(ev.key));
        w.i16(q100(ev.x));
        w.i16(q100(ev.z));
        let flags = 0;
        if (ev.fx !== undefined) flags |= 1;
        if (ev.ax !== undefined) flags |= 2;
        if (ev.source !== undefined) flags |= 4;
        if (ev.target !== undefined) flags |= 8;
        w.u8(flags);
        if (ev.fx !== undefined) {
          w.i8(Math.round(ev.fx * 127));
          w.i8(Math.round((ev.fz ?? 0) * 127));
        }
        if (ev.ax !== undefined) {
          w.i16(q100(ev.ax));
          w.i16(q100(ev.az ?? 0));
        }
        if (ev.source !== undefined) w.u16(ev.source > 0xfffe ? NONE16 : ev.source);
        if (ev.target !== undefined) w.u16(ev.target > 0xfffe ? NONE16 : ev.target);
      } else {
        w.u8(255);
        w.str(JSON.stringify(ev));
      }
    }
  }
}

/* -------------------------------- decoder --------------------------------- */

export class SnapshotDecoder {
  private entities = new Map<number, EntitySnap>();
  private match: MatchStateSnap | null = null;
  private table: string[] = [];

  /** Returns null for a delta that arrives before any baseline (unjoinable). */
  decode(buf: Uint8Array): (Snapshot & { ack?: number }) | null {
    const r = new Reader(buf);
    const frameKind = r.u8();
    r.u16(); // seq (transport is ordered — kept for diagnostics)
    const ack = r.i32();
    const tick = r.u32();
    const time = r.u16() / 10;
    const nextOrbRaw = r.i16();
    const matchDirty = r.u8() === 1;

    if (frameKind === 1) {
      this.entities.clear();
      this.table = [];
    } else if (this.match === null) {
      return null; // delta without a baseline — wait for the next keyframe
    }

    const strings = r.u8();
    for (let i = 0; i < strings; i++) {
      const n = r.u8();
      this.table.push(new TextDecoder().decode(buf.subarray(r.pos, r.pos + n)));
      r.pos += n;
    }

    if (matchDirty) {
      this.match = JSON.parse(r.str()) as MatchStateSnap;
    }
    const match: MatchStateSnap = {
      ...(this.match as MatchStateSnap),
      time,
      nextOrbIn: nextOrbRaw < 0 ? null : nextOrbRaw / 10,
    };

    const removed = r.u16();
    for (let i = 0; i < removed; i++) this.entities.delete(r.u16());

    const count = r.u16();
    for (let i = 0; i < count; i++) {
      const id = r.u16();
      const kind = KINDS[r.u8()];
      const mask = r.u8();
      const before = this.entities.get(id);
      const e: Record<string, unknown> =
        before && before.kind === kind ? { ...before } : { id, kind };
      if (mask & B_POS) this.decPos(r, e, kind);
      if (mask & B_VITAL) this.decVital(r, e, kind);
      if (mask & B_PROGRESS) this.decProgress(r, e);
      if (mask & B_CD) this.decCd(r, e);
      if (mask & B_STATE) this.decState(r, e);
      if (mask & B_BUFFS) this.decBuffs(r, e);
      if (mask & B_PASSIVE) this.decPassive(r, e);
      if (mask & B_RARE) this.decRare(r, e, kind);
      this.entities.set(id, e as unknown as EntitySnap);
    }

    const events = this.decodeEvents(r);

    return {
      tick,
      time,
      match,
      entities: [...this.entities.values()],
      events,
      ack: ack >= 0 ? ack : undefined,
    };
  }

  private decPos(r: Reader, e: Record<string, unknown>, kind: Kind): void {
    e.x = r.i16() / 100;
    e.z = r.i16() / 100;
    e.fx = r.i8() / 127;
    e.fz = r.i8() / 127;
    if (kind === 'champion') e.speed = r.u8() / 10;
  }

  private decVital(r: Reader, e: Record<string, unknown>, kind: Kind): void {
    switch (kind) {
      case 'champion':
        e.hp = r.u16();
        e.shield = r.u16();
        e.energy = r.u8();
        break;
      case 'mini':
        e.hp = r.u16();
        e.attacking = r.u8() === 1;
        break;
      case 'projectile':
        e.travelFrac = r.u8() / 200;
        break;
      case 'tower': {
        e.hp = r.u16();
        e.ramp = r.u8() / 50;
        const aggro = r.u16();
        e.aggro = aggro === NONE16 ? null : aggro;
        const f = r.u8();
        e.invulnerable = (f & 1) !== 0;
        e.dead = (f & 2) !== 0;
        break;
      }
      case 'core':
        e.hp = r.u16();
        e.invulnerable = r.u8() === 1;
        break;
      case 'keg':
        e.fuseLeft = r.u8() / 10;
        e.tossPhase = r.u8() / 200;
        break;
      case 'wall':
      case 'flower':
      case 'zone':
        e.tLeft = r.u16() / 10;
        break;
      case 'dummy': {
        e.hp = r.u16();
        e.dps = r.u16();
        const f = r.u8();
        e.windowActive = (f & 1) !== 0;
        e.ccKind = CC_KINDS[(f >> 1) & 3];
        e.hitPulse = r.u8() / 100;
        break;
      }
      case 'orb':
        e.hp = r.u16();
        break;
    }
  }

  private decProgress(r: Reader, e: Record<string, unknown>): void {
    e.level = r.u8();
    e.gold = r.u16();
    e.kills = r.u8();
    e.deaths = r.u8();
    e.assists = r.u8();
    e.hpMax = r.u16();
    e.respawnIn = r.u8() / 10;
    e.stats = {
      ad: r.u16(),
      attackSpeed: r.u16() / 100,
      moveSpeed: r.u16() / 100,
      armor: r.u16(),
      ward: r.u16(),
    };
  }

  private decCd(r: Reader, e: Record<string, unknown>): void {
    e.cooldowns = { q: r.u16() / 10, w: r.u16() / 10, r: r.u16() / 10 };
    const relicCd = r.u16();
    // The relic id/cdMax live in the rare block; stitch cd onto it.
    if (relicCd !== NONE16) {
      const prevRelic = (e.relic ?? null) as { id: string; cdMax: number } | null;
      e.relic = prevRelic ? { ...prevRelic, cd: relicCd / 10 } : null;
      (e as { __relicCd?: number }).__relicCd = relicCd / 10;
    }
  }

  private decState(r: Reader, e: Record<string, unknown>): void {
    const flags = r.u8();
    e.dead = (flags & F_DEAD) !== 0;
    e.inBrush = (flags & F_BRUSH) !== 0;
    e.dancing = (flags & F_DANCING) !== 0;
    if (flags & F_CASTING) {
      e.casting = {
        kind: CAST_KINDS[r.u8()],
        progress: r.u8() / 200,
        aimX: r.i16() / 100,
        aimZ: r.i16() / 100,
      } satisfies CastSnap;
    } else {
      e.casting = undefined;
    }
    if (flags & F_RECAST) {
      e.recast = { slot: SLOTS[r.u8()], tLeft: r.u8() / 10 };
    } else {
      e.recast = undefined;
    }
    e.airborne = flags & F_AIRBORNE ? r.u8() / 200 : undefined;
  }

  private decBuffs(r: Reader, e: Record<string, unknown>): void {
    const n = r.u8();
    const buffs = [];
    for (let i = 0; i < n; i++) {
      buffs.push({ id: this.table[r.u8()] ?? '?', stacks: r.u8(), tLeft: r.u16() / 10 });
    }
    e.buffs = buffs;
  }

  private decPassive(r: Reader, e: Record<string, unknown>): void {
    const n = r.u8();
    const passive: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      passive[this.table[r.u8()] ?? '?'] = r.i32() / 100;
    }
    e.passive = passive;
  }

  private decRare(r: Reader, e: Record<string, unknown>, kind: Kind): void {
    const data = JSON.parse(r.str()) as Record<string, unknown>;
    if (kind === 'mini') data.miniKind = MINI_KINDS[data.miniKind as number];
    if (kind === 'tower') data.tier = TIERS[data.tier as number];
    if (kind === 'champion') {
      const relic = data.relic as { id: string; cdMax: number } | null;
      const cd = (e as { __relicCd?: number }).__relicCd ?? 0;
      data.relic = relic ? { id: relic.id, cd, cdMax: relic.cdMax } : null;
      if (data.recap === null) data.recap = undefined;
    }
    Object.assign(e, data);
  }

  private decodeEvents(r: Reader): SimEvent[] {
    const n = r.u16();
    const out: SimEvent[] = [];
    for (let i = 0; i < n; i++) {
      const t = r.u8();
      if (t === 0) {
        out.push({
          t: 'damage',
          target: r.u16(),
          amount: r.u16(),
          dtype: r.u8() === 0 ? 'physical' : 'arcane',
          x: r.i16() / 100,
          z: r.i16() / 100,
        });
      } else if (t === 1) {
        const key = this.table[r.u8()] ?? '?';
        const x = r.i16() / 100;
        const z = r.i16() / 100;
        const flags = r.u8();
        const ev: SimEvent = { t: 'fx', key, x, z };
        if (flags & 1) {
          (ev as { fx?: number }).fx = r.i8() / 127;
          (ev as { fz?: number }).fz = r.i8() / 127;
        }
        if (flags & 2) {
          (ev as { ax?: number }).ax = r.i16() / 100;
          (ev as { az?: number }).az = r.i16() / 100;
        }
        if (flags & 4) (ev as { source?: number }).source = r.u16();
        if (flags & 8) (ev as { target?: number }).target = r.u16();
        out.push(ev);
      } else {
        out.push(JSON.parse(r.str()) as SimEvent);
      }
    }
    return out;
  }
}
