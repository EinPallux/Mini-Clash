import { CHAMPIONS, ITEMS, type ItemDef, RELICS, STRINGS } from '@mini-clash/data';
import type { PingKind } from '@mini-clash/protocol';
import { useEffect, useMemo, useRef, useState } from 'react';
import { uiSound } from '../../game/audio';
import { type FeedEntry, type HudSeat, useHud } from '../../game/hudStore';
import type { MatchRuntime } from '../../game/match';
import { useLobby } from '../../state/lobby';
import { useSession } from '../../state/session';
import { paletteColors, useSettings } from '../../state/settings';
import { ChampionCluster, DenyFlash } from './HudShared';

/**
 * Bridge Brawl HUD (UI_UX §8, §10–§12): match strip, team frames, killfeed,
 * lane-strip minimap, gold + item slots, death-screen shop, Tab scoreboard,
 * ping wheel (G / Alt+RMB), FTUE coach-marks, and the end-of-match sequence
 * (slab → podium → summary with local history).
 */

const CHAMP_TONE: Record<string, string> = {
  rook: '#8a94a6',
  fathom: '#2e5aa8',
  mortis: '#6c4a8a',
  rattle: '#8a2f3c',
  grukk: '#4a7a3a',
  sylva: '#c47a3a',
};

function fmtClock(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function champLetter(id: string): string {
  return CHAMPIONS[id]?.name.slice(0, 1) ?? '?';
}

export function BridgeHud({ runtime }: { runtime: () => MatchRuntime | null }): React.ReactElement {
  const champ = useHud((s) => s.champion);
  const match = useHud((s) => s.match);
  const fps = useHud((s) => s.fps);
  const dropped = useHud((s) => s.droppedReason);
  const goto = useSession((s) => s.goto);
  const [rtt, setRtt] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setRtt(Math.round(runtime()?.rttMs ?? 0)), 1000);
    return () => clearInterval(iv);
  }, [runtime]);

  if (dropped) {
    // Clean failure contract: the room died — say so plainly and go home.
    return (
      <div className="hud">
        <div className="loading-veil backdrop-dark" style={{ background: 'rgba(8, 8, 14, 0.92)' }}>
          <div className="screen" style={{ position: 'static' }}>
            <h1 className="wordmark" style={{ fontSize: '2.6rem' }}>
              Match lost to the void
            </h1>
            <p style={{ opacity: 0.75, marginTop: 6 }}>{dropped}</p>
            <button
              type="button"
              className="btn primary"
              style={{ marginTop: 18 }}
              onClick={() => {
                uiSound('ui_back');
                goto('hub');
              }}
            >
              {STRINGS.back}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!champ || !match) return <div className="hud" />;

  const banner = match.suddenDeath ? 'SUDDEN DEATH' : match.overtime ? 'OVERTIME' : null;

  return (
    <div className="hud">
      {/* top-center: the match strip */}
      <div className="match-strip">
        <div className="side ally">
          <span className="kills">{match.teamKills[0]}</span>
          <span className="pips">
            {[0, 1].map((i) => (
              <span key={i} className={`pip ${i < match.towersDown[1] ? 'down' : ''}`} />
            ))}
          </span>
        </div>
        <div className="clock-block">
          <span className={`clock ${banner ? 'hot' : ''}`}>{fmtClock(match.time)}</span>
          {!match.barrierDown && (
            <span className="sub">Gates open {Math.max(0, 20 - match.time)}s</span>
          )}
          {match.barrierDown && match.nextOrbIn !== null && match.nextOrbIn <= 15 && (
            <span className="sub orb">Orbs {match.nextOrbIn}s</span>
          )}
        </div>
        <div className="side enemy">
          <span className="pips">
            {[0, 1].map((i) => (
              <span key={i} className={`pip ${i < match.towersDown[0] ? 'down' : ''}`} />
            ))}
          </span>
          <span className="kills">{match.teamKills[1]}</span>
        </div>
      </div>

      {banner && !match.over && (
        <div className="escalation-banner">
          <span>{banner}</span>
        </div>
      )}

      <TeamFrames />
      <Killfeed />
      <Minimap runtime={runtime} />
      <GoldAndItems />

      <div className="hud-topleft" style={{ top: 'auto', bottom: 10 }}>
        <span className="hud-chip" style={{ opacity: 0.65 }}>
          {fps} fps
        </span>
        {rtt > 0 && (
          <span
            className="hud-chip"
            style={{
              opacity: 0.8,
              color: rtt > 120 ? '#ff8a5c' : rtt > 60 ? '#ffc72e' : '#8ade6a',
            }}
            title="Round-trip to the game server"
          >
            {rtt} ms
          </span>
        )}
        <span className="hud-chip" style={{ opacity: 0.8 }}>
          <b>TAB</b> Score · <b>G</b> Ping · <b>ESC</b> Menu
        </span>
      </div>

      <DenyFlash />
      <ShopToast />
      <ChampionCluster />
      <PingWheel runtime={runtime} />
      <CoachMarks dead={champ.dead} />

      <Scoreboard />

      {/* death screen = the shop */}
      {champ.dead && !match.over && <DeathShop runtime={runtime} />}

      {match.over && <EndSequence />}
    </div>
  );
}

/* ------------------------------ Team frames ------------------------------- */

function SeatChip({
  seat,
  self,
  ally,
}: {
  seat: HudSeat;
  self: boolean;
  ally: boolean;
}): React.ReactElement {
  return (
    <div
      className={`seat ${seat.dead ? 'dead' : ''} ${seat.visible ? '' : 'hidden-seat'} ${self ? 'self' : ''}`}
    >
      <div className="chip" style={{ background: CHAMP_TONE[seat.championId] ?? '#555' }}>
        {seat.visible || ally ? champLetter(seat.championId) : '?'}
        <span className="lv">{seat.level}</span>
        {seat.dead && <span className="skull">☠ {seat.respawnIn}</span>}
      </div>
      <div className="seat-hp">
        <div className="fill" style={{ transform: `scaleX(${seat.dead ? 0 : seat.hpFrac})` }} />
      </div>
    </div>
  );
}

function TeamFrames(): React.ReactElement {
  const seats = useHud((s) => s.seats);
  const selfPlayer = useHud((s) => s.selfPlayer);
  const selfTeam = useHud((s) => s.selfTeam);
  const allies = seats.filter((s) => s.team === selfTeam);
  const enemies = seats.filter((s) => s.team !== selfTeam);
  return (
    <>
      <div className="team-frames left">
        {allies.map((s) => (
          <SeatChip key={s.player} seat={s} self={s.player === selfPlayer} ally />
        ))}
      </div>
      <div className="team-frames right">
        {enemies.map((s) => (
          <SeatChip key={s.player} seat={s} self={false} ally={false} />
        ))}
      </div>
    </>
  );
}

/* -------------------------------- Killfeed -------------------------------- */

function FeedRow({ e }: { e: FeedEntry }): React.ReactElement {
  const selfTeam = useHud((s) => s.selfTeam);
  if (e.kind === 'kill') {
    return (
      <div className={`feed-row ${e.team === selfTeam ? 'ally' : 'enemy'}`}>
        {e.killerChamp && (
          <span className="fchip" style={{ background: CHAMP_TONE[e.killerChamp] ?? '#555' }}>
            {champLetter(e.killerChamp)}
          </span>
        )}
        <b>{e.killerName}</b>
        <span className="x">⚔</span>
        <b>{e.victimName}</b>
        {e.victimChamp && (
          <span className="fchip" style={{ background: CHAMP_TONE[e.victimChamp] ?? '#555' }}>
            {champLetter(e.victimChamp)}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={`feed-row ${e.team === selfTeam ? 'ally' : 'enemy'}`}>
      <span className="x">{e.kind === 'tower' ? '🏰' : '🏳'}</span>
      <b>{e.text}</b>
    </div>
  );
}

function Killfeed(): React.ReactElement {
  const feed = useHud((s) => s.feed);
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const now = Date.now();
  const fresh = feed.filter((e) => now - e.at < 7000);
  return (
    <div className="killfeed">
      {fresh.map((e) => (
        <FeedRow key={e.id} e={e} />
      ))}
    </div>
  );
}

/* --------------------------------- Minimap -------------------------------- */

function Minimap({ runtime }: { runtime: () => MatchRuntime | null }): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const iv = setInterval(() => {
      const cv = canvasRef.current;
      const rt = runtime();
      if (!cv || !rt) return;
      const g = cv.getContext('2d');
      if (!g) return;
      const { width, deckHalf, marks, selfTeam } = rt.minimap();
      const W = cv.width;
      const H = cv.height;
      const colors = paletteColors(useSettings.getState().palette);
      const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
      g.clearRect(0, 0, W, H);
      // Deck strip.
      g.fillStyle = 'rgba(255,255,255,0.10)';
      const deckY = H * 0.2;
      const deckH = H * 0.6;
      g.fillRect(2, deckY, W - 4, deckH);
      // Team 1 sees the strip mirrored — your base is always on the left.
      const flip = selfTeam === 1;
      const px = (x: number): number => {
        const v = 2 + ((x + width / 2) / width) * (W - 4);
        return flip ? W - v : v;
      };
      const pz = (z: number): number => deckY + ((z + deckHalf) / (deckHalf * 2)) * deckH;
      for (const m of marks) {
        const teamColor = m.team === selfTeam ? colors.ally : colors.enemy;
        if (m.kind === 'tower') {
          g.fillStyle = m.dead ? 'rgba(255,255,255,0.18)' : hex(teamColor);
          g.fillRect(px(m.x) - 3, pz(m.z) - 4, 6, 8);
        } else if (m.kind === 'core') {
          g.fillStyle = hex(teamColor);
          g.beginPath();
          const cx = px(m.x);
          const cz = pz(m.z);
          g.moveTo(cx, cz - 5);
          g.lineTo(cx + 4, cz);
          g.lineTo(cx, cz + 5);
          g.lineTo(cx - 4, cz);
          g.fill();
        } else if (m.kind === 'orb') {
          g.fillStyle = '#6fe0a8';
          g.beginPath();
          g.arc(px(m.x), pz(m.z), 3, 0, Math.PI * 2);
          g.fill();
        } else if (m.kind === 'mini') {
          g.fillStyle = hex(teamColor);
          g.globalAlpha = 0.55;
          g.fillRect(px(m.x) - 1, pz(m.z) - 1, 2, 2);
          g.globalAlpha = 1;
        } else {
          // champion
          g.fillStyle = m.dead ? 'rgba(255,255,255,0.3)' : hex(m.self ? colors.self : teamColor);
          g.beginPath();
          g.arc(px(m.x), pz(m.z), m.self ? 3.4 : 2.8, 0, Math.PI * 2);
          g.fill();
          if (m.self) {
            g.strokeStyle = '#ffffff';
            g.lineWidth = 1.2;
            g.stroke();
          }
        }
      }
    }, 110);
    return () => clearInterval(iv);
  }, [runtime]);
  return (
    <div className="minimap">
      <canvas ref={canvasRef} width={252} height={44} />
    </div>
  );
}

/* ----------------------------- Gold + item row ----------------------------- */

function GoldAndItems(): React.ReactElement | null {
  const champ = useHud((s) => s.champion);
  if (!champ) return null;
  return (
    <div className="wallet">
      <div className="slots">
        {Array.from({ length: 6 }, (_, i) => {
          const id = champ.items[i];
          const def = id ? ITEMS[id] : null;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed positional slots — the index IS the identity
            <span key={i} className={`islot ${def ? 'full' : ''}`} title={def?.name}>
              {def && (
                <span
                  className="ic"
                  style={{
                    maskImage: `url(/icons/${def.icon}.svg)`,
                    WebkitMaskImage: `url(/icons/${def.icon}.svg)`,
                  }}
                />
              )}
            </span>
          );
        })}
        <span
          className={`islot relic ${champ.relic ? 'full' : ''}`}
          title={champ.relic ? RELICS[champ.relic.id]?.name : 'Relic'}
        >
          {champ.relic && (
            <>
              <span
                className="ic"
                style={{
                  maskImage: `url(/icons/${RELICS[champ.relic.id]?.icon}.svg)`,
                  WebkitMaskImage: `url(/icons/${RELICS[champ.relic.id]?.icon}.svg)`,
                }}
              />
              {champ.relic.cd > 0.05 && <span className="cdnum">{Math.ceil(champ.relic.cd)}</span>}
            </>
          )}
        </span>
      </div>
      <div className="gold">
        <span className="coin">⬢</span> {champ.gold.toLocaleString()}
      </div>
    </div>
  );
}

/* ------------------------------ Death shop --------------------------------- */

function effectiveCost(def: ItemDef, owned: string[]): number {
  // Component discount mirrors the sim's tryBuy rule.
  if (def.buildsFrom && owned.includes(def.buildsFrom)) {
    return def.cost - (ITEMS[def.buildsFrom]?.cost ?? 0);
  }
  return def.cost;
}

function DeathShop({ runtime }: { runtime: () => MatchRuntime | null }): React.ReactElement | null {
  const champ = useHud((s) => s.champion);
  if (!champ) return null;
  const tiers: [string, ItemDef[]][] = [1, 2, 3].map((t) => [
    `Tier ${t}`,
    Object.values(ITEMS).filter((i) => i.tier === t),
  ]);
  return (
    <div className="death-shop">
      <div className="ds-head">
        <h2 className="wordmark" style={{ fontSize: '1.9rem' }}>
          Respawning <span className="clash">{champ.respawnIn.toFixed(1)}s</span>
        </h2>
        <p className="ds-sub">
          {STRINGS.shopTitle} — {STRINGS.shopHint}
        </p>
      </div>
      <div className="ds-grid">
        {tiers.map(([label, list]) => (
          <div key={label} className="ds-col">
            <div className="section-label on-dark">{label}</div>
            {list.map((def) => {
              const owned = champ.items.includes(def.id);
              const cost = effectiveCost(def, champ.items);
              const afford = champ.gold >= cost && champ.items.length < 6;
              return (
                <button
                  key={def.id}
                  type="button"
                  className={`ds-item ${owned ? 'owned' : ''} ${afford || owned ? '' : 'dim'}`}
                  disabled={owned}
                  title={def.passive?.description ?? ''}
                  onClick={() => {
                    uiSound('ui_click');
                    runtime()?.buy(def.id);
                  }}
                >
                  <span
                    className="ic"
                    style={{
                      maskImage: `url(/icons/${def.icon}.svg)`,
                      WebkitMaskImage: `url(/icons/${def.icon}.svg)`,
                    }}
                  />
                  <span className="ds-nm">{def.name}</span>
                  <span className="cost">
                    {owned ? (
                      STRINGS.shopOwned
                    ) : (
                      <>
                        <span className="coin">⬢</span>
                        {cost}
                        {cost !== def.cost && <s>{def.cost}</s>}
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        <div className="ds-col">
          <div className="section-label on-dark">Relics</div>
          {Object.values(RELICS).map((def) => {
            const owned = champ.relic?.id === def.id;
            const afford = champ.gold >= def.cost && !champ.relic;
            return (
              <button
                key={def.id}
                type="button"
                className={`ds-item ${owned ? 'owned' : ''} ${afford || owned ? '' : 'dim'}`}
                disabled={owned || champ.relic !== null}
                title={def.description}
                onClick={() => {
                  uiSound('ui_click');
                  runtime()?.buyRelic(def.id);
                }}
              >
                <span
                  className="ic"
                  style={{
                    maskImage: `url(/icons/${def.icon}.svg)`,
                    WebkitMaskImage: `url(/icons/${def.icon}.svg)`,
                  }}
                />
                <span className="ds-nm">{def.name}</span>
                <span className="cost">
                  {owned ? (
                    STRINGS.shopOwned
                  ) : (
                    <>
                      <span className="coin">⬢</span>
                      {def.cost}
                    </>
                  )}
                </span>
              </button>
            );
          })}
          {champ.items.length > 0 && (
            <>
              <div className="section-label on-dark" style={{ marginTop: 10 }}>
                {STRINGS.shopSell} (70%)
              </div>
              <div className="ds-sellrow">
                {champ.items.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="ds-sell"
                    title={`${STRINGS.shopSell} ${ITEMS[id]?.name}`}
                    onClick={() => {
                      uiSound('ui_back');
                      runtime()?.sell(id);
                    }}
                  >
                    <span
                      className="ic"
                      style={{
                        maskImage: `url(/icons/${ITEMS[id]?.icon}.svg)`,
                        WebkitMaskImage: `url(/icons/${ITEMS[id]?.icon}.svg)`,
                      }}
                    />
                    ✕
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="ds-gold">
        <span className="coin">⬢</span> {champ.gold.toLocaleString()}
      </div>
    </div>
  );
}

function ShopToast(): React.ReactElement | null {
  const msg = useHud((s) => s.shopMsg);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!msg || msg.ok) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 1200);
    return () => clearTimeout(t);
  }, [msg]);
  if (!show || !msg || msg.ok) return null;
  const text =
    msg.reason === 'gold'
      ? STRINGS.shopNoGold
      : msg.reason === 'slots'
        ? STRINGS.shopNoSlots
        : msg.reason === 'zone'
          ? STRINGS.shopZone
          : 'Unavailable';
  return (
    <div className="deny-flash" key={msg.at}>
      <span>{text}</span>
    </div>
  );
}

/* ------------------------------- Scoreboard -------------------------------- */

function Scoreboard(): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const seats = useHud((s) => s.seats);
  const match = useHud((s) => s.match);
  const selfPlayer = useHud((s) => s.selfPlayer);
  const selfTeam = useHud((s) => s.selfTeam);
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setOpen(true);
      }
    };
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'Tab') setOpen(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  if (!open || !match) return null;
  return (
    <div className="scoreboard">
      {[selfTeam, 1 - selfTeam].map((team) => (
        <div key={team} className={`sb-team ${team === selfTeam ? 'ally' : 'enemy'}`}>
          <div className="sb-head">
            <span>{team === selfTeam ? STRINGS.selectYourTeam : STRINGS.selectEnemyTeam}</span>
            <span className="sb-score">
              {match.teamKills[team]} ⚔ · {match.towersDown[1 - team]} 🏰
            </span>
          </div>
          {seats
            .filter((s) => s.team === team)
            .map((s) => (
              <div key={s.player} className={`sb-row ${s.player === selfPlayer ? 'self' : ''}`}>
                <span className="fchip" style={{ background: CHAMP_TONE[s.championId] ?? '#555' }}>
                  {s.visible || team === selfTeam ? champLetter(s.championId) : '?'}
                </span>
                <span className="sb-name">
                  {s.player === selfPlayer ? 'You' : s.name}
                  {!s.visible && <i className="sb-hidden"> hidden</i>}
                </span>
                <span className="sb-lv">{s.level}</span>
                <span className="sb-kda">
                  {s.kills}/{s.deaths}/{s.assists}
                </span>
                <span className="sb-items">
                  {s.items.map((id) => (
                    <span
                      key={id}
                      className="ic"
                      style={{
                        maskImage: `url(/icons/${ITEMS[id]?.icon}.svg)`,
                        WebkitMaskImage: `url(/icons/${ITEMS[id]?.icon}.svg)`,
                      }}
                    />
                  ))}
                </span>
                <span className="sb-gold">⬢ {s.gold.toLocaleString()}</span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- Ping wheel -------------------------------- */

const WHEEL: { kind: PingKind; label: string; color: string; angle: number }[] = [
  { kind: 'danger', label: 'Danger', color: '#ff5a3c', angle: -90 },
  { kind: 'attack', label: 'Attack', color: '#ffc72e', angle: 0 },
  { kind: 'help', label: 'Help', color: '#6fe0a8', angle: 90 },
  { kind: 'omw', label: 'On my way', color: '#3ba7ff', angle: 180 },
];

function PingWheel({ runtime }: { runtime: () => MatchRuntime | null }): React.ReactElement | null {
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);
  const [pick, setPick] = useState<PingKind | null>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const pickRef = useRef<PingKind | null>(null);
  pickRef.current = pick;

  useEffect(() => {
    const move = (e: PointerEvent): void => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };
    const down = (e: KeyboardEvent): void => {
      if (e.code !== 'KeyG' || e.repeat) return;
      setCenter({ ...mouse.current });
      setPick(null);
    };
    const up = (e: KeyboardEvent): void => {
      if (e.code !== 'KeyG') return;
      if (pickRef.current) runtime()?.ping(pickRef.current);
      setCenter(null);
      setPick(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [runtime]);

  useEffect(() => {
    if (!center) return;
    const iv = setInterval(() => {
      const dx = mouse.current.x - center.x;
      const dy = mouse.current.y - center.y;
      if (Math.hypot(dx, dy) < 18) {
        setPick(null);
        return;
      }
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0 = right
      const best = WHEEL.reduce((a, b) => {
        const da = Math.min(Math.abs(deg - a.angle), 360 - Math.abs(deg - a.angle));
        const db = Math.min(Math.abs(deg - b.angle), 360 - Math.abs(deg - b.angle));
        return db < da ? b : a;
      });
      setPick(best.kind);
    }, 40);
    return () => clearInterval(iv);
  }, [center]);

  if (!center) return null;
  return (
    <div className="ping-wheel" style={{ left: center.x, top: center.y }}>
      {WHEEL.map((w) => (
        <div
          key={w.kind}
          className={`pw-opt ${pick === w.kind ? 'on' : ''}`}
          style={{
            transform: `rotate(${w.angle}deg) translateX(64px) rotate(${-w.angle}deg) translate(-50%, -50%)`,
            borderColor: w.color,
            color: w.color,
          }}
        >
          {w.label}
        </div>
      ))}
      <div className="pw-hub" />
    </div>
  );
}

/* ------------------------------- Coach marks -------------------------------- */

const FTUE_KEY = 'mc.ftue.bridge';

function CoachMarks({ dead }: { dead: boolean }): React.ReactElement | null {
  const [step, setStep] = useState(() => (localStorage.getItem(FTUE_KEY) ? -1 : 0));
  const [deathSeen, setDeathSeen] = useState(false);

  // Steps 0/1/2 auto-advance; the shop mark waits for the first death.
  useEffect(() => {
    if (step < 0 || step > 2) return;
    const t = setTimeout(() => setStep((v) => v + 1), 5600);
    return () => clearTimeout(t);
  }, [step]);
  useEffect(() => {
    if (step === 3 && !deathSeen) {
      localStorage.setItem(FTUE_KEY, '1');
    }
  }, [step, deathSeen]);
  useEffect(() => {
    if (dead && step >= 3 && !deathSeen) {
      setDeathSeen(true);
      const t = setTimeout(() => setDeathSeen(false), 6000);
      return () => clearTimeout(t);
    }
  }, [dead, step, deathSeen]);

  const text =
    step === 0
      ? 'Right-click to move · A to attack-move'
      : step === 1
        ? 'Q, W and R cast toward your cursor'
        : step === 2
          ? 'Hold G to ping your team — bots listen'
          : null;
  if (text) {
    return (
      <div className="coach-mark">
        <span>{text}</span>
      </div>
    );
  }
  if (dead && deathSeen) {
    return (
      <div className="coach-mark low">
        <span>Death is shop time — spend your gold</span>
      </div>
    );
  }
  return null;
}

/* ------------------------------ End sequence -------------------------------- */

interface HistoryEntry {
  at: number;
  result: 'victory' | 'defeat';
  duration: number;
  kills: [number, number];
  myChampion: string;
  seats: { championId: string; name: string; team: number; k: number; d: number; a: number }[];
}

function writeHistory(entry: HistoryEntry): void {
  try {
    const raw = localStorage.getItem('mc.history');
    const list = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    list.unshift(entry);
    localStorage.setItem('mc.history', JSON.stringify(list.slice(0, 30)));
  } catch {
    // storage may be unavailable (private mode) — history is best-effort
  }
}

function EndSequence(): React.ReactElement | null {
  const goto = useSession((s) => s.goto);
  const match = useHud((s) => s.match);
  const seats = useHud((s) => s.seats);
  const champ = useHud((s) => s.champion);
  const selfPlayer = useHud((s) => s.selfPlayer);
  const selfTeam = useHud((s) => s.selfTeam);
  const [phase, setPhase] = useState<'slab' | 'podium' | 'summary'>('slab');
  const wrote = useRef(false);

  const won = match?.winner === selfTeam;

  useEffect(() => {
    const t = setTimeout(() => setPhase('podium'), 2400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (wrote.current || !match || !champ) return;
    wrote.current = true;
    writeHistory({
      at: Date.now(),
      result: won ? 'victory' : 'defeat',
      duration: match.time,
      kills: match.teamKills,
      myChampion: champ.championId,
      seats: seats.map((s) => ({
        championId: s.championId,
        name: s.player === selfPlayer ? 'You' : s.name,
        team: s.team,
        k: s.kills,
        d: s.deaths,
        a: s.assists,
      })),
    });
  }, [match, champ, seats, won, selfPlayer]);

  // MVP score: kills weigh triple, assists ×1.5, deaths subtract; level breaks ties.
  const podium = useMemo(() => {
    const scored = seats
      .map((s) => ({ s, score: s.kills * 3 + s.assists * 1.5 - s.deaths + s.level * 0.5 }))
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 3);
  }, [seats]);

  if (!match) return null;

  if (phase === 'slab') {
    return (
      <div className={`end-veil slab ${won ? 'won' : 'lost'}`}>
        <h1 className="wordmark end-slab">{won ? STRINGS.victory : STRINGS.defeat}</h1>
      </div>
    );
  }

  if (phase === 'podium') {
    return (
      <div className="end-veil backdrop-dark">
        <h1 className="wordmark" style={{ fontSize: '2.6rem' }}>
          {won ? STRINGS.victory : STRINGS.defeat}
        </h1>
        <div className="podium">
          {podium.map(({ s }, i) => (
            <div
              key={s.player}
              className={`podium-card ${i === 0 ? 'mvp' : ''}`}
              style={{ background: CHAMP_TONE[s.championId] ?? '#555' }}
            >
              {i === 0 && <span className="crown">{STRINGS.mvp}</span>}
              <span className="big">{champLetter(s.championId)}</span>
              <span className="who">{s.player === selfPlayer ? 'You' : s.name}</span>
              <span className="kda">
                {s.kills} / {s.deaths} / {s.assists}
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            uiSound('ui_click');
            setPhase('summary');
          }}
        >
          {STRINGS.continueLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="end-veil backdrop-dark">
      <h2 className="menu-heading" style={{ color: '#fff' }}>
        {STRINGS.matchSummary}
      </h2>
      <p style={{ opacity: 0.75 }}>
        {match.teamKills[0]} — {match.teamKills[1]} · {fmtClock(match.time)}
      </p>
      <div className="summary-table">
        {[selfTeam, 1 - selfTeam].map((team) => (
          <div key={team} className={`sb-team ${team === selfTeam ? 'ally' : 'enemy'}`}>
            <div className="sb-head">
              <span>{team === selfTeam ? STRINGS.selectYourTeam : STRINGS.selectEnemyTeam}</span>
            </div>
            {seats
              .filter((s) => s.team === team)
              .map((s) => (
                <div key={s.player} className={`sb-row ${s.player === selfPlayer ? 'self' : ''}`}>
                  <span
                    className="fchip"
                    style={{ background: CHAMP_TONE[s.championId] ?? '#555' }}
                  >
                    {champLetter(s.championId)}
                  </span>
                  <span className="sb-name">{s.player === selfPlayer ? 'You' : s.name}</span>
                  <span className="sb-lv">{s.level}</span>
                  <span className="sb-kda">
                    {s.kills}/{s.deaths}/{s.assists}
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 12, marginTop: 18 }}>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            uiSound('ui_click');
            // Lobby matches re-queue through the lobby (same party, new deal).
            if (useLobby.getState().status === 'in') {
              useSession.getState().setMatchJoin(null);
              goto('lobby');
            } else {
              goto('select');
            }
          }}
        >
          {STRINGS.playAgain}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            uiSound('ui_back');
            useSession.getState().setMatchJoin(null);
            goto('hub');
          }}
        >
          Hub
        </button>
      </div>
    </div>
  );
}
