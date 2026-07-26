import { STRINGS } from '@mini-clash/data';
import { useEffect, useState } from 'react';
import { readRejoinTicket } from '../game/link';
import { useAccount } from '../state/account';
import { useSession } from '../state/session';

/** Boot: warm the asset manifest + fonts, then route to name pick or hub —
 * or straight back into a live match if a rejoin ticket survived a refresh. */
export function BootScreen(): React.ReactElement {
  const [progress, setProgress] = useState(0.1);
  const goto = useSession((s) => s.goto);
  const profile = useSession((s) => s.profile);

  useEffect(() => {
    let alive = true;
    const started = performance.now();
    const work = async (): Promise<void> => {
      const steps: Promise<unknown>[] = [
        fetch('/game-assets/manifest.json').then((r) => r.json()),
        document.fonts.ready,
        // Who are we? A signed-out or unreachable answer is fine — the name
        // screen handles both, and Training never needed an account.
        useAccount.getState().boot(),
      ];
      let done = 0;
      for (const s of steps) {
        s.then(() => {
          done++;
          if (alive) setProgress(0.15 + (done / steps.length) * 0.85);
        }).catch(() => {
          done++;
        });
      }
      await Promise.allSettled(steps);
      const elapsed = performance.now() - started;
      await new Promise((r) => setTimeout(r, Math.max(0, 700 - elapsed)));
      if (!alive) return;
      // Refresh-proof reconnect (GAME_DESIGN §17): a fresh ticket means a match
      // is (probably) still holding our seat — rejoin it before anything else.
      const ticket = profile ? readRejoinTicket() : null;
      if (ticket) {
        const session = useSession.getState();
        session.setMatchMode('bridge');
        session.setBridgeLineup(null);
        session.setMatchJoin({ roomId: ticket.roomId, token: ticket.token, seat: ticket.seat });
        goto('match');
        return;
      }
      // The account's name wins over the local one: it survives a new browser.
      goto(useAccount.getState().user || profile ? 'hub' : 'name');
    };
    void work();
    return () => {
      alive = false;
    };
  }, [goto, profile]);

  return (
    <div className="screen backdrop-dark">
      <h1 className="wordmark">
        Mini <span className="clash">Clash</span>
      </h1>
      <div className="boot-bar">
        <div style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <span className="subtle-onvoid">{STRINGS.tagline}</span>
    </div>
  );
}
