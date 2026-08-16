-- 0010_um_clube_por_conta.sql
--
-- Uma conta, um clube.
--
-- A app sempre assumiu isto sem nunca o dizer: o painel abre no clube, os
-- escalões pertencem-lhe, a época é dele. Nada impedia um segundo, e quem o
-- criasse ficava com uma app sem resposta para "qual mostro?".
--
-- A regra está agora em três sítios, e só o terceiro é uma fechadura:
--
--   1. O painel deixou de ter botão de criar quando já existe um clube.
--   2. O `repository.js` recusa o segundo `clubs.create`.
--   3. Este índice.
--
-- Os dois primeiros são cortesia — vivem dentro da app, que vai empacotada no
-- telemóvel de cada um e onde uma versão antiga continua a correr durante meses.
-- Este índice é do servidor, e vale para todas as versões ao mesmo tempo.
--
-- ## Porquê `where archived_at is null`
--
-- Apagar um clube na app é arquivá-lo, não removê-lo: os jogos e o histórico
-- ficam. Sem esta condição, um treinador que apagasse o clube para começar de
-- novo nunca mais conseguia criar nenhum — o arquivado continuava a ocupar o
-- lugar, invisível, sem nada no ecrã que explicasse a recusa.
--
-- ## Antes de correr
--
-- Se alguma conta já tiver dois clubes activos, a criação do índice falha — e é
-- assim que deve ser, porque decidir qual deles fica é uma escolha de quem lá
-- tem os dados, não deste ficheiro. Para os encontrar:
--
--   select owner_id, count(*), array_agg(name)
--   from clubs where archived_at is null
--   group by owner_id having count(*) > 1;
--
-- Correr no Supabase → SQL Editor.

create unique index if not exists clubs_um_por_dono
  on clubs (owner_id)
  where archived_at is null;

comment on index clubs_um_por_dono is
  'Uma conta tem um clube activo. A app assume-o em todo o lado; isto é o que o garante.';
