-- 20260912105200_escalao_nunca_muda_de_clube.sql
--
-- A2 da auditoria de 12/09/2026: `so_o_dono_arquiva()` (0013) tinha isto no
-- topo:
--
--   if sou_dono_do_clube(new.club_id) then
--     return new;
--   end if;
--
-- A intenção era só para o arquivar: o dono do clube pode arquivar/reativar o
-- escalão sem mais perguntas. Mas isto testa a propriedade do clube NOVO, e
-- devolve logo `new` sem olhar a mais nada — incluindo se `club_id` mudou.
--
-- Resultado: quem tem `editar` num escalão alheio, e é dono de outro clube
-- seu (o caso mais comum: o dono de um clube que também partilhou consigo
-- próprio, ou um treinador que também gere o seu próprio clube), consegue
-- fazer UPDATE ao escalão a mudar `club_id` para esse clube seu — e o
-- gatilho deixa passar, porque `sou_dono_do_clube(new.club_id)` dá verdadeiro
-- para o clube de destino. Confirmado em SQL: o escalão "roubado" muda de
-- dono, e jogadores/jogos que continuam a apontar para o clube antigo ficam
-- incoerentes com ele.
--
-- A correção que a auditoria pede é tornar `club_id` imutável neste caminho,
-- sem exceção nenhuma — uma transferência a sério, se algum dia existir, tem
-- de ser uma operação própria, que valide o dono de origem E de destino, e
-- atualize jogadores/jogos na mesma transação. Não este `update` normal.

create or replace function so_o_dono_arquiva()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Isto vem primeiro, e sem bypass nenhum: não interessa de quem o chamador
  -- é dono, `club_id` não muda por aqui.
  if new.club_id is distinct from old.club_id then
    raise exception 'Um escalão não muda de clube.'
      using errcode = 'insufficient_privilege', hint = 'so_o_dono_muda_de_clube';
  end if;

  -- Arquivar/reativar continua a ser só de quem é dono do clube ATUAL do
  -- escalão (old.club_id — e agora sabemos que é sempre igual a new.club_id,
  -- pela verificação de cima).
  if new.archived_at is distinct from old.archived_at and not sou_dono_do_clube(old.club_id) then
    raise exception 'Só o clube pode apagar escalões.'
      using errcode = 'insufficient_privilege', hint = 'so_o_dono_arquiva';
  end if;

  return new;
end $$;

comment on function so_o_dono_arquiva is
  'Quem tem `editar` muda o nome e a foto do escalão. `club_id` nunca muda por aqui, para ninguém; arquivar/reativar continua a ser só do dono do clube atual do escalão.';
