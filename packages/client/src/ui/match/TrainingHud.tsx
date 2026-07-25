import { CHAMPION_LIST, STRINGS } from '@mini-clash/data';
import { uiSound } from '../../game/audio';
import { useHud } from '../../game/hudStore';
import type { MatchRuntime } from '../../game/match';
import { ChampionCluster, DenyFlash } from './HudShared';

export function TrainingHud({
  runtime,
}: {
  runtime: () => MatchRuntime | null;
}): React.ReactElement {
  const champ = useHud((s) => s.champion);
  const dummies = useHud((s) => s.dummies);
  const fps = useHud((s) => s.fps);
  const noCooldowns = useHud((s) => s.noCooldowns);
  const infiniteEnergy = useHud((s) => s.infiniteEnergy);
  const setFlags = useHud((s) => s.setFlags);

  if (!champ) return <div className="hud" />;

  return (
    <div className="hud">
      {/* top-left: champion switcher + fps */}
      <div className="hud-topleft">
        {CHAMPION_LIST.map((c) => (
          <button
            type="button"
            key={c.id}
            className={`hud-chip ${champ.championId === c.id ? 'on' : ''}`}
            onClick={() => {
              uiSound('ui_click');
              runtime()?.switchChampion(c.id);
            }}
          >
            {c.name}
          </button>
        ))}
        <span className="hud-chip" style={{ opacity: 0.65 }}>
          {fps} fps
        </span>
      </div>

      {/* top-right: trainer panel + dummy DPS */}
      <div className="hud-topright">
        <div className="trainer-panel">
          {/* Duo config (GAME_DESIGN §7.2): pick a bench and practise the swap
              against any pairing without leaving the Grounds. */}
          <h4>{STRINGS.trainerDuo}</h4>
          <div className="duo-config">
            <button
              type="button"
              className={`hud-chip ${champ.duo ? '' : 'on'}`}
              onClick={() => {
                uiSound('ui_click');
                runtime()?.setBench(null);
              }}
            >
              {STRINGS.trainerSolo}
            </button>
            {CHAMPION_LIST.filter((c) => c.id !== champ.championId).map((c) => (
              <button
                type="button"
                key={c.id}
                className={`hud-chip ${champ.duo?.championId === c.id ? 'on' : ''}`}
                onClick={() => {
                  uiSound('ui_click');
                  runtime()?.setBench(c.id);
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
          <p className="duo-config-hint">
            {champ.duo ? STRINGS.trainerDuoHint : STRINGS.trainerSoloHint}
          </p>
          <h4>{STRINGS.cheats}</h4>
          <div className="set-row">
            <span>{STRINGS.cheatCooldowns}</span>
            <button
              type="button"
              className={`toggle ${noCooldowns ? 'on' : ''}`}
              onClick={() => {
                uiSound('ui_click');
                const on = !noCooldowns;
                setFlags({ noCooldowns: on });
                runtime()?.trainer({ k: 'noCooldowns', on });
              }}
            />
          </div>
          <div className="set-row">
            <span>{STRINGS.cheatEnergy}</span>
            <button
              type="button"
              className={`toggle ${infiniteEnergy ? 'on' : ''}`}
              onClick={() => {
                uiSound('ui_click');
                const on = !infiniteEnergy;
                setFlags({ infiniteEnergy: on });
                runtime()?.trainer({ k: 'infiniteEnergy', on });
              }}
            />
          </div>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                uiSound('ui_click');
                runtime()?.trainer({ k: 'levelUp' });
              }}
            >
              {STRINGS.cheatLevelUp} ({champ.level})
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                uiSound('ui_click');
                runtime()?.trainer({ k: 'resetDummies' });
              }}
            >
              {STRINGS.cheatResetDummies}
            </button>
          </div>
        </div>
        {dummies.map((d) => (
          <div className="dummy-chip" key={d.id}>
            <span>{d.label}</span>
            <b>{d.active ? `${d.dps} ${STRINGS.dps}` : '—'}</b>
          </div>
        ))}
      </div>

      <DenyFlash />
      <ChampionCluster />

      <div className="keyhint">
        <span className="cap">ESC</span>
        <span className="lbl">Menu</span>
      </div>

      {/* death veil */}
      {champ.dead && (
        <div className="loading-veil" style={{ background: 'rgba(10, 6, 10, 0.55)' }}>
          <div className="screen" style={{ position: 'static' }}>
            <h1 className="wordmark" style={{ fontSize: '2.6rem' }}>
              Respawning <span className="clash">{champ.respawnIn.toFixed(1)}s</span>
            </h1>
          </div>
        </div>
      )}
    </div>
  );
}
