-- ricardo-fc-seniores.sql
--
-- Clube Ricardo FC, escalão Séniores, com um plantel inventado de 14 jogadores
-- e duas competições. Serve para pôr uma conta a andar com alguma coisa lá
-- dentro, em vez de um ecrã vazio à espera que alguém escreva catorze nomes.
--
-- ## Como se usa
--
-- 1. A conta tem de existir (painel: `npm run painel`).
-- 2. Supabase → SQL Editor → cola e corre.
--
-- Corre-se as vezes que forem precisas: tudo o que cria é verificado antes, por
-- isso uma segunda passagem não duplica nada. **Não apaga nada** — se esta conta
-- já tiver um clube com outro nome, fica com dois.

do $$
declare
  o_email     text := 'rdcdc91@hotmail.com';
  nome_clube  text := 'Ricardo FC';
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
    insert into clubs (owner_id, name, short_name, current_season)
    values (o_dono, nome_clube, 'RFC', '2026/27')
    returning id into o_clube;
  end if;

  select id into a_equipa from teams where club_id = o_clube and name = nome_equipa;
  if a_equipa is null then
    -- Cronometrado: é o que os séniores jogam, e é o modo onde o tempo de cada
    -- jogador conta a sério.
    insert into teams (club_id, name, short_name, timing)
    values (o_clube, nome_equipa, 'SEN', 'TIMED')
    returning id into a_equipa;
  end if;

  insert into competitions (team_id, name, short_name)
  select a_equipa, v.nome, v.curto
  from (values ('Campeonato', 'Camp.'), ('Taça', 'Taça')) as v(nome, curto)
  where not exists (
    select 1 from competitions c where c.team_id = a_equipa and c.name = v.nome
  );

  -- Catorze: dois guarda-redes e doze de campo, que é o que se leva a um jogo.
  -- Com menos, metade dos ecrãs da app não tem nada para mostrar.
  insert into players (club_id, team_id, name, shirt_number, preferred_position, strong_foot)
  select o_clube, a_equipa, v.nome, v.numero, v.pos::player_position, v.pe::strong_foot
  from (values
    ('Bruno Casimiro',   1, 'GOALKEEPER',   'RIGHT'),
    ('Nélson Prata',     2, 'FIXO',         'RIGHT'),
    ('Rui Vinagre',      3, 'LEFT_WINGER',  'LEFT'),
    ('Hélder Passos',    4, 'FIXO',         'RIGHT'),
    ('Márcio Bandeira',  5, 'RIGHT_WINGER', 'RIGHT'),
    ('Tiago Alcaide',    6, 'PIVOT',        'RIGHT'),
    ('Nuno Belchior',    7, 'RIGHT_WINGER', 'RIGHT'),
    ('Sérgio Vaqueiro',  8, 'UNIVERSAL',    'BOTH'),
    ('Paulo Estrelinha', 9, 'PIVOT',        'LEFT'),
    ('Ivo Mendonça',    10, 'LEFT_WINGER',  'LEFT'),
    ('Dário Camelo',    11, 'UNIVERSAL',    'RIGHT'),
    ('Carlos Boaventura', 12, 'GOALKEEPER',  'RIGHT'),
    ('Ivan Rosado',     14, 'RIGHT_WINGER', 'RIGHT'),
    ('Fernando Gil',    17, 'FIXO',         'LEFT')
  ) as v(nome, numero, pos, pe)
  where not exists (
    select 1 from players p
    where p.team_id = a_equipa and p.shirt_number = v.numero and p.is_active
  );

  raise notice 'Pronto: clube %, escalão %, % jogadores, para %',
    o_clube, a_equipa,
    (select count(*) from players where team_id = a_equipa and is_active),
    o_email;
end $$;
