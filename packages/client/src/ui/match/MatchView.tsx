import { BRIDGE, CHAMPIONS, STRINGS } from '@mini-clash/data';
import { useEffect, useRef, useState } from 'react';
import { uiSound } from '../../game/audio';
import { useHud } from '../../game/hudStore';
import { MatchRuntime } from '../../game/match';
import { useSession } from '../../state/session';
import { SettingsModal } from '../SettingsModal';
import { BridgeHud } from './BridgeHud';
import { TrainingHud } from './TrainingHud';

/** The match screen: canvas + loading veil + HUD + Esc menu. */
export function MatchView(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<MatchRuntime | null>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const championId = useSession((s) => s.trainingChampion);
  const mode = useSession((s) => s.matchMode);
  const lineup = useSession((s) => s.bridgeLineup);
  const goto = useSession((s) => s.goto);
  const matchTime = useHud((s) => s.match?.time ?? 0);
  const matchOver = useHud((s) => s.match?.over ?? false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the runtime owns champion switching after boot — never restart the match on championId change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const runtime = new MatchRuntime();
    runtimeRef.current = runtime;
    runtime.onEscape = () => setMenuOpen((v) => !v);
    let alive = true;
    const myChampion = mode === 'bridge' ? (lineup?.[0]?.championId ?? championId) : championId;
    // Lobby matches always ride the socket (seat reservation from the lobby);
    // ?online=1 additionally routes solo bridge matches through the server.
    const join = useSession.getState().matchJoin;
    const net =
      mode === 'bridge' &&
      (join !== null || new URLSearchParams(window.location.search).get('online') === '1')
        ? ('socket' as const)
        : ('worker' as const);
    const name = useSession.getState().profile?.name;
    runtime
      .start(
        canvas,
        myChampion,
        (p) => alive && setProgress(p),
        mode,
        lineup ?? undefined,
        net,
        join ? { ...join, name } : undefined,
      )
      .then(() => alive && setReady(true))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
      runtime.dispose();
      runtimeRef.current = null;
      // A lobby handoff is one match only — the next round mints a new token.
      useSession.getState().setMatchJoin(null);
    };
  }, []);

  return (
    <div className="match-root">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />

      {ready &&
        (mode === 'bridge' ? (
          <BridgeHud runtime={() => runtimeRef.current} />
        ) : (
          <TrainingHud runtime={() => runtimeRef.current} />
        ))}

      {(!ready || error) && (
        <div className="loading-veil backdrop-dark">
          <div className="screen" style={{ position: 'static' }}>
            <h1 className="wordmark" style={{ fontSize: '3rem' }}>
              {mode === 'bridge' ? 'BRIDGE BRAWL' : STRINGS.training}
            </h1>
            {mode === 'bridge' && lineup && !error && (
              <div className="load-lineup">
                {lineup
                  .filter((p) => p.team === 0)
                  .map((p) => (
                    <div key={p.id} className="load-card">
                      <span className="ltr">
                        {CHAMPIONS[p.championId].name.slice(0, 1)}
                        {p.benchId && (
                          <span className="ltr-bench">{CHAMPIONS[p.benchId].name.slice(0, 1)}</span>
                        )}
                      </span>
                      <span className="who">{p.bot ? (p.name ?? 'Bot') : 'You'}</span>
                    </div>
                  ))}
              </div>
            )}
            {error ? (
              <>
                <div className="panel" style={{ maxWidth: 420, textAlign: 'center' }}>
                  <p>Couldn’t start the arena: {error}</p>
                </div>
                <button type="button" className="btn primary" onClick={() => goto('hub')}>
                  {STRINGS.back}
                </button>
              </>
            ) : (
              <div className="boot-bar">
                <div style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
          </div>
        </div>
      )}

      {menuOpen && !settingsOpen && (
        <div
          className="modal-veil"
          onPointerDown={(e) => e.target === e.currentTarget && setMenuOpen(false)}
        >
          <div className="panel esc-menu col">
            <h2>{STRINGS.appName}</h2>
            <div className="col">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  uiSound('ui_click');
                  setMenuOpen(false);
                }}
              >
                {STRINGS.resume}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  uiSound('ui_click');
                  setSettingsOpen(true);
                }}
              >
                ⚙ {STRINGS.settings}
              </button>
              {mode === 'bridge' && !matchOver && (
                <button
                  type="button"
                  className="btn"
                  disabled={matchTime < BRIDGE.surrenderAt}
                  title={matchTime < BRIDGE.surrenderAt ? STRINGS.surrenderGate : undefined}
                  style={matchTime < BRIDGE.surrenderAt ? { opacity: 0.45 } : undefined}
                  onClick={() => {
                    uiSound('ui_back');
                    runtimeRef.current?.surrender();
                    setMenuOpen(false);
                  }}
                >
                  🏳 {STRINGS.surrender}
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => {
                  uiSound('ui_back');
                  goto('hub');
                }}
              >
                {STRINGS.leaveMatch}
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <SettingsModal
          onClose={() => {
            setSettingsOpen(false);
            setMenuOpen(false);
          }}
        />
      )}
    </div>
  );
}
