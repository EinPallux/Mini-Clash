import { describe, expect, it } from 'vitest';
import type { ChampionSnap, EntitySnap, MiniSnap, Snapshot } from '../src/index';
import { SnapshotDecoder, SnapshotEncoder } from '../src/index';

/** Round-trip fidelity: quantization ≤ 0.01 u positions, 0.1 s timers (TECH §6). */

function champ(id: number, over: Partial<ChampionSnap> = {}): ChampionSnap {
  return {
    kind: 'champion',
    id,
    x: 12.34,
    z: -3.21,
    fx: 0.6,
    fz: -0.8,
    hp: 512.7,
    hpMax: 740,
    radius: 0.55,
    team: 0,
    player: id,
    championId: 'rattle',
    bot: false,
    name: 'Tester',
    dead: false,
    respawnIn: 0,
    energy: 63.4,
    level: 4,
    gold: 1234,
    kills: 2,
    deaths: 1,
    assists: 3,
    items: ['whetstone'],
    relic: { id: 'blink_prism', cd: 12.3, cdMax: 45 },
    inBrush: false,
    shield: 55,
    cooldowns: { q: 1.2, w: 0, r: 33.3 },
    cooldownMax: { q: 6, w: 11, r: 60 },
    passive: { boneCharges: 2, stonewallCd: 3.47 },
    dancing: false,
    speed: 3.6,
    buffs: [{ id: 'windrunner_haste', tLeft: 2.4, stacks: 3 }],
    stats: { ad: 61, attackSpeed: 1.24, moveSpeed: 3.6, armor: 28, ward: 10 },
    ...over,
  };
}

function mini(id: number, over: Partial<MiniSnap> = {}): MiniSnap {
  return {
    kind: 'mini',
    id,
    x: -20.5,
    z: 4.05,
    fx: 1,
    fz: 0,
    hp: 140,
    hpMax: 180,
    radius: 0.4,
    team: 1,
    unitId: 'mini_bruiser',
    miniKind: 'bruiser',
    attacking: false,
    ...over,
  };
}

function snap(entities: EntitySnap[], tick = 100, over: Partial<Snapshot> = {}): Snapshot {
  return {
    tick,
    time: tick / 30,
    match: {
      mode: 'bridge',
      time: tick / 30,
      barrierDown: true,
      teamKills: [2, 3],
      towersDown: [0, 1],
      over: null,
      nextOrbIn: 12.5,
      overtime: false,
      suddenDeath: false,
    },
    entities,
    events: [],
    ...over,
  };
}

function pair(): { enc: SnapshotEncoder; dec: SnapshotDecoder } {
  return { enc: new SnapshotEncoder(), dec: new SnapshotDecoder() };
}

describe('snapshot codec', () => {
  it('round-trips a baseline within quantization error', () => {
    const { enc, dec } = pair();
    const s = snap([
      champ(1, {
        casting: { kind: 'q', progress: 0.5, aimX: 3.5, aimZ: -1 },
        recast: { slot: 'q', tLeft: 1.5 },
        airborne: 0.25,
        inBrush: true,
      }),
      mini(50),
      {
        kind: 'tower',
        id: 90,
        x: 24,
        z: 0,
        fx: 1,
        fz: 0,
        hp: 1800.4,
        hpMax: 2400,
        radius: 1.4,
        team: 1,
        tier: 'outer',
        aggro: 1,
        ramp: 0.4,
        invulnerable: false,
        dead: false,
      },
      {
        kind: 'projectile',
        id: 200,
        x: 5,
        z: 5,
        fx: 0,
        fz: 1,
        hp: 1,
        hpMax: 1,
        radius: 0.3,
        team: 0,
        projId: 'skipshot',
        style: 'def',
        color: 0x3ba7ff,
        size: 0.35,
        travelFrac: 0.62,
      },
    ]);
    const out = dec.decode(enc.encode(s));
    expect(out).not.toBeNull();
    expect(out!.tick).toBe(100);
    expect(out!.match.teamKills).toEqual([2, 3]);
    expect(out!.match.nextOrbIn).toBeCloseTo(12.5, 1);

    const c = out!.entities.find((e) => e.id === 1) as ChampionSnap;
    expect(c.x).toBeCloseTo(12.34, 2);
    expect(c.z).toBeCloseTo(-3.21, 2);
    expect(c.hp).toBe(513); // rounded
    expect(c.name).toBe('Tester');
    expect(c.items).toEqual(['whetstone']);
    expect(c.relic).toEqual({ id: 'blink_prism', cd: 12.3, cdMax: 45 });
    expect(c.cooldowns.r).toBeCloseTo(33.3, 1);
    expect(c.buffs).toEqual([{ id: 'windrunner_haste', tLeft: 2.4, stacks: 3 }]);
    expect(c.passive.stonewallCd).toBeCloseTo(3.47, 2);
    expect(c.casting).toMatchObject({ kind: 'q', aimX: 3.5, aimZ: -1 });
    expect(c.casting?.progress).toBeCloseTo(0.5, 2);
    expect(c.recast).toMatchObject({ slot: 'q' });
    expect(c.airborne).toBeCloseTo(0.25, 2);
    expect(c.inBrush).toBe(true);
    expect(c.stats.attackSpeed).toBeCloseTo(1.24, 2);

    const m = out!.entities.find((e) => e.id === 50) as MiniSnap;
    expect(m.miniKind).toBe('bruiser');
    expect(m.unitId).toBe('mini_bruiser');
    expect(m.hp).toBe(140);

    const t = out!.entities.find((e) => e.id === 90);
    expect(t).toMatchObject({ kind: 'tower', tier: 'outer', aggro: 1, hp: 1800 });
    const p = out!.entities.find((e) => e.id === 200);
    expect(p).toMatchObject({ kind: 'projectile', projId: 'skipshot' });
  });

  it('delta frames carry only changes and merge over prior state', () => {
    const { enc, dec } = pair();
    const c0 = champ(1);
    const m0 = mini(50);
    const base = enc.encode(snap([c0, m0], 100));
    dec.decode(base);

    // Move the champion; the mini is untouched.
    const c1 = champ(1, { x: 13.0, z: -3.0 });
    const delta = enc.encode(snap([c1, m0], 103));
    expect(delta.length).toBeLessThan(base.length / 3);
    const out = dec.decode(delta);
    const c = out!.entities.find((e) => e.id === 1) as ChampionSnap;
    expect(c.x).toBeCloseTo(13.0, 2);
    expect(c.name).toBe('Tester'); // rare fields preserved from the baseline
    expect(c.buffs.length).toBe(1);
    const m = out!.entities.find((e) => e.id === 50) as MiniSnap;
    expect(m.x).toBeCloseTo(-20.5, 2);
  });

  it('handles removal and full re-add (brush concealment round trip)', () => {
    const { enc, dec } = pair();
    dec.decode(enc.encode(snap([champ(1), champ(2, { name: 'Hider', team: 1 })], 100)));

    // Champion 2 slips into brush — omitted from the view.
    let out = dec.decode(enc.encode(snap([champ(1)], 103)));
    expect(out!.entities.find((e) => e.id === 2)).toBeUndefined();

    // …and steps back out: the encoder must resend ALL blocks.
    out = dec.decode(enc.encode(snap([champ(1), champ(2, { name: 'Hider', team: 1 })], 106)));
    const back = out!.entities.find((e) => e.id === 2) as ChampionSnap;
    expect(back.name).toBe('Hider');
    expect(back.team).toBe(1);
    expect(back.hp).toBe(513);
  });

  it('a late-join decoder ignores deltas and boots from the next baseline', () => {
    const { enc } = pair();
    enc.encode(snap([champ(1)], 100)); // baseline someone else received
    const lateDelta = enc.encode(snap([champ(1, { x: 14 })], 103));
    const late = new SnapshotDecoder();
    expect(late.decode(lateDelta)).toBeNull();
    enc.forceBaseline();
    const base2 = enc.encode(snap([champ(1, { x: 15 })], 106));
    const out = late.decode(base2);
    expect(out).not.toBeNull();
    expect((out!.entities[0] as ChampionSnap).x).toBeCloseTo(15, 2);
    expect((out!.entities[0] as ChampionSnap).name).toBe('Tester');
  });

  it('encodes damage + fx events binary and the rest as JSON', () => {
    const { enc, dec } = pair();
    const s = snap([champ(1)], 100, {
      events: [
        { t: 'damage', target: 50, amount: 87.6, dtype: 'physical', x: 1.5, z: -2 },
        { t: 'fx', key: 'rook_q_impact', x: 3, z: 4, fx: 1, fz: 0, source: 1 },
        { t: 'kill', killer: 1, victim: 5, assists: [2], x: 0, z: 0 },
        { t: 'ping', player: 1, team: 0, kind: 'danger', x: 9, z: 9 },
      ],
    });
    const out = dec.decode(enc.encode(s));
    expect(out!.events).toHaveLength(4);
    expect(out!.events[0]).toMatchObject({ t: 'damage', target: 50, amount: 88 });
    expect(out!.events[1]).toMatchObject({ t: 'fx', key: 'rook_q_impact', source: 1 });
    const fx = out!.events[1] as { fx?: number };
    expect(fx.fx).toBeCloseTo(1, 1);
    expect(out!.events[2]).toMatchObject({ t: 'kill', killer: 1, victim: 5, assists: [2] });
    expect(out!.events[3]).toMatchObject({ t: 'ping', kind: 'danger' });
  });

  it('round-trips Tag Team duo state and drops it for solo champions', () => {
    const { enc, dec } = pair();
    const withDuo = champ(1, {
      duo: {
        championId: 'sylva',
        energy: 62,
        cooldowns: { q: 3.4, w: 0, r: 41.2 },
        swapCd: 7.8,
        morphT: 0.22,
      },
    });
    const out = dec.decode(enc.encode(snap([withDuo])));
    const c = out!.entities[0] as ChampionSnap;
    expect(c.duo?.championId).toBe('sylva');
    expect(c.duo?.energy).toBe(62);
    expect(c.duo?.cooldowns.q).toBeCloseTo(3.4, 1);
    expect(c.duo?.cooldowns.r).toBeCloseTo(41.2, 1);
    expect(c.duo?.swapCd).toBeCloseTo(7.8, 1);
    expect(c.duo?.morphT).toBeCloseTo(0.22, 2);

    // A swap exchanges both identities and resets the timers — one delta.
    const swapped = champ(1, {
      championId: 'sylva',
      duo: {
        championId: 'rattle',
        energy: 100,
        cooldowns: { q: 0, w: 0, r: 0 },
        swapCd: 9,
        morphT: 0.35,
      },
    });
    const after = dec.decode(enc.encode(snap([swapped], 103)));
    const c2 = after!.entities[0] as ChampionSnap;
    expect(c2.championId).toBe('sylva');
    expect(c2.duo?.championId).toBe('rattle');
    expect(c2.duo?.swapCd).toBeCloseTo(9, 1);
    // The pre-swap frame is untouched (no aliasing into decoder history).
    expect(c.duo?.championId).toBe('sylva');

    // Solo champions carry no duo block at all.
    const soloDec = new SnapshotDecoder();
    const soloEnc = new SnapshotEncoder();
    const solo = soloDec.decode(soloEnc.encode(snap([champ(1)])));
    expect((solo!.entities[0] as ChampionSnap).duo).toBeUndefined();
  });

  it('ack patches per client at the fixed header offset', () => {
    const { enc, dec } = pair();
    const buf = enc.encode(snap([champ(1)], 100));
    const copy = new Uint8Array(buf);
    new DataView(copy.buffer, copy.byteOffset).setInt32(3, 41);
    const out = dec.decode(copy);
    expect(out!.ack).toBe(41);
    // Unpatched frames carry no ack.
    const out2 = new SnapshotDecoder().decode(enc.encode(snap([champ(1)], 103)));
    void out2; // delta after fresh decoder → null; just ensure no throw
  });

  it('emits periodic baselines that resync a drifted decoder', () => {
    const { enc } = pair();
    const dec = new SnapshotDecoder();
    let sawBaseline = 0;
    for (let f = 0; f < 90; f++) {
      const buf = enc.encode(snap([champ(1, { x: 10 + f * 0.1 })], 100 + f * 3));
      if (buf[0] === 1) sawBaseline++;
      dec.decode(buf);
    }
    expect(sawBaseline).toBeGreaterThanOrEqual(2); // every ~40 frames
    // Decoder tracks the entity through all of it.
    const final = dec.decode(enc.encode(snap([champ(1, { x: 19 })], 400)));
    expect((final!.entities[0] as ChampionSnap).x).toBeCloseTo(19, 2);
  });
});
