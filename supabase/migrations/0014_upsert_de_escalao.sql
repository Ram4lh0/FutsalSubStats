-- 0014_upsert_de_escalao.sql
--
-- Faz o `upsert` do escalão funcionar para quem tem "Ver e editar".
--
-- A 0013 abriu a política de `update` e não chegou. O sintoma era o mesmo erro
-- de sempre, e a mensagem apontava para o sítio errado:
--
--   new row violates row-level security policy for table "teams"  (42501)
--
-- ## Porquê
--
-- A app não faz `update`: faz **upsert**. E um `upsert`, em Postgres, é
--
--   insert into teams (…) values (…) on conflict (id) do update set …
--
-- É um `insert` que às vezes acaba em `update`. O Postgres não sabe de antemão
-- qual dos dois vai ser, por isso avalia o `with check` da política de
-- **inserção** para a linha proposta — sempre, mesmo quando a linha já existe e
-- a operação acaba por ser um `update`.
--
-- A `teams_criar` exige `sou_dono_do_clube(club_id)`. Um treinador associado
-- falha aí e nunca chega à `teams_atualizar`, por mais permissiva que ela seja.
--
-- ## A correção, e porque é que continua segura
--
-- O `with check` da inserção passa a aceitar também quem pode editar **aquele**
-- escalão. Isto não abre a porta a criar escalões: um escalão novo tem um `id`
-- que ainda não existe, logo não tem linha nenhuma em `team_access`, logo
-- `pode_editar_escalao(id)` é falso. Continua a ser preciso ser dono do clube
-- para criar.
--
-- E para dar acesso a si próprio a um `id` inventado, um treinador teria de
-- inserir primeiro em `team_access` — que só o dono do clube pode fazer.
--
-- Correr no Supabase → SQL Editor, depois da 0013.

drop policy if exists teams_criar on teams;

create policy teams_criar on teams
  for insert with check (
    sou_dono_do_clube(club_id)
    -- O caminho do `upsert` sobre um escalão que já existe e que esta conta pode
    -- editar. Para um `id` novo isto é sempre falso.
    or pode_editar_escalao(id)
  );
