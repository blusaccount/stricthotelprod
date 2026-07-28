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

-- add diamonds column for diamond shop feature
alter table players add column if not exists diamonds integer not null default 0;

-- add character_data column for persistent character portraits
alter table players add column if not exists character_data jsonb;

-- TOFU owner token for player names (claimed on first register-player)
alter table players add column if not exists owner_token text;

-- Last time this player registered from a browser. Distinct from updated_at,
-- which only moves when the balance changes: someone can play Watch Party or
-- Food Guessr for months without a single coin transaction. Drives the
-- inactive-account retention job in server/retention.js.
alter table players add column if not exists last_seen_at timestamptz;

create index if not exists players_last_seen_idx
  on players (last_seen_at);

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

-- ============================================================================
-- Food Guessr — per-user smash/pass votes on dishes (rating mode)
-- Used to compute community ratings for the Scrandle "community" mode.
-- ============================================================================
create table if not exists food_ratings (
  id bigserial primary key,
  player_name text not null,
  dish_key text not null,
  rating smallint not null check (rating in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_name, dish_key)
);

create index if not exists food_ratings_dish_idx
  on food_ratings (dish_key);

create index if not exists food_ratings_player_idx
  on food_ratings (player_name);

-- ============================================================================
-- Stock price cache — last-known live prices, persisted so portfolio G/L
-- survives Yahoo Finance outages and free-tier cold starts.
-- ============================================================================
create table if not exists stock_price_cache (
  symbol text primary key,
  name text,
  price numeric(20,6) not null,
  currency text,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Food Guessr — Scrandle best streak per player per variant (wiki | community)
-- ============================================================================
create table if not exists food_scrandle_streaks (
  player_name text not null,
  variant text not null check (variant in ('wiki', 'community')),
  best_streak integer not null default 0,
  total_runs integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (player_name, variant)
);

create index if not exists food_scrandle_streaks_variant_idx
  on food_scrandle_streaks (variant, best_streak desc, updated_at desc);

-- ============================================================================
-- Food Guessr — Classic mode best score per player
-- ============================================================================
create table if not exists food_classic_scores (
  player_name text not null primary key,
  best_score integer not null default 0,
  total_games integer not null default 0,
  perfect_games integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists food_classic_scores_best_idx
  on food_classic_scores (best_score desc, updated_at desc);
