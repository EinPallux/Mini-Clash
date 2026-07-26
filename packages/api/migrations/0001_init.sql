-- Mini Clash platform schema (TECHNICAL_ARCHITECTURE §9).
--
-- Two rules this schema enforces rather than trusts:
--   1. Coins are a LEDGER. `transactions` is the truth; `profiles.coins` is a
--      cached balance carried alongside it, and the CHECK makes a negative
--      balance impossible at the storage layer rather than in a code path
--      somebody can forget.
--   2. A guest and a registered player are the SAME ROW. Upgrading flips `kind`
--      and adds an email credential; it never creates a second identity, so
--      everything earned as a guest survives the upgrade by construction.

create table users (
  id            text primary key,
  kind          text not null check (kind in ('guest', 'registered')),
  name          text not null,
  email         text unique,
  password_hash text,
  -- Guest credential: the browser's device key. Survives the upgrade so the
  -- original device stays logged in without re-authenticating.
  device_key    text unique,
  created_at    timestamptz not null default now(),
  -- A registered account must have both halves of its credential.
  constraint users_registered_has_email
    check (kind = 'guest' or (email is not null and password_hash is not null))
);

create table profiles (
  user_id    text primary key references users(id) on delete cascade,
  level      integer not null default 1 check (level >= 1),
  xp         integer not null default 0 check (xp >= 0),
  -- Cached balance. Derived from `transactions`; see economy.ts for the
  -- invariant test that re-derives it and compares.
  coins      integer not null default 0 check (coins >= 0),
  banner_id  text not null default 'banner_default',
  showcase   jsonb not null default '[]'::jsonb,
  settings   jsonb not null default '{}'::jsonb,
  -- First-win-of-day streak bookkeeping (GAME_DESIGN §18).
  last_win_day  date,
  win_streak    integer not null default 0 check (win_streak >= 0),
  -- UI_UX §13: the first name change is free, the rest are paid.
  name_changes  integer not null default 0 check (name_changes >= 0)
);

create table unlocks (
  user_id  text not null references users(id) on delete cascade,
  kind     text not null check (kind in ('champion', 'palette', 'sticker', 'pose')),
  ref_id   text not null,
  at       timestamptz not null default now(),
  primary key (user_id, kind, ref_id)
);

create table mastery (
  user_id     text not null references users(id) on delete cascade,
  champion_id text not null,
  xp          integer not null default 0 check (xp >= 0),
  level       integer not null default 1 check (level between 1 and 10),
  primary key (user_id, champion_id)
);

create table quests (
  user_id   text not null references users(id) on delete cascade,
  quest_id  text not null,
  -- 'daily' | 'weekly'; kept denormalised so a reset can target one cadence.
  cadence   text not null check (cadence in ('daily', 'weekly')),
  progress  integer not null default 0 check (progress >= 0),
  state     text not null default 'active' check (state in ('active', 'ready', 'claimed')),
  reset_at  timestamptz not null,
  rerolled  boolean not null default false,
  primary key (user_id, quest_id)
);

create table matches (
  id         text primary key,
  mode       text not null,
  seed       bigint not null,
  started_at timestamptz not null,
  duration   integer not null check (duration >= 0),
  -- The summary blob the history detail view reads back (UI_UX §13).
  result     jsonb not null
);

create table match_players (
  match_id  text not null references matches(id) on delete cascade,
  -- Null for bot seats: a match row keeps the whole 8-seat scoreboard.
  user_id   text references users(id) on delete set null,
  bot_tier  text,
  seat      integer not null,
  team_id   integer not null check (team_id in (0, 1)),
  won       boolean not null,
  duo       jsonb not null,
  stats     jsonb not null,
  augments  jsonb not null default '[]'::jsonb,
  primary key (match_id, seat)
);

create table transactions (
  id        bigserial primary key,
  user_id   text not null references users(id) on delete cascade,
  delta     integer not null,
  reason    text not null,
  ref_id    text,
  -- Purchases carry the client's Idempotency-Key. The unique index below is
  -- what makes a double-click, or two tabs racing, provably charge once.
  idem_key  text,
  at        timestamptz not null default now()
);

create unique index transactions_idem on transactions (user_id, idem_key)
  where idem_key is not null;
create index transactions_user_at on transactions (user_id, at desc);

create table sessions (
  token      text primary key,
  user_id    text not null references users(id) on delete cascade,
  csrf       text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user on sessions (user_id);

create index match_players_user on match_players (user_id);
create index matches_started on matches (started_at desc);
