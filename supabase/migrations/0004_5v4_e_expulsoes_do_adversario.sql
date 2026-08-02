-- 0004_5v4_e_expulsoes_do_adversario.sql
--
-- Quatro tipos de evento novos. O tipo `match_event_type` é um enum a sério no
-- Postgres, por isso um evento que não conste desta lista é recusado à entrada —
-- ficaria preso no dispositivo e a sincronização a falhar em silêncio.
--
-- POWER_PLAY_STARTED / ENDED
--   O 5v4 marcado à mão. A app deteta sozinha quando um jogador de campo vai
--   para a baliza; estes eventos são para o caso contrário — um guarda-redes a
--   sério que sobe para jogar como quinto — e para desligar uma deteção errada.
--
-- OPPONENT_EXPULSION_ADDED / REMOVED
--   Quantos jogadores faltam ao adversário. Não há plantel deles para registar,
--   mas o número é preciso: em futsal, o golo só devolve um jogador à equipa que
--   está com menos gente. A 4 contra 4 ninguém repõe, e sem este contador a app
--   não tem como saber.
--
-- Correr no Supabase → SQL Editor. Pode ser corrida mais do que uma vez.

alter type match_event_type add value if not exists 'POWER_PLAY_STARTED';
alter type match_event_type add value if not exists 'POWER_PLAY_ENDED';
alter type match_event_type add value if not exists 'OPPONENT_EXPULSION_ADDED';
alter type match_event_type add value if not exists 'OPPONENT_EXPULSION_REMOVED';
