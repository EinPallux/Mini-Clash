import { describe, expect, it } from 'vitest';
import {
  AUGMENT_LIST,
  AUGMENTS,
  CHAMPION_LIST,
  DRAFT,
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
});
