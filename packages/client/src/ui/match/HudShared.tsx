import { CHAMPIONS, type Slot, TAG_SWAP } from '@mini-clash/data';
import { useEffect, useState } from 'react';
import { type HudChampion, useHud } from '../../game/hudStore';
import { AugmentStrip } from './DraftOverlay';

/** HUD pieces shared by every mode: champion cluster, ability slots, deny flash, death veil. */

const SLOT_KEYS: Record<Slot, string> = { q: 'Q', w: 'W', r: 'R' };

/** game-icons.net glyphs (CC BY 3.0 — see CREDITS.md), recolored via CSS mask.
 * Boltz's and Wisp's six are original project glyphs drawn in the same language. */
export const SLOT_ICONS: Record<string, Record<Slot, string>> = {
  rook: { q: 'sword-clash', w: 'brick-wall', r: 'tower-fall' },
  fathom: { q: 'cannon-ball', w: 'barrel', r: 'galleon' },
  mortis: { q: 'ink-swirl', w: 'grasping-claws', r: 'vortex' },
  rattle: { q: 'thrown-daggers', w: 'skull-staff', r: 'backstab' },
  grukk: { q: 'barbed-spear', w: 'shouting', r: 'quake-stomp' },
  sylva: { q: 'thorny-vine', w: 'flower-emblem', r: 'vine-whip' },
  boltz: { q: 'arc-beam', w: 'energy-dome', r: 'drop-pod' },
  wisp: { q: 'boo-face', w: 'sheet-decoy', r: 'midnight-gong' },
};

export function AbilitySlot({ slot, champ }: { slot: Slot; champ: string }): React.ReactElement {
  const hud = useHud((s) => s.champion);
  const [flash, setFlash] = useState(false);
  const [wasOnCd, setWasOnCd] = useState(false);
  const def = CHAMPIONS[champ];
  const ability = def.abilities[slot];
  const cd = hud?.cooldowns[slot] ?? 0;
  const energy = hud?.energy ?? 0;
  const isRecast = hud?.recastSlot === slot;
  const rGated = slot === 'r' && (hud?.level ?? 1) < 4;

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
      className={`ability ${slot === 'r' ? 'r-slot' : ''} ${flash ? 'ready-flash' : ''} ${gated || rGated ? 'noenergy' : ''}`}
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
      <span className="key">{rGated ? '4' : SLOT_KEYS[slot]}</span>
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

/** Bottom-center: portrait + HP/Energy bars + ability row. */
/**
 * Duo panel (UI_UX §8): the active portrait with the benched champion tucked
 * behind it, ringed by the 9 s swap radial. The bench glints when one of its
 * abilities is ready and you can afford it — decision support, not noise.
 */
function DuoPanel({ champ }: { champ: HudChampion }): React.ReactElement | null {
  const duo = champ.duo;
  if (!duo) return null;
  const benchDef = CHAMPIONS[duo.championId];
  const ready = duo.swapCd <= 0.001;
  const deg = ready ? 360 : (1 - duo.swapCd / TAG_SWAP.cooldown) * 360;
  // Glint when the bench brings something castable to the table right now.
  const glint =
    ready &&
    (['q', 'w', 'r'] as Slot[]).some(
      (sl) => duo.cooldowns[sl] <= 0.001 && duo.energy >= benchDef.abilities[sl].cost,
    );
  return (
    <div
      className={`duo-panel ${ready ? 'ready' : ''} ${glint ? 'glint' : ''}`}
      title={`${benchDef.name} on the bench — Space to Tag Swap`}
    >
      <div
        className="duo-bench"
        style={{
          background: `linear-gradient(150deg, #${benchDef.visual.portraitColor.toString(16).padStart(6, '0')}, #131a2c)`,
        }}
      >
        {benchDef.name.slice(0, 1)}
      </div>
      <div
        className="duo-ring"
        style={{
          background: `conic-gradient(var(--gold) ${deg}deg, rgba(255,255,255,0.10) 0deg)`,
        }}
      />
      <span className="duo-key">{ready ? 'SPACE' : duo.swapCd.toFixed(1)}</span>
      <span className="duo-energy">
        <span style={{ height: `${duo.energy}%` }} />
      </span>
    </div>
  );
}

export function ChampionCluster(): React.ReactElement | null {
  const champ = useHud((s) => s.champion);
  if (!champ) return null;
  const def = CHAMPIONS[champ.championId];
  return (
    <div className="hud-bottom">
      <AugmentStrip />
      <DuoPanel champ={champ} />
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
  );
}

/** Cast-denied toast (drives itself from the store timestamp). */
export function DenyFlash(): React.ReactElement | null {
  const deniedAt = useHud((s) => s.deniedAt);
  const deniedReason = useHud((s) => s.deniedReason);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (deniedAt === 0) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 800);
    return () => clearTimeout(t);
  }, [deniedAt]);

  if (!show) return null;
  return (
    <div className="deny-flash" key={deniedAt}>
      <span>
        {deniedReason === 'energy'
          ? 'Not enough energy'
          : deniedReason === 'cooldown'
            ? 'Not ready'
            : deniedReason === 'level'
              ? 'Unlocks at level 4'
              : 'Unavailable'}
      </span>
    </div>
  );
}
