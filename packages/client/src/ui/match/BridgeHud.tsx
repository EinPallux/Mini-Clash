import { STRINGS } from '@mini-clash/data';
import { uiSound } from '../../game/audio';
import { useHud } from '../../game/hudStore';
import type { MatchRuntime } from '../../game/match';
import { useSession } from '../../state/session';
import { ChampionCluster, DenyFlash } from './HudShared';

/**
 * Bridge Brawl HUD (v0.2 scope): match strip (clock, kills, towers, orb timer,
 * escalation banners), champion cluster, death veil, end-of-match veil.
 * Killfeed, Tab scoreboard and the death-screen shop land with the HUD pass.
 */

function fmtClock(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function BridgeHud({ runtime }: { runtime: () => MatchRuntime | null }): React.ReactElement {
  void runtime;
  const champ = useHud((s) => s.champion);
  const match = useHud((s) => s.match);
  const fps = useHud((s) => s.fps);
  const goto = useSession((s) => s.goto);

  if (!champ || !match) return <div className="hud" />;

  const banner = match.suddenDeath ? 'SUDDEN DEATH' : match.overtime ? 'OVERTIME' : null;
  const won = match.winner === 0;

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

      <div className="hud-topleft">
        <span className="hud-chip" style={{ opacity: 0.65 }}>
          {fps} fps
        </span>
      </div>

      <DenyFlash />
      <ChampionCluster />

      <div className="keyhint">
        <span className="cap">ESC</span>
        <span className="lbl">Menu</span>
      </div>

      {/* death veil (suppressed once the match is decided) */}
      {champ.dead && !match.over && (
        <div className="loading-veil" style={{ background: 'rgba(10, 6, 10, 0.55)' }}>
          <div className="screen" style={{ position: 'static' }}>
            <h1 className="wordmark" style={{ fontSize: '2.6rem' }}>
              Respawning <span className="clash">{champ.respawnIn.toFixed(1)}s</span>
            </h1>
          </div>
        </div>
      )}

      {/* end of match — podium + summary arrive with the HUD pass */}
      {match.over && (
        <div className="loading-veil backdrop-dark" style={{ background: 'rgba(8, 8, 14, 0.82)' }}>
          <div className="screen" style={{ position: 'static' }}>
            <h1 className="wordmark" style={{ fontSize: '4rem' }}>
              {won ? 'VICTORY' : 'DEFEAT'}
            </h1>
            <p style={{ opacity: 0.8, marginTop: 4 }}>
              {match.teamKills[0]} — {match.teamKills[1]} · {fmtClock(match.time)}
            </p>
            <button
              type="button"
              className="btn primary"
              style={{ marginTop: 18 }}
              onClick={() => {
                uiSound('ui_click');
                goto('hub');
              }}
            >
              {STRINGS.back}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
