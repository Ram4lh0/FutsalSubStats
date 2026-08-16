-- verificar_acessos.sql — põe a migração 0011 à prova, sem deixar rasto.
--
-- Corre tudo dentro de uma transação que **termina em `rollback`**: cria dois
-- clubes, quatro pessoas e alguns dados, faz as perguntas todas, e desfaz-se.
-- Nada disto sobrevive ao fim do guião.
--
--   Supabase → SQL Editor → colar tudo → Run
--
-- Se aparecer "TUDO CERTO" no fim, as políticas fazem o que dizem. Qualquer
-- outra coisa é uma linha a dizer o que falhou.
--
-- ## Porque é que isto existe
--
-- A migração 0011 substituiu a única frase em que toda a segurança assentava. Um
-- erro aqui não parte nada visível: dá um treinador a ver os dados de outro
-- clube, e ninguém descobre até alguém reparar. Não é o género de coisa que se
-- confirma a olho num ficheiro de 300 linhas.
--
-- ## Como é que se finge um utilizador
--
-- O SQL Editor corre como superutilizador, e um superutilizador **ignora a
-- segurança por linha** — se não se fizesse nada, passava tudo e o guião dizia
-- que estava bem. As duas linhas que mudam isso são:
--
--   set local role authenticated;                 -- deixa de ser superutilizador
--   set local request.jwt.claims = '{"sub": …}';  -- passa a ser aquela pessoa
--
-- É de lá que o `auth.uid()` tira a resposta.

begin;

/* ------------------------------------------------------------- o cenário */

-- Dois clubes que não têm nada que ver um com o outro, e quatro pessoas:
--
--   gerente   dono do Clube A, licença `clube`
--   ana       associada ao A, com `editar` no escalão A1
--   bruno     associado ao A, com `ver` no escalão A1
--   sozinho   dono do Clube B, licença `treinador`

do $$
declare
  ids uuid[] := array[
    '00000000-0000-4000-9000-00000000000a'::uuid,  -- gerente
    '00000000-0000-4000-9000-00000000000b'::uuid,  -- ana
    '00000000-0000-4000-9000-00000000000c'::uuid,  -- bruno
    '00000000-0000-4000-9000-00000000000d'::uuid   -- sozinho
  ];
  i int;
begin
  for i in 1 .. array_length(ids, 1) loop
    insert into auth.users (id, email, aud, role)
    values (ids[i], 'teste' || i || '@exemplo.invalido', 'authenticated', 'authenticated')
    on conflict (id) do nothing;
  end loop;
end $$;

-- O gatilho `handle_new_user` já criou os perfis. Só falta dizer as licenças.
update profiles set licenca = 'clube'     where id = '00000000-0000-4000-9000-00000000000a';
update profiles set licenca = 'treinador' where id = '00000000-0000-4000-9000-00000000000d';

insert into clubs (id, owner_id, name) values
  ('00000000-0000-4000-9001-00000000000a', '00000000-0000-4000-9000-00000000000a', 'Clube A'),
  ('00000000-0000-4000-9001-00000000000d', '00000000-0000-4000-9000-00000000000d', 'Clube B');

insert into teams (id, club_id, name) values
  ('00000000-0000-4000-9002-000000000001', '00000000-0000-4000-9001-00000000000a', 'A1'),
  ('00000000-0000-4000-9002-000000000002', '00000000-0000-4000-9001-00000000000a', 'A2'),
  ('00000000-0000-4000-9002-000000000009', '00000000-0000-4000-9001-00000000000d', 'B1');

insert into players (id, club_id, team_id, name, shirt_number) values
  ('00000000-0000-4000-9003-000000000001', '00000000-0000-4000-9001-00000000000a',
   '00000000-0000-4000-9002-000000000001', 'Jogador do A1', 7);

insert into club_members (club_id, user_id) values
  ('00000000-0000-4000-9001-00000000000a', '00000000-0000-4000-9000-00000000000b'),
  ('00000000-0000-4000-9001-00000000000a', '00000000-0000-4000-9000-00000000000c');

insert into team_access (team_id, user_id, nivel) values
  ('00000000-0000-4000-9002-000000000001', '00000000-0000-4000-9000-00000000000b', 'editar'),
  ('00000000-0000-4000-9002-000000000001', '00000000-0000-4000-9000-00000000000c', 'ver');

/* ---------------------------------------------------------- as perguntas */

create or replace function pg_temp.como(quem uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', quem, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.exigir(condicao boolean, o_que text) returns void
language plpgsql as $$
begin
  if not condicao then
    raise exception 'FALHOU: %', o_que;
  end if;
  raise notice '  ok  %', o_que;
end $$;

do $$
declare n int;
begin
  set local role authenticated;

  /* ---- o gerente vê o seu clube inteiro ---- */
  perform pg_temp.como('00000000-0000-4000-9000-00000000000a');
  select count(*) into n from teams;
  perform pg_temp.exigir(n = 2, 'o gerente vê os 2 escalões do seu clube');
  select count(*) into n from clubs;
  perform pg_temp.exigir(n = 1, 'e vê 1 clube — não vê o Clube B');

  /* ---- a ana só vê o escalão que lhe deram ---- */
  perform pg_temp.como('00000000-0000-4000-9000-00000000000b');
  select count(*) into n from teams;
  perform pg_temp.exigir(n = 1, 'a ana vê 1 escalão, não os 2 do clube');
  select count(*) into n from teams where id = '00000000-0000-4000-9002-000000000001';
  perform pg_temp.exigir(n = 1, 'e é mesmo o A1');
  select count(*) into n from clubs;
  perform pg_temp.exigir(n = 1, 'vê o clube a que está associada');
  select count(*) into n from players;
  perform pg_temp.exigir(n = 1, 'vê o jogador do A1');

  /* ---- e pode escrever, porque tem `editar` ---- */
  insert into players (club_id, team_id, name, shirt_number)
  values ('00000000-0000-4000-9001-00000000000a', '00000000-0000-4000-9002-000000000001', 'Novo da Ana', 11);
  perform pg_temp.exigir(true, 'a ana consegue criar um jogador no A1');

  /* ---- o bruno vê o mesmo e não mexe em nada ---- */
  perform pg_temp.como('00000000-0000-4000-9000-00000000000c');
  select count(*) into n from teams;
  perform pg_temp.exigir(n = 1, 'o bruno vê o A1');
  begin
    insert into players (club_id, team_id, name, shirt_number)
    values ('00000000-0000-4000-9001-00000000000a', '00000000-0000-4000-9002-000000000001', 'Do Bruno', 12);
    raise exception 'FALHOU: o bruno tinha só `ver` e conseguiu criar um jogador';
  exception when insufficient_privilege or check_violation then
    perform pg_temp.exigir(true, 'o bruno com `ver` não consegue escrever');
  end;

  /* ---- o treinador sozinho não vê nada do clube A ---- */
  perform pg_temp.como('00000000-0000-4000-9000-00000000000d');
  select count(*) into n from teams;
  perform pg_temp.exigir(n = 1, 'o treinador sozinho vê só o escalão dele');
  select count(*) into n from players;
  perform pg_temp.exigir(n = 0, 'e nenhum jogador do outro clube');
  select count(*) into n from clubs;
  perform pg_temp.exigir(n = 1, 'e um só clube');

  reset role;
end $$;

/* ------------------------------------------- o limite de escalões */

do $$
begin
  -- O treinador sozinho já tem o B1. O segundo tem de bater na parede, e a
  -- parede é o gatilho — nem sequer é preciso ser ele a tentar.
  begin
    insert into teams (club_id, name)
    values ('00000000-0000-4000-9001-00000000000d', 'B2 que não devia existir');
    raise exception 'FALHOU: a licença de treinador deixou criar um segundo escalão';
  exception when check_violation then
    raise notice '  ok  a licença de treinador recusa o segundo escalão';
  end;

  -- E o gerente, com licença de clube, cria à vontade.
  insert into teams (club_id, name)
  values ('00000000-0000-4000-9001-00000000000a', 'A3');
  raise notice '  ok  a licença de clube cria o terceiro escalão';

  -- Arquivar o único escalão liberta o lugar: quem apaga o seu para recomeçar
  -- não pode ficar preso.
  update teams set archived_at = now() where id = '00000000-0000-4000-9002-000000000009';
  insert into teams (club_id, name)
  values ('00000000-0000-4000-9001-00000000000d', 'B1 outra vez');
  raise notice '  ok  depois de arquivar, o treinador cria outro';
end $$;

do $$ begin raise notice 'TUDO CERTO.'; end $$;

-- Nada disto fica. Se precisares de espreitar o estado a meio, troca por
-- `commit` — mas depois tens de limpar à mão, e as linhas ficam com utilizadores
-- em `auth.users` que não existem em lado nenhum.
rollback;
