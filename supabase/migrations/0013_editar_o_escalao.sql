-- 0013_editar_o_escalao.sql
--
-- Quem tem "Ver e editar" passa a poder mudar o escalão em si.
--
-- A 0011 deixou a alteração de um escalão só para o dono do clube, com o
-- argumento de que mudar o nome ou a foto é "gerir a estrutura". Na prática não
-- é: um treinador a quem deram um escalão quer pôr-lhe o emblema da equipa e
-- corrigir o nome, e ter de pedir isso ao gerente é atrito sem retorno.
--
-- ## O que continua a ser só do dono
--
-- **Criar** e **apagar** escalões. Essas duas mexem na estrutura do clube — e
-- apagar, na app, é arquivar, ou seja um `update` da coluna `archived_at`. Uma
-- política de `update` não consegue distinguir *que* colunas mudaram: só vê a
-- linha antiga e a nova, cada uma do seu lado. Quem consegue comparar as duas é
-- um gatilho, e é por isso que existe o de baixo.
--
-- Sem ele, "editar" incluiria "fazer desaparecer", e um treinador podia arquivar
-- o escalão de que discordasse.
--
-- Mudar o `club_id` — levar o escalão para outro clube — está no mesmo saco pela
-- mesma razão.
--
-- Correr no Supabase → SQL Editor, depois da 0011.

drop policy if exists teams_atualizar on teams;

create policy teams_atualizar on teams
  for update using (pode_editar_escalao(id)) with check (pode_editar_escalao(id));

/* --------------------------------------------- arquivar continua do dono */

create or replace function so_o_dono_arquiva()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if sou_dono_do_clube(new.club_id) then
    return new;
  end if;

  if new.archived_at is distinct from old.archived_at then
    raise exception 'Só o clube pode apagar escalões.'
      using errcode = 'insufficient_privilege', hint = 'so_o_dono_arquiva';
  end if;

  if new.club_id is distinct from old.club_id then
    raise exception 'Um escalão não muda de clube.'
      using errcode = 'insufficient_privilege', hint = 'so_o_dono_muda_de_clube';
  end if;

  return new;
end $$;

drop trigger if exists teams_so_o_dono_arquiva on teams;
create trigger teams_so_o_dono_arquiva
  before update on teams
  for each row execute function so_o_dono_arquiva();

comment on function so_o_dono_arquiva is
  'Quem tem `editar` muda o nome e a foto do escalão; arquivar e mudar de clube continua a ser do dono. Uma política de update não distingue colunas — só um gatilho compara a linha antiga com a nova.';
