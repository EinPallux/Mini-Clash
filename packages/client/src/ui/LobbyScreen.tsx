import { STRINGS } from '@mini-clash/data';
import type { BotTier, LobbyClientMsg, LobbySeatSnap } from '@mini-clash/protocol';
import { useEffect, useRef, useState } from 'react';
import { uiSound } from '../game/audio';
import { useLobby } from '../state/lobby';
import { useSession } from '../state/session';
import { SelectCeremony, type SelectDriver } from './ChampionSelect';

/**
 * Custom Lobby (UI_UX §5): two team columns of 4 seats, huge code + copy-link,
 * per-seat bot difficulty, bot-fill toggle, leader START gated on readiness.
 * When the leader starts, the server runs the select deal and this screen
 * becomes the ceremony; the match handoff then swaps to the match screen.
 */

const TIER_LABEL: Record<BotTier, string> = {
  recruit: 'Recruit',
  veteran: 'Veteran',
  elite: 'Elite',
};
const TIER_ORDER: BotTier[] = ['recruit', 'veteran', 'elite'];

function useLobbySelectDriver(): SelectDriver | null {
  const select = useLobby((s) => s.select);
  const selectAt = useLobby((s) => s.selectAt);
  const send = useLobby((s) => s.send);
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(iv);
  }, []);
  if (!select) return null;
  const elapsed = Math.floor((performance.now() - selectAt) / 1000);
  return {
    mine: select.you.champion,
    allies: select.team
      .filter((t) => !t.you)
      .map((t) => ({
        key: t.key,
        name: t.name,
        champion: t.champion,
        locked: t.locked,
        bot: t.bot,
      })),
    bench: select.bench,
    rerolls: select.you.rerolls,
    locked: select.you.locked,
    timeLeft: Math.max(0, select.timeLeft - elapsed),
    enemyCount: select.enemyCount,
    reroll: () => send({ t: 'reroll' }),
    swap: (championId) => send({ t: 'swap', championId }),
    lock: () => send({ t: 'lock' }),
  };
}

export function LobbyScreen(): React.ReactElement {
  const goto = useSession((s) => s.goto);
  const status = useLobby((s) => s.status);
  const error = useLobby((s) => s.error);
  const snap = useLobby((s) => s.snap);
  const myKey = useLobby((s) => s.myKey);
  const send = useLobby((s) => s.send);
  const leaveLobby = useLobby((s) => s.leave);
  const selectDriver = useLobbySelectDriver();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const prevLeader = useRef<string | null>(null);

  const me = snap?.seats.find(
    (s) => s.occupant?.kind === 'human' && s.occupant.key === myKey,
  )?.occupant;
  const amLeader = me?.kind === 'human' && me.leader;
  const leaderOcc = snap?.seats.find(
    (s) => s.occupant?.kind === 'human' && s.occupant.leader,
  )?.occupant;
  const leaderKey = leaderOcc?.kind === 'human' ? leaderOcc.key : null;

  // Crown migration toast (UI_UX §5 edge state).
  useEffect(() => {
    const prev = prevLeader.current;
    prevLeader.current = leaderKey;
    if (leaderKey && prev && prev !== leaderKey) {
      setToast(
        leaderKey === myKey
          ? 'The crown passed to you — you lead this lobby now'
          : 'The lobby has a new leader',
      );
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [leaderKey, myKey]);

  // Esc goes back to the hub — the lobby stays connected (ambient party dock).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') {
        uiSound('ui_back');
        goto('hub');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goto]);

  if (selectDriver) return <SelectCeremony driver={selectDriver} />;

  if (status !== 'in' || !snap) {
    return (
      <div className="select-root backdrop-dark">
        <div className="screen" style={{ position: 'static' }}>
          <h1 className="wordmark" style={{ fontSize: '2.4rem' }}>
            Custom Lobby
          </h1>
          {status === 'connecting' ? (
            <p style={{ opacity: 0.8 }}>Connecting…</p>
          ) : (
            <>
              <div className="panel" style={{ maxWidth: 440, textAlign: 'center' }}>
                <p>{error ?? 'The lobby is gone.'}</p>
              </div>
              <button
                type="button"
                className="btn primary"
                style={{ marginTop: 14 }}
                onClick={() => {
                  uiSound('ui_back');
                  leaveLobby();
                  goto('hub');
                }}
              >
                {STRINGS.back}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const copy = (what: 'code' | 'link'): void => {
    const text =
      what === 'code'
        ? snap.code
        : `${window.location.origin}${window.location.pathname}?join=${snap.code}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    uiSound('ui_click');
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };

  const humans = snap.seats.filter((s) => s.occupant?.kind === 'human').length;

  return (
    <div className="select-root backdrop-dark lobby-root">
      <div className="select-head">
        <h1 className="wordmark" style={{ fontSize: '2.2rem' }}>
          CUSTOM LOBBY
        </h1>
        <span className="lobby-count">{humans}/8 players</span>
      </div>

      <div className="lobby-stage">
        <div className="lobby-teams">
          {([0, 1] as const).map((team) => (
            <div key={team} className={`lobby-team t${team}`}>
              <div className="section-label on-dark">{team === 0 ? 'BLUE TEAM' : 'RED TEAM'}</div>
              {snap.seats
                .filter((s) => s.team === team)
                .map((seat) => (
                  <SeatCard
                    key={`${seat.team}-${seat.idx}`}
                    seat={seat}
                    myKey={myKey}
                    amLeader={amLeader}
                    send={send}
                  />
                ))}
            </div>
          ))}
        </div>

        <div className="lobby-panel panel">
          <div className="section-label on-dark">INVITE CODE</div>
          <div className="lobby-code">{snap.code}</div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn" onClick={() => copy('code')}>
              {copied === 'code' ? '✓ Copied' : 'Copy code'}
            </button>
            <button type="button" className="btn" onClick={() => copy('link')}>
              {copied === 'link' ? '✓ Copied' : 'Copy link'}
            </button>
          </div>

          <div className="lobby-sep" />
          <div className="lobby-mode">
            <b>Bridge Brawl</b> · 4v4 · Shatterbridge
          </div>

          <label className="lobby-fill">
            <input
              type="checkbox"
              checked={snap.botFill}
              disabled={!amLeader}
              onChange={(e) => {
                uiSound('ui_click');
                send({ t: 'fill', on: e.target.checked });
              }}
            />
            <span>Fill empty seats with bots on start</span>
          </label>

          <div className="lobby-sep" />
          {amLeader ? (
            <>
              <button
                type="button"
                className="btn primary lobby-start"
                disabled={snap.startBlocked !== null}
                onClick={() => {
                  uiSound('ui_click');
                  send({ t: 'start' });
                }}
              >
                START MATCH
              </button>
              {snap.startBlocked !== null && (
                <div className="lobby-blocked">{snap.startBlocked}</div>
              )}
            </>
          ) : (
            <button
              type="button"
              className={`btn lobby-start ${me?.kind === 'human' && me.ready ? 'primary' : ''}`}
              onClick={() => {
                uiSound('ui_click');
                send({ t: 'ready', on: !(me?.kind === 'human' && me.ready) });
              }}
            >
              {me?.kind === 'human' && me.ready ? '✓ READY' : 'READY UP'}
            </button>
          )}

          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                uiSound('ui_back');
                goto('hub');
              }}
            >
              Hub
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                uiSound('ui_back');
                leaveLobby();
                goto('hub');
              }}
            >
              Leave lobby
            </button>
          </div>
        </div>
      </div>

      {toast && <div className="lobby-toast">{toast}</div>}
      <div className="hintbar on-dark">
        Share the code — friends join from the hub via “Play with friends”.
      </div>
    </div>
  );
}

function SeatCard({
  seat,
  myKey,
  amLeader,
  send,
}: {
  seat: LobbySeatSnap;
  myKey: string;
  amLeader: boolean;
  send: (msg: LobbyClientMsg) => void;
}): React.ReactElement {
  const occ = seat.occupant;
  if (occ?.kind === 'human') {
    const you = occ.key === myKey;
    return (
      <div className={`lobby-seat human ${you ? 'you' : ''}`}>
        <div className="ls-avatar">{occ.name.slice(0, 1).toUpperCase()}</div>
        <div className="ls-name">
          {occ.leader && <span className="ls-crown">♛</span>}
          {occ.name}
          {you && <span className="ls-you"> (you)</span>}
        </div>
        <span className={`ls-ready ${occ.ready ? 'on' : ''}`}>
          {occ.ready ? 'READY' : 'NOT READY'}
        </span>
      </div>
    );
  }
  if (occ?.kind === 'bot') {
    return (
      <div className="lobby-seat bot">
        <div className="ls-avatar bot">⚙</div>
        <div className="ls-name">Bot</div>
        {amLeader ? (
          <div className="ls-tier-row">
            {TIER_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                className={`ls-tier ${occ.tier === t ? 'sel' : ''}`}
                onClick={() => {
                  uiSound('ui_hover');
                  send({ t: 'bot', team: seat.team, idx: seat.idx, tier: t });
                }}
              >
                {TIER_LABEL[t].slice(0, 1)}
              </button>
            ))}
            <button
              type="button"
              className="ls-tier remove"
              title="Remove bot"
              onClick={() => {
                uiSound('ui_back');
                send({ t: 'bot', team: seat.team, idx: seat.idx, tier: null });
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <span className="ls-ready on">{TIER_LABEL[occ.tier].toUpperCase()}</span>
        )}
      </div>
    );
  }
  return (
    <div className="lobby-seat empty">
      <button
        type="button"
        className="ls-sit"
        onClick={() => {
          uiSound('ui_hover');
          send({ t: 'seat', team: seat.team, idx: seat.idx });
        }}
      >
        Sit here
      </button>
      {amLeader && (
        <button
          type="button"
          className="ls-addbot"
          onClick={() => {
            uiSound('ui_click');
            send({ t: 'bot', team: seat.team, idx: seat.idx, tier: 'veteran' });
          }}
        >
          + Bot
        </button>
      )}
    </div>
  );
}
