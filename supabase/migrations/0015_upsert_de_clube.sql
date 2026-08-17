-- 0015_upsert_de_clube.sql
--
-- Faz o `upsert` de um clube — e de um escalão novo — voltar a funcionar.
--
-- O sintoma era criar o primeiro clube numa conta acabada de convidar e receber
--
--   new row violates row-level security policy for table "clubs"  (42501)
--
-- com tudo aparentemente certo: as quatro políticas no sítio, `owner_id` igual
-- ao `auth.uid()`, e um `insert into clubs (owner_id, name) values (…)` à mão
-- que passava sem se queixar.
--
-- ## Não era nenhuma das políticas de escrita
--
-- Isolou-se abrindo uma política de cada vez, dentro de uma transação desfeita
-- no fim. `clubs_criar` aberta: falhava na mesma. `clubs_atualizar` aberta:
-- falhava na mesma. `clubs_ler` aberta: **passava**.
--
-- E falhava também com `on conflict (id) do nothing`, que nunca chega a fazer
-- `update` nenhum. Ou seja, não é o `do update`: é o `on conflict`.
--
-- ## Porquê a política de leitura
--
-- Um `insert … on conflict` tem de ir ver se já existe linha que colida. O
-- Postgres não deixa uma conta descobrir, pelo comportamento do comando, que
-- existe uma linha que ela não tem autorização para ver — se deixasse, o
-- `on conflict` era um detector de linhas alheias. Por isso exige que a
-- política de **leitura** aceite a linha proposta, e é essa que responde `não`.
--
-- A `clubs_ler` era:
--
--   for select using (pode_ver_clube(id))
--
-- e `pode_ver_clube` procura o clube **pelo próprio id, na tabela**. Para uma
-- linha que ainda não existe a busca não devolve nada, portanto a resposta é
-- sempre `false` — mesmo para o dono, mesmo estando o `owner_id` à frente dela
-- na linha proposta. A política olhava para a tabela quando tinha a resposta na
-- mão.
--
-- ## A correção
--
-- Ler as colunas da própria linha em vez de a ir procurar pelo id:
--
--   owner_id = auth.uid()          -- lê-se na linha proposta, existe ou não
--   or sou_membro_do_clube(id)     -- para quem só está associado
--
-- Para quem já tem o clube gravado o resultado é exactamente o mesmo de antes:
-- ou é o dono, ou tem linha em `club_members`. Não se abre nada — troca-se a
-- ordem das duas perguntas para que a primeira não dependa da linha já existir.
--
-- ## E o mesmo mal em `teams_ler`
--
-- `teams_ler` tinha a mesma forma — `pode_ver_escalao(id)`, uma busca pelo
-- próprio id — e portanto o mesmo defeito: criar um escalão novo pelo `upsert`
-- falhava para toda a gente, incluindo o dono do clube. Foi este o erro que
-- apareceu ao criar um escalão e que na altura se atribuiu às duas sessões
-- abertas no mesmo browser; a 0014 arrumou o caso do treinador com `editar`
-- sobre um escalão que já existia, mas o do escalão novo continuava aqui.
--
-- Fica igual: pergunta-se pelo `club_id`, que vem na linha proposta e aponta
-- para um clube que existe.
--
-- Correr no Supabase → SQL Editor, depois da 0014.

/* ------------------------------------------------------------- perguntas */

-- As duas metades de `pode_ver_clube` e `pode_ver_escalao`, cada uma por si.
-- São precisas em separado porque só uma delas é que pode ser feita a uma linha
-- que ainda não está na tabela.
--
-- `security definer` pela razão do costume: são chamadas de dentro de políticas
-- e não podem voltar a acordar a segurança por linha das tabelas que consultam.

create or replace function sou_membro_do_clube(cl uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from club_members m where m.club_id = cl and m.user_id = auth.uid());
$$;

create or replace function tenho_acesso_ao_escalao(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_access a where a.team_id = t and a.user_id = auth.uid());
$$;

comment on function sou_membro_do_clube is
  'Metade de pode_ver_clube. Separada para as políticas poderem perguntar pelo owner_id da própria linha.';
comment on function tenho_acesso_ao_escalao is
  'Metade de pode_ver_escalao, pela mesma razão.';

/* --------------------------------------------------------------- clubes */

drop policy if exists clubs_ler on clubs;

create policy clubs_ler on clubs
  for select using (
    -- Primeiro a pergunta que se responde só com a linha à frente. É esta que
    -- deixa o `on conflict` funcionar num clube que ainda não existe.
    owner_id = auth.uid()
    or sou_membro_do_clube(id)
  );

/* ------------------------------------------------------------- escalões */

drop policy if exists teams_ler on teams;

create policy teams_ler on teams
  for select using (
    -- O `club_id` vem na linha proposta e o clube já existe, por isso esta
    -- resposta é dada sem a tabela `teams` ter de conter a linha.
    sou_dono_do_clube(club_id)
    or tenho_acesso_ao_escalao(id)
  );
