import { STRINGS } from '@mini-clash/data';
import { useState } from 'react';
import { uiSound } from '../game/audio';
import { randomName, useSession } from '../state/session';

export function NameScreen(): React.ReactElement {
  const [name, setName] = useState(randomName());
  const setProfile = useSession((s) => s.setProfile);
  const goto = useSession((s) => s.goto);

  const submit = (): void => {
    const clean = name.trim().slice(0, 16);
    if (clean.length < 2) return;
    uiSound('ui_click');
    setProfile(clean);
    goto('hub');
  };

  return (
    <div className="screen backdrop-dark">
      <h1 className="wordmark" style={{ fontSize: '3.4rem' }}>
        Mini <span className="clash">Clash</span>
      </h1>
      <div className="panel col" style={{ width: 380, textAlign: 'center' }}>
        <h2 style={{ fontStyle: 'italic', fontSize: '1.5rem' }}>{STRINGS.chooseName}</h2>
        <div className="row">
          <input
            type="text"
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
          <button
            type="button"
            className="btn"
            title={STRINGS.rerollName}
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
          onClick={submit}
          disabled={name.trim().length < 2}
        >
          {STRINGS.enter}
        </button>
        <span className="subtle-onvoid" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {STRINGS.guestNotice}
        </span>
      </div>
    </div>
  );
}
