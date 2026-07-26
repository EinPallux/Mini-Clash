import { AUGMENTS, CHAMPIONS } from '@mini-clash/data';
import { useCallback, useEffect, useState } from 'react';
import { uiSound } from '../../game/audio';
import { type HistoryEntry, useAccount } from '../../state/account';

/**
 * Match history (UI_UX §13).
 *
 * The detail view renders the summary blob the game server wrote at match end,
 * untouched. That is deliberate: re-deriving a scoreboard from whatever the
 * current code thinks a match looks like would quietly rewrite history every
 * time the game changed.
 */

interface MatchDetail {
  matchId: string;
  mode: string;
  startedAt: string;
  duration: number;
  result: {
    winner: number | null;
    teamKills?: [number, number];
    towersDown?: [number, number];
    events?: unknown[];
    scoreboard?: {
      seat: number;
      name: string;
      team: number;
      bot: string | null;
      duo: string[];
      augments: string[];
      k: number;
      d: number;
      a: number;
      damage: number;
      gold: number;
      level: number;
    }[];
  };
  players: { seat: number; userId: string | null; name: string | null }[];
}

export function HistoryScreen(): React.ReactElement {
  const status = useAccount((s) => s.status);
  const loadHistory = useAccount((s) => s.history);
  const loadDetail = useAccount((s) => s.matchDetail);
  const myId = useAccount((s) => s.user?.id ?? null);

  const [list, setList] = useState<HistoryEntry[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [open, setOpen] = useState<MatchDetail | null>(null);
  const [openState, setOpenState] = useState<'idle' | 'loading' | 'error'>('idle');

  const load = useCallback(async () => {
    setState('loading');
    try {
      setList(await loadHistory(30));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [loadHistory]);

  useEffect(() => {
    if (status === 'ready') void load();
    else setState('error');
  }, [status, load]);

  const openMatch = async (matchId: string): Promise<void> => {
    uiSound('ui_click');
    setOpenState('loading');
    try {
      setOpen((await loadDetail(matchId)) as MatchDetail);
      setOpenState('idle');
    } catch {
      setOpenState('error');
    }
  };

  if (status !== 'ready') {
    return (
      <div className="history-screen">
        <h1 className="menu-heading">History</h1>
        <p className="empty-note">
          {status === 'offline'
            ? 'Match history lives on the server — it will be here when you reconnect.'
            : 'Sign in to keep a record of your matches.'}
        </p>
      </div>
    );
  }

  return (
    <div className="history-screen">
      <div className="screen-head">
        <h1 className="menu-heading">History</h1>
        <span className="subtle">last 30 matches</span>
      </div>

      {state === 'loading' && (
        <div className="skeleton-list" role="status" aria-busy="true" aria-label="Loading history">
          <span />
          <span />
          <span />
          <span />
        </div>
      )}

      {state === 'error' && (
        <>
          <p className="empty-note">Could not load your matches.</p>
          <button type="button" className="btn" onClick={() => void load()}>
            Try again
          </button>
        </>
      )}

      {state === 'ready' && list && list.length === 0 && (
        <p className="empty-note">
          No matches yet. Play an online match and it will show up here — with the full scoreboard.
        </p>
      )}

      {state === 'ready' && list && list.length > 0 && (
        <ul className="history-list">
          {list.map((m) => (
            <li key={m.matchId}>
              <button
                type="button"
                className={`history-row ${m.won ? 'won' : 'lost'}`}
                onClick={() => void openMatch(m.matchId)}
              >
                <span className="hr-result">{m.won ? 'Victory' : 'Defeat'}</span>
                <span className="hr-duo">
                  {m.duo.map((id) => CHAMPIONS[id]?.name ?? id).join(' + ')}
                </span>
                <span className="hr-kda">
                  {m.stats.kills ?? 0} / {m.stats.deaths ?? 0} / {m.stats.assists ?? 0}
                </span>
                <span className="hr-augs">
                  {m.augments.slice(0, 3).map((a) => (
                    <span key={a} className="aug-chip" title={AUGMENTS[a]?.name ?? a}>
                      {(AUGMENTS[a]?.name ?? a).slice(0, 1)}
                    </span>
                  ))}
                </span>
                <span className="hr-meta">
                  {formatDuration(m.duration)} · {formatDate(m.startedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openState === 'loading' && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Loading match">
          <div className="panel col modal-panel">Loading match…</div>
        </div>
      )}

      {openState === 'error' && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Match unavailable">
          <div className="panel col modal-panel">
            <p>That match could not be loaded.</p>
            <button type="button" className="btn" onClick={() => setOpenState('idle')}>
              Close
            </button>
          </div>
        </div>
      )}

      {open && <DetailModal detail={open} myId={myId} onClose={() => setOpen(null)} />}
    </div>
  );
}

function DetailModal({
  detail,
  myId,
  onClose,
}: {
  detail: MatchDetail;
  myId: string | null;
  onClose: () => void;
}): React.ReactElement {
  const board = detail.result.scoreboard ?? [];
  const mine = detail.players.find((p) => p.userId === myId);
  const teams = [0, 1] as const;
  const winner = detail.result.winner;

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Match detail">
      <div className="panel col modal-panel wide">
        <div className="spread">
          <h2>
            {winner === null ? 'Match' : `Team ${winner + 1} wins`} ·{' '}
            {formatDuration(detail.duration)}
          </h2>
          <button type="button" className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="subtle">{formatDate(detail.startedAt)}</p>

        {board.length === 0 ? (
          <p className="empty-note small">This match has no stored scoreboard.</p>
        ) : (
          teams.map((team) => (
            <div key={team} className={`board-team${winner === team ? ' won' : ''}`}>
              <div className="section-label">
                Team {team + 1}
                {detail.result.teamKills ? ` · ${detail.result.teamKills[team]} kills` : ''}
                {detail.result.towersDown ? ` · ${detail.result.towersDown[team]} towers lost` : ''}
              </div>
              <table className="scoreboard">
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Duo</th>
                    <th scope="col">K / D / A</th>
                    <th scope="col">Damage</th>
                    <th scope="col">Augments</th>
                  </tr>
                </thead>
                <tbody>
                  {board
                    .filter((row) => row.team === team)
                    .map((row) => (
                      <tr key={row.seat} className={row.seat === mine?.seat ? 'me' : undefined}>
                        <th scope="row">
                          {row.name}
                          {row.bot ? <span className="bot-tag">{row.bot}</span> : null}
                        </th>
                        <td>{row.duo.map((id) => CHAMPIONS[id]?.name ?? id).join(' + ')}</td>
                        <td>
                          {row.k} / {row.d} / {row.a}
                        </td>
                        <td>{row.damage.toLocaleString()}</td>
                        <td>
                          {row.augments.length === 0
                            ? '—'
                            : row.augments.map((a) => AUGMENTS[a]?.name ?? a).join(', ')}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
