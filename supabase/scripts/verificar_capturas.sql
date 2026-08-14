-- verificar_capturas.sql — os dados das capturas chegaram mesmo?
--
-- Nas capturas do telemóvel a época aparece vazia: a página da competição diz
-- "6 jogos · 0 terminados" e zero golos, e a ficha do jogador mostra 0–0 em
-- todos os jogos. Os jogos e os jogadores estão lá; os acontecimentos que
-- fazem os resultados é que não.
--
-- Isso deixa duas hipóteses, e esta consulta separa-as:
--
--   A) O servidor não tem os acontecimentos → o script falhou a meio.
--   B) O servidor tem-nos e o telemóvel não os descarregou → é a sincronização.
--
-- Correr no Supabase → SQL Editor e olhar para a coluna `eventos`.

select
  m.scheduled_at::date              as data,
  m.opponent_name                   as adversario,
  m.status,
  count(e.id)                       as eventos,
  count(*) filter (where e.event_type = 'TEAM_GOAL_ADDED')     as golos_nossos,
  count(*) filter (where e.event_type = 'OPPONENT_GOAL_ADDED') as golos_deles,
  bool_or(e.event_type = 'MATCH_FINISHED')                     as tem_fim
from matches m
join clubs c on c.id = m.club_id
left join match_events e on e.match_id = m.id
where c.name = 'CD Ribeira Alta'
group by m.id, m.scheduled_at, m.opponent_name, m.status
order by m.scheduled_at;

-- Como ler:
--
--   `eventos` a zero em todas as linhas  → hipótese A. O script não chegou ao
--   fim, e é preciso voltar a corrê-lo (ele começa por apagar o clube antigo,
--   por isso não duplica nada).
--
--   `eventos` com 12 a 20 por jogo, `tem_fim` verdadeiro, e os golos a bater
--   certo com 4-2, 2-2, 5-1, 1-3, 3-0, 6-4 → hipótese B. Os dados estão bons e
--   o problema é a descarga: na app, "Limpar este dispositivo" força um pull
--   completo do servidor.
