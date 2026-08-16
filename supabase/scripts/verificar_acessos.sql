-- verificar_acessos.sql — põe a migração 0011 à prova, sem deixar rasto.
--
-- Corre tudo dentro de uma transação que **termina em `rollback`**: cria dois
-- clubes, quatro pessoas e alguns dados, faz as perguntas todas, e desfaz-se.
-- Nada disto sobrevive ao fim do guião.
--
--   Supabase → SQL Editor → colar tudo → Run
--
-- No fim sai uma tabela com uma linha por verificação. Todas a `ok` significa
-- que as políticas fazem o que dizem. Se alguma falhar, o guião pára ali e a
-- mensagem a vermelho diz qual foi — as falhas atiram exceção de propósito, para
-- não haver hipótese de passarem despercebidas no meio das outras.
--
-- ## Corre DEPOIS da migração 0011, não antes
--
-- Isto não é um ensaio prévio: é a verificação do que a 0011 deixou feito. Sem
-- ela aplicada não há coluna `licenca` nem tabelas de acesso, e o guião falha
-- logo na terceira linha a dizer que a coluna não existe.
--
-- A ordem certa é: 0011 → este guião. Se algo falhar aqui, corrige-se e
-- reaplica-se a 0011 — que é escrita para poder correr outra vez sem estragar o
-- que já lá está.
--
-- Se preferires não aplicar nada sem prova, dá para fazer o ensaio a sério:
-- colar `begin;`, o conteúdo da 0011, depois este guião sem o `begin`/`rollback`
-- dele, e terminar em `rollback`. Fica tudo testado e nada fica gravado.
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

-- O gatilho `handle_new_user` já criou os perfis. Só falta dizer as licenças —
-- ambas explícitas, e não à conta do valor por omissão: estas quatro contas
-- nascem depois da migração, mas se um dia o guião for corrido antes dela o
-- teste tem de continuar a medir o que diz medir.
update profiles set licenca = 'clube'     where id = '00000000-0000-4000-9000-00000000000a';
update profiles set licenca = 'treinador' where id = '00000000-0000-4000-9000-00000000000d';
update profiles set licenca = 'treinador'
  where id in ('00000000-0000-4000-9000-00000000000b', '00000000-0000-4000-9000-00000000000c');

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

-- Os resultados vão para uma tabela, e não para `raise notice`.
--
-- O SQL Editor do Supabase mostra o que uma consulta devolve; os avisos podem
-- não aparecer em lado nenhum. Um guião que só falasse por avisos daria "Success.
-- No rows returned" e ficavas sem saber se tinha passado ou se não tinha chegado
-- a testar nada.
--
-- As falhas continuam a atirar exceção — param tudo e aparecem a vermelho — mas
-- agora os acertos também se veem.
create temp table resultado (ordem serial, verificacao text, estado text) on commit drop;

-- `security definer` porque esta função é chamada enquanto fingimos ser a ana ou
-- o bruno, e nenhum deles tem autorização para escrever numa tabela temporária
-- criada pelo superutilizador. Sem isto, o guião rebentava a meio a queixar-se de
-- permissões — e a queixa não teria nada que ver com o que se está a testar.
create or replace function pg_temp.exigir(condicao boolean, o_que text) returns void
language plpgsql security definer as $$
begin
  if not condicao then
    raise exception 'FALHOU: %', o_que;
  end if;
  insert into resultado (verificacao, estado) values (o_que, 'ok');
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

  /* ---- de volta à ana, que tem `editar` ---- */
  --
  -- Esta linha não é decoração. O bloco de cima corre como o bruno, e a sessão
  -- **fica** como ele até alguém a trocar: um `set_config` dura toda a
  -- transação. Sem isto, o que vinha a seguir pedia a um treinador com "só ver"
  -- que renomeasse o escalão — e o servidor recusava, com toda a razão, o que
  -- fazia o guião acusar as políticas de um erro que era do próprio guião.
  perform pg_temp.como('00000000-0000-4000-9000-00000000000b');

  /* ---- antes de acusar, perguntar às peças uma a uma ---- */
  --
  -- Um `update` que não altera nada tem várias causas possíveis, e o número de
  -- linhas não distingue nenhuma delas. Estas três perguntas separam-nas: se a
  -- função disser `true` e o `update` mexer em zero linhas, o problema está na
  -- política; se a função disser `false`, está nos dados ou na própria função.
  perform pg_temp.exigir(
    pode_ver_escalao('00000000-0000-4000-9002-000000000001'),
    'diagnóstico: pode_ver_escalao diz que sim'
  );
  -- Esta traz os valores na própria mensagem. Um "false" sem contexto não diz
  -- se o problema é a linha de acesso, o utilizador que a sessão julga ser, ou a
  -- função — e são três sítios muito diferentes.
  if not pode_editar_escalao('00000000-0000-4000-9002-000000000001') then
    raise exception
      'pode_editar_escalao=false · auth.uid()=% · nivel na tabela=% · linhas minhas=%',
      auth.uid(),
      coalesce((select nivel from team_access
                 where team_id = '00000000-0000-4000-9002-000000000001'
                   and user_id = auth.uid()), '(nenhuma)'),
      (select count(*) from team_access where user_id = auth.uid());
  end if;
  perform pg_temp.exigir(true, 'diagnóstico: pode_editar_escalao diz que sim');
  perform pg_temp.exigir(
    exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'teams'
               and cmd = 'UPDATE' and qual like '%pode_editar_escalao%'),
    'diagnóstico: a política de update é a da migração 0013'
  );

  /* ---- a ana muda o escalão, mas não o faz desaparecer ---- */

  -- Contam-se as linhas afectadas, e não se espera uma exceção.
  --
  -- Um `update` recusado pela segurança por linha **não dá erro**: as linhas que
  -- a política não deixa ver simplesmente não entram no `update`, e o comando
  -- termina bem tendo alterado zero. Só o `with check` é que atira — e esse
  -- aplica-se à linha nova, não ao direito de lá chegar.
  --
  -- É por isso que um `update` que "correu" não prova nada. A primeira versão
  -- deste teste dava a ana como capaz de renomear sem nunca ter renomeado.
  update teams set name = 'A1 renomeado' where id = '00000000-0000-4000-9002-000000000001';
  get diagnostics n = row_count;
  perform pg_temp.exigir(n = 1, 'a ana com `editar` muda mesmo o nome do escalão');

  -- Arquivar é outra coisa: a política deixa passar (ela pode editar), e quem
  -- trava é o gatilho da 0013 — que **atira**. Se esta parte falhar com "não
  -- arquivou nada", é sinal de que a 0013 não foi aplicada.
  begin
    update teams set archived_at = now() where id = '00000000-0000-4000-9002-000000000001';
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'FALHOU: nem arquivou nem foi travada — a migração 0013 não está aplicada';
    end if;
    raise exception 'FALHOU: a ana arquivou um escalão que não é dela';
  exception when insufficient_privilege then
    perform pg_temp.exigir(true, 'mas não o consegue arquivar — isso é do dono');
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
    insert into resultado (verificacao, estado) values ('a licença de treinador recusa o segundo escalão', 'ok');
  end;

  -- E o gerente, com licença de clube, cria à vontade.
  insert into teams (club_id, name)
  values ('00000000-0000-4000-9001-00000000000a', 'A3');
  insert into resultado (verificacao, estado) values ('a licença de clube cria o terceiro escalão', 'ok');

  -- Arquivar o único escalão liberta o lugar: quem apaga o seu para recomeçar
  -- não pode ficar preso.
  update teams set archived_at = now() where id = '00000000-0000-4000-9002-000000000009';
  insert into teams (club_id, name)
  values ('00000000-0000-4000-9001-00000000000d', 'B1 outra vez');
  insert into resultado (verificacao, estado) values ('depois de arquivar, o treinador cria outro', 'ok');
end $$;

-- O resultado, à vista. Se aparecerem todas as linhas com `ok`, está feito.
select ordem, verificacao, estado from resultado order by ordem;

-- Nada disto fica. Se precisares de espreitar o estado a meio, troca por
-- `commit` — mas depois tens de limpar à mão, e as linhas ficam com utilizadores
-- em `auth.users` que não existem em lado nenhum.
rollback;

-- O SQL Editor mostra o resultado da **última** instrução, e a última era o
-- `rollback`, que não devolve nada — a tabela de cima era produzida e nunca
-- chegava ao ecrã. Esta linha é o que se vê, e vê-se só se tudo o que está
-- acima tiver corrido: qualquer verificação falhada atira exceção e o guião
-- nunca chega aqui.
select 'Passou. As políticas fazem o que dizem.' as resultado;
