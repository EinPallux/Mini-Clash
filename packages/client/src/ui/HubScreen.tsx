import { CHAMPION_LIST, STRINGS } from '@mini-clash/data';
import { useEffect, useRef, useState } from 'react';
import { uiSound } from '../game/audio';
import { useLobby } from '../state/lobby';
import { useSession } from '../state/session';
import { SettingsModal } from './SettingsModal';

/** Main menu — hero-shooter chrome: dark top nav, light diamond backdrop, flat tiles. */

const ROLE_ICON: Record<string, string> = {
  vanguard: 'checked-shield',
  gunner: 'cannon-ball',
  caster: 'tower-fall',
  support: 'three-friends',
};

const CHAMP_THEME: Record<string, { from: string; to: string; line: string }> = {
  rook: { from: '#8a94a6', to: '#3d4656', line: '#aab6cc' },
  fathom: { from: '#2e5aa8', to: '#14274d', line: '#3ba7ff' },
  mortis: { from: '#6c4a8a', to: '#2a1a3d', line: '#b36bff' },
  rattle: { from: '#8a2f3c', to: '#3d1420', line: '#ff5a6b' },
  grukk: { from: '#4a7a3a', to: '#1f3a17', line: '#8ade6a' },
  sylva: { from: '#c47a3a', to: '#5c3417', line: '#ffb35c' },
};

export function HubScreen(): React.ReactElement {
  const profile = useSession((s) => s.profile);
  const goto = useSession((s) => s.goto);
  const champion = useSession((s) => s.trainingChampion);
  const setChampion = useSession((s) => s.setTrainingChampion);
  const setMatchMode = useSession((s) => s.setMatchMode);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const lobbyStatus = useLobby((s) => s.status);
  const lobbySnap = useLobby((s) => s.snap);
  const pendingCode = useLobby((s) => s.pendingCode);

  const play = (mode: 'training' | 'bridge'): void => {
    uiSound('ui_click');
    setMatchMode(mode);
    goto(mode === 'bridge' ? 'select' : 'match');
  };

  // ?join=CODE deep link: land in the join flow once (with the code prefilled).
  const consumedDeepLink = useRef(false);
  useEffect(() => {
    if (pendingCode && !consumedDeepLink.current && lobbyStatus === 'idle') {
      consumedDeepLink.current = true;
      setFriendsOpen(true);
    }
  }, [pendingCode, lobbyStatus]);

  useEffect(() => {
    // Ignore the Enter that submitted the name screen: React flushes this effect
    // while that keydown is still bubbling toward window, so it would instantly
    // launch a match the player never asked for.
    const mountedAt = performance.now();
    const onKey = (e: KeyboardEvent): void => {
      if (performance.now() - mountedAt < 300) return;
      if (e.code === 'Enter' && !settingsOpen && !friendsOpen) {
        uiSound('ui_click');
        setMatchMode('bridge');
        goto('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goto, setMatchMode, settingsOpen, friendsOpen]);

  return (
    <div className="hub-root backdrop-light">
      <nav className="top-nav">
        <div className="brand">
          <span className="mark">◢◤</span> MINI CLASH
        </div>
        <div className="nav-tabs">
          <button type="button" className="nav-tab active">
            <span>Play</span>
          </button>
          <button type="button" className="nav-tab locked" title={`${STRINGS.comingSoon} (v0.7)`}>
            <span>Heroes</span>
            <span className="mini-tag">v0.7</span>
          </button>
          <button type="button" className="nav-tab locked" title={`${STRINGS.comingSoon} (v0.7)`}>
            <span>Store</span>
            <span className="mini-tag">v0.7</span>
          </button>
          <button type="button" className="nav-tab locked" title={`${STRINGS.comingSoon} (v0.8)`}>
            <span>Tournament</span>
            <span className="mini-tag">v0.8</span>
          </button>
        </div>
        <div className="nav-right">
          <span className="nav-chip" title={`Clash Coins — ${STRINGS.comingSoon} (v0.7)`}>
            <span className="coin">⬢</span> 0
          </span>
          <button
            type="button"
            className="nav-chip"
            onClick={() => {
              uiSound('ui_click');
              setSettingsOpen(true);
            }}
          >
            ⚙
          </button>
          <div className="profile-tile">
            <div className="avatar">{profile?.name.slice(0, 1).toUpperCase() ?? '?'}</div>
            {profile?.name}
          </div>
        </div>
      </nav>

      <div className="hub-content">
        <h1 className="menu-heading">Play</h1>

        <div className="section-label">Choose your champion</div>
        <div className="champ-row">
          {CHAMPION_LIST.map((c) => {
            const theme = CHAMP_THEME[c.id] ?? CHAMP_THEME.rook;
            return (
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
                  className="art"
                  style={{ background: `linear-gradient(160deg, ${theme.from}, ${theme.to})` }}
                >
                  <span className="letter">{c.name.slice(0, 1)}</span>
                </div>
                <div className="plate">
                  <span className="nm">{c.name}</span>
                  <span
                    className="role-ic"
                    title={c.role}
                    style={{
                      maskImage: `url(/icons/${ROLE_ICON[c.role] ?? 'sword-clash'}.svg)`,
                      WebkitMaskImage: `url(/icons/${ROLE_ICON[c.role] ?? 'sword-clash'}.svg)`,
                    }}
                  />
                </div>
                <div className="underline" style={{ background: theme.line }} />
              </button>
            );
          })}
        </div>

        <div className="section-label">Game modes</div>
        <div className="mode-row">
          <button type="button" className="mode-card" onClick={() => play('bridge')}>
            <span className="ribbon">
              <span>New</span>
            </span>
            <div
              className="hero"
              style={{ background: 'linear-gradient(135deg, #b23a3a, #6e1c1c)' }}
            >
              <span
                className="glyph"
                style={{
                  maskImage: 'url(/icons/tower-fall.svg)',
                  WebkitMaskImage: 'url(/icons/tower-fall.svg)',
                }}
              />
            </div>
            <div className="info">
              <div className="mode-kind">4v4 · vs Bots</div>
              <h3>Bridge Brawl</h3>
              <div className="desc">The full ARAM on the Shatterbridge.</div>
            </div>
          </button>

          <button type="button" className="mode-card" onClick={() => play('training')}>
            <span className="ribbon">
              <span>Available now</span>
            </span>
            <div
              className="hero"
              style={{ background: 'linear-gradient(135deg, #2ea860, #1c6e3e)' }}
            >
              <span
                className="glyph"
                style={{
                  maskImage: 'url(/icons/crossed-swords.svg)',
                  WebkitMaskImage: 'url(/icons/crossed-swords.svg)',
                }}
              />
            </div>
            <div className="info">
              <div className="mode-kind">Solo · Sandbox</div>
              <h3>{STRINGS.training}</h3>
              <div className="desc">{STRINGS.trainingDesc}</div>
            </div>
          </button>

          <button
            type="button"
            className="mode-card"
            onClick={() => {
              uiSound('ui_click');
              if (lobbyStatus === 'in') goto('lobby');
              else setFriendsOpen(true);
            }}
          >
            <span className="ribbon">
              <span>New</span>
            </span>
            <div
              className="hero"
              style={{ background: 'linear-gradient(135deg, #3b6fd4, #1d3a78)' }}
            >
              <span
                className="glyph"
                style={{
                  maskImage: 'url(/icons/three-friends.svg)',
                  WebkitMaskImage: 'url(/icons/three-friends.svg)',
                }}
              />
            </div>
            <div className="info">
              <div className="mode-kind">Online · Custom lobby</div>
              <h3>Play with friends</h3>
              <div className="desc">
                {lobbyStatus === 'in'
                  ? 'Return to your lobby.'
                  : 'Invite codes, bots fill empty seats.'}
              </div>
            </div>
          </button>
        </div>
      </div>

      {lobbyStatus === 'in' && lobbySnap && (
        <button
          type="button"
          className="party-dock"
          title="Return to lobby"
          onClick={() => {
            uiSound('ui_click');
            goto('lobby');
          }}
        >
          <span className="pd-code">{lobbySnap.code}</span>
          {lobbySnap.seats
            .filter((s) => s.occupant?.kind === 'human')
            .map((s) =>
              s.occupant?.kind === 'human' ? (
                <span key={s.occupant.key} className="pd-chip">
                  {s.occupant.name.slice(0, 1).toUpperCase()}
                </span>
              ) : null,
            )}
          <span className="pd-label">IN LOBBY — return</span>
        </button>
      )}

      <div className="hintbar on-light">Mini Clash v0.2 — Shatterbridge</div>
      <div className="keyhint on-light">
        <span className="cap">ENTER</span>
        <span className="lbl">Play</span>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {friendsOpen && <FriendsModal onClose={() => setFriendsOpen(false)} />}
    </div>
  );
}

/** Create-or-join sheet for custom lobbies (UI_UX §5). */
function FriendsModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const profile = useSession((s) => s.profile);
  const goto = useSession((s) => s.goto);
  const createLobby = useLobby((s) => s.create);
  const joinLobby = useLobby((s) => s.join);
  const lobbyError = useLobby((s) => s.error);
  const clearError = useLobby((s) => s.clearError);
  const pendingCode = useLobby((s) => s.pendingCode);
  const setPendingCode = useLobby((s) => s.setPendingCode);
  const [code, setCode] = useState(pendingCode ?? '');
  const [busy, setBusy] = useState(false);
  const name = profile?.name ?? 'Player';

  const doCreate = async (): Promise<void> => {
    if (busy) return;
    uiSound('ui_click');
    setBusy(true);
    const ok = await createLobby(name);
    setBusy(false);
    if (ok) {
      setPendingCode(null);
      onClose();
      goto('lobby');
    }
  };

  const doJoin = async (): Promise<void> => {
    if (busy || code.trim().length < 6) return;
    uiSound('ui_click');
    setBusy(true);
    const ok = await joinLobby(code, name);
    setBusy(false);
    if (ok) {
      setPendingCode(null);
      onClose();
      goto('lobby');
    }
  };

  return (
    <div className="modal-veil" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel friends-modal col">
        <h2>Play with friends</h2>
        <p className="fm-sub">
          One lobby, one code. Create one and share it, or punch in a friend’s code.
        </p>
        <button type="button" className="btn primary" disabled={busy} onClick={doCreate}>
          {busy ? '…' : 'CREATE LOBBY'}
        </button>
        <div className="fm-or">— or join with a code —</div>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="fm-code"
            value={code}
            maxLength={6}
            placeholder="ABC123"
            onChange={(e) => {
              clearError();
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
            }}
            onKeyDown={(e) => {
              if (e.code === 'Enter') void doJoin();
              e.stopPropagation();
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={busy || code.trim().length < 6}
            onClick={doJoin}
          >
            JOIN
          </button>
        </div>
        {lobbyError && (
          <div className="fm-error">
            {lobbyError} — <b>make your own lobby</b> with the button above.
          </div>
        )}
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            uiSound('ui_back');
            setPendingCode(null);
            onClose();
          }}
        >
          {STRINGS.back}
        </button>
      </div>
    </div>
  );
}
