/* --------------------------------------- feedback inicial, por momento */
-- O popup passa a ter dois momentos, cada um uma única vez por conta:
--   'registo'    — contas criadas a partir de agora, logo à entrada: email e
--                  onde ouviram falar de nós;
--   'dois_jogos' — quando a conta chega aos dois jogos registados: o que está a
--                  achar da app (e o resto, se não respondeu no registo).
-- A chave passa a ser (user_id, momento). As linhas que já existam ficam como
-- 'dois_jogos', que era o único momento até aqui.

alter table feedback_inicial
  add column if not exists momento text not null default 'dois_jogos'
  check (momento in ('registo', 'dois_jogos'));

alter table feedback_inicial drop constraint if exists feedback_inicial_pkey;
alter table feedback_inicial add primary key (user_id, momento);
