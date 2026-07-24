import { CHAMPION_LIST, CHAMPIONS, STRINGS } from '@mini-clash/data';
import type { MatchPlayerConfig } from '@mini-clash/protocol';
import { useEffect, useRef, useState } from 'react';
import { uiSound } from '../game/audio';
import { useSession } from '../state/session';

/**
 * Champion Select — the Deal (UI_UX §6, v0.2 single-champion form): card-flip
 * deal of your champion + live ally picks, 2 rerolls with a team bench (tap to
 * swap), hidden enemy silhouettes, 45 s timer around LOCK.
 *
 * The ceremony is presentation-only and runs from a SelectDriver: offline the
 * driver deals locally and launches the worker match; in a lobby the driver
 * mirrors the server's deal (rerolls/bench/locks are validated server-side).
 */

const SELECT_SECONDS = 45;
const BOT_NAMES = ['Krag', 'Nyx', 'Piston', 'Moxie', 'Thorn', 'Ember', 'Gruff', 'Fizz'];

export interface SelectAllyView {
  key: string;
  name: string;
  champion: string;
  locked: boolean;
  bot: boolean;
}

export interface SelectDriver {
  mine: string;
  /** The three teammates (never includes you). */
  allies: SelectAllyView[];
  bench: string[];
  rerolls: number;
  locked: boolean;
  timeLeft: number;
  enemyCount: number;
  reroll: () => void;
  swap: (championId: string) => void;
  lock: () => void;
}

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

/** Offline driver: local deal, bot allies, lock launches the worker match. */
function useOfflineSelect(): SelectDriver {
  const goto = useSession((s) => s.goto);
  const setBridgeLineup = useSession((s) => s.setBridgeLineup);

  const [deal] = useState(() => {
    const first = drawUnique(1, [])[0];
    return { first, allies: drawUnique(3, [first]), enemies: drawUnique(4, []) };
  });
  const [mine, setMine] = useState(deal.first);
  const [bench, setBench] = useState<string[]>([]);
  const [rerolls, setRerolls] = useState(2);
  const [locked, setLocked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SELECT_SECONDS);
  const lockedRef = useRef(false);
  // The interval closure goes stale — lock() reads the live pick through this ref.
  const latestMine = useRef(mine);
  latestMine.current = mine;

  const lock = (): void => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    uiSound('ui_click');
    const players: MatchPlayerConfig[] = [
      { id: 1, championId: latestMine.current, team: 0 },
      ...deal.allies.map((c, i) => ({
        id: 2 + i,
        championId: c,
        team: 0 as const,
        bot: 'veteran' as const,
        name: BOT_NAMES[i],
      })),
      ...deal.enemies.map((c, i) => ({
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
  const lockRef = useRef(lock);
  lockRef.current = lock;

  // 45 → 0 timer; timeout locks whatever is held.
  useEffect(() => {
    const iv = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(iv);
          lockRef.current();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  return {
    mine,
    allies: deal.allies.map((c, i) => ({
      key: `bot-${i}`,
      name: BOT_NAMES[i],
      champion: c,
      locked: false,
      bot: true,
    })),
    bench,
    rerolls,
    locked,
    timeLeft,
    enemyCount: 4,
    reroll: (): void => {
      if (rerolls <= 0 || locked) return;
      uiSound('ui_click');
      setRerolls((r) => r - 1);
      setMine((prev) => {
        const next = drawUnique(1, [prev, ...bench, ...deal.allies])[0];
        setBench((b) => [...b, prev]);
        return next;
      });
    },
    swap: (benchId: string): void => {
      if (locked || !bench.includes(benchId)) return;
      uiSound('ui_click');
      setBench((b) => [...b.filter((x) => x !== benchId), mine]);
      setMine(benchId);
    },
    lock,
  };
}

/** Offline entry (App screen 'select'): deal locally, then into the worker match. */
export function ChampionSelect(): React.ReactElement {
  return <SelectCeremony driver={useOfflineSelect()} />;
}

export function SelectCeremony({ driver }: { driver: SelectDriver }): React.ReactElement {
  const [flipped, setFlipped] = useState<number>(0);

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

  const myDef = CHAMPIONS[driver.mine];
  const ringDeg = (driver.timeLeft / SELECT_SECONDS) * 360;

  return (
    <div className="select-root backdrop-dark">
      <div className="select-head">
        <h1 className="wordmark" style={{ fontSize: '2.2rem' }}>
          {STRINGS.selectTitle}
        </h1>
        <span className="select-timer">{driver.timeLeft}s</span>
      </div>

      <div className="select-stage">
        <div className="select-side">
          <div className="section-label on-dark">{STRINGS.selectYourTeam}</div>
          <div className="select-row">
            <DealCard
              champ={driver.mine}
              big
              flipped={flipped >= 1}
              label="YOU"
              locked={driver.locked}
            />
            {driver.allies.map((a, i) => (
              <DealCard
                key={a.key}
                champ={a.champion}
                flipped={flipped >= i + 2}
                label={a.name}
                locked={a.locked && !a.bot}
              />
            ))}
          </div>

          <div className="select-controls">
            <button
              type="button"
              className={`btn reroll ${driver.rerolls <= 0 || driver.locked ? 'spent' : ''}`}
              onClick={driver.reroll}
              disabled={driver.rerolls <= 0 || driver.locked}
            >
              🎲 {STRINGS.selectReroll} ({driver.rerolls})
            </button>
            {driver.bench.length > 0 && (
              <div className="bench">
                <span className="bench-label">{STRINGS.selectBench}</span>
                <div className="bench-row" title={STRINGS.selectBenchHint}>
                  {driver.bench.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="bench-card"
                      onClick={() => {
                        if (!driver.locked) uiSound('ui_click');
                        driver.swap(c);
                      }}
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
            {Array.from({ length: driver.enemyCount }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: silhouettes are identical placeholders
              <div key={i} className="deal-card back-only">
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
          className={`lock-btn ${driver.locked ? 'locked' : ''}`}
          onClick={() => {
            if (!driver.locked) uiSound('ui_click');
            driver.lock();
          }}
          disabled={driver.locked}
          style={{
            background: driver.locked
              ? undefined
              : `conic-gradient(var(--gold) ${ringDeg}deg, rgba(255,255,255,0.12) 0deg)`,
          }}
        >
          <span>{driver.locked ? STRINGS.selectLocked : STRINGS.selectLock}</span>
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
  label,
  locked,
}: {
  champ: string;
  flipped: boolean;
  big?: boolean;
  label: string;
  locked?: boolean;
}): React.ReactElement {
  const def = CHAMPIONS[champ];
  const theme = CHAMP_THEME[champ];
  // Burst whenever the champion on this card changes (reroll/bench swap —
  // local or a teammate's, delivered by the server broadcast).
  const [burst, setBurst] = useState(false);
  const prev = useRef(champ);
  useEffect(() => {
    if (prev.current !== champ) {
      prev.current = champ;
      setBurst(true);
      const t = setTimeout(() => setBurst(false), 340);
      return () => clearTimeout(t);
    }
  }, [champ]);
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
          {locked && <span className="dc-locked">LOCKED</span>}
        </div>
      </div>
    </div>
  );
}
