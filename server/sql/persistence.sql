create table if not exists players (
  id bigserial primary key,
  name text not null unique,
  balance numeric(14,2) not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stock_positions (
  player_id bigint not null references players(id) on delete cascade,
  symbol text not null,
  shares numeric(20,8) not null check (shares > 0),
  avg_cost numeric(14,4) not null,
  primary key (player_id, symbol)
);

create table if not exists wallet_ledger (
  id bigserial primary key,
  player_id bigint not null references players(id) on delete cascade,
  delta numeric(14,2) not null,
  reason text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists picto_strokes (
  id bigserial primary key,
  stroke_id text not null unique,
  author_name text not null,
  tool text not null,
  color text not null,
  size integer not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists picto_messages (
  id bigserial primary key,
  author_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists turkish_streaks (
  player_id bigint primary key references players(id) on delete cascade,
  current_streak integer not null default 0,
  max_streak integer not null default 0,
  last_completed_day integer
);

create index if not exists turkish_streaks_current_idx
  on turkish_streaks (current_streak desc, max_streak desc);

create table if not exists brain_leaderboards (
  player_id bigint primary key references players(id) on delete cascade,
  best_brain_age integer not null,
  updated_at timestamptz not null default now()
);

create index if not exists brain_leaderboards_age_idx
  on brain_leaderboards (best_brain_age asc, updated_at desc);

create table if not exists brain_game_leaderboards (
  player_id bigint not null references players(id) on delete cascade,
  game_id text not null,
  best_score integer not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, game_id)
);

create index if not exists brain_game_leaderboards_game_idx
  on brain_game_leaderboards (game_id, best_score, updated_at desc);

create table if not exists lol_bets (
  id bigserial primary key,
  player_id bigint not null references players(id) on delete cascade,
  player_name text not null,
  lol_username text not null,
  bet_amount numeric(14,2) not null check (bet_amount > 0),
  bet_on_win boolean not null,
  status text not null default 'pending',
  puuid text,
  last_match_id text,
  game_id text,
  result boolean,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- backfill columns that may be missing on databases created before these were added
alter table lol_bets add column if not exists puuid text;
alter table lol_bets add column if not exists last_match_id text;
alter table lol_bets add column if not exists game_id text;
alter table lol_bets add column if not exists result boolean;
alter table lol_bets add column if not exists resolved_at timestamptz;

-- add diamonds column for diamond shop feature
alter table players add column if not exists diamonds integer not null default 0;

-- add character_data column for persistent character portraits
alter table players add column if not exists character_data jsonb;

create index if not exists lol_bets_status_idx
  on lol_bets (status, created_at desc);

create index if not exists lol_bets_player_idx
  on lol_bets (player_id, created_at desc);

create index if not exists lol_bets_player_name_idx
  on lol_bets (player_name);

create index if not exists wallet_ledger_player_created_idx
  on wallet_ledger (player_id, created_at desc);

-- tierlist placements for Thing of the Week
create table if not exists tierlist_placements (
  id bigserial primary key,
  player_name text not null,
  week_key text not null,
  item_index smallint not null,
  tier text not null,
  placed_at timestamptz not null default now(),
  unique (player_name, week_key, item_index)
);

create index if not exists tierlist_placements_week_idx
  on tierlist_placements (week_key);

create index if not exists tierlist_placements_player_week_idx
  on tierlist_placements (player_name, week_key);

-- ============================================================================
-- Daily Streaks (lobby-wide login streak)
-- ============================================================================
create table if not exists daily_streaks (
  player_id bigint primary key references players(id) on delete cascade,
  current_streak integer not null default 0,
  max_streak integer not null default 0,
  last_claimed_day integer,
  total_claims integer not null default 0
);

create index if not exists daily_streaks_current_idx
  on daily_streaks (current_streak desc, max_streak desc);

-- ============================================================================
-- Achievements
-- ============================================================================
create table if not exists achievements (
  player_id bigint not null references players(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  metadata jsonb,
  primary key (player_id, achievement_id)
);

create index if not exists achievements_unlocked_idx
  on achievements (player_id, unlocked_at desc);

-- ============================================================================
-- Achievement progress counters (running tallies for incremental unlocks)
-- ============================================================================
create table if not exists achievement_progress (
  player_id bigint not null references players(id) on delete cascade,
  counter_id text not null,
  value bigint not null default 0,
  primary key (player_id, counter_id)
);

-- ============================================================================
-- Loop Machine — singleton row holding the live shared state (grid, bpm, etc.)
-- ============================================================================
create table if not exists loop_machine_state (
  id smallint primary key,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  constraint loop_machine_state_singleton check (id = 1)
);
