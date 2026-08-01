-- 0001_init.sql — esquema completo do MVP (secção 7 da especificação).
-- Pronto a correr em `supabase db push` ou no SQL editor do Supabase.

create extension if not exists "pgcrypto";

/* ------------------------------------------------------------------ tipos */

create type player_position as enum (
  'GOALKEEPER', 'FIXO', 'LEFT_WINGER', 'RIGHT_WINGER', 'PIVOT', 'UNIVERSAL', 'UNDEFINED'
);

create type match_location as enum ('HOME', 'AWAY');

create type strong_foot as enum ('RIGHT', 'LEFT', 'BOTH', 'UNKNOWN');

create type match_status as enum (
  'DRAFT', 'READY',
  'FIRST_HALF_RUNNING', 'FIRST_HALF_PAUSED',
  'HALFTIME',
  'SECOND_HALF_RUNNING', 'SECOND_HALF_PAUSED',
  'FINISHED'
);

create type timer_status as enum ('STOPPED', 'RUNNING', 'PAUSED');

create type player_location as enum ('COURT', 'BENCH');

create type match_player_status as enum ('ON_COURT', 'ON_BENCH', 'EXPELLED', 'UNAVAILABLE');

create type stint_end_reason as enum (
  'SUBSTITUTED', 'HALFTIME', 'MATCH_FINISHED', 'EXPELLED', 'CORRECTED'
);

create type match_event_type as enum (
  'MATCH_CREATED', 'SQUAD_UPDATED',
  'FIRST_HALF_STARTED', 'CLOCK_PAUSED', 'CLOCK_RESUMED', 'FIRST_HALF_FINISHED',
  'SECOND_HALF_LINEUP_SET', 'SECOND_HALF_STARTED',
  'SUBSTITUTION', 'POSITION_CHANGED',
  'PLAYER_EXPELLED', 'PLAYER_REPLACED_AFTER_EXPULSION',
  'PENALTY_STARTED', 'PENALTY_ENDED',
  'GOAL_ATTRIBUTED', 'YELLOW_CARD', 'RED_CARD',
  'TEAM_FOUL_ADDED', 'TEAM_FOUL_REMOVED',
  'OPPONENT_FOUL_ADDED', 'OPPONENT_FOUL_REMOVED', 'FOUL_ATTRIBUTED',
  'TEAM_GOAL_ADDED', 'TEAM_GOAL_REMOVED',
  'OPPONENT_GOAL_ADDED', 'OPPONENT_GOAL_REMOVED',
  'MATCH_FINISHED', 'EVENT_UNDONE', 'MATCH_CORRECTED'
);

/* --------------------------------------------------------------- tabelas */

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table clubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  logo_url text,
  primary_color text,
  secondary_color text,
  current_season text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clubs_owner_idx on clubs (owner_id);

create table players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  shirt_number integer not null check (shirt_number between 0 and 99),
  preferred_position player_position default 'UNIVERSAL',
  strong_foot strong_foot default 'UNKNOWN',
  photo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Regra 3.1: dois jogadores ATIVOS do mesmo clube não podem partilhar número.
create unique index players_club_number_active_idx
  on players (club_id, shirt_number) where is_active;
create index players_club_idx on players (club_id);

create table matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  opponent_name text not null check (length(btrim(opponent_name)) > 0),
  competition text,
  venue text,
  season text,
  home_or_away match_location not null default 'HOME',
  scheduled_at timestamptz,
  status match_status not null default 'DRAFT',
  current_period integer not null default 0,
  timer_status timer_status not null default 'STOPPED',
  period_duration_ms integer not null default 1200000 check (period_duration_ms > 0),
  elapsed_match_ms bigint not null default 0,
  period_elapsed_ms bigint not null default 0,
  timer_started_at timestamptz,
  team_score integer not null default 0 check (team_score >= 0),
  opponent_score integer not null default 0 check (opponent_score >= 0),
  halftime_team_score integer,
  halftime_opponent_score integer,
  -- Total de faltas acumuladas da nossa equipa no jogo (1.ª + 2.ª parte).
  -- Denormalizado a partir dos eventos ao terminar o jogo, para consultas
  -- rápidas de histórico sem reconstruir a linha temporal.
  team_fouls integer,
  notes text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index matches_club_idx on matches (club_id, scheduled_at desc);

create table match_squad (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  player_id uuid not null references players (id) on delete restrict,
  player_name_snapshot text not null,
  shirt_number_snapshot integer not null,
  preferred_position player_position,
  initial_position player_position,
  initial_location player_location not null default 'BENCH',
  current_status match_player_status not null default 'ON_BENCH',
  expelled_at_match_ms bigint,
  available_from_ms bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id),
  unique (match_id, shirt_number_snapshot)
);
create index match_squad_match_idx on match_squad (match_id);

-- Máximo de 14 convocados por jogo (secção 3.2).
create or replace function enforce_squad_limit() returns trigger as $$
begin
  if (select count(*) from match_squad where match_id = new.match_id) > 14 then
    raise exception 'Máximo de 14 convocados por jogo';
  end if;
  return new;
end;
$$ language plpgsql;

create constraint trigger match_squad_limit
  after insert on match_squad
  deferrable initially deferred
  for each row execute function enforce_squad_limit();

create table match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  seq integer not null,
  event_type match_event_type not null,
  period integer not null default 0,
  match_elapsed_ms bigint not null default 0,
  period_elapsed_ms bigint not null default 0,
  player_id uuid references players (id),
  player_in_id uuid references players (id),
  player_out_id uuid references players (id),
  position player_position,
  team_score_snapshot integer,
  opponent_score_snapshot integer,
  metadata jsonb not null default '{}'::jsonb,
  client_event_id uuid not null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid references profiles (id),
  -- Impede duplicados quando a fila offline é reenviada (secção 10).
  unique (client_event_id),
  unique (match_id, seq)
);
create index match_events_match_idx on match_events (match_id, seq);

create table player_stints (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  match_squad_id uuid not null references match_squad (id) on delete cascade,
  player_id uuid not null references players (id),
  stint_number integer not null,
  start_event_id uuid references match_events (id),
  end_event_id uuid references match_events (id),
  start_period integer not null,
  end_period integer,
  start_match_ms bigint not null,
  end_match_ms bigint,
  start_period_ms bigint not null,
  end_period_ms bigint,
  starting_position player_position,
  ending_reason stint_end_reason,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id, stint_number)
);
create index player_stints_match_idx on player_stints (match_id);

/* ------------------------------------------------------------ updated_at */

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['profiles','clubs','players','matches','match_squad','player_stints'] loop
    execute format(
      'create trigger %I_touch before update on %I for each row execute function touch_updated_at()',
      t, t
    );
  end loop;
end $$;

/* -------------------------------------------------- Row Level Security */
-- Regra da secção 11: tudo se resolve a partir de clubs.owner_id = auth.uid().

alter table profiles      enable row level security;
alter table clubs         enable row level security;
alter table players       enable row level security;
alter table matches       enable row level security;
alter table match_squad   enable row level security;
alter table match_events  enable row level security;
alter table player_stints enable row level security;

create policy profiles_self on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy clubs_owner on clubs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy players_owner on players
  for all using (exists (select 1 from clubs c where c.id = players.club_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from clubs c where c.id = players.club_id and c.owner_id = auth.uid()));

create policy matches_owner on matches
  for all using (exists (select 1 from clubs c where c.id = matches.club_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from clubs c where c.id = matches.club_id and c.owner_id = auth.uid()));

create policy match_squad_owner on match_squad
  for all using (exists (
    select 1 from matches m join clubs c on c.id = m.club_id
    where m.id = match_squad.match_id and c.owner_id = auth.uid()))
  with check (exists (
    select 1 from matches m join clubs c on c.id = m.club_id
    where m.id = match_squad.match_id and c.owner_id = auth.uid()));

create policy match_events_owner on match_events
  for all using (exists (
    select 1 from matches m join clubs c on c.id = m.club_id
    where m.id = match_events.match_id and c.owner_id = auth.uid()))
  with check (exists (
    select 1 from matches m join clubs c on c.id = m.club_id
    where m.id = match_events.match_id and c.owner_id = auth.uid()));

create policy player_stints_owner on player_stints
  for all using (exists (
    select 1 from matches m join clubs c on c.id = m.club_id
    where m.id = player_stints.match_id and c.owner_id = auth.uid()))
  with check (exists (
    select 1 from matches m join clubs c on c.id = m.club_id
    where m.id = player_stints.match_id and c.owner_id = auth.uid()));

/* ------------------------------------------------ perfil automático */

create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

/* ---------------------------------------------- escrita idempotente */
-- Chamada pela fila offline: reenviar o mesmo client_event_id não duplica nada.

create or replace function append_match_event(payload jsonb)
returns match_events as $$
declare
  v_match uuid := (payload->>'match_id')::uuid;
  v_seq integer;
  v_row match_events;
begin
  select * into v_row from match_events
   where client_event_id = (payload->>'client_event_id')::uuid;
  if found then
    return v_row;
  end if;

  select coalesce(max(seq), 0) + 1 into v_seq from match_events where match_id = v_match;

  insert into match_events (
    match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
    player_id, player_in_id, player_out_id, position,
    team_score_snapshot, opponent_score_snapshot, metadata, client_event_id, created_by
  ) values (
    v_match, v_seq,
    (payload->>'event_type')::match_event_type,
    coalesce((payload->>'period')::int, 0),
    coalesce((payload->>'match_elapsed_ms')::bigint, 0),
    coalesce((payload->>'period_elapsed_ms')::bigint, 0),
    nullif(payload->>'player_id', '')::uuid,
    nullif(payload->>'player_in_id', '')::uuid,
    nullif(payload->>'player_out_id', '')::uuid,
    nullif(payload->>'position', '')::player_position,
    (payload->>'team_score_snapshot')::int,
    (payload->>'opponent_score_snapshot')::int,
    coalesce(payload->'metadata', '{}'::jsonb),
    (payload->>'client_event_id')::uuid,
    auth.uid()
  ) returning * into v_row;

  return v_row;
end;
$$ language plpgsql security invoker;
