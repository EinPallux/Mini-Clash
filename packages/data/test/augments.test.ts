import { describe, expect, it } from 'vitest';
import {
  AUGMENT_LIST,
  AUGMENTS,
  CHAMPION_LIST,
  DRAFT,
  FX,
  GENERIC_AUGMENTS,
  SIGNATURE_AUGMENTS,
  signaturesFor,
} from '../src';

/** Catalog integrity + the authoring rules in docs/AUGMENTS.md §1 and §4. */

describe('augment catalog', () => {
  it('ships the full catalog: 48 generic + 3 signatures per champion', () => {
    expect(GENERIC_AUGMENTS).toHaveLength(48);
    expect(SIGNATURE_AUGMENTS).toHaveLength(CHAMPION_LIST.length * 3);
    expect(AUGMENT_LIST).toHaveLength(48 + CHAMPION_LIST.length * 3);
  });

  it('every champion has exactly one signature per rarity (§4.5)', () => {
    for (const c of CHAMPION_LIST) {
      const sigs = signaturesFor(c.id);
      expect(sigs, c.id).toHaveLength(3);
      expect(sigs.map((s) => s.rarity).sort()).toEqual(['gold', 'prismatic', 'silver']);
    }
  });

  it('ids are unique and stable', () => {
    const ids = AUGMENT_LIST.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  it('passes the visibility mandate: every augment states an on-screen tell (§1)', () => {
    const silent = AUGMENT_LIST.filter((a) => !a.visual || a.visual.trim().length < 12);
    expect(silent.map((a) => a.id)).toEqual([]);
  });

  it('reads like a collectible card, not a patch note (§4.1–4.2)', () => {
    for (const a of AUGMENT_LIST) {
      // A name, not a number.
      expect(a.name.length, a.id).toBeGreaterThan(2);
      expect(a.name, a.id).not.toMatch(/^[+-]?\d/);
      // One sentence of effect. Terse is fine ("+18 Armor.") — rambling is not.
      expect(a.description.length, a.id).toBeGreaterThan(8);
      expect(a.description.trim().endsWith('.'), a.id).toBe(true);
      const sentences = a.description.split(/[.!?]+\s/).filter(Boolean).length;
      expect(sentences, a.id).toBeLessThanOrEqual(2);
    }
  });

  it('every augment actually does something', () => {
    for (const a of AUGMENT_LIST) expect(a.effects.length, a.id).toBeGreaterThan(0);
  });

  it('every augment carries at least one bot-affinity tag (§2)', () => {
    for (const a of AUGMENT_LIST) expect(a.tags.length, a.id).toBeGreaterThan(0);
  });

  it('signatures name a real champion; generics name none', () => {
    const roster = new Set(CHAMPION_LIST.map((c) => c.id));
    for (const a of SIGNATURE_AUGMENTS) {
      expect(a.championId, a.id).toBeDefined();
      expect(roster.has(a.championId as string), a.id).toBe(true);
      expect(a.category).toBe('signature');
    }
    for (const a of GENERIC_AUGMENTS) expect(a.championId, a.id).toBeUndefined();
  });

  it('the generic pool spans every rarity and category the draft can offer', () => {
    const rarities = new Set(GENERIC_AUGMENTS.map((a) => a.rarity));
    expect([...rarities].sort()).toEqual(['gold', 'prismatic', 'silver']);
    const cats = new Set(GENERIC_AUGMENTS.map((a) => a.category));
    for (const c of ['offense', 'defense', 'mobility', 'tagteam', 'siege']) {
      expect(cats.has(c as never), c).toBe(true);
    }
  });

  it('rarity odds are well-formed probabilities, one row per draft (§1)', () => {
    expect(DRAFT.odds).toHaveLength(DRAFT.levels.length);
    for (const row of DRAFT.odds) {
      const sum = row.silver + row.gold + row.prismatic;
      expect(sum).toBeCloseTo(1, 5);
      // Prismatics get rarer the further back you look.
      expect(row.prismatic).toBeGreaterThan(0);
    }
    // Later drafts skew richer — that is the whole point of the ramp.
    expect(DRAFT.odds[2].prismatic).toBeGreaterThan(DRAFT.odds[0].prismatic);
  });

  it('lookups resolve', () => {
    for (const a of AUGMENT_LIST) expect(AUGMENTS[a.id]).toBe(a);
  });

  it('every behavioural augment has its own on-field tell (the visibility mandate)', () => {
    // The written `visual` line is checked above; this locks the *timeline*
    // behind it. Anything the sim emits for an augment has to exist here, or
    // the card fires invisibly and fails review by definition.
    const required = [
      // Generic behaviours.
      'augment.silver',
      'augment.gold',
      'augment.prismatic',
      'augment.chain',
      'augment.mirror',
      'augment.echo',
      'augment.element.flame',
      'augment.element.frost',
      'augment.element.storm',
      'augment.deathblossom',
      'augment.thorns',
      'augment.secondwind',
      'augment.star.bank',
      'augment.star.break',
      'augment.undying',
      'augment.slipstream',
      'augment.ghost',
      'augment.ghost.swing',
      // Signature behaviours.
      'augment.counterweight',
      'augment.castle',
      'augment.chainshot',
      'augment.debt',
      'augment.execute',
      'augment.nettle',
      'augment.poltergeist',
      'augment.share',
      'augment.silence',
      'augment.society',
      'augment.waltz',
      'augment.wall.block',
    ];
    const missing = required.filter((k) => !FX[k]);
    expect(missing).toEqual([]);
    // Each tell has to actually put something on screen, not just exist.
    for (const k of required) {
      expect(FX[k].events.length, k).toBeGreaterThan(0);
      const visible = FX[k].events.some((e) => e.op.t !== 'sound');
      expect(visible, `${k} is sound-only — the mandate is visual`).toBe(true);
    }
  });
});
