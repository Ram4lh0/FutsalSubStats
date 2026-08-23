-- trocar-clube.sql
--
-- Tira a uma conta o clube que ela tem e põe-lhe um clube fictício no lugar,
-- com um escalão de séniores e um plantel inventado.
--
-- ## Há duas maneiras de estar "associado a um clube", e são muito diferentes
--
-- **Ser dono.** A linha em `clubs` tem o `owner_id` dela. O clube é dela, os
-- dados são dela, e apagá-lo apaga tudo o que lá está dentro.
--
-- **Ser convidado.** O clube é de outra pessoa, e esta conta só aparece em
-- `club_members` (é escolhível para os escalões) ou em `team_access` (vê ou
-- edita um escalão em concreto). Aqui não há nada dela para apagar — o que se
-- tira é a ligação, e o clube fica intacto para quem é dono dele.
--
-- Este script trata as duas em separado, e **nunca apaga um clube que não seja
-- dela**. Apagar o clube de outra pessoa por engano seria estragar dados de
-- alguém que nem sabe que isto correu.
--
-- ## Como se usa
--
-- 1. Confirma o email na linha marcada com ←.
-- 2. Corre uma vez com `limpar := false` e lê os avisos: dizem exactamente o que
--    esta conta tem e o que seria apagado.
-- 3. Se concordares, põe `limpar := true` e corre outra vez.
--
-- ## Depois de correr
--
-- Quem tiver a app aberta nessa conta continua com a cópia antiga no aparelho —
-- a descarga traz o que existe, não apaga o que já lá está. Peça-se-lhe para ir
-- a **Definições → Limpar dispositivo**, ou sair da conta e voltar a entrar.

do $$
declare
  o_email     text := 'rdcdc91@hotmail.com';   -- ← confirma o email
  limpar      boolean := false;                -- ← true para apagar mesmo
  nome_clube  text := 'Ricardo FC';
  nome_equipa text := 'Séniores';

  o_dono   uuid;
  o_clube  uuid;
  a_equipa uuid;
  n_meus   int;
  n_conv   int;
  n_acess  int;
  n_jogos  int;
begin
  select id into o_dono from profiles where lower(email) = lower(o_email);
  if o_dono is null then
    raise exception 'Não há conta com o email %. Cria-a primeiro no painel.', o_email;
  end if;

  /* ------------------------------------------------- o que esta conta tem */

  select count(*) into n_meus from clubs where owner_id = o_dono;
  select count(*) into n_conv from club_members where user_id = o_dono;
  select count(*) into n_acess from team_access where user_id = o_dono;
  select count(*) into n_jogos
    from matches m join clubs c on c.id = m.club_id
    where c.owner_id = o_dono;

  raise notice 'Clubes de que é dona: %  (com % jogos)', n_meus, n_jogos;
  raise notice 'Clubes a que está só associada: %', n_conv;
  raise notice 'Escalões a que tem acesso: %', n_acess;

  if not limpar then
    raise notice '--- ENSAIO. Nada foi apagado. Põe `limpar := true` para avançar. ---';
  end if;

  /* --------------------------------------------------------- as ligações */

  -- Estas saem sempre que se limpa, e não custam nada a ninguém: são só a
  -- ligação desta conta a clubes de outras pessoas.
  if limpar then
    delete from team_access where user_id = o_dono;
    delete from club_members where user_id = o_dono;
  end if;

  /* ------------------------------------------------- os clubes que são dela */

  if limpar and n_meus > 0 then
    -- De baixo para cima, e não com um `delete from clubs` a confiar no
    -- cascade: o `match_squad` aponta para `players` com `on delete restrict`,
    -- e um cascade que apague os jogadores antes das convocatórias esbarra
    -- nessa restrição. Por ordem, não há como falhar.
    delete from match_events e using matches m, clubs c
      where e.match_id = m.id and m.club_id = c.id and c.owner_id = o_dono;
    delete from match_squad s using matches m, clubs c
      where s.match_id = m.id and m.club_id = c.id and c.owner_id = o_dono;
    delete from matches m using clubs c
      where m.club_id = c.id and c.owner_id = o_dono;
    delete from players p using clubs c
      where p.club_id = c.id and c.owner_id = o_dono;
    delete from competitions k using teams t, clubs c
      where k.team_id = t.id and t.club_id = c.id and c.owner_id = o_dono;
    delete from team_access a using teams t, clubs c
      where a.team_id = t.id and t.club_id = c.id and c.owner_id = o_dono;
    delete from teams t using clubs c
      where t.club_id = c.id and c.owner_id = o_dono;
    delete from club_members mb using clubs c
      where mb.club_id = c.id and c.owner_id = o_dono;
    delete from clubs c where c.owner_id = o_dono;

    raise notice 'Apagados % clube(s) e tudo o que tinham dentro.', n_meus;
  end if;

  if not limpar then
    return; -- no ensaio não se cria nada: só se queria ver o retrato
  end if;

  /* ------------------------------------------------- o clube fictício */

  select id into o_clube from clubs where owner_id = o_dono and name = nome_clube;
  if o_clube is null then
    insert into clubs (owner_id, name, short_name, current_season)
    values (o_dono, nome_clube, 'RFC', '2026/27')
    returning id into o_clube;
  end if;

  select id into a_equipa from teams where club_id = o_clube and name = nome_equipa;
  if a_equipa is null then
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

  insert into players (club_id, team_id, name, shirt_number, preferred_position, strong_foot)
  select o_clube, a_equipa, v.nome, v.numero, v.pos::player_position, v.pe::strong_foot
  from (values
    ('Bruno Casimiro',     1, 'GOALKEEPER',   'RIGHT'),
    ('Nélson Prata',       2, 'FIXO',         'RIGHT'),
    ('Rui Vinagre',        3, 'LEFT_WINGER',  'LEFT'),
    ('Hélder Passos',      4, 'FIXO',         'RIGHT'),
    ('Márcio Bandeira',    5, 'RIGHT_WINGER', 'RIGHT'),
    ('Tiago Alcaide',      6, 'PIVOT',        'RIGHT'),
    ('Nuno Belchior',      7, 'RIGHT_WINGER', 'RIGHT'),
    ('Sérgio Vaqueiro',    8, 'UNIVERSAL',    'BOTH'),
    ('Paulo Estrelinha',   9, 'PIVOT',        'LEFT'),
    ('Ivo Mendonça',      10, 'LEFT_WINGER',  'LEFT'),
    ('Dário Camelo',      11, 'UNIVERSAL',    'RIGHT'),
    ('Carlos Boaventura', 12, 'GOALKEEPER',   'RIGHT'),
    ('Ivan Rosado',       14, 'RIGHT_WINGER', 'RIGHT'),
    ('Fernando Gil',      17, 'FIXO',         'LEFT')
  ) as v(nome, numero, pos, pe)
  where not exists (
    select 1 from players p
    where p.team_id = a_equipa and p.shirt_number = v.numero and p.is_active
  );

  raise notice 'Pronto: % · %, com % jogadores, para %',
    nome_clube, nome_equipa,
    (select count(*) from players where team_id = a_equipa and is_active),
    o_email;
end $$;
