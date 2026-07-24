import { CHAMPION_LIST, CHAMPIONS, STRINGS } from '@mini-clash/data';
import type { MatchPlayerConfig } from '@mini-clash/protocol';
import { useEffect, useRef, useState } from 'react';
import { uiSound } from '../game/audio';
import { useSession } from '../state/session';

/**
 * Champion Select v1 — the Deal (UI_UX §6, v0.2 single-champion form):
 * card-flip deal of your champion + live ally picks, 2 rerolls with a team
 * bench (tap to swap), hidden enemy silhouettes, 45 s timer around LOCK.
 */

const SELECT_SECONDS = 45;
const BOT_NAMES = ['Krag', 'Nyx', 'Piston', 'Moxie', 'Thorn', 'Ember', 'Gruff', 'Fizz'];

const CHAMP_THEME: Record<string, { from: string; to: string; line: string }> = {
  rook: { from: '#8a94a6', to: '#3d4656', line: '#aab6cc' },
  fathom: { from: '#2e5aa8', to: '#14274d', line: '#3ba7ff' },
  mortis: { from: '#6c4a8a', to: '#2a1a3d', line: '#b36bff' },
  rattle: { from: '#8a2f3c', to: '#3d1420', line: '#ff5a6b' },
  grukk: { from: '#4a7a3a', to: '#1f3a17', line: '#8ade6a' },
  sylva: { from: '#c47a3a', to: '#5c3417', line: '#ffb35c' },
};

const ROLE_ICON: Record<string, string> = {
  vanguard: 'checked-shield',
  bruiser: 'quake-stomp',
  slayer: 'backstab',
  gunner: 'cannon-ball',
  caster: 'tower-fall',
  support: 'three-friends',
};

function drawUnique(count: number, exclude: string[]): string[] {
  const pool = CHAMPION_LIST.map((c) => c.id).filter((id) => !exclude.includes(id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(pool[i] ?? CHAMPION_LIST[Math.floor(Math.random() * CHAMPION_LIST.length)].id);
  }
  return out;
}

export function ChampionSelect(): React.ReactElement {
  const goto = useSession((s) => s.goto);
  const setBridgeLineup = useSession((s) => s.setBridgeLineup);

  // One deal per mount. Allies unique vs me; enemies unique among themselves.
  const [deal] = useState(() => {
    const first = drawUnique(1, [])[0];
    return { first, allies: drawUnique(3, [first]), enemies: drawUnique(4, []) };
  });
  const { allies, enemies } = deal;
  const [mine, setMine] = useState(deal.first);
  const [bench, setBench] = useState<string[]>([]);
  const [rerolls, setRerolls] = useState(2);
  const [flipped, setFlipped] = useState<number>(0); // how many cards have flipped in
  const [burst, setBurst] = useState(false);
  const [locked, setLocked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SELECT_SECONDS);
  const lockedRef = useRef(false);
  // The interval closure goes stale — lock() reads the live pick through this ref.
  const latestMine = useRef(mine);
  latestMine.current = mine;

  // Staggered deal animation: my card, then allies left→right.
  useEffect(() => {
    const timers = [0, 1, 2, 3, 4].map((i) =>
      setTimeout(
        () => {
          setFlipped((f) => Math.max(f, i + 1));
          uiSound('ui_hover');
        },
        350 + i * 240,
      ),
    );
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  // 45 → 0 timer; timeout locks whatever is held.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the timer arms once per mount; lock() reads live picks via refs
  useEffect(() => {
    const iv = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(iv);
          lock();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const reroll = (): void => {
    if (rerolls <= 0 || locked || burst) return;
    uiSound('ui_click');
    setRerolls((r) => r - 1);
    setBurst(true);
    setTimeout(() => {
      setMine((prev) => {
        const next = drawUnique(1, [prev, ...bench, ...allies])[0];
        setBench((b) => [...b, prev]);
        return next;
      });
      setBurst(false);
      uiSound('ui_hover');
    }, 320);
  };

  const swapWith = (benchId: string): void => {
    if (locked) return;
    uiSound('ui_click');
    setBench((b) => [...b.filter((x) => x !== benchId), mine]);
    setMine(benchId);
  };

  const lock = (): void => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    uiSound('ui_click');
    const players: MatchPlayerConfig[] = [
      { id: 1, championId: latestMine.current, team: 0 },
      ...allies.map((c, i) => ({
        id: 2 + i,
        championId: c,
        team: 0 as const,
        bot: 'veteran' as const,
        name: BOT_NAMES[i],
      })),
      ...enemies.map((c, i) => ({
        id: 5 + i,
        championId: c,
        team: 1 as const,
        bot: 'veteran' as const,
        name: BOT_NAMES[3 + i],
      })),
    ];
    setBridgeLineup(players);
    setTimeout(() => goto('match'), 650);
  };

  const myDef = CHAMPIONS[mine];
  const ringDeg = (timeLeft / SELECT_SECONDS) * 360;

  return (
    <div className="select-root backdrop-dark">
      <div className="select-head">
        <h1 className="wordmark" style={{ fontSize: '2.2rem' }}>
          {STRINGS.selectTitle}
        </h1>
        <span className="select-timer">{timeLeft}s</span>
      </div>

      <div className="select-stage">
        <div className="select-side">
          <div className="section-label on-dark">{STRINGS.selectYourTeam}</div>
          <div className="select-row">
            {/* my card */}
            <DealCard champ={mine} big flipped={flipped >= 1} burst={burst} label="YOU" />
            {allies.map((c, i) => (
              <DealCard key={c} champ={c} flipped={flipped >= i + 2} label={BOT_NAMES[i]} />
            ))}
          </div>

          <div className="select-controls">
            <button
              type="button"
              className={`btn reroll ${rerolls <= 0 || locked ? 'spent' : ''}`}
              onClick={reroll}
              disabled={rerolls <= 0 || locked}
            >
              🎲 {STRINGS.selectReroll} ({rerolls})
            </button>
            {bench.length > 0 && (
              <div className="bench">
                <span className="bench-label">{STRINGS.selectBench}</span>
                <div className="bench-row" title={STRINGS.selectBenchHint}>
                  {bench.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="bench-card"
                      onClick={() => swapWith(c)}
                      style={{
                        background: `linear-gradient(150deg, ${CHAMP_THEME[c].from}, ${CHAMP_THEME[c].to})`,
                      }}
                    >
                      {CHAMPIONS[c].name.slice(0, 1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="select-tip">
            <b>{myDef.name}</b> — {myDef.title} · {myDef.passive.name}:{' '}
            {resolveParams(myDef.passive.description, myDef.passive.params)}
          </div>
        </div>

        <div className="select-side enemy">
          <div className="section-label on-dark">{STRINGS.selectEnemyTeam}</div>
          <div className="select-row">
            {enemies.map((c) => (
              <div key={c} className="deal-card back-only">
                <div className="face back">
                  <span className="q">?</span>
                </div>
              </div>
            ))}
          </div>
          <div className="select-tip dim">{STRINGS.selectEnemyHidden}</div>
        </div>
      </div>

      <div className="select-foot">
        <button
          type="button"
          className={`lock-btn ${locked ? 'locked' : ''}`}
          onClick={lock}
          disabled={locked}
          style={{
            background: locked
              ? undefined
              : `conic-gradient(var(--gold) ${ringDeg}deg, rgba(255,255,255,0.12) 0deg)`,
          }}
        >
          <span>{locked ? STRINGS.selectLocked : STRINGS.selectLock}</span>
        </button>
      </div>
    </div>
  );
}

/** Fill "{param}" placeholders from the passive's params block. */
function resolveParams(s: string, params: Record<string, number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? '?'));
}

function DealCard({
  champ,
  flipped,
  big,
  burst,
  label,
}: {
  champ: string;
  flipped: boolean;
  big?: boolean;
  burst?: boolean;
  label: string;
}): React.ReactElement {
  const def = CHAMPIONS[champ];
  const theme = CHAMP_THEME[champ];
  return (
    <div
      className={`deal-card ${big ? 'big' : ''} ${flipped ? 'flipped' : ''} ${burst ? 'burst' : ''}`}
    >
      <div className="inner">
        <div className="face back">
          <span className="q">◆</span>
        </div>
        <div
          className="face front"
          style={{ background: `linear-gradient(160deg, ${theme.from}, ${theme.to})` }}
        >
          <span className="dc-letter">{def.name.slice(0, 1)}</span>
          <div className="dc-plate">
            <span className="dc-nm">{def.name}</span>
            <span
              className="dc-role"
              title={def.role}
              style={{
                maskImage: `url(/icons/${ROLE_ICON[def.role] ?? 'sword-clash'}.svg)`,
                WebkitMaskImage: `url(/icons/${ROLE_ICON[def.role] ?? 'sword-clash'}.svg)`,
              }}
            />
          </div>
          <div className="dc-underline" style={{ background: theme.line }} />
          <span className="owner">{label}</span>
        </div>
      </div>
    </div>
  );
}
