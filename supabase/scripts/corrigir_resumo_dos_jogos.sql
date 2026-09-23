-- Corrige o resumo (estado/resultado) de todos os jogos terminados cujo
-- resumo ainda não bateu certo com os eventos.
--
-- Contexto: até setembro de 2026, terminar um jogo enviava todos os eventos
-- para o servidor mas nunca atualizava a própria linha do jogo na tabela
-- `matches` (ficava "DRAFT"/"0-0" para sempre, mesmo com o jogo todo lá
-- dentro em eventos). Já corrigido no código (`src/app/match/live/page.jsx` +
-- `src/lib/data/mappers.js`, setembro de 2026) — mas essa correção só chega
-- aos telemóveis/iPads já instalados depois de publicares um pacote OTA
-- (`npm run publicar:pacote`, ver `ATUALIZACOES.md`).
--
-- Até esse pacote ser publicado e ativado, QUALQUER jogo terminado num
-- aparelho que ainda tenha o código antigo continua a chegar ao servidor com
-- o resumo errado (mas os eventos certinhos). Este script corrige-os,
-- recalculando o resumo a partir dos próprios eventos já guardados.
--
-- É seguro correr as vezes que quiseres: só toca em jogos cujo `status`
-- ainda não é `FINISHED` e que já têm um evento de "terminar jogo" —
-- nada se perde, e um jogo já corrigido não volta a ser tocado.
--
-- Depois de publicares e ativares o pacote OTA, isto deixa de ser preciso
-- para jogos novos — mas não faz mal nenhum voltar a correr, por garantia.

begin;

with finalizados as (
  select match_id, max(seq) as seq_finish
  from match_events
  where undone_at is null and event_type = 'MATCH_FINISHED'
  group by match_id
),
ultimo_evento as (
  select match_id, max(seq) as seq_ultimo
  from match_events
  where undone_at is null
  group by match_id
),
ultimo_periodo1 as (
  select match_id, max(seq) as seq_p1
  from match_events
  where undone_at is null and period = 1
  group by match_id
),
primeiro_inicio as (
  select match_id, min(created_at) as inicio
  from match_events
  where undone_at is null and event_type = 'FIRST_HALF_STARTED'
  group by match_id
),
calculado as (
  select
    f.match_id,
    fe.created_at as finished_at,
    fe.period as periodo_final,
    pi.inicio as started_at,
    ue_ev.team_score_snapshot as team_score,
    ue_ev.opponent_score_snapshot as opponent_score,
    p1_ev.team_score_snapshot as halftime_team_score,
    p1_ev.opponent_score_snapshot as halftime_opponent_score
  from finalizados f
  join match_events fe on fe.match_id = f.match_id and fe.seq = f.seq_finish
  left join ultimo_evento ue on ue.match_id = f.match_id
  left join match_events ue_ev on ue_ev.match_id = ue.match_id and ue_ev.seq = ue.seq_ultimo
  left join ultimo_periodo1 p1 on p1.match_id = f.match_id
  left join match_events p1_ev on p1_ev.match_id = p1.match_id and p1_ev.seq = p1.seq_p1
  left join primeiro_inicio pi on pi.match_id = f.match_id
)
update matches m
set
  status = 'FINISHED',
  started_at = coalesce(c.started_at, m.started_at),
  finished_at = c.finished_at,
  team_score = coalesce(c.team_score, m.team_score),
  opponent_score = coalesce(c.opponent_score, m.opponent_score),
  halftime_team_score = c.halftime_team_score,
  halftime_opponent_score = c.halftime_opponent_score,
  timer_status = 'STOPPED',
  current_period = coalesce(c.periodo_final, m.current_period)
from calculado c
where m.id = c.match_id
  and m.status != 'FINISHED'
returning m.id, m.opponent_name, m.status, m.team_score, m.opponent_score;

commit;
