import { STRINGS } from '@mini-clash/data';
import { useState } from 'react';
import { uiSound } from '../game/audio';
import { useAccount } from '../state/account';
import { randomName, useSession } from '../state/session';

/**
 * First run: pick a name and start playing (UI_UX §2).
 *
 * The name creates a real account on the api — a guest one, with no email and
 * no password, which can be upgraded later without losing anything. If the api
 * cannot be reached the player still gets in: the name is kept locally and the
 * hub says plainly that nothing is being recorded, rather than blocking on a
 * service the offline modes never needed.
 */

const MESSAGES: Record<string, string> = {
  bad_name: 'That name has characters we cannot use — letters, numbers and spaces work.',
  bad_device_key: 'This browser could not create a sign-in key. Try turning off private mode.',
  rate_limited: 'Too many new accounts from here just now. Give it a minute.',
  offline: 'We could not reach the servers — playing offline for now.',
};

export function NameScreen(): React.ReactElement {
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [name, setName] = useState(randomName());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const setProfile = useSession((s) => s.setProfile);
  const goto = useSession((s) => s.goto);
  const signInGuest = useAccount((s) => s.signInGuest);
  const login = useAccount((s) => s.login);

  /**
   * Returning on a new browser. Without this the sign-in form is only reachable
   * *after* creating a throwaway guest account, which is exactly backwards for
   * somebody who already has one.
   */
  const signIn = async (): Promise<void> => {
    if (busy || !email || !password) return;
    uiSound('ui_click');
    setBusy(true);
    setNotice(null);
    try {
      await login(email, password);
      setProfile(useAccount.getState().user?.name ?? name);
      goto('hub');
    } catch {
      const code = useAccount.getState().error ?? 'unknown';
      setNotice(
        code === 'bad_credentials'
          ? 'That email and password do not match an account.'
          : code === 'offline'
            ? MESSAGES.offline
            : 'Sign-in failed.',
      );
      setBusy(false);
    }
  };

  const submit = async (): Promise<void> => {
    const clean = name.trim().slice(0, 16);
    if (clean.length < 2 || busy) return;
    uiSound('ui_click');
    setBusy(true);
    setNotice(null);
    // Kept locally too, so an offline session and a later reconnect both have
    // a name to show.
    setProfile(clean);
    try {
      await signInGuest(clean);
      goto('hub');
    } catch {
      const code = useAccount.getState().error ?? 'unknown';
      if (code === 'offline') {
        // Offline is not a wall: play now, sign in when the network is back.
        setNotice(MESSAGES.offline);
        setTimeout(() => goto('hub'), 1400);
        return;
      }
      setNotice(MESSAGES[code] ?? 'Something went wrong creating your account.');
      setBusy(false);
    }
  };

  return (
    <div className="screen backdrop-dark">
      <h1 className="wordmark" style={{ fontSize: '3.4rem' }}>
        Mini <span className="clash">Clash</span>
      </h1>
      <div className="panel col" style={{ width: 380, textAlign: 'center' }}>
        {mode === 'signin' ? (
          <>
            <h2 style={{ fontStyle: 'italic', fontSize: '1.5rem' }}>Welcome back</h2>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-label="Email"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              aria-label="Password"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void signIn();
              }}
            />
            <button
              type="button"
              className="btn primary"
              disabled={busy || !email || !password}
              onClick={() => void signIn()}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => {
                setNotice(null);
                setMode('create');
              }}
            >
              Back
            </button>
            {notice && (
              <span className="form-notice" role="status">
                {notice}
              </span>
            )}
          </>
        ) : (
          <>
            <h2 style={{ fontStyle: 'italic', fontSize: '1.5rem' }}>{STRINGS.chooseName}</h2>
            <div className="row">
              <input
                type="text"
                value={name}
                maxLength={16}
                disabled={busy}
                aria-label={STRINGS.chooseName}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                }}
              />
              <button
                type="button"
                className="btn"
                title={STRINGS.rerollName}
                disabled={busy}
                onClick={() => {
                  uiSound('ui_hover');
                  setName(randomName());
                }}
              >
                ↻
              </button>
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={() => void submit()}
              disabled={name.trim().length < 2 || busy}
            >
              {busy ? 'Creating…' : STRINGS.enter}
            </button>
            {notice ? (
              <span className="form-notice" role="status">
                {notice}
              </span>
            ) : (
              <span className="subtle-onvoid" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {STRINGS.guestNotice}
              </span>
            )}
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => {
                uiSound('ui_click');
                setNotice(null);
                setMode('signin');
              }}
            >
              I already have an account
            </button>
          </>
        )}
      </div>
    </div>
  );
}
