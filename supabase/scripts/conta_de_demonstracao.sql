-- conta_de_demonstracao.sql — encher uma conta para quem revê a app.
--
-- Quem revê na Apple abre a app, vê um ecrã de início de sessão, entra com as
-- credenciais que lhe deste — e se do outro lado estiver um painel vazio, não
-- tem como perceber para que serve isto. Rejeições por "não conseguimos avaliar
-- a funcionalidade" são das mais comuns, e das mais fáceis de evitar.
--
-- Este script põe lá dentro um clube com dois escalões, um plantel completo,
-- duas competições, um jogo já jogado do princípio ao fim (com golos,
-- substituições, faltas, cartões e um período de 5v4) e um jogo por jogar, para
-- se poder experimentar o assistente.
--
-- A conta é a `review.futsalsubstats@gmail.com`.
--
-- COMO USAR
--   1. Cria a conta pela app, normalmente: abre o site, "Criar conta", confirma
--      o email. A palavra-passe vai ter de ser escrita no formulário da Apple,
--      por isso que seja uma que só sirva para isto.
--   2. Corre isto no Supabase → SQL Editor.
--   3. Entra na app com essa conta para confirmar que está tudo lá.
--
-- Pode ser corrido outra vez: apaga o clube de demonstração antes de o refazer.

do $$
declare
  email_da_conta text := 'review.futsalsubstats@gmail.com';

  dono uuid;
  clube uuid;
  seniores uuid;
  sub17 uuid;
  campeonato uuid;
  taca uuid;
  jogo uuid;
  n integer := 0;

  -- O plantel. O primeiro é guarda-redes; o resto joga por fora.
  nomes text[] := array[
    'Rui Almeida', 'Tiago Nunes', 'Miguel Faria', 'André Costa', 'Pedro Lima',
    'João Marques', 'Diogo Pinto', 'Bruno Serra', 'Nuno Teixeira', 'Hugo Barros'
  ];
  posicoes player_position[] := array[
    'GOALKEEPER', 'FIXO', 'LEFT_WINGER', 'RIGHT_WINGER', 'PIVOT',
    'UNIVERSAL', 'LEFT_WINGER', 'PIVOT', 'FIXO', 'GOALKEEPER'
  ]::player_position[];
  ids uuid[] := '{}';
  novo uuid;
  i integer;
begin
  select id into dono from profiles where email = email_da_conta;
  if dono is null then
    raise exception 'Não existe conta com o email %. Cria-a primeiro pela app.', email_da_conta;
  end if;

  delete from clubs where owner_id = dono and name = 'CD Demonstração';

  insert into clubs (owner_id, name, short_name, current_season, primary_color)
  values (dono, 'CD Demonstração', 'CDD', '2026/27', '#22c55e')
  returning id into clube;

  insert into teams (club_id, name, short_name, timing)
  values (clube, 'Séniores', 'SEN', 'TIMED') returning id into seniores;
  insert into teams (club_id, name, short_name, timing)
  values (clube, 'Sub-17', 'S17', 'UNTIMED') returning id into sub17;

  insert into competitions (team_id, name, short_name)
  values (seniores, 'Campeonato Distrital', 'CAMP') returning id into campeonato;
  insert into competitions (team_id, name, short_name)
  values (seniores, 'Taça', 'TAÇA') returning id into taca;

  for i in 1..array_length(nomes, 1) loop
    -- O `::strong_foot` não é decoração: dentro de um `case` o Postgres decide o
    -- tipo do resultado antes de olhar para a coluna, e decide "texto". Os
    -- valores são os nomes internos (RIGHT, LEFT, BOTH, UNKNOWN) — quem os
    -- traduz para português é a app.
    insert into players (club_id, team_id, name, shirt_number, preferred_position, strong_foot)
    values (clube, seniores, nomes[i], i, posicoes[i],
            (case when i % 3 = 0 then 'LEFT' else 'RIGHT' end)::strong_foot)
    returning id into novo;
    ids := ids || novo;
  end loop;

  /* ------------------------------------------- o jogo já jogado */

  insert into matches (
    club_id, team_id, competition_id, opponent_name, opponent_short_name,
    home_or_away, scheduled_at, season, timing, status
  ) values (
    clube, seniores, campeonato, 'AD Vizinhança', 'ADV',
    'HOME', now() - interval '6 days', '2026/27', 'TIMED', 'FINISHED'
  ) returning id into jogo;

  -- Convocados: os cinco primeiros começam em campo, os outros no banco.
  for i in 1..array_length(ids, 1) loop
    insert into match_squad (
      match_id, player_id, player_name_snapshot, shirt_number_snapshot,
      preferred_position, initial_position, initial_location
    ) values (
      jogo, ids[i], nomes[i], i, posicoes[i],
      case when i <= 5 then posicoes[i] else null end,
      (case when i <= 5 then 'COURT' else 'BENCH' end)::player_location
    );
  end loop;

  -- Os acontecimentos do jogo, por ordem. Uma primeira parte com dois golos
  -- nossos e um sofrido, substituições, faltas e um amarelo; uma segunda com
  -- guarda-redes avançado e o golo que fecha o resultado em 4-2.
  insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                            player_id, player_in_id, player_out_id, position,
                            team_score_snapshot, opponent_score_snapshot, metadata, client_event_id, created_by)
  values
    (jogo,  1, 'MATCH_CREATED',        0,       0,       0, null, null, null, null, 0, 0, '{}', gen_random_uuid(), dono),
    (jogo,  2, 'FIRST_HALF_STARTED',   1,       0,       0, null, null, null, null, 0, 0, '{}', gen_random_uuid(), dono),
    (jogo,  3, 'TEAM_GOAL_ADDED',      1,  180000,  180000, null, null, null, null, 0, 0,
       jsonb_build_object('scorerId', ids[5], 'assistId', ids[3]), gen_random_uuid(), dono),
    (jogo,  4, 'SUBSTITUTION',         1,  300000,  300000, null, ids[6], ids[3], 'LEFT_WINGER', 1, 0, '{}', gen_random_uuid(), dono),
    (jogo,  5, 'TEAM_FOUL_ADDED',      1,  420000,  420000, null, null, null, null, 1, 0,
       jsonb_build_object('playerId', ids[2]), gen_random_uuid(), dono),
    (jogo,  6, 'OPPONENT_GOAL_ADDED',  1,  540000,  540000, null, null, null, null, 1, 0, '{}', gen_random_uuid(), dono),
    (jogo,  7, 'YELLOW_CARD',          1,  660000,  660000, ids[4], null, null, null, 1, 1,
       jsonb_build_object('playerId', ids[4]), gen_random_uuid(), dono),
    (jogo,  8, 'TEAM_GOAL_ADDED',      1,  780000,  780000, null, null, null, null, 1, 1,
       jsonb_build_object('scorerId', ids[6], 'assistId', ids[5]), gen_random_uuid(), dono),
    (jogo,  9, 'SUBSTITUTION',         1,  900000,  900000, null, ids[7], ids[4], 'RIGHT_WINGER', 2, 1, '{}', gen_random_uuid(), dono),
    (jogo, 10, 'FIRST_HALF_FINISHED',  1, 1200000, 1200000, null, null, null, null, 2, 1, '{}', gen_random_uuid(), dono),
    (jogo, 11, 'SECOND_HALF_LINEUP_SET', 1, 1200000, 1200000, null, null, null, null, 2, 1,
       jsonb_build_object('lineup', jsonb_build_object(
         'GOALKEEPER', ids[1], 'FIXO', ids[2], 'LEFT_WINGER', ids[6],
         'RIGHT_WINGER', ids[7], 'PIVOT', ids[5])), gen_random_uuid(), dono),
    (jogo, 12, 'SECOND_HALF_STARTED',  2, 1200000,       0, null, null, null, null, 2, 1, '{}', gen_random_uuid(), dono),
    (jogo, 13, 'OPPONENT_GOAL_ADDED',  2, 1440000,  240000, null, null, null, null, 2, 1, '{}', gen_random_uuid(), dono),
    (jogo, 14, 'TEAM_GOAL_ADDED',      2, 1680000,  480000, null, null, null, null, 2, 2,
       jsonb_build_object('scorerId', ids[2], 'assistId', ids[6]), gen_random_uuid(), dono),
    -- Guarda-redes avançado: sai o guarda-redes, entra um jogador de campo para
    -- a baliza. A app reconhece o 5v4 sozinha a partir daqui.
    (jogo, 15, 'SUBSTITUTION',         2, 1920000,  720000, null, ids[8], ids[1], 'GOALKEEPER', 3, 2, '{}', gen_random_uuid(), dono),
    (jogo, 16, 'TEAM_GOAL_ADDED',      2, 2040000,  840000, null, null, null, null, 3, 2,
       jsonb_build_object('scorerId', ids[8], 'assistId', ids[2]), gen_random_uuid(), dono),
    (jogo, 17, 'SUBSTITUTION',         2, 2160000,  960000, null, ids[1], ids[8], 'GOALKEEPER', 4, 2, '{}', gen_random_uuid(), dono),
    (jogo, 18, 'TEAM_FOUL_ADDED',      2, 2280000, 1080000, null, null, null, null, 4, 2,
       jsonb_build_object('playerId', ids[7]), gen_random_uuid(), dono),
    (jogo, 19, 'MATCH_FINISHED',       2, 2400000, 1200000, null, null, null, null, 4, 2, '{}', gen_random_uuid(), dono);

  /* --------------------------------------------- o jogo por jogar */

  insert into matches (
    club_id, team_id, competition_id, opponent_name, opponent_short_name,
    home_or_away, scheduled_at, season, timing, status
  ) values (
    clube, seniores, taca, 'GD Ribeira', 'GDR',
    'AWAY', now() + interval '3 days', '2026/27', 'TIMED', 'DRAFT'
  );

  select count(*) into n from players where team_id = seniores;

  raise notice '';
  raise notice 'Conta de demonstração pronta para %', email_da_conta;
  raise notice '  CD Demonstração · 2 escalões · % jogadores', n;
  raise notice '  Campeonato: 1 jogo terminado (4-2), com 5v4 e cartões';
  raise notice '  Taça: 1 jogo por jogar';
  raise notice '';
end $$;
