import {
  CHAMPION_LIST,
  CHAMPIONS,
  type ChampionDef,
  MASTERY_CURVE,
  palettesFor,
  type Slot,
} from '@mini-clash/data';
import { useEffect, useMemo, useRef, useState } from 'react';
import { uiSound } from '../../game/audio';
import { ChampionViewer, type ViewerAction } from '../../game/viewer';
import { type ChampionEntry, useAccount } from '../../state/account';
import { useSession } from '../../state/session';
import { abilityText, passiveText } from './kitText';

/**
 * Champions (UI_UX §13) — *the kit is the pitch*.
 *
 * The detail view leads with the model and the ability buttons rather than with
 * a price, because what sells a champion is watching their ultimate go off. The
 * previews run the same FxTimelines the match runs (see `game/viewer.ts`), so
 * what you buy is what you get.
 */

/**
 * Derived from the roster, never listed by hand — a hard-coded list silently
 * drops a role the moment a champion introduces one, and the filter for it
 * simply never appears.
 */
const ROLES: string[] = ['all', ...[...new Set(CHAMPION_LIST.map((c) => c.role))].sort()];
type RoleFilter = string;

const SLOTS: { slot: Slot; key: string }[] = [
  { slot: 'q', key: 'Q' },
  { slot: 'w', key: 'W' },
  { slot: 'r', key: 'R' },
];

export function ChampionsScreen(): React.ReactElement {
  const champions = useAccount((s) => s.champions);
  const [role, setRole] = useState<RoleFilter>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const list = useMemo(() => {
    const byId = new Map(champions.map((c) => [c.id, c]));
    return CHAMPION_LIST.map((def) => ({
      def,
      entry: byId.get(def.id) ?? fallbackEntry(def),
    })).filter((c) => role === 'all' || c.def.role === role);
  }, [champions, role]);

  if (selected) {
    return <ChampionDetail championId={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="champions-screen">
      <div className="screen-head">
        <h1 className="menu-heading">Champions</h1>
        <div className="filter-row" role="tablist" aria-label="Filter by role">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === role}
              className={`filter-chip${r === role ? ' on' : ''}`}
              onClick={() => {
                uiSound('ui_hover');
                setRole(r);
              }}
            >
              {r === 'all' ? 'All' : r}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="empty-note">No champions match that filter.</p>
      ) : (
        <div className="champion-grid">
          {list.map(({ def, entry }) => (
            <button
              key={def.id}
              type="button"
              className={`champion-card${entry.owned ? ' owned' : ''}${entry.free ? ' rotating' : ''}`}
              onClick={() => {
                uiSound('ui_click');
                setSelected(def.id);
              }}
            >
              <span className="cc-portrait" style={{ background: portrait(def) }}>
                {def.name.slice(0, 1)}
              </span>
              <span className="cc-name">{def.name}</span>
              <span className="cc-title">{def.title}</span>
              <span className="cc-role">{def.role}</span>
              {entry.owned ? (
                <span className="cc-tag owned">Owned</span>
              ) : entry.free ? (
                <span className="cc-tag rotate" title="Free this week">
                  ⟳ Free
                </span>
              ) : (
                <span className="cc-tag price">
                  <span className="coin">⬢</span> {entry.price.toLocaleString()}
                </span>
              )}
              {entry.mastery ? <span className="cc-mastery">M{entry.mastery.level}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function fallbackEntry(def: ChampionDef): ChampionEntry {
  // The catalog is compiled in, so a failed ownership fetch still renders a
  // full grid — just with nothing marked owned.
  return {
    id: def.id,
    name: def.name,
    title: def.title,
    role: def.role,
    difficulty: def.difficulty,
    price: 0,
    owned: false,
    free: false,
    playable: false,
    mastery: null,
  };
}

const portrait = (def: ChampionDef): string =>
  `linear-gradient(160deg, #${def.visual.portraitColor.toString(16).padStart(6, '0')}, #12161f)`;

/* ------------------------------- Detail ---------------------------------- */

function ChampionDetail({
  championId,
  onBack,
}: {
  championId: string;
  onBack: () => void;
}): React.ReactElement {
  const def = CHAMPIONS[championId];
  const entry = useAccount((s) => s.champions.find((c) => c.id === championId));
  const unlocks = useAccount((s) => s.unlocks);
  const mastery = useAccount((s) => s.mastery.find((m) => m.championId === championId));
  const coins = useAccount((s) => s.profile?.coins ?? 0);
  const purchase = useAccount((s) => s.purchase);
  const claimMastery = useAccount((s) => s.claimMastery);
  const setTrainingChampion = useSession((s) => s.setTrainingChampion);
  const setMatchMode = useSession((s) => s.setMatchMode);
  const goto = useSession((s) => s.goto);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<ChampionViewer | null>(null);
  const [action, setAction] = useState<ViewerAction>('idle');
  const [palette, setPalette] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const palettes = palettesFor(championId);
  const ownedPalettes = new Set(unlocks.palette ?? []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewer = new ChampionViewer(canvas);
    viewerRef.current = viewer;
    viewer.applySettings();
    viewer.start();
    let alive = true;
    // `finally`, not `then`: a model that fails to load must still clear the
    // overlay, or the ability buttons stay behind a label that never goes away.
    void viewer.setChampion(championId).finally(() => {
      if (alive) setReady(true);
    });
    const onResize = (): void => viewer.resize();
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      window.removeEventListener('resize', onResize);
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [championId]);

  useEffect(() => {
    const tint = palette ? palettes.find((p) => p.id === palette)?.tint : undefined;
    viewerRef.current?.setPalette(tint);
  }, [palette, palettes]);

  const play = (next: ViewerAction): void => {
    uiSound('ui_click');
    setAction(next);
    viewerRef.current?.setAction(next);
  };

  const buy = async (kind: 'champion' | 'palette', refId: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await purchase(kind, refId);
      uiSound('ui_confirm');
      setNotice(`Unlocked — ${res.paid.toLocaleString()} coins spent.`);
    } catch {
      const code = useAccount.getState().error;
      setNotice(
        code === 'insufficient_coins'
          ? 'Not enough coins yet.'
          : code === 'offline'
            ? 'Could not reach the store — try again in a moment.'
            : 'That purchase did not go through.',
      );
    } finally {
      setBusy(false);
    }
  };

  const owned = entry?.owned ?? false;
  const price = entry?.price ?? 0;
  const level = mastery?.level ?? 1;
  const progress = mastery?.progress ?? null;

  return (
    <div className="champion-detail">
      <button type="button" className="btn ghost back-btn" onClick={onBack}>
        ← All champions
      </button>

      <div className="cd-grid">
        <section className="cd-stage" aria-label={`${def.name} preview`}>
          <canvas ref={canvasRef} className="cd-canvas" />
          {!ready && <div className="cd-loading">Loading model…</div>}
          <div className="cd-actions">
            {(
              [
                ['idle', 'Idle'],
                ['run', 'Run'],
                ['attack', 'Attack'],
                ['q', 'Q'],
                ['w', 'W'],
                ['r', 'R'],
                ['entrance', 'Entrance'],
              ] as [ViewerAction, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`cd-action${action === id ? ' on' : ''}`}
                onClick={() => play(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="cd-turn">
            <button
              type="button"
              aria-label="Rotate left"
              onClick={() => viewerRef.current?.nudge(-1)}
            >
              ↺
            </button>
            <span className="subtle">drag to rotate</span>
            <button
              type="button"
              aria-label="Rotate right"
              onClick={() => viewerRef.current?.nudge(1)}
            >
              ↻
            </button>
          </div>
          {palettes.length > 0 && (
            <div className="cd-palettes">
              <button
                type="button"
                className={`swatch${palette === null ? ' on' : ''}`}
                style={{ background: '#cfd6e4' }}
                aria-label="Default palette"
                onClick={() => setPalette(null)}
              />
              {palettes.map((p) => {
                const has = ownedPalettes.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`swatch${palette === p.id ? ' on' : ''}${has ? '' : ' locked'}`}
                    style={{ background: p.swatch }}
                    title={has ? p.name : `${p.name} — locked`}
                    aria-label={has ? p.name : `${p.name}, locked`}
                    onClick={() => setPalette(p.id)}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section className="cd-info">
          <header>
            <h1>{def.name}</h1>
            <p className="cd-subtitle">
              {def.title} · <span className="cd-role">{def.role}</span> ·{' '}
              {'★'.repeat(def.difficulty)}
              <span className="dim">{'★'.repeat(3 - def.difficulty)}</span>
            </p>
          </header>

          <div className="cd-kit">
            <Kit label="P" name={def.passive.name} text={passiveText(def, 'passive')} />
            {SLOTS.map(({ slot, key }) => {
              const ability = def.abilities[slot];
              return (
                <Kit
                  key={slot}
                  label={key}
                  name={ability.name}
                  // Level 1: what the champion does the moment you pick them.
                  text={abilityText(ability, 1)}
                  meta={`${ability.cooldown}s · ${ability.cost} energy`}
                  onPreview={() => play(slot as ViewerAction)}
                />
              );
            })}
            <Kit label="E" name={def.entrance.name} text={passiveText(def, 'entrance')} />
          </div>

          <div className="cd-mastery">
            <div className="spread mastery-head">
              <strong>Mastery {level}</strong>
              {progress ? (
                <span className="subtle">
                  {progress.into.toLocaleString()} / {progress.needed.toLocaleString()} XP
                </span>
              ) : (
                <span className="subtle">
                  {mastery ? 'Mastered' : `Play a match to start · ${MASTERY_CURVE[1]} XP to 2`}
                </span>
              )}
            </div>
            <div className="mastery-bar">
              <div
                style={{
                  width: progress
                    ? `${(progress.into / progress.needed) * 100}%`
                    : mastery
                      ? '100%'
                      : '0%',
                }}
              />
            </div>
            {mastery?.claimable && (
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await claimMastery(championId);
                    uiSound('ui_confirm');
                    setNotice(`Mastery ${res.level} reward: ${res.coins} coins.`);
                  } catch {
                    setNotice('Could not claim that just now.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Claim mastery {mastery.claimable.level} · ⬢ {mastery.claimable.coins}
              </button>
            )}
          </div>

          <div className="cd-buy">
            {owned ? (
              <span className="cd-owned">Owned</span>
            ) : entry?.free ? (
              <span className="cd-owned rotate">⟳ Free this week</span>
            ) : (
              <button
                type="button"
                className="btn primary"
                disabled={busy || coins < price}
                onClick={() => void buy('champion', championId)}
              >
                Unlock · <span className="coin">⬢</span> {price.toLocaleString()}
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => {
                uiSound('ui_click');
                setTrainingChampion(championId);
                setMatchMode('training');
                goto('match');
              }}
            >
              Try in Training
            </button>
          </div>

          {palettes.length > 0 && (
            <div className="cd-palette-buy">
              {palettes.map((p) => {
                const has = ownedPalettes.has(p.id);
                return (
                  <div key={p.id} className="palette-row">
                    <span className="swatch small" style={{ background: p.swatch }} />
                    <span className="palette-name">{p.name}</span>
                    {has ? (
                      <span className="subtle">Owned</span>
                    ) : (
                      <button
                        type="button"
                        className="btn small"
                        disabled={busy}
                        onClick={() => void buy('palette', p.id)}
                      >
                        <span className="coin">⬢</span> 800
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {notice && (
            <p className="form-notice" role="status">
              {notice}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Kit({
  label,
  name,
  text,
  meta,
  onPreview,
}: {
  label: string;
  name: string;
  text: string;
  meta?: string;
  onPreview?: () => void;
}): React.ReactElement {
  return (
    <div className="kit-row">
      <span className="kit-key">{label}</span>
      <div className="kit-body">
        <div className="spread">
          <strong>{name}</strong>
          {meta && <span className="subtle">{meta}</span>}
        </div>
        <p>{text}</p>
      </div>
      {onPreview && (
        <button
          type="button"
          className="kit-preview"
          onClick={onPreview}
          aria-label={`Preview ${name}`}
        >
          ▶
        </button>
      )}
    </div>
  );
}
