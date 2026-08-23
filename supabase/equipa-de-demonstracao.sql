-- equipa-de-demonstracao.sql
--
-- Cria um clube, um escalão, uma competição e um plantel de 12 jogadores para
-- uma conta que já existe. Serve para um tester entrar e encontrar a app com
-- alguma coisa lá dentro, em vez de um ecrã vazio à espera que ele escreva doze
-- nomes antes de perceber para que é que a app serve.
--
-- ## Como se usa
--
-- 1. Cria a conta primeiro, no painel (`npm run painel`). Sem conta não há
--    perfil, e sem perfil não há dono para o clube.
-- 2. Supabase → SQL Editor → cola isto, muda o email da primeira linha, corre.
--
-- Corre-se as vezes que forem precisas: se o clube já existir com este nome,
-- não faz nada. Não é um `insert` cego.

do $$
declare
  -- ↓↓↓ o único sítio a mexer ↓↓↓
  o_email    text := 'brunomrcosta21@gmail.com';
  nome_clube text := 'Bruno FC';
  nome_equipa text := 'Séniores';

  o_dono   uuid;
  o_clube  uuid;
  a_equipa uuid;
begin
  select id into o_dono from profiles where lower(email) = lower(o_email);
  if o_dono is null then
    raise exception 'Não há conta com o email %. Cria-a primeiro no painel.', o_email;
  end if;

  -- Idempotente: se já lá está, reaproveita em vez de duplicar.
  select id into o_clube from clubs where owner_id = o_dono and name = nome_clube;
  if o_clube is null then
    insert into clubs (owner_id, name, current_season)
    values (o_dono, nome_clube, '2025/26')
    returning id into o_clube;
  end if;

  select id into a_equipa from teams where club_id = o_clube and name = nome_equipa;
  if a_equipa is null then
    -- TIMED: com cronómetro. É o modo em que se vê o acerto do relógio e o
    -- tempo de jogo de cada um, que é o que a app tem de diferente.
    insert into teams (club_id, name, short_name, timing)
    values (o_clube, nome_equipa, 'SEN', 'TIMED')
    returning id into a_equipa;
  end if;

  insert into competitions (team_id, name, short_name)
  select a_equipa, 'Campeonato Distrital', 'Distrital'
  where not exists (
    select 1 from competitions where team_id = a_equipa and name = 'Campeonato Distrital'
  );

  -- Doze jogadores: cinco para o cinco inicial e sete de banco, que é mais ou
  -- menos o que uma equipa leva a um jogo. Com menos, metade dos ecrãs da app
  -- não tem nada para mostrar.
  insert into players (club_id, team_id, name, shirt_number, preferred_position, strong_foot)
  select o_clube, a_equipa, v.nome, v.numero, v.pos::player_position, v.pe::strong_foot
  from (values
    ('Rui Almeida',      1, 'GOALKEEPER',   'RIGHT'),
    ('Tiago Nunes',      2, 'FIXO',         'RIGHT'),
    ('André Salgado',    4, 'FIXO',         'LEFT'),
    ('Miguel Antunes',   5, 'LEFT_WINGER',  'LEFT'),
    ('Diogo Peixoto',    7, 'RIGHT_WINGER', 'RIGHT'),
    ('João Rebelo',      8, 'PIVOT',        'RIGHT'),
    ('Bruno Vilar',      9, 'UNIVERSAL',    'BOTH'),
    ('Hugo Marinho',    10, 'LEFT_WINGER',  'LEFT'),
    ('Nuno Faria',      11, 'RIGHT_WINGER', 'RIGHT'),
    ('Filipe Torres',   12, 'GOALKEEPER',   'RIGHT'),
    ('Ricardo Vaz',     14, 'PIVOT',        'RIGHT'),
    ('Pedro Gaspar',    17, 'UNIVERSAL',    'LEFT')
  ) as v(nome, numero, pos, pe)
  where not exists (
    select 1 from players p
    where p.team_id = a_equipa and p.shirt_number = v.numero and p.is_active
  );

  raise notice 'Pronto: clube %, escalão %, para %', o_clube, a_equipa, o_email;
end $$;
