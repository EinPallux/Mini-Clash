import { CHAMPION_LIST, CHAMPIONS, type Slot, STRINGS } from '@mini-clash/data';
import { useEffect, useState } from 'react';
import { uiSound } from '../../game/audio';
import { useHud } from '../../game/hudStore';
import type { MatchRuntime } from '../../game/match';

const SLOT_KEYS: Record<Slot, string> = { q: 'Q', w: 'W', r: 'R' };

export function TrainingHud({
  runtime,
}: {
  runtime: () => MatchRuntime | null;
}): React.ReactElement {
  const champ = useHud((s) => s.champion);
  const dummies = useHud((s) => s.dummies);
  const fps = useHud((s) => s.fps);
  const deniedAt = useHud((s) => s.deniedAt);
  const deniedReason = useHud((s) => s.deniedReason);
  const noCooldowns = useHud((s) => s.noCooldowns);
  const infiniteEnergy = useHud((s) => s.infiniteEnergy);
  const setFlags = useHud((s) => s.setFlags);
  const [showDeny, setShowDeny] = useState(false);

  useEffect(() => {
    if (deniedAt === 0) return;
    setShowDeny(true);
    const t = setTimeout(() => setShowDeny(false), 800);
    return () => clearTimeout(t);
  }, [deniedAt]);

  if (!champ) return <div className="hud" />;
  const def = CHAMPIONS[champ.championId];

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

      {/* cast-denied feedback */}
      {showDeny && (
        <div className="deny-flash" key={deniedAt}>
          <span>
            {deniedReason === 'energy'
              ? 'Not enough energy'
              : deniedReason === 'cooldown'
                ? 'Not ready'
                : 'Unavailable'}
          </span>
        </div>
      )}

      {/* bottom-center: portrait + bars + abilities */}
      <div className="hud-bottom">
        <div
          className="portrait"
          style={{
            background: `linear-gradient(150deg, #${def.visual.portraitColor.toString(16).padStart(6, '0')}, #131a2c)`,
          }}
          title={`${def.name} — ${def.title}`}
        >
          {def.name.slice(0, 1)}
          <span className="lvl">{champ.level}</span>
        </div>
        <div className="col" style={{ gap: 8 }}>
          <div className="bars">
            <div className="bar hp">
              <div
                className="fill"
                style={{ transform: `scaleX(${Math.max(0, champ.hp / champ.hpMax)})` }}
              />
              <span className="txt">
                {champ.hp} / {champ.hpMax}
              </span>
            </div>
            <div className="bar energy">
              <div className="fill" style={{ transform: `scaleX(${champ.energy / 100})` }} />
              <span className="txt">{champ.energy}</span>
            </div>
          </div>
          <div className="ability-row">
            {(['q', 'w', 'r'] as Slot[]).map((slot) => (
              <AbilitySlot key={slot} slot={slot} champ={champ.championId} />
            ))}
          </div>
        </div>
      </div>

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

function AbilitySlot({ slot, champ }: { slot: Slot; champ: string }): React.ReactElement {
  const hud = useHud((s) => s.champion);
  const [flash, setFlash] = useState(false);
  const [wasOnCd, setWasOnCd] = useState(false);
  const def = CHAMPIONS[champ];
  const ability = def.abilities[slot];
  const cd = hud?.cooldowns[slot] ?? 0;
  const energy = hud?.energy ?? 0;
  const isRecast = hud?.recastSlot === slot;

  useEffect(() => {
    if (cd > 0.05) setWasOnCd(true);
    else if (wasOnCd) {
      setWasOnCd(false);
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 380);
      return () => clearTimeout(t);
    }
  }, [cd, wasOnCd]);

  const gated = ability.cost > 0 && energy < ability.cost && cd <= 0.05;

  return (
    <div
      className={`ability ${slot === 'r' ? 'r-slot' : ''} ${flash ? 'ready-flash' : ''} ${gated ? 'noenergy' : ''}`}
      title={`${ability.name} — ${ability.description}`}
      style={
        isRecast
          ? { borderColor: 'var(--gold)', boxShadow: '0 0 14px rgba(255,194,75,0.8)' }
          : undefined
      }
    >
      <span
        className="ability-icon"
        style={{
          maskImage: `url(/icons/${SLOT_ICONS[champ]?.[slot] ?? 'sword-clash'}.svg)`,
          WebkitMaskImage: `url(/icons/${SLOT_ICONS[champ]?.[slot] ?? 'sword-clash'}.svg)`,
        }}
      />
      {ability.cost > 0 && <span className="cost">⚡{ability.cost}</span>}
      <span className="key">{SLOT_KEYS[slot]}</span>
      {cd > 0.05 && (
        <div
          className="cd-wipe"
          style={{
            background: `conic-gradient(rgba(10,14,28,0.85) ${(cd / (hud?.cooldownMax[slot] ?? 1)) * 360}deg, rgba(10,14,28,0.25) 0deg)`,
          }}
        >
          {cd >= 1 ? Math.ceil(cd) : cd.toFixed(1)}
        </div>
      )}
    </div>
  );
}

/** game-icons.net glyphs (CC BY 3.0 — see CREDITS.md), recolored via CSS mask. */
const SLOT_ICONS: Record<string, Record<Slot, string>> = {
  rook: { q: 'sword-clash', w: 'brick-wall', r: 'tower-fall' },
  fathom: { q: 'cannon-ball', w: 'barrel', r: 'galleon' },
};
