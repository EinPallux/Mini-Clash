import { CHAMPION_LIST } from '@mini-clash/data';
import { describe, expect, it } from 'vitest';
import { abilityText, passiveText } from '../src/ui/hub/kitText';

/**
 * Kit descriptions (UI_UX §13: *kit panel with numbers*).
 *
 * The champion viewer is the shop window; a `{dmg}` left showing in it is the
 * plainest possible sign that a description and its ability have drifted apart.
 * This walks the whole roster so a new champion cannot ship with one.
 */

const SLOTS = ['q', 'w', 'r'] as const;

describe('every champion’s kit reads as finished prose', () => {
  for (const def of CHAMPION_LIST) {
    it(`${def.name} has no unresolved placeholders`, () => {
      const texts = [
        passiveText(def, 'passive'),
        passiveText(def, 'entrance'),
        ...SLOTS.map((slot) => abilityText(def.abilities[slot], 1)),
      ];
      for (const text of texts) {
        expect(text, text).not.toMatch(/\{[a-zA-Z0-9_]+\}/);
      }
    });
  }
});

describe('the numbers are the ability’s own', () => {
  it('scales damage with champion level', () => {
    const rook = CHAMPION_LIST.find((c) => c.id === 'rook');
    if (!rook) throw new Error('rook missing');
    const one = abilityText(rook.abilities.q, 1);
    const ten = abilityText(rook.abilities.q, 10);
    expect(one).not.toBe(ten);
    // Rook's Q is 70 base + 6 per level: 70 at 1, 124 at 10.
    expect(one).toContain('70');
    expect(ten).toContain('124');
  });

  it('reads a recast’s damage as the second number', () => {
    const rook = CHAMPION_LIST.find((c) => c.id === 'rook');
    if (!rook) throw new Error('rook missing');
    const text = abilityText(rook.abilities.q, 1);
    expect(text).toMatch(/backswing for \d+ physical damage/);
  });

  it('turns a ratio in a passive’s params into a percentage', () => {
    const withRatio = CHAMPION_LIST.map((d) => passiveText(d, 'passive')).join(' ');
    expect(withRatio).toMatch(/\d+%/);
  });
});
