import { REWARDS } from '@mini-clash/data';
import { useCallback, useEffect, useState } from 'react';
import { uiSound } from '../../game/audio';
import { type QuestEntry, type QuestsView, useAccount } from '../../state/account';

/**
 * Quests and the streak calendar (UI_UX §13).
 *
 * Everything here is a claim button, so everything here has to survive being
 * pressed twice: the server is the authority on whether a quest has already
 * paid, and the screen reloads from it after every action rather than trusting
 * its own optimistic edit.
 */

const METRIC_LABEL: Record<string, string> = {
  matches: 'matches played',
  wins: 'wins',
  kills: 'takedowns',
  assists: 'assists',
  augmentsDrafted: 'augments drafted',
  golemsTaken: 'Clash Golems taken',
  swaps: 'tag swaps',
  towers: 'towers destroyed',
};

export function QuestsScreen(): React.ReactElement {
  const status = useAccount((s) => s.status);
  const loadQuests = useAccount((s) => s.quests);
  const claimQuest = useAccount((s) => s.claimQuest);
  const rerollQuest = useAccount((s) => s.rerollQuest);
  const mastery = useAccount((s) => s.mastery);
  const claimMastery = useAccount((s) => s.claimMastery);

  const [view, setView] = useState<QuestsView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await loadQuests());
      setState('ready');
    } catch {
      setState('error');
    }
  }, [loadQuests]);

  useEffect(() => {
    if (status === 'ready') void load();
    else setState('error');
  }, [status, load]);

  const claim = async (quest: QuestEntry): Promise<void> => {
    setBusy(quest.id);
    setNotice(null);
    try {
      const coins = await claimQuest(quest.id);
      uiSound('ui_confirm');
      setNotice(`${quest.name} claimed — ${coins} coins.`);
      await load();
    } catch {
      setNotice('That reward could not be claimed. Reloading…');
      await load();
    } finally {
      setBusy(null);
    }
  };

  const reroll = async (quest: QuestEntry): Promise<void> => {
    setBusy(quest.id);
    setNotice(null);
    try {
      await rerollQuest(quest.id);
      uiSound('ui_click');
      await load();
    } catch {
      setNotice('That quest could not be rerolled.');
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (status !== 'ready') {
    return (
      <div className="quests-screen">
        <h1 className="menu-heading">Quests</h1>
        <p className="empty-note">
          {status === 'offline'
            ? 'Quests need a connection — they track matches the server ran.'
            : 'Sign in to pick up daily and weekly quests.'}
        </p>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="quests-screen">
        <h1 className="menu-heading">Quests</h1>
        <div className="skeleton-list" role="status" aria-busy="true" aria-label="Loading quests">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (state === 'error' || !view) {
    return (
      <div className="quests-screen">
        <h1 className="menu-heading">Quests</h1>
        <p className="empty-note">Could not load your quests.</p>
        <button type="button" className="btn" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }

  const milestones = mastery.filter((m) => m.claimable);

  return (
    <div className="quests-screen">
      <div className="screen-head">
        <h1 className="menu-heading">Quests</h1>
        <StreakChip streak={view.streak} lastWinDay={view.lastWinDay} />
      </div>

      <div className="section-label">
        Daily · resets {relativeReset(view.daily[0]?.resetAt)}
        {view.rerollAvailable ? ' · one reroll available' : ' · reroll used today'}
      </div>
      <div className="quest-list">
        {view.daily.map((q) => (
          <QuestCard
            key={q.id}
            quest={q}
            busy={busy === q.id}
            canReroll={view.rerollAvailable && q.state === 'active'}
            onClaim={() => void claim(q)}
            onReroll={() => void reroll(q)}
          />
        ))}
      </div>

      <div className="section-label">Weekly · resets {relativeReset(view.weekly[0]?.resetAt)}</div>
      <div className="quest-list">
        {view.weekly.map((q) => (
          <QuestCard
            key={q.id}
            quest={q}
            busy={busy === q.id}
            canReroll={false}
            onClaim={() => void claim(q)}
            onReroll={() => undefined}
          />
        ))}
      </div>

      <div className="section-label">Mastery milestones</div>
      {milestones.length === 0 ? (
        <p className="empty-note small">
          Nothing waiting. Mastery {Object.keys(REWARDS.masteryCoins).join(' and ')} on any champion
          pays coins.
        </p>
      ) : (
        <div className="quest-list">
          {milestones.map((m) => (
            <div key={m.championId} className="quest-card ready">
              <div className="qc-body">
                <strong>
                  {m.championId} · mastery {m.claimable?.level}
                </strong>
                <span className="subtle">Milestone reached</span>
              </div>
              <button
                type="button"
                className="btn primary small"
                disabled={busy === m.championId}
                onClick={async () => {
                  setBusy(m.championId);
                  try {
                    const res = await claimMastery(m.championId);
                    uiSound('ui_confirm');
                    setNotice(`Mastery ${res.level} claimed — ${res.coins} coins.`);
                  } catch {
                    setNotice('Could not claim that milestone.');
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Claim ⬢ {m.claimable?.coins}
              </button>
            </div>
          ))}
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

function QuestCard({
  quest,
  busy,
  canReroll,
  onClaim,
  onReroll,
}: {
  quest: QuestEntry;
  busy: boolean;
  canReroll: boolean;
  onClaim: () => void;
  onReroll: () => void;
}): React.ReactElement {
  const pct = Math.min(100, (quest.progress / quest.target) * 100);
  return (
    <div className={`quest-card ${quest.state}`}>
      <div className="qc-body">
        <div className="spread">
          <strong>{quest.name}</strong>
          <span className="subtle">
            {quest.progress} / {quest.target} {METRIC_LABEL[quest.metric] ?? quest.metric}
          </span>
        </div>
        <div className="qc-bar">
          <div style={{ width: `${pct}%` }} />
        </div>
      </div>
      {quest.state === 'claimed' ? (
        <span className="qc-done">Claimed</span>
      ) : quest.state === 'ready' ? (
        <button type="button" className="btn primary small" disabled={busy} onClick={onClaim}>
          Claim ⬢ {quest.coins}
        </button>
      ) : (
        <div className="qc-actions">
          <span className="qc-reward">⬢ {quest.coins}</span>
          {canReroll && (
            <button
              type="button"
              className="btn small ghost"
              disabled={busy}
              title="Swap this quest for another (once a day)"
              onClick={onReroll}
            >
              ↻
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Seven days of "did you win today", the calendar UI_UX §13 asks for. */
function StreakChip({
  streak,
  lastWinDay,
}: {
  streak: number;
  lastWinDay: string | null;
}): React.ReactElement {
  const today = new Date();
  const days: { key: string; label: string; hit: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    // A streak of n means the n days ending on lastWinDay each had a win.
    const hit = lastWinDay !== null && key <= lastWinDay && daysBetween(key, lastWinDay) < streak;
    days.push({ key, label: 'SMTWTFS'[d.getUTCDay()], hit });
  }
  return (
    <div className="streak-chip" title={`${streak}-day win streak`}>
      <span className="streak-count">{streak}</span>
      <span className="streak-days">
        {days.map((d) => (
          <span
            key={d.key}
            role="img"
            className={d.hit ? 'on' : ''}
            aria-label={`${d.key}: ${d.hit ? 'won' : 'no win'}`}
          >
            {d.label}
          </span>
        ))}
      </span>
    </div>
  );
}

const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

function relativeReset(iso: string | undefined): string {
  if (!iso) return 'soon';
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'now';
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `in ${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours >= 1) return `in ${hours}h`;
  return `in ${Math.max(1, Math.floor(ms / 60_000))}m`;
}
