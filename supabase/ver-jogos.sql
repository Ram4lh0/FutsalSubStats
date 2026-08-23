-- ver-jogos.sql — os jogos de uma conta, só para ler.
--
-- Não escreve nada. Corre no Supabase → SQL Editor, uma consulta de cada vez
-- (marca a que quiseres e carrega em Run).
--
-- Troca o email nas três.

/* ------------------------------------------------- 1. a lista de jogos */

select
  c.name                                as clube,
  t.name                                as escalao,
  k.name                                as prova,
  to_char(m.scheduled_at, 'DD/MM/YYYY') as quando,
  m.opponent_name                       as adversario,
  case m.home_or_away when 'AWAY' then 'fora' else 'casa' end as onde,
  m.status,
  m.team_score || '-' || m.opponent_score as resultado,
  (select count(*) from match_squad s where s.match_id = m.id) as convocados,
  (select count(*) from match_events e where e.match_id = m.id) as eventos,
  m.archived_at is not null             as apagado
from matches m
join clubs c on c.id = m.club_id
left join teams t on t.id = m.team_id
left join competitions k on k.id = m.competition_id
join profiles p on p.id = c.owner_id
where lower(p.email) = lower('rdcdc91@hotmail.com')
order by m.scheduled_at desc nulls last;

/* --------------------------------------------- 2. o resumo, em uma linha */

select
  count(*)                                             as jogos,
  count(*) filter (where m.status = 'FINISHED')        as terminados,
  count(*) filter (where m.archived_at is not null)    as apagados,
  sum(m.team_score)                                    as golos_marcados,
  sum(m.opponent_score)                                as golos_sofridos
from matches m
join clubs c on c.id = m.club_id
join profiles p on p.id = c.owner_id
where lower(p.email) = lower('rdcdc91@hotmail.com');

/* ------------------------- 3. a linha de eventos de um jogo em concreto */
--
-- Põe o id do jogo (sai da consulta 1 se lhe acrescentares `m.id`). É isto que
-- a app lê para reconstruir o jogo: o estado não está guardado em lado nenhum,
-- é sempre recalculado a partir daqui.

select
  e.seq,
  e.event_type,
  e.period,
  to_char((e.match_elapsed_ms || ' milliseconds')::interval, 'MI:SS') as ao_minuto,
  e.player_id,
  e.player_in_id,
  e.player_out_id,
  e.undone_at is not null as desfeito
from match_events e
where e.match_id = '00000000-0000-0000-0000-000000000000'   -- ← o id do jogo
order by e.seq;
