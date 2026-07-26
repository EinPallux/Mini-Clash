import { CHAMPIONS, COSMETIC_PRICES, PALETTES } from '@mini-clash/data';
import { useMemo, useState } from 'react';
import { uiSound } from '../../game/audio';
import { useAccount } from '../../state/account';

/**
 * The store (UI_UX §13).
 *
 * The featured shelf is a **spotlight, not scarcity**: everything on it is also
 * on its normal tab at the same price, and nothing has a countdown. A store
 * that manufactures urgency would be at odds with an earn-only economy, and
 * this one is only ever spending coins somebody played for.
 */

type Tab = 'champions' | 'palettes';

export function ShopScreen(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('champions');
  const champions = useAccount((s) => s.champions);
  const unlocks = useAccount((s) => s.unlocks);
  const coins = useAccount((s) => s.profile?.coins ?? 0);
  const status = useAccount((s) => s.status);
  const purchase = useAccount((s) => s.purchase);
  const [pending, setPending] = useState<{ kind: Tab; refId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const ownedPalettes = useMemo(() => new Set(unlocks.palette ?? []), [unlocks.palette]);
  const lockedChampions = champions.filter((c) => !c.owned && c.price > 0);
  const lockedPalettes = PALETTES.filter((p) => !ownedPalettes.has(p.id));

  /** This week's spotlight — derived from the rotation, so it moves with it. */
  const rotation = useAccount((s) => s.rotation);
  const featured = lockedChampions.filter((c) => rotation.includes(c.id)).slice(0, 3);

  const confirm = async (): Promise<void> => {
    if (!pending || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await purchase(
        pending.kind === 'champions' ? 'champion' : 'palette',
        pending.refId,
      );
      uiSound('ui_confirm');
      setNotice(`Purchased for ${res.paid.toLocaleString()} coins.`);
      setPending(null);
    } catch {
      const code = useAccount.getState().error;
      setNotice(
        code === 'insufficient_coins'
          ? 'Not enough coins.'
          : code === 'already_owned'
            ? 'You already own that.'
            : code === 'offline'
              ? 'The store is unreachable right now.'
              : 'That purchase did not go through.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (status !== 'ready') {
    return (
      <div className="shop-screen">
        <h1 className="menu-heading">Store</h1>
        <p className="empty-note">
          {status === 'offline'
            ? 'The store needs a connection. Everything you have already unlocked still works offline.'
            : 'Sign in to spend your coins — everything you have earned is waiting.'}
        </p>
      </div>
    );
  }

  return (
    <div className="shop-screen">
      <div className="screen-head">
        <h1 className="menu-heading">Store</h1>
        <span className="purse">
          <span className="coin">⬢</span> {coins.toLocaleString()}
        </span>
      </div>

      {featured.length > 0 && (
        <section className="featured">
          <div className="section-label">Spotlight this week</div>
          <p className="featured-note">
            Free to play right now in the rotation — and available at the usual price whenever you
            want to keep them.
          </p>
          <div className="featured-row">
            {featured.map((c) => (
              <button
                key={c.id}
                type="button"
                className="featured-card"
                onClick={() => {
                  uiSound('ui_click');
                  setTab('champions');
                  setPending({ kind: 'champions', refId: c.id });
                }}
              >
                <span className="fc-name">{c.name}</span>
                <span className="fc-title">{CHAMPIONS[c.id]?.title}</span>
                <span className="fc-price">
                  <span className="coin">⬢</span> {c.price.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="filter-row" role="tablist" aria-label="Store sections">
        {(['champions', 'palettes'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            className={`filter-chip${t === tab ? ' on' : ''}`}
            onClick={() => {
              uiSound('ui_hover');
              setTab(t);
            }}
          >
            {t === 'champions' ? 'Champions' : 'Palettes'}
          </button>
        ))}
      </div>

      {tab === 'champions' ? (
        lockedChampions.length === 0 ? (
          <p className="empty-note">You own every champion. Nicely done.</p>
        ) : (
          <div className="shop-grid">
            {lockedChampions.map((c) => (
              <ShopCard
                key={c.id}
                title={c.name}
                subtitle={CHAMPIONS[c.id]?.title ?? ''}
                price={c.price}
                affordable={coins >= c.price}
                onBuy={() => setPending({ kind: 'champions', refId: c.id })}
              />
            ))}
          </div>
        )
      ) : lockedPalettes.length === 0 ? (
        <p className="empty-note">Every palette is yours.</p>
      ) : (
        <div className="shop-grid">
          {lockedPalettes.map((p) => (
            <ShopCard
              key={p.id}
              title={p.name}
              subtitle={CHAMPIONS[p.championId]?.name ?? p.championId}
              price={COSMETIC_PRICES.palette}
              affordable={coins >= COSMETIC_PRICES.palette}
              swatch={p.swatch}
              onBuy={() => setPending({ kind: 'palettes', refId: p.id })}
            />
          ))}
        </div>
      )}

      {pending && (
        <ConfirmPurchase
          label={
            pending.kind === 'champions'
              ? (CHAMPIONS[pending.refId]?.name ?? pending.refId)
              : (PALETTES.find((p) => p.id === pending.refId)?.name ?? pending.refId)
          }
          price={
            pending.kind === 'champions'
              ? (champions.find((c) => c.id === pending.refId)?.price ?? 0)
              : COSMETIC_PRICES.palette
          }
          coins={coins}
          busy={busy}
          onCancel={() => {
            setPending(null);
            setNotice(null);
          }}
          onConfirm={() => void confirm()}
        />
      )}

      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

function ShopCard({
  title,
  subtitle,
  price,
  affordable,
  swatch,
  onBuy,
}: {
  title: string;
  subtitle: string;
  price: number;
  affordable: boolean;
  swatch?: string;
  onBuy: () => void;
}): React.ReactElement {
  return (
    <div className="shop-card">
      {swatch ? (
        <span className="sc-swatch" style={{ background: swatch }} />
      ) : (
        <span className="sc-mark">{title.slice(0, 1)}</span>
      )}
      <div className="sc-body">
        <strong>{title}</strong>
        <span className="subtle">{subtitle}</span>
      </div>
      <button
        type="button"
        className={`btn small${affordable ? ' primary' : ''}`}
        disabled={!affordable}
        title={affordable ? undefined : 'Not enough coins yet'}
        onClick={() => {
          uiSound('ui_click');
          onBuy();
        }}
      >
        <span className="coin">⬢</span> {price.toLocaleString()}
      </button>
    </div>
  );
}

function ConfirmPurchase({
  label,
  price,
  coins,
  busy,
  onCancel,
  onConfirm,
}: {
  label: string;
  price: number;
  coins: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  return (
    <div
      className="modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={`Confirm purchase of ${label}`}
    >
      <div className="panel col modal-panel">
        <h2>{label}</h2>
        <p className="subtle">
          <span className="coin">⬢</span> {price.toLocaleString()} — you have{' '}
          {coins.toLocaleString()}, leaving {(coins - price).toLocaleString()}.
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Buying…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
