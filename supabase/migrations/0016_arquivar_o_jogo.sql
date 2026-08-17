-- 0016_arquivar_o_jogo.sql
--
-- Dá aos jogos a coluna que o clube, o escalão e a competição já tinham.
--
-- Apagar um jogo na app não fazia nada. O `matches.remove` apagava a linha
-- **deste aparelho** e mais nada: no ecrã desaparecia, e a descarga seguinte
-- trazia-o de volta porque no servidor ele nunca tinha saído. É o mesmo defeito
-- que a 0015 arrumou para os escalões, no único sítio onde ainda faltava a peça
-- do lado da base de dados.
--
-- ## Porquê arquivar e não apagar mesmo
--
-- Um jogo não está sozinho: tem convocatória, eventos e períodos em campo
-- pendurados nele, e as estatísticas de um jogador saem daí. Apagar a sério
-- obrigava a apagar tudo isso em cadeia, em quatro tabelas, e a ordem certa
-- tinha de estar bem numa fila que corre offline e pode falhar a meio.
--
-- Arquivar é uma alteração como as outras: sobe com o resto, chega ao servidor,
-- e quem descarrega recebe o jogo já marcado. O trabalho fica todo nas listas,
-- que já sabiam filtrar.
--
-- E há uma segunda razão, menos técnica: apagar por engano o jogo de sábado
-- passado apaga também as estatísticas de toda a gente que jogou. Preferimos
-- que isso seja recuperável por nós do que definitivo por eles.
--
-- ## Quem pode
--
-- Ninguém de novo. A `matches_escrever` já é `pode_editar_escalao(team_id)`, e
-- arquivar é um `update` como outro qualquer — quem tem "Ver e editar" no
-- escalão trata dos jogos dele, que é exactamente o que se quer de um treinador.
--
-- Ao contrário do escalão, aqui não se põe gatilho nenhum a reservar isto ao
-- dono do clube. Um escalão é a estrutura do clube; um jogo é o trabalho do
-- treinador, e quem o criou tem de o poder tirar da lista.
--
-- Correr no Supabase → SQL Editor, depois da 0015.

alter table matches add column if not exists archived_at timestamptz;

-- As listas do servidor pedem sempre os jogos de um escalão, e a partir de agora
-- quase sempre só os que não estão arquivados.
create index if not exists matches_team_activos_idx
  on matches (team_id)
  where archived_at is null;

comment on column matches.archived_at is
  'Quando o jogo foi apagado na app. Apagar é arquivar: os eventos e a convocatória ficam, e as listas filtram por aqui.';
