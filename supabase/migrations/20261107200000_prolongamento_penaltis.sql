-- Prolongamento e desempate por penáltis (07/11/2026).
--
-- Quatro tipos de evento novos (ver src/domain/prolongamento.js):
--   PERIOD_FINISHED     fim da 2.ª parte / do 1.º prolongamento sem acabar o jogo
--   EXTRA_TIME_STARTED  começa uma parte do prolongamento (período 3 ou 4)
--   SHOOTOUT_STARTED    ordem dos nossos marcadores e quem bate primeiro
--   SHOOTOUT_KICK       um penálti do desempate (não conta para o resultado)
-- As versões antigas da app ignoram-nos (evento desconhecido = aviso).
alter type match_event_type add value if not exists 'PERIOD_FINISHED';
alter type match_event_type add value if not exists 'EXTRA_TIME_STARTED';
alter type match_event_type add value if not exists 'SHOOTOUT_STARTED';
alter type match_event_type add value if not exists 'SHOOTOUT_KICK';

-- Como se desempata um jogo empatado nesta competição.
alter table public.competitions
  add column if not exists desempate text not null default 'NENHUM';

alter table public.competitions
  drop constraint if exists competitions_desempate_check;
alter table public.competitions
  add constraint competitions_desempate_check
  check (desempate in ('NENHUM', 'PENALTIS', 'PROLONGAMENTO'));

comment on column public.competitions.desempate is
  'Empate no fim da 2.ª parte: NENHUM (fica empate), PENALTIS (direto) ou PROLONGAMENTO (2x5 min e depois penáltis).';
