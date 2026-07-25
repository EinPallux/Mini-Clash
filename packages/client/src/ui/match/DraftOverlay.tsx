import {
  AUGMENTS,
  type AugmentCategory,
  type AugmentRarity,
  CHAMPIONS,
  DRAFT,
} from '@mini-clash/data';
import { useEffect, useRef, useState } from 'react';
import { playCue, uiSound } from '../../game/audio';
import { useHud } from '../../game/hudStore';
import type { MatchRuntime } from '../../game/match';

/**
 * The Power Surge draft (UI_UX §9, AUGMENTS.md §1).
 *
 * Docks bottom-centre and **never pauses the match** — you can keep moving,
 * casting and dying with it open, so a draft that lands mid-teamfight is a real
 * decision under fire. Keys 1/2/3 pick, R rerolls. Nothing here calls
 * preventDefault on a movement or ability key: the overlay must never eat a
 * game input (a ROADMAP acceptance line).
 */

const RARITY_LABEL: Record<AugmentRarity, string> = {
  silver: 'SILVER',
  gold: 'GOLD',
  prismatic: 'PRISMATIC',
};

/** How long the "taken" slab lingers after a pick before the dock clears. */
const SLAB_MS = 2600;

/**
 * Category glyphs for the compact strip and the scoreboard. The category is
 * what a teammate actually needs at a glance ("they went defensive"); the exact
 * card is one hover away.
 */
export const CATEGORY_GLYPH: Record<AugmentCategory, string> = {
  offense: '⚔',
  defense: '🛡',
  mobility: '➤',
  tagteam: '⇄',
  siege: '⌂',
  signature: '★',
};

export function DraftOverlay({
  runtime,
}: {
  runtime: () => MatchRuntime | null;
}): React.ReactElement | null {
  const champ = useHud((s) => s.champion);
  const taken = useHud((s) => s.draftTaken);
  const draft = champ?.draft;
  const [picked, setPicked] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const openedFor = useRef<string>('');
  const pickedRef = useRef<number | null>(null);
  pickedRef.current = picked;

  const offers = draft?.offers;
  const offerKey = offers ? offers.join('|') : '';

  // Arrival flourish: the set announces itself, and a prismatic in the hand
  // gets its own chase-card sting (§1 — "should feel like opening a chase card").
  useEffect(() => {
    if (!offerKey || openedFor.current === offerKey) return;
    openedFor.current = offerKey;
    setPicked(null);
    const rare = (offers ?? []).some((id) => AUGMENTS[id]?.rarity === 'prismatic');
    playCue(rare ? 'draft_prismatic' : 'draft_open', { bus: 'ui', volume: 0.9 });
  }, [offerKey, offers]);

  // 1/2/3 to pick, R to reroll. Keydown only, no preventDefault — movement and
  // ability keys keep working exactly as they do with the overlay closed.
  useEffect(() => {
    if (!draft) return;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const rt = runtime();
      if (!rt) return;
      const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(ev.code);
      if (idx >= 0 && idx < draft.offers.length) {
        if (pickedRef.current !== null) return;
        setPicked(idx);
        uiSound('ui_click');
        rt.draftPick(idx as 0 | 1 | 2);
      } else if (ev.code === 'KeyR' && !draft.rerolled) {
        uiSound('ui_click');
        rt.draftReroll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, runtime]);

  // The slab is the only wall-clock thing in this component: tick while it is up.
  const slabUp = !draft && taken !== null && now - taken.at < SLAB_MS;
  useEffect(() => {
    if (draft || !taken) return;
    const h = window.setInterval(() => setNow(Date.now()), 120);
    return () => window.clearInterval(h);
  }, [draft, taken]);

  if (!draft) {
    if (!slabUp || !taken) return null;
    const a = AUGMENTS[taken.augmentId];
    if (!a) return null;
    return (
      <div className={`draft-slab ${a.rarity}`} role="status">
        <span className="draft-slab-kicker">{taken.auto ? 'COACH CHOSE' : 'ACQUIRED'}</span>
        <span className="draft-slab-name">{a.name}</span>
        <span className="draft-slab-desc">{a.description}</span>
      </div>
    );
  }
  if (!champ) return null;

  const frac = Math.max(0, Math.min(1, draft.tLeft / DRAFT.seconds));
  const urgent = draft.tLeft <= 10;

  return (
    <div className="draft-dock" role="dialog" aria-label="Augment draft">
      <div className="draft-head">
        <span className="draft-title">POWER SURGE</span>
        <span className="draft-sub">
          Draft {draft.index + 1} of {DRAFT.levels.length}
        </span>
        {/* 45 s ring (UI_UX §9) — a conic sweep, not a bar: it reads as a clock
            at a glance without pulling the eye off the cards. */}
        <span
          className={`draft-ring ${urgent ? 'urgent' : ''}`}
          style={{ ['--frac' as string]: String(frac) }}
          role="timer"
          aria-label={`${Math.ceil(draft.tLeft)} seconds left`}
        >
          <b>{Math.ceil(draft.tLeft)}</b>
        </span>
      </div>

      <div className="draft-cards">
        {draft.offers.map((id, i) => {
          const a = AUGMENTS[id];
          if (!a) return null;
          const owner = a.championId ? CHAMPIONS[a.championId]?.name : null;
          return (
            <button
              type="button"
              key={id}
              className={`draft-card ${a.rarity} ${picked === i ? 'taken' : ''} ${
                picked !== null && picked !== i ? 'dimmed' : ''
              }`}
              disabled={picked !== null}
              onClick={() => {
                if (picked !== null) return;
                setPicked(i);
                uiSound('ui_click');
                runtime()?.draftPick(i as 0 | 1 | 2);
              }}
              onMouseEnter={() => uiSound('ui_hover')}
            >
              <span className="draft-key">{i + 1}</span>
              <span className="draft-rarity">
                <i>{CATEGORY_GLYPH[a.category]}</i> {RARITY_LABEL[a.rarity]}
              </span>
              {owner && <span className="draft-owner">{owner}</span>}
              <span className="draft-name">{a.name}</span>
              <span className="draft-desc">{a.description}</span>
              <span className="draft-visual">{a.visual}</span>
            </button>
          );
        })}
      </div>

      <div className="draft-foot">
        <button
          type="button"
          className="btn draft-reroll"
          disabled={draft.rerolled || champ.rerolls <= 0 || picked !== null}
          onClick={() => {
            uiSound('ui_click');
            runtime()?.draftReroll();
          }}
        >
          ⟳ Reroll {draft.rerolled ? '(spent)' : `(${champ.rerolls})`}
          <span className="cap">R</span>
        </button>
        <span className="draft-hint">The match is still running — you can move and fight.</span>
      </div>
    </div>
  );
}

/** Your taken augments, shown beside the ability cluster. */
export function AugmentStrip(): React.ReactElement | null {
  const champ = useHud((s) => s.champion);
  if (!champ || champ.augments.length === 0) return null;
  return (
    <div className="augment-strip">
      {champ.augments.map((id) => {
        const a = AUGMENTS[id];
        if (!a) return null;
        return (
          <span
            key={id}
            className={`aug-pip ${a.rarity}`}
            title={`${a.name} — ${a.description}`}
            role="img"
            aria-label={a.name}
          >
            {CATEGORY_GLYPH[a.category]}
          </span>
        );
      })}
    </div>
  );
}
