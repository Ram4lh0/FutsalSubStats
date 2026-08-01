-- 0002_apelidos_e_tempo.sql
-- Alinha o esquema com o que a app passou a guardar depois do MVP inicial:
-- apelidos das equipas para o marcador e o tipo de tempo de jogo.

/* ------------------------------------------------------------ tipo de tempo */

-- Como se joga: cronometrado (relógio pára a cada interrupção, 20 min por parte,
-- 2 min de sanção) ou corrido (30 min por parte, 3 min de sanção). É uma
-- propriedade do CLUBE; cada jogo guarda uma cópia para que alterar o clube não
-- reescreva jogos já disputados.
create type match_timing as enum ('TIMED', 'UNTIMED');

alter table clubs
  add column short_name text,
  add column timing match_timing not null default 'UNTIMED';

comment on column clubs.short_name is
  'Apelido curto para o marcador e resumos. Nulo usa o nome completo.';

alter table matches
  add column opponent_short_name text,
  add column timing match_timing not null default 'UNTIMED';

comment on column matches.timing is
  'Cópia do tipo de tempo do clube à data do jogo.';

/* -------------------------------------------------- duração da sanção */

-- A duração da sanção por expulsão depende do tipo de tempo. Guardar aqui evita
-- espalhar a regra pelo código de cada cliente.
alter table matches
  add column penalty_duration_ms integer not null default 180000
  check (penalty_duration_ms > 0);

/* ---------------------------------------------------- eventos em falta */

-- Eventos criados depois do esquema inicial.
alter type match_event_type add value if not exists 'GOAL_ATTRIBUTED';
alter type match_event_type add value if not exists 'FOUL_ATTRIBUTED';

/* ------------------------------------------------ herdar o tempo do clube */

-- Um jogo novo nasce com o tempo do clube: a app não tem de se lembrar disso, e
-- clientes antigos continuam a criar jogos coerentes.
create or replace function match_inherits_club_timing() returns trigger as $$
begin
  if new.timing is null or tg_op = 'INSERT' then
    select c.timing into new.timing from clubs c where c.id = new.club_id;
    new.timing := coalesce(new.timing, 'UNTIMED');
  end if;
  new.period_duration_ms := case when new.timing = 'TIMED' then 1200000 else 1800000 end;
  new.penalty_duration_ms := case when new.timing = 'TIMED' then 120000 else 180000 end;
  return new;
end;
$$ language plpgsql;

create trigger matches_timing_defaults
  before insert on matches
  for each row execute function match_inherits_club_timing();
