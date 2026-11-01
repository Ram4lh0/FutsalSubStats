/* ------------------------------------------------- link do pavilhão do jogo */
-- O link da localização do pavilhão (Google Maps, Waze…), opcional, por baixo
-- do nome do pavilhão em jogo novo, preparar jogo e convocatória. Vai para o
-- texto do WhatsApp e para o PDF da convocatória, para os pais e jogadores
-- abrirem o caminho direto.
--
-- Coluna simples e opcional: as versões antigas da app não a mandam, e o
-- upsert delas só mexe nas colunas que envia — o link fica como estava.

alter table matches add column if not exists venue_url text
  check (venue_url is null or char_length(venue_url) <= 500);
