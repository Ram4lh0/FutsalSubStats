-- 0003_escaloes_e_competicoes.sql
--
-- O clube deixa de ser a unidade de trabalho e passa a ser um guarda-chuva:
-- dentro dele vivem os escalões (Sub-15, Sub-17, Séniores…), cada um com o seu
-- plantel, os seus jogos e as suas competições. Um jogador é de um escalão; as
-- estatísticas nunca atravessam escalões, porque comparar um Sub-15 com um
-- sénior não diz nada a ninguém.
--
-- A época continua a ser do clube — todos os escalões partilham a mesma. O tipo
-- de tempo passa para o escalão, porque é aí que difere: os miúdos jogam corrido
-- e os séniores cronometrado.
--
-- Esta migração não perde nada: cada clube existente ganha um escalão para onde
-- os jogadores e os jogos são mudados. E pode ser corrida mais do que uma vez
-- sem estragar nada — tudo o que cria é verificado antes.

/* ------------------------------------------------------------- escalões */

do $$
begin
  if not exists (select 1 from pg_type where typname = 'match_timing') then
    create type match_timing as enum ('TIMED', 'UNTIMED');
  end if;
end $$;

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  short_name text,
  timing match_timing not null default 'UNTIMED',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists teams_club_idx on teams (club_id);

comment on table teams is 'Escalões de um clube. O nome é livre: quem treina é que sabe como lhes chama.';

/* --------------------------------------------------------- competições */

create table if not exists competitions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  short_name text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists competitions_team_idx on competitions (team_id);

comment on table competitions is
  'Provas em que um escalão participa: campeonato, taça, particulares.';

/* ------------------------------------------ ligar jogadores e jogos */

alter table players add column if not exists team_id uuid references teams (id) on delete cascade;
alter table matches add column if not exists team_id uuid references teams (id) on delete cascade;
alter table matches add column if not exists competition_id uuid references competitions (id) on delete set null;

/* --------------------------------------------------------- migração */

-- Um escalão por clube, a herdar o tipo de tempo que o clube tinha, e tudo o
-- que já existe passa para lá. Se a base já estiver vazia, isto não faz nada.
do $$
declare
  c record;
  novo_team uuid;
  nome_prova text;   -- o texto que estava escrito no jogo
  nova_comp uuid;    -- a competição a sério que nasce desse texto
  tem_timing boolean;
begin
  -- A coluna `timing` do clube pode já ter sido removida por uma passagem
  -- anterior desta migração.
  select exists (
    select 1 from information_schema.columns
    where table_name = 'clubs' and column_name = 'timing'
  ) into tem_timing;

  for c in select id from clubs loop
    -- Clube já tratado numa passagem anterior? Não repetir.
    if exists (select 1 from teams where club_id = c.id) then
      continue;
    end if;

    if tem_timing then
      execute 'insert into teams (club_id, name, timing) select $1, ''Sénior'', coalesce(timing, ''UNTIMED'') from clubs where id = $1 returning id'
        into novo_team using c.id;
    else
      insert into teams (club_id, name) values (c.id, 'Sénior') returning id into novo_team;
    end if;

    update players set team_id = novo_team where club_id = c.id and team_id is null;

    -- Os jogos antigos guardavam a competição como texto solto. Cada texto
    -- distinto vira uma competição a sério, e os jogos passam a apontar para ela.
    for nome_prova in
      select distinct btrim(competition) from matches
      where club_id = c.id and competition is not null and btrim(competition) <> ''
    loop
      insert into competitions (team_id, name) values (novo_team, nome_prova)
      returning id into nova_comp;
      update matches set competition_id = nova_comp
      where club_id = c.id and btrim(competition) = nome_prova;
    end loop;

    -- Jogos sem competição ficam num balde próprio, para nenhum jogo ficar órfão
    -- agora que a competição passa a ser obrigatória.
    if exists (
      select 1 from matches
      where club_id = c.id and (competition is null or btrim(competition) = '')
    ) then
      insert into competitions (team_id, name) values (novo_team, 'Sem competição')
      returning id into nova_comp;
      update matches set competition_id = nova_comp
      where club_id = c.id and (competition is null or btrim(competition) = '');
    end if;

    update matches set team_id = novo_team where club_id = c.id and team_id is null;
  end loop;
end $$;

-- Depois de tudo migrado, o vínculo passa a ser obrigatório.
alter table players alter column team_id set not null;
alter table matches alter column team_id set not null;

create index if not exists players_team_idx on players (team_id);
create index if not exists matches_team_idx on matches (team_id, scheduled_at desc);
create index if not exists matches_competition_idx on matches (competition_id);

-- O número de camisola é único dentro do escalão, não do clube: o 10 dos
-- Sub-15 e o 10 dos séniores são pessoas diferentes.
drop index if exists players_club_number_active_idx;
create unique index if not exists players_team_number_active_idx
  on players (team_id, shirt_number) where is_active;

-- O tipo de tempo mudou-se para o escalão.
alter table clubs drop column if exists timing;

/* ------------------------------------------------ segurança por linha */

alter table teams enable row level security;
alter table competitions enable row level security;

drop policy if exists teams_owner on teams;
create policy teams_owner on teams
  for all using (exists (select 1 from clubs c where c.id = teams.club_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from clubs c where c.id = teams.club_id and c.owner_id = auth.uid()));

drop policy if exists competitions_owner on competitions;
create policy competitions_owner on competitions
  for all using (exists (
    select 1 from teams t join clubs c on c.id = t.club_id
    where t.id = competitions.team_id and c.owner_id = auth.uid()))
  with check (exists (
    select 1 from teams t join clubs c on c.id = t.club_id
    where t.id = competitions.team_id and c.owner_id = auth.uid()));

drop trigger if exists teams_touch on teams;
create trigger teams_touch before update on teams
  for each row execute function touch_updated_at();

drop trigger if exists competitions_touch on competitions;
create trigger competitions_touch before update on competitions
  for each row execute function touch_updated_at();

/* ------------------------------------- o jogo herda o tempo do escalão */

create or replace function match_inherits_club_timing() returns trigger as $$
begin
  -- O tipo de tempo vem do escalão, mas pode ser mudado jogo a jogo: um
  -- particular pode ser corrido mesmo num escalão que joga cronometrado.
  if new.timing is null then
    select t.timing into new.timing from teams t where t.id = new.team_id;
    new.timing := coalesce(new.timing, 'UNTIMED');
  end if;
  new.period_duration_ms := case when new.timing = 'TIMED' then 1200000 else 1800000 end;
  new.penalty_duration_ms := case when new.timing = 'TIMED' then 120000 else 180000 end;
  return new;
end;
$$ language plpgsql;

drop trigger if exists matches_timing_defaults on matches;
create trigger matches_timing_defaults
  before insert or update of timing on matches
  for each row execute function match_inherits_club_timing();
