import { AUGMENTS, CHAMPIONS, MASTERY_CURVE } from '@mini-clash/data';
import { useState } from 'react';
import { uiSound } from '../../game/audio';
import { useAccount } from '../../state/account';
import { useSession } from '../../state/session';

/**
 * Profile: who you are, what you have done, and the account panel (UI_UX §13).
 *
 * The account panel is where "play now, sign up later" is finally cashed in.
 * Adding an email does not create anything — it attaches a credential to the
 * account already in play — and the copy says exactly that, because a player
 * who thinks they are about to start over will not press the button.
 */

export function ProfileScreen(): React.ReactElement {
  const status = useAccount((s) => s.status);
  const user = useAccount((s) => s.user);
  const profile = useAccount((s) => s.profile);
  const lifetime = useAccount((s) => s.lifetime);
  const mastery = useAccount((s) => s.mastery);
  const unlocks = useAccount((s) => s.unlocks);
  const setShowcase = useAccount((s) => s.setShowcase);

  if (status !== 'ready' || !user || !profile) {
    return (
      <div className="profile-screen">
        <h1 className="menu-heading">Profile</h1>
        {status === 'offline' ? (
          <p className="empty-note">
            Your profile lives on the server. Everything you play offline still works — it just is
            not recorded.
          </p>
        ) : (
          <SignedOutPanel />
        )}
      </div>
    );
  }

  const topMastery = [...mastery].sort((a, b) => b.xp - a.xp).slice(0, 6);
  const owned = unlocks.champion ?? [];

  return (
    <div className="profile-screen">
      <section className="profile-banner">
        <div className="level-ring" role="img" aria-label={`Account level ${profile.level}`}>
          <span>{profile.level}</span>
        </div>
        <div className="pb-body">
          <h1>{user.name}</h1>
          <p className="subtle">
            {user.kind === 'registered' ? user.email : 'Guest account'} ·{' '}
            {profile.xp.toLocaleString()} XP
          </p>
        </div>
        <div className="pb-purse">
          <span className="coin">⬢</span> {profile.coins.toLocaleString()}
        </div>
      </section>

      <div className="section-label">Lifetime</div>
      {lifetime && lifetime.matches > 0 ? (
        <div className="stat-grid">
          <Stat label="Matches" value={lifetime.matches.toLocaleString()} />
          <Stat label="Wins" value={`${lifetime.wins} · ${Math.round(lifetime.winrate * 100)}%`} />
          <Stat label="KDA" value={lifetime.kda.toFixed(2)} />
          <Stat
            label="Favourite duo"
            value={
              lifetime.favoriteDuo
                ? lifetime.favoriteDuo.ids.map((id) => CHAMPIONS[id]?.name ?? id).join(' + ')
                : '—'
            }
          />
          <Stat
            label="Most played"
            value={
              lifetime.topChampion
                ? (CHAMPIONS[lifetime.topChampion.id]?.name ?? lifetime.topChampion.id)
                : '—'
            }
          />
          <Stat
            label="Most drafted"
            value={
              lifetime.topAugment
                ? (AUGMENTS[lifetime.topAugment.id]?.name ?? lifetime.topAugment.id)
                : '—'
            }
          />
        </div>
      ) : (
        <p className="empty-note small">
          No online matches yet — your lifetime stats start with your first one.
        </p>
      )}

      <div className="section-label">Mastery</div>
      {topMastery.length === 0 ? (
        <p className="empty-note small">Play a champion online to start their mastery track.</p>
      ) : (
        <div className="mastery-grid">
          {topMastery.map((m) => (
            <div key={m.championId} className="mastery-card">
              <div className="spread">
                <strong>{CHAMPIONS[m.championId]?.name ?? m.championId}</strong>
                <span className="mastery-level">{m.level}</span>
              </div>
              <div className="mastery-bar">
                <div
                  style={{
                    width: m.progress ? `${(m.progress.into / m.progress.needed) * 100}%` : '100%',
                  }}
                />
              </div>
              <span className="subtle">
                {m.progress
                  ? `${m.progress.into.toLocaleString()} / ${m.progress.needed.toLocaleString()}`
                  : `Mastered · ${MASTERY_CURVE[MASTERY_CURVE.length - 1].toLocaleString()} XP`}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="section-label">Showcase</div>
      <p className="subtle small-note">Three champions posed on your profile. Owned only.</p>
      <div className="showcase-row">
        {owned.map((id) => {
          const on = profile.showcase.includes(id);
          return (
            <button
              key={id}
              type="button"
              className={`showcase-pick${on ? ' on' : ''}`}
              onClick={() => {
                uiSound('ui_click');
                const next = on
                  ? profile.showcase.filter((s) => s !== id)
                  : [...profile.showcase, id].slice(-3);
                void setShowcase(next);
              }}
            >
              {CHAMPIONS[id]?.name ?? id}
            </button>
          );
        })}
      </div>

      <div className="section-label">Account</div>
      <AccountPanel />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="stat-cell">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

/* ----------------------------- Signed out -------------------------------- */

function SignedOutPanel(): React.ReactElement {
  const login = useAccount((s) => s.login);
  const signInGuest = useAccount((s) => s.signInGuest);
  const localName = useSession((s) => s.profile?.name ?? 'Guest');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      await login(email, password);
    } catch {
      const code = useAccount.getState().error;
      setNotice(
        code === 'bad_credentials'
          ? 'That email and password do not match an account.'
          : code === 'offline'
            ? 'Could not reach the servers.'
            : 'Sign-in failed.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-panel">
      <h2>Sign in</h2>
      <p className="subtle">Bring your coins, unlocks and mastery to this browser.</p>
      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
      </label>
      <button
        type="button"
        className="btn primary"
        disabled={busy || !email || !password}
        onClick={() => void submit()}
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <hr />
      <p className="subtle">Or start fresh on this device — no email needed.</p>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => void signInGuest(localName)}
      >
        Play as {localName}
      </button>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

/* ---------------------------- Account panel ------------------------------ */

function AccountPanel(): React.ReactElement {
  const user = useAccount((s) => s.user);
  const renamePrice = useAccount((s) => s.renamePrice);
  const coins = useAccount((s) => s.profile?.coins ?? 0);
  const upgrade = useAccount((s) => s.upgrade);
  const rename = useAccount((s) => s.rename);
  const logout = useAccount((s) => s.logout);
  const logoutOthers = useAccount((s) => s.logoutOthers);
  const deleteAccount = useAccount((s) => s.deleteAccount);
  const goto = useSession((s) => s.goto);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newName, setNewName] = useState(user?.name ?? '');
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!user) return <SignedOutPanel />;

  const doUpgrade = async (): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      await upgrade(email, password);
      uiSound('ui_confirm');
      setNotice('Email added — you can now sign in from any browser.');
      setEmail('');
      setPassword('');
    } catch {
      const code = useAccount.getState().error;
      setNotice(
        code === 'email_taken'
          ? 'That email already has an account.'
          : code === 'bad_email'
            ? 'That does not look like an email address.'
            : code === 'weak_password'
              ? 'Use at least 8 characters.'
              : 'Could not add that email.',
      );
    } finally {
      setBusy(false);
    }
  };

  const doRename = async (): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await rename(newName);
      uiSound('ui_confirm');
      setNotice(res.charged > 0 ? `Renamed — ${res.charged} coins spent.` : 'Renamed.');
    } catch {
      const code = useAccount.getState().error;
      setNotice(
        code === 'insufficient_coins'
          ? `A name change costs ${renamePrice} coins.`
          : code === 'bad_name'
            ? 'Names are 2–16 letters, numbers and spaces.'
            : 'Could not change your name.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-panel">
      {user.kind === 'guest' ? (
        <>
          <h2>Add an email</h2>
          <p className="subtle">
            This does <strong>not</strong> start a new account. It adds a way to sign in to the one
            you are already playing — every coin, unlock and mastery level comes with it.
          </p>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !email || password.length < 8}
            onClick={() => void doUpgrade()}
          >
            {busy ? 'Saving…' : 'Add email'}
          </button>
          <hr />
        </>
      ) : (
        <>
          <h2>Signed in as {user.email}</h2>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await logoutOthers();
                setNotice('Signed out everywhere else.');
              } catch {
                setNotice('Could not sign out the other devices.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Sign out other devices
          </button>
          <hr />
        </>
      )}

      <h2>Name</h2>
      <p className="subtle">
        {renamePrice === 0
          ? 'Your first change is free.'
          : `Further changes cost ${renamePrice} coins (you have ${coins.toLocaleString()}).`}
      </p>
      <label>
        Display name
        <input
          type="text"
          maxLength={16}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn"
        disabled={busy || newName.trim() === user.name || newName.trim().length < 2}
        onClick={() => void doRename()}
      >
        Change name
      </button>

      <hr />
      <div className="row">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            await logout();
            goto('name');
          }}
        >
          Log out
        </button>
        <button type="button" className="btn danger" onClick={() => setDeleting(true)}>
          Delete account
        </button>
      </div>

      {deleting && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Delete account">
          <div className="panel col modal-panel">
            <h2>Delete this account?</h2>
            <p className="subtle">
              This removes your coins, unlocks, mastery and match history permanently. Type{' '}
              <strong>{user.name}</strong> to confirm.
            </p>
            <input
              type="text"
              value={confirm}
              aria-label="Type your name to confirm"
              onChange={(e) => setConfirm(e.target.value)}
            />
            <div className="row">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDeleting(false);
                  setConfirm('');
                }}
              >
                Keep it
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={confirm.trim() !== user.name}
                onClick={async () => {
                  try {
                    await deleteAccount(confirm);
                    goto('name');
                  } catch {
                    setNotice('Could not delete the account.');
                    setDeleting(false);
                  }
                }}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
