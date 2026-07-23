import { CHAMPION_LIST, STRINGS } from '@mini-clash/data';
import { useState } from 'react';
import { uiSound } from '../game/audio';
import { useSession } from '../state/session';
import { SettingsModal } from './SettingsModal';

const ROLE_EMOJI: Record<string, string> = {
  vanguard: '🛡',
  gunner: '🏴‍☠️',
  caster: '💀',
  support: '🌿',
};

export function HubScreen(): React.ReactElement {
  const profile = useSession((s) => s.profile);
  const goto = useSession((s) => s.goto);
  const champion = useSession((s) => s.trainingChampion);
  const setChampion = useSession((s) => s.setTrainingChampion);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="screen" style={{ justifyContent: 'flex-start', paddingTop: '5.5rem' }}>
      <div className="hub-topbar">
        <div className="profile-chip">
          <div className="avatar">{profile?.name.slice(0, 1).toUpperCase() ?? '?'}</div>
          {profile?.name}
        </div>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            uiSound('ui_click');
            setSettingsOpen(true);
          }}
        >
          ⚙ {STRINGS.settings}
        </button>
      </div>

      <div className="hub-center">
        <h1 className="title-hero" style={{ fontSize: '3.4rem' }}>
          MINI <span className="clash">CLASH</span>
        </h1>

        <div className="champ-pick">
          {CHAMPION_LIST.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`champ-card ${champion === c.id ? 'sel' : ''}`}
              onClick={() => {
                uiSound('ui_hover');
                setChampion(c.id);
              }}
            >
              <div
                className="face"
                style={{
                  background: `linear-gradient(145deg, #${c.visual.portraitColor.toString(16).padStart(6, '0')}, #1c2438)`,
                }}
              >
                {ROLE_EMOJI[c.role] ?? '⚔'}
              </div>
              <h3>{c.name}</h3>
              <div className="role">{c.role}</div>
            </button>
          ))}
        </div>

        <div className="row" style={{ alignItems: 'stretch' }}>
          <button
            type="button"
            className="mode-card"
            onClick={() => {
              uiSound('ui_click');
              goto('match');
            }}
          >
            <h3>🎯 {STRINGS.training}</h3>
            <span className="subtle">{STRINGS.trainingDesc}</span>
            <div>
              <span className="tag">PLAY NOW</span>
            </div>
          </button>
          <div className="mode-card locked" aria-disabled>
            <h3>⚔ Bridge Brawl vs Bots</h3>
            <span className="subtle">The full 4v4 ARAM on the Shatterbridge.</span>
            <div>
              <span className="tag">v0.2 — {STRINGS.comingSoon}</span>
            </div>
          </div>
          <div className="mode-card locked" aria-disabled>
            <h3>🌐 Play with friends</h3>
            <span className="subtle">Custom lobbies with invite codes.</span>
            <div>
              <span className="tag">v0.3 — {STRINGS.comingSoon}</span>
            </div>
          </div>
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
