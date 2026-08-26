-- Regras próprias de cada competição. Jogos já iniciados preservam a duração
-- com que arrancaram; jogos ainda em preparação acompanham futuras alterações.

alter table public.competitions
  add column if not exists timing public.match_timing,
  add column if not exists max_squad smallint;

update public.competitions c
set timing = coalesce(c.timing, t.timing, 'UNTIMED'::public.match_timing),
    max_squad = coalesce(c.max_squad, 14)
from public.teams t
where t.id = c.team_id
  and (c.timing is null or c.max_squad is null);

alter table public.competitions
  alter column timing set default 'UNTIMED',
  alter column timing set not null,
  alter column max_squad set default 14;

alter table public.competitions
  drop constraint if exists competitions_max_squad_check;
alter table public.competitions
  add constraint competitions_max_squad_check
  check (max_squad is null or max_squad between 5 and 99);

comment on column public.competitions.timing is
  'Tipo de relógio herdado por todos os jogos desta competição.';
comment on column public.competitions.max_squad is
  'Máximo de convocados por jogo; NULL significa sem limite.';

create or replace function public.match_inherits_club_timing() returns trigger as $$
declare
  competition_timing public.match_timing;
begin
  if new.competition_id is not null then
    select c.timing into competition_timing
    from public.competitions c
    where c.id = new.competition_id and c.team_id = new.team_id;
  end if;

  if competition_timing is not null then
    new.timing := competition_timing;
  elsif new.timing is null then
    select t.timing into new.timing from public.teams t where t.id = new.team_id;
    new.timing := coalesce(new.timing, 'UNTIMED');
  end if;

  new.period_duration_ms := case when new.timing = 'TIMED' then 1200000 else 1800000 end;
  new.penalty_duration_ms := case when new.timing = 'TIMED' then 120000 else 180000 end;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists matches_timing_defaults on public.matches;
create trigger matches_timing_defaults
  before insert or update of timing, competition_id on public.matches
  for each row execute function public.match_inherits_club_timing();

create or replace function public.propagate_competition_timing() returns trigger as $$
begin
  if new.timing is distinct from old.timing then
    update public.matches m
    set timing = new.timing
    where m.competition_id = new.id
      and not exists (
        select 1 from public.match_events e
        where e.match_id = m.id and e.event_type = 'FIRST_HALF_STARTED'
      );
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists competitions_propagate_timing on public.competitions;
create trigger competitions_propagate_timing
  after update of timing on public.competitions
  for each row execute function public.propagate_competition_timing();

create or replace function public.enforce_squad_limit() returns trigger as $$
declare
  squad_limit smallint;
  squad_count integer;
begin
  select c.max_squad into squad_limit
  from public.matches m
  left join public.competitions c on c.id = m.competition_id
  where m.id = new.match_id;

  if squad_limit is null then
    return new;
  end if;

  select count(*) into squad_count
  from public.match_squad s
  where s.match_id = new.match_id;

  if squad_count > squad_limit then
    raise exception 'Máximo de % convocados nesta competição', squad_limit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;
