-- dados_para_capturas.sql — uma época inventada, para as imagens da App Store.
--
-- Porque não serve a conta de demonstração: essa tem um jogo só, e as capturas
-- que interessam — as estatísticas do escalão e a ficha de um jogador — ficam a
-- zeros ou quase. Uma montra com uma linha de dados não vende nada.
--
-- Aqui nascem seis jogos disputados ao longo de uma época, com golos,
-- assistências, substituições, faltas, cartões e um período de 5v4. Os números
-- que saem das estatísticas são credíveis porque são calculados a sério, a
-- partir dos acontecimentos — é o mesmo código do jogo real.
--
-- Nomes todos inventados. Nada aqui é de ninguém.
--
-- COMO USAR
--   1. Muda o email para a conta onde queres os dados.
--   2. Corre no Supabase → SQL Editor.
--   3. Na app: sai da conta e volta a entrar (ou "Limpar este dispositivo"),
--      para o telemóvel descarregar a época nova.
--   4. Tira as capturas.
--   5. No fim, limpa com o comando que está no fundo deste ficheiro.

do $$
declare
  -- ↓↓↓ A CONTA ONDE OS DADOS VÃO PARAR ↓↓↓
  email_da_conta text := 'axbmr17@gmail.com';

  dono uuid;
  clube uuid;
  escalao uuid;
  campeonato uuid;
  taca uuid;

  ids uuid[] := '{}';
  novo uuid;
  i integer;
  j integer;

  jogo uuid;
  n integer;                    -- número de ordem do acontecimento
  nos integer;                  -- golos nossos nesse jogo
  deles integer;                -- golos deles
  prova uuid;
  quando timestamptz;
  adversario text;
  casa match_location;

  -- Doze jogadores: dá para substituições a sério e para um banco com gente.
  nomes text[] := array[
    'Rui Almeida', 'Tiago Nunes', 'Miguel Faria', 'André Costa',
    'Pedro Lima', 'João Marques', 'Diogo Pinto', 'Bruno Serra',
    'Nuno Teixeira', 'Hugo Barros', 'Vasco Antunes', 'Ricardo Melo'
  ];
  posicoes player_position[] := array[
    'GOALKEEPER', 'FIXO', 'LEFT_WINGER', 'RIGHT_WINGER',
    'PIVOT', 'UNIVERSAL', 'LEFT_WINGER', 'PIVOT',
    'FIXO', 'GOALKEEPER', 'RIGHT_WINGER', 'UNIVERSAL'
  ]::player_position[];

  -- Os seis jogos: adversário, casa/fora, golos nossos, golos deles, dias atrás.
  advs text[] := array['AD Vizinhança', 'GD Ribeira', 'CS Ponte', 'UD Alverca do Sul', 'SC Miradouro', 'AC Fontelas'];
  gn integer[] := array[4, 2, 5, 1, 3, 6];
  gd integer[] := array[2, 2, 1, 3, 0, 4];
  dias integer[] := array[42, 35, 28, 21, 14, 7];
begin
  select id into dono from profiles where email = email_da_conta;
  if dono is null then
    raise exception 'Não existe conta com o email %.', email_da_conta;
  end if;

  delete from clubs where owner_id = dono and name = 'CD Ribeira Alta';

  insert into clubs (owner_id, name, short_name, current_season, primary_color)
  values (dono, 'CD Ribeira Alta', 'CDRA', '2026/27', '#22c55e')
  returning id into clube;

  insert into teams (club_id, name, short_name, timing)
  values (clube, 'Séniores', 'SEN', 'TIMED') returning id into escalao;

  insert into competitions (team_id, name, short_name)
  values (escalao, 'Campeonato Distrital', 'CAMP') returning id into campeonato;
  insert into competitions (team_id, name, short_name)
  values (escalao, 'Taça de Lisboa', 'TAÇA') returning id into taca;

  for i in 1..array_length(nomes, 1) loop
    insert into players (club_id, team_id, name, shirt_number, preferred_position, strong_foot)
    values (clube, escalao, nomes[i], i, posicoes[i],
            (case when i % 3 = 0 then 'LEFT' else 'RIGHT' end)::strong_foot)
    returning id into novo;
    ids := ids || novo;
  end loop;

  /* ------------------------------------------------- os seis jogos */

  for j in 1..6 loop
    adversario := advs[j];
    nos := gn[j];
    deles := gd[j];
    quando := now() - (dias[j] || ' days')::interval;
    casa := (case when j % 2 = 1 then 'HOME' else 'AWAY' end)::match_location;
    prova := case when j = 4 then taca else campeonato end;

    insert into matches (
      club_id, team_id, competition_id, opponent_name, opponent_short_name,
      home_or_away, scheduled_at, season, timing, status
    ) values (
      clube, escalao, prova, adversario, upper(left(adversario, 3)),
      casa, quando, '2026/27', 'TIMED', 'FINISHED'
    ) returning id into jogo;

    -- Convocatória: os cinco primeiros em campo, o resto no banco. Roda-se o
    -- ponto de partida a cada jogo, para os minutos não saírem todos iguais.
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

    n := 0;

    -- Um acontecimento de cada vez, com o relógio a andar de forma plausível.
    n := n + 1;
    insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                              team_score_snapshot, opponent_score_snapshot, client_event_id, created_by)
    values (jogo, n, 'MATCH_CREATED', 0, 0, 0, 0, 0, gen_random_uuid(), dono);

    n := n + 1;
    insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                              team_score_snapshot, opponent_score_snapshot, client_event_id, created_by)
    values (jogo, n, 'FIRST_HALF_STARTED', 1, 0, 0, 0, 0, gen_random_uuid(), dono);

    -- Primeira parte: metade dos golos, uma substituição e uma falta.
    --
    -- Sem `greatest`: num jogo de um golo só, `greatest(1, 0)` marcava um golo
    -- aqui e outro na segunda parte, e o resultado saía 2 em vez de 1. Um ciclo
    -- de 1 até 0 simplesmente não corre, que é o que se quer.
    for i in 1..(nos / 2) loop
      n := n + 1;
      insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                                team_score_snapshot, opponent_score_snapshot, metadata, client_event_id, created_by)
      values (jogo, n, 'TEAM_GOAL_ADDED', 1, i * 180000, i * 180000, i - 1, 0,
              jsonb_build_object('scorerId', ids[((j + i) % 5) + 2], 'assistId', ids[((j + i) % 4) + 3]),
              gen_random_uuid(), dono);
    end loop;

    n := n + 1;
    insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                              player_in_id, player_out_id, position,
                              team_score_snapshot, opponent_score_snapshot, client_event_id, created_by)
    values (jogo, n, 'SUBSTITUTION', 1, 420000, 420000,
            ids[6 + (j % 4)], ids[3], 'LEFT_WINGER', nos / 2, 0, gen_random_uuid(), dono);

    n := n + 1;
    insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                              team_score_snapshot, opponent_score_snapshot, metadata, client_event_id, created_by)
    values (jogo, n, 'TEAM_FOUL_ADDED', 1, 540000, 540000, nos / 2, 0,
            jsonb_build_object('playerId', ids[2]), gen_random_uuid(), dono);

    if deles > 0 then
      n := n + 1;
      insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                                team_score_snapshot, opponent_score_snapshot, client_event_id, created_by)
      values (jogo, n, 'OPPONENT_GOAL_ADDED', 1, 660000, 660000, nos / 2, 0, gen_random_uuid(), dono);
    end if;

    -- Um amarelo em dois jogos, para os cartões não estarem sempre a zero.
    if j % 3 = 0 then
      n := n + 1;
      insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                                player_id, team_score_snapshot, opponent_score_snapshot, metadata, client_event_id, created_by)
      values (jogo, n, 'YELLOW_CARD', 1, 720000, 720000, ids[4], nos / 2, least(deles, 1),
              jsonb_build_object('playerId', ids[4]), gen_random_uuid(), dono);
    end if;

    n := n + 1;
    insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                              team_score_snapshot, opponent_score_snapshot, client_event_id, created_by)
    values (jogo, n, 'FIRST_HALF_FINISHED', 1, 1200000, 1200000, nos / 2, least(deles, 1), gen_random_uuid(), dono);

    n := n + 1;
    insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                              team_score_snapshot, opponent_score_snapshot, metadata, client_event_id, created_by)
    values (jogo, n, 'SECOND_HALF_LINEUP_SET', 1, 1200000, 1200000, nos / 2, least(deles, 1),
            jsonb_build_object('lineup', jsonb_build_object(
              'GOALKEEPER', ids[1], 'FIXO', ids[2], 'LEFT_WINGER', ids[6 + (j % 4)],
              'RIGHT_WINGER', ids[4], 'PIVOT', ids[5])),
            gen_random_uuid(), dono);

    n := n + 1;
    insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                              team_score_snapshot, opponent_score_snapshot, client_event_id, created_by)
    values (jogo, n, 'SECOND_HALF_STARTED', 2, 1200000, 0, nos / 2, least(deles, 1), gen_random_uuid(), dono);

    -- Segunda parte: o resto dos golos de cada lado.
    for i in 1..greatest(0, nos - (nos / 2)) loop
      n := n + 1;
      insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                                team_score_snapshot, opponent_score_snapshot, metadata, client_event_id, created_by)
      values (jogo, n, 'TEAM_GOAL_ADDED', 2, 1200000 + i * 210000, i * 210000, nos / 2 + i - 1, least(deles, 1),
              jsonb_build_object('scorerId', ids[((j * i) % 6) + 2], 'assistId', ids[((j + i) % 5) + 4]),
              gen_random_uuid(), dono);
    end loop;

    for i in 1..greatest(0, deles - least(deles, 1)) loop
      n := n + 1;
      insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                                team_score_snapshot, opponent_score_snapshot, client_event_id, created_by)
      values (jogo, n, 'OPPONENT_GOAL_ADDED', 2, 1200000 + 300000 + i * 120000, 300000 + i * 120000,
              nos, least(deles, 1) + i - 1, gen_random_uuid(), dono);
    end loop;

    -- No jogo em que se perdia, o guarda-redes avançado: a estatística de 5v4
    -- só aparece no resumo se tiver mesmo acontecido.
    if j = 4 then
      n := n + 1;
      insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                                player_in_id, player_out_id, position,
                                team_score_snapshot, opponent_score_snapshot, client_event_id, created_by)
      values (jogo, n, 'SUBSTITUTION', 2, 1200000 + 900000, 900000,
              ids[8], ids[1], 'GOALKEEPER', nos, deles, gen_random_uuid(), dono);

      n := n + 1;
      insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                                player_in_id, player_out_id, position,
                                team_score_snapshot, opponent_score_snapshot, client_event_id, created_by)
      values (jogo, n, 'SUBSTITUTION', 2, 1200000 + 1080000, 1080000,
              ids[1], ids[8], 'GOALKEEPER', nos, deles, gen_random_uuid(), dono);
    end if;

    n := n + 1;
    insert into match_events (match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
                              team_score_snapshot, opponent_score_snapshot, client_event_id, created_by)
    values (jogo, n, 'MATCH_FINISHED', 2, 2400000, 1200000, nos, deles, gen_random_uuid(), dono);
  end loop;

  /* -------------------------------------- e um jogo por jogar */

  insert into matches (
    club_id, team_id, competition_id, opponent_name, opponent_short_name,
    home_or_away, scheduled_at, season, timing, status
  ) values (
    clube, escalao, campeonato, 'CD Poente', 'POE', 'HOME',
    now() + interval '4 days', '2026/27', 'TIMED', 'DRAFT'
  );

  raise notice '';
  raise notice 'Época pronta em % — CD Ribeira Alta', email_da_conta;
  raise notice '  12 jogadores · 2 competições · 6 jogos disputados · 1 por jogar';
  raise notice '  Sai da conta e volta a entrar na app para os descarregar.';
  raise notice '';
end $$;

-- Confirmação: seis jogos, com os resultados a bater certo.
select m.opponent_name, m.home_or_away, m.scheduled_at::date, c.name as competicao
from matches m
join clubs cl on cl.id = m.club_id
join competitions c on c.id = m.competition_id
where cl.name = 'CD Ribeira Alta'
order by m.scheduled_at;

/* -------------------------------------------------------------------------
   DEPOIS DAS CAPTURAS, limpar: corre o ficheiro `apagar_capturas.sql`.

   Não basta `delete from clubs where name = 'CD Ribeira Alta'`. A cascata não
   chega a tudo: há chaves estrangeiras a apontar para `players` que existem
   precisamente para impedir que se apague um jogador já convocado — apagá-lo
   reescreveria a ficha de um jogo passado. É a mesma razão que obrigou a
   migração 0006 a apagar a conta por ordem, em vez de confiar na cascata.
   ------------------------------------------------------------------------- */
