import { CHAMPION_LIST, CHAMPIONS, STRINGS } from '@mini-clash/data';
import type { MatchPlayerConfig } from '@mini-clash/protocol';
import { useEffect, useRef, useState } from 'react';
import { uiSound } from '../game/audio';
import { useSession } from '../state/session';

/**
 * Champion Select — the Deal (UI_UX §6 / GAME_DESIGN §7.1, v0.4 duo form):
 * each player is dealt a **pair** of champions that lands as one chained card,
 * 2 rerolls spent per-slot, rerolled champions slide to the shared team bench
 * and swap back into whichever slot you pick, hidden enemy silhouettes, 60 s
 * timer around LOCK.
 *
 * The ceremony is presentation-only and runs from a SelectDriver: offline the
 * driver deals locally and launches the worker match; in a lobby the driver
 * mirrors the server's deal (rerolls/bench/locks are validated server-side).
 */

const SELECT_SECONDS = 60;
const BOT_NAMES = ['Krag', 'Nyx', 'Piston', 'Moxie', 'Thorn', 'Ember', 'Gruff', 'Fizz'];

export type Duo = [string, string];
export type DuoSlot = 0 | 1;

export interface SelectAllyView {
  key: string;
  name: string;
  duo: Duo;
  locked: boolean;
  bot: boolean;
}

export interface SelectDriver {
  /** [active, bench] — the pair you'll play. */
  duo: Duo;
  /** The three teammates (never includes you). */
  allies: SelectAllyView[];
  bench: string[];
  rerolls: number;
  locked: boolean;
  timeLeft: number;
  enemyCount: number;
  reroll: (slot: DuoSlot) => void;
  swap: (championId: string, slot: DuoSlot) => void;
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

function theme(id: string): { from: string; to: string; line: string } {
  return CHAMP_THEME[id] ?? CHAMP_THEME.rook;
}

function drawUnique(count: number, exclude: string[]): string[] {
  const pool = CHAMPION_LIST.map((c) => c.id).filter((id) => !exclude.includes(id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: string[] = [];
  const all = CHAMPION_LIST.map((c) => c.id);
  for (let i = 0; i < count; i++) {
    // Past the pool's end (roster smaller than the ask) we wrap the roster
    // rather than repeating whatever the caller ruled out.
    out.push(pool[i] ?? all[(i + out.length) % all.length]);
  }
  return out;
}

/** Draw one champion, guaranteed different from everything in `avoid`. */
function drawOther(avoid: string[]): string {
  const all = CHAMPION_LIST.map((c) => c.id);
  const pool = all.filter((id) => !avoid.includes(id));
  const from = pool.length > 0 ? pool : all;
  return from[Math.floor(Math.random() * from.length)];
}

/**
 * Deal `n` duos, exhausting the roster before any champion repeats
 * (GAME_DESIGN §7.1). A team of 4 duos wants 8 distinct champions, so the
 * no-duplicates rule fully holds once the roster reaches 8; until then repeats
 * are spread as thinly as possible and never land inside a single duo.
 */
function dealDuos(n: number): Duo[] {
  const flat = drawUnique(n * 2, []);
  const duos: Duo[] = [];
  for (let i = 0; i < n; i++) {
    let bench = flat[i * 2 + 1];
    if (bench === flat[i * 2]) {
      bench = drawUnique(1, [flat[i * 2]])[0];
    }
    duos.push([flat[i * 2], bench]);
  }
  return duos;
}

/** Offline driver: local deal, bot allies, lock launches the worker match. */
function useOfflineSelect(): SelectDriver {
  const goto = useSession((s) => s.goto);
  const setBridgeLineup = useSession((s) => s.setBridgeLineup);

  const [deal] = useState(() => {
    const team = dealDuos(4); // me + 3 allies, team-unique
    return { mine: team[0], allies: team.slice(1), enemies: dealDuos(4) };
  });
  const [duo, setDuo] = useState<Duo>(deal.mine);
  const [bench, setBench] = useState<string[]>([]);
  const [rerolls, setRerolls] = useState(2);
  const [locked, setLocked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SELECT_SECONDS);
  const lockedRef = useRef(false);
  // The interval closure goes stale — lock() reads the live pair through this ref.
  const latestDuo = useRef(duo);
  latestDuo.current = duo;

  const lock = (): void => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    uiSound('ui_click');
    const [mine, benched] = latestDuo.current;
    const players: MatchPlayerConfig[] = [
      { id: 1, championId: mine, benchId: benched, team: 0 },
      ...deal.allies.map((d, i) => ({
        id: 2 + i,
        championId: d[0],
        benchId: d[1],
        team: 0 as const,
        bot: 'veteran' as const,
        name: BOT_NAMES[i],
      })),
      ...deal.enemies.map((d, i) => ({
        id: 5 + i,
        championId: d[0],
        benchId: d[1],
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

  // 60 → 0 timer; timeout locks whatever is held.
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
    duo,
    allies: deal.allies.map((d, i) => ({
      key: `bot-${i}`,
      name: BOT_NAMES[i],
      duo: d,
      locked: false,
      bot: true,
    })),
    bench,
    rerolls,
    locked,
    timeLeft,
    enemyCount: 4,
    reroll: (slot: DuoSlot): void => {
      if (rerolls <= 0 || locked) return;
      uiSound('ui_click');
      setRerolls((r) => r - 1);
      setDuo((prev) => {
        // Prefer an untouched champion; when the roster is smaller than the
        // deal, still never re-draw your own other half or the card you spent.
        const taken = [...prev, ...bench, ...deal.allies.flat()];
        const fresh = CHAMPION_LIST.map((c) => c.id).filter((id) => !taken.includes(id));
        const next =
          fresh.length > 0
            ? fresh[Math.floor(Math.random() * fresh.length)]
            : drawOther([prev[slot], prev[slot === 0 ? 1 : 0]]);
        setBench((b) => [...b, prev[slot]]);
        const out: Duo = [...prev];
        out[slot] = next;
        return out;
      });
    },
    swap: (benchId: string, slot: DuoSlot): void => {
      if (locked || !bench.includes(benchId) || duo.includes(benchId)) return;
      uiSound('ui_click');
      setBench((b) => [...b.filter((x) => x !== benchId), duo[slot]]);
      setDuo((prev) => {
        const out: Duo = [...prev];
        out[slot] = benchId;
        return out;
      });
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
  /** Which half of your duo the bench swaps into (UI_UX §6 per-slot bench). */
  const [slot, setSlot] = useState<DuoSlot>(0);

  // Staggered deal: your pair lands as a chained pair, then allies left→right.
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

  const activeDef = CHAMPIONS[driver.duo[0]];
  const benchDef = CHAMPIONS[driver.duo[1]];
  const pickedDef = CHAMPIONS[driver.duo[slot]];
  const ringDeg = (driver.timeLeft / SELECT_SECONDS) * 360;
  const canAct = !driver.locked;

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
            {/* Your duo: two chained cards, each individually rerollable. */}
            <div className="duo-pair mine">
              {([0, 1] as DuoSlot[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`duo-slot ${slot === s ? 'picked' : ''}`}
                  onClick={() => {
                    if (!canAct) return;
                    uiSound('ui_hover');
                    setSlot(s);
                  }}
                  aria-label={`Duo slot ${s + 1}: ${CHAMPIONS[driver.duo[s]].name}`}
                >
                  <DealCard
                    champ={driver.duo[s]}
                    big
                    flipped={flipped >= 1}
                    label={s === 0 ? 'ACTIVE' : 'BENCH'}
                    locked={driver.locked}
                  />
                  {canAct && driver.rerolls > 0 && (
                    <span
                      className="slot-reroll"
                      title={STRINGS.selectReroll}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        driver.reroll(s);
                      }}
                    >
                      🎲
                    </span>
                  )}
                </button>
              ))}
              <span className="duo-link">♦</span>
            </div>

            {driver.allies.map((a, i) => (
              <div key={a.key} className="duo-pair ally">
                <span className="ally-name">
                  {a.name}
                  {a.locked && !a.bot && <b> ✓</b>}
                </span>
                <div className="ally-cards">
                  <DealCard champ={a.duo[0]} flipped={flipped >= i + 2} label="" small />
                  <DealCard champ={a.duo[1]} flipped={flipped >= i + 2} label="" small />
                </div>
              </div>
            ))}
          </div>

          <div className="select-controls">
            <span className={`reroll-count ${driver.rerolls <= 0 ? 'spent' : ''}`}>
              🎲 {STRINGS.selectReroll}: <b>{driver.rerolls}</b> — tap the dice on a card
            </span>
            {driver.bench.length > 0 && (
              <div className="bench">
                <span className="bench-label">
                  {STRINGS.selectBench} → {slot === 0 ? 'ACTIVE' : 'BENCH'}
                </span>
                <div className="bench-row" title={STRINGS.selectBenchHint}>
                  {driver.bench.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="bench-card"
                      onClick={() => {
                        if (!driver.locked) uiSound('ui_click');
                        driver.swap(c, slot);
                      }}
                      style={{
                        background: `linear-gradient(150deg, ${theme(c).from}, ${theme(c).to})`,
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
            <b>
              {activeDef.name} ♦ {benchDef.name}
            </b>{' '}
            — {pickedDef.name}’s {pickedDef.passive.name}:{' '}
            {resolveParams(pickedDef.passive.description, pickedDef.passive.params)}
          </div>
          <div className="select-tip dim">
            <b>Space</b> swaps your duo mid-match — bench cooldowns and Energy keep recovering.
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
                  <span className="duo-hint">♦♦</span>
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
  small,
  label,
  locked,
}: {
  champ: string;
  flipped: boolean;
  big?: boolean;
  small?: boolean;
  label: string;
  locked?: boolean;
}): React.ReactElement {
  const def = CHAMPIONS[champ];
  const t = theme(champ);
  // Burst whenever the champion on this card changes (reroll/bench swap —
  // local or a teammate's, delivered by the server broadcast).
  const [burst, setBurst] = useState(false);
  const prev = useRef(champ);
  useEffect(() => {
    if (prev.current !== champ) {
      prev.current = champ;
      setBurst(true);
      const to = setTimeout(() => setBurst(false), 340);
      return () => clearTimeout(to);
    }
  }, [champ]);
  return (
    <div
      className={`deal-card ${big ? 'big' : ''} ${small ? 'small' : ''} ${flipped ? 'flipped' : ''} ${burst ? 'burst' : ''}`}
    >
      <div className="inner">
        <div className="face back">
          <span className="q">◆</span>
        </div>
        <div
          className="face front"
          style={{ background: `linear-gradient(160deg, ${t.from}, ${t.to})` }}
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
          <div className="dc-underline" style={{ background: t.line }} />
          {label && <span className="owner">{label}</span>}
          {locked && <span className="dc-locked">LOCKED</span>}
        </div>
      </div>
    </div>
  );
}
