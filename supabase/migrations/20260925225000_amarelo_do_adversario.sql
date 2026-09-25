-- 20260925225000_amarelo_do_adversario.sql
--
-- Novo tipo de evento para apontar um amarelo do adversário — a app não
-- conhece o plantel deles, por isso o evento identifica só o número da
-- camisola (guardado em metadata.number, sem coluna própria).
--
-- Sem dados a migrar: é só mais um valor possível para o tipo já existente,
-- os eventos antigos continuam válidos como estavam.
alter type match_event_type add value if not exists 'OPPONENT_YELLOW_CARD';
