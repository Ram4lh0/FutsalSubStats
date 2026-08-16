-- 0012_emblema_do_escalao.sql
--
-- O escalão passa a poder ter emblema, como o clube já tinha.
--
-- A coluna guarda a imagem inteira, não um endereço — é um `data:` URL de menos
-- de 48 KB, recortado e comprimido no telemóvel antes de sair de lá (ver
-- `src/lib/imagem.js`). O `clubs.logo_url` já era assim; isto só põe o escalão
-- em pé de igualdade.
--
-- ## Porquê dentro da linha e não no Storage
--
-- Um endereço só vale com rede, e esta app é feita para pavilhões sem ela. Num
-- balde, o treinador offline via o nome do escalão e um quadrado vazio onde
-- devia estar o emblema — e resolvê-lo obrigava a uma segunda cache de imagens,
-- com regras de validade próprias, à parte de tudo o resto.
--
-- Aqui a imagem viaja no mesmo caminho que o nome: mesma fila a subir, mesma
-- descarga a descer, mesmas políticas de acesso. Sem balde, sem permissões de
-- ficheiro, sem endereços assinados.
--
-- O nome da coluna mantém-se `logo_url` por simetria com `clubs`, mesmo não
-- sendo um endereço. Trocá-lo obrigava a mexer nas duas tabelas e nos dois
-- mapeadores para não ganhar nada.
--
-- Correr no Supabase → SQL Editor.

alter table teams add column if not exists logo_url text;

comment on column teams.logo_url is
  'Emblema do escalão: `data:` URL de até 48 KB, preparado no dispositivo. Não é um endereço.';
