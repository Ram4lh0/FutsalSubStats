-- equipa-do-nuno.sql
--
-- Clube, escalão de séniores, duas competições (Campeonato e Taça) e o plantel
-- de 14 jogadores, para uma conta que já existe.
--
-- ## Como se usa
--
-- 1. A conta tem de existir primeiro (painel: `npm run painel`). Sem conta não
--    há perfil, e sem perfil não há dono para o clube.
-- 2. Preenche as duas coisas marcadas com ← em baixo: o nome do clube e os
--    cinco apelidos que a captura cortou.
-- 3. Supabase → SQL Editor → cola isto e corre.
--
-- Corre-se as vezes que forem precisas: tudo o que cria é verificado antes, por
-- isso uma segunda passagem não duplica nada.

do $$
declare
  o_email     text := 'nunomerodrigues@gmail.com';
  nome_clube  text := 'CLUBE';                      -- ← põe aqui o nome do clube
  nome_equipa text := 'Séniores';

  o_dono   uuid;
  o_clube  uuid;
  a_equipa uuid;
begin
  select id into o_dono from profiles where lower(email) = lower(o_email);
  if o_dono is null then
    raise exception 'Não há conta com o email %. Cria-a primeiro no painel.', o_email;
  end if;

  select id into o_clube from clubs where owner_id = o_dono and name = nome_clube;
  if o_clube is null then
    insert into clubs (owner_id, name, current_season)
    values (o_dono, nome_clube, '2025/26')
    returning id into o_clube;
  end if;

  select id into a_equipa from teams where club_id = o_clube and name = nome_equipa;
  if a_equipa is null then
    -- TIMED: séniores jogam cronometrado. É o modo onde o tempo de jogo por
    -- jogador conta, que é a razão de ser da app.
    insert into teams (club_id, name, short_name, timing)
    values (o_clube, nome_equipa, 'SEN', 'TIMED')
    returning id into a_equipa;
  end if;

  /* ------------------------------------------------------- competições */

  insert into competitions (team_id, name, short_name)
  select a_equipa, v.nome, v.curto
  from (values ('Campeonato', 'Camp.'), ('Taça', 'Taça')) as v(nome, curto)
  where not exists (
    select 1 from competitions c where c.team_id = a_equipa and c.name = v.nome
  );

  /* ---------------------------------------------------------- plantel */

  -- Os números são os da folha, com falhas (falta o 7, o 11, o 12…) — é assim
  -- num plantel a sério e a app não se importa: o que não pode haver são dois
  -- jogadores activos com o mesmo número.
  insert into players (club_id, team_id, name, shirt_number, preferred_position, strong_foot)
  select o_clube, a_equipa, v.nome, v.numero, v.pos::player_position, v.pe::strong_foot
  from (values
    ('Fábio Tava…',    1, 'GOALKEEPER',   'LEFT'),     -- ← apelido cortado
    ('Hermínio',       2, 'LEFT_WINGER',  'LEFT'),
    ('Titi',           3, 'RIGHT_WINGER', 'UNKNOWN'),
    ('Zini',           4, 'PIVOT',        'BOTH'),
    ('João Leite',     5, 'PIVOT',        'RIGHT'),
    ('Idalécio',       6, 'PIVOT',        'BOTH'),
    ('Serginho',       8, 'FIXO',         'BOTH'),
    ('Rodrigo R…',     9, 'RIGHT_WINGER', 'BOTH'),     -- ← apelido cortado
    ('Tiago Rodr…',   10, 'RIGHT_WINGER', 'RIGHT'),    -- ← apelido cortado
    ('Zef',           13, 'FIXO',         'UNKNOWN'),
    ('Diogo Mag…',    14, 'RIGHT_WINGER', 'RIGHT'),    -- ← apelido cortado
    ('Helton',        16, 'PIVOT',        'RIGHT'),
    ('António Ra…',   17, 'FIXO',         'RIGHT'),    -- ← apelido cortado
    ('Brandão',       20, 'GOALKEEPER',   'LEFT')
  ) as v(nome, numero, pos, pe)
  where not exists (
    select 1 from players p
    where p.team_id = a_equipa and p.shirt_number = v.numero and p.is_active
  );

  raise notice 'Pronto: clube %, escalão %, para %', o_clube, a_equipa, o_email;
end $$;
