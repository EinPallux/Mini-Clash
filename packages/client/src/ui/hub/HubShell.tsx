import { useEffect } from 'react';
import { uiSound } from '../../game/audio';
import { useAccount } from '../../state/account';
import { useSession } from '../../state/session';

/**
 * The hub's chrome (UI_UX §13): nav, coin purse, and the honest status line.
 *
 * The status line is the part worth being careful about. Offline and signed-out
 * play are both fully supported — Training and vs-bots never needed an account
 * — so the hub does not nag or block. It states plainly that nothing is being
 * recorded, because a player who grinds twenty matches and finds no coins waited
 * for them has been misled, and a banner is cheaper than that.
 */

export type HubTab = 'play' | 'champions' | 'shop' | 'quests' | 'history' | 'profile';

const TABS: { id: HubTab; label: string }[] = [
  { id: 'play', label: 'Play' },
  { id: 'champions', label: 'Champions' },
  { id: 'shop', label: 'Store' },
  { id: 'quests', label: 'Quests' },
  { id: 'history', label: 'History' },
  { id: 'profile', label: 'Profile' },
];

interface Props {
  tab: HubTab;
  onTab: (tab: HubTab) => void;
  onSettings: () => void;
  children: React.ReactNode;
}

export function HubShell({ tab, onTab, onSettings, children }: Props): React.ReactElement {
  const status = useAccount((s) => s.status);
  const user = useAccount((s) => s.user);
  const profile = useAccount((s) => s.profile);
  const localProfile = useSession((s) => s.profile);
  const name = user?.name ?? localProfile?.name ?? 'Guest';
  const coins = profile?.coins ?? 0;

  return (
    <div className="hub-root backdrop-light">
      <nav className="top-nav">
        <div className="brand">
          <span className="mark">◢◤</span> MINI CLASH
        </div>
        <div className="nav-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`nav-tab${t.id === tab ? ' active' : ''}`}
              aria-current={t.id === tab ? 'page' : undefined}
              onClick={() => {
                if (t.id === tab) return;
                uiSound('ui_click');
                onTab(t.id);
              }}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="nav-right">
          <span className="nav-chip" title="Clash Coins">
            <span className="coin">⬢</span> {coins.toLocaleString()}
          </span>
          <button type="button" className="nav-chip" aria-label="Settings" onClick={onSettings}>
            ⚙
          </button>
          <button
            type="button"
            className="profile-tile"
            onClick={() => {
              uiSound('ui_click');
              onTab('profile');
            }}
          >
            <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>
            <span className="pt-name">{name}</span>
            {profile ? <span className="pt-level">Lv {profile.level}</span> : null}
          </button>
        </div>
      </nav>

      <StatusLine status={status} kind={user?.kind ?? null} onProfile={() => onTab('profile')} />
      <div className="hub-content">{children}</div>
    </div>
  );
}

function StatusLine({
  status,
  kind,
  onProfile,
}: {
  status: string;
  kind: string | null;
  onProfile: () => void;
}): React.ReactElement | null {
  if (status === 'offline') {
    return (
      <div className="hub-status warn" role="status">
        <strong>Offline.</strong> Training and matches versus bots work as normal — coins, quests
        and match history are paused until we can reach the servers again.
      </div>
    );
  }
  if (status === 'signedOut') {
    return (
      <div className="hub-status" role="status">
        <strong>Not signed in.</strong> You can play, but nothing is being saved.{' '}
        <button type="button" className="link-btn" onClick={onProfile}>
          Sign in
        </button>
      </div>
    );
  }
  if (kind === 'guest') {
    return (
      <div className="hub-status subtle-line" role="status">
        Playing as a guest — everything you earn is saved on this device.{' '}
        <button type="button" className="link-btn" onClick={onProfile}>
          Add an email
        </button>{' '}
        to keep it if you switch browsers.
      </div>
    );
  }
  return null;
}

/**
 * Rewards land only for matches the server itself simulated (ROADMAP v0.7).
 * Shown next to the Play buttons rather than buried in a help page.
 */
export function OfflineRewardNote(): React.ReactElement | null {
  const status = useAccount((s) => s.status);
  if (status === 'ready') return null;
  return <p className="reward-note">Offline and vs-bots matches do not earn coins or quests.</p>;
}

/** Scroll a hub panel to the top whenever the tab changes. */
export function useScrollReset(key: unknown): void {
  useEffect(() => {
    if (key === undefined) return;
    document.querySelector('.hub-content')?.scrollTo({ top: 0 });
  }, [key]);
}
