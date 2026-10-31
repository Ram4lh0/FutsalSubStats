/* ------------------------------------------------------ pavilhão do jogo */
-- Onde é o jogo. A app pede-o sempre que o jogo é fora (jogo novo, preparar
-- jogo, convocatória e preparação) e põe-no no texto e no PDF da convocatória.
-- Em casa pode ficar vazio: a app usa o pavilhão de casa do escalão.
--
-- Coluna simples e opcional: as versões antigas da app não a mandam, e o
-- upsert delas só mexe nas colunas que envia — o pavilhão fica como estava.

alter table matches add column if not exists venue text
  check (venue is null or char_length(venue) <= 120);
