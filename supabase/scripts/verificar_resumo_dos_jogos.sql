-- Verificar o resumo (estado/resultado) de todos os jogos de uma conta.
--
-- Contexto: até setembro de 2026, terminar um jogo enviava todos os eventos
-- (golos, substituições, etc.) para o servidor, mas NUNCA atualizava a
-- própria linha do jogo na tabela `matches` — ficava para sempre "DRAFT" e
-- "0-0", mesmo com o jogo todo lá dentro em eventos. Dentro da app isto não
-- se notava (o ecrã reconstrói o resultado a partir dos eventos), mas
-- consultar `matches` diretamente (aqui, ou num relatório) mostrava sempre
-- o jogo como por começar.
--
-- Corrigido em duas partes:
--   1. Um "backfill" que recalculou o resumo de todos os jogos já terminados
--      a partir dos eventos que já lá estavam guardados (correu uma vez, em
--      setembro de 2026 — nada se perdeu, só se preencheram os campos que
--      faltavam).
--   2. O código (`src/app/match/live/page.jsx`, `src/lib/data/mappers.js`)
--      passou a gravar o resumo (estado, resultado, horas) na própria linha
--      do jogo sempre que um jogo termina, para os novos jogos não voltarem
--      a ter este problema.
--
-- Troca o email abaixo pelo que quiseres verificar.

select
  m.id,
  m.opponent_name as adversario,
  m.status,
  m.team_score || ' - ' || m.opponent_score as resultado,
  m.halftime_team_score || ' - ' || m.halftime_opponent_score as intervalo,
  m.started_at,
  m.finished_at,
  m.scheduled_at,
  t.name as escalao,
  c.name as clube,
  (select count(*) from match_events me where me.match_id = m.id and me.undone_at is null) as n_eventos
from matches m
join teams t on t.id = m.team_id
join clubs c on c.id = t.club_id
join profiles p on p.id = c.owner_id
where p.email = 'pedro.quinta77@gmail.com'   -- <-- muda o email aqui
order by m.scheduled_at desc;

-- Para confirmar que não ficou nenhum jogo "esquecido" (tem o evento de
-- terminar mas o estado ainda não bate certo) — deve devolver zero linhas:
--
-- select count(*)
-- from matches m
-- where m.status != 'FINISHED'
--   and exists (
--     select 1 from match_events e
--     where e.match_id = m.id and e.undone_at is null and e.event_type = 'MATCH_FINISHED'
--   );
