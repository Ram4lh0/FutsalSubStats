-- 0018_marca_de_agua.sql
--
-- Dá à tabela dos eventos um `updated_at`, para a app poder perguntar «o que
-- mudou desde a última vez» em vez de descarregar tudo outra vez.
--
-- ## O problema que isto resolve
--
-- A descarga trazia todas as linhas de todas as tabelas, sempre. Com a app
-- aberta e um temporizador a disparar de três em três segundos, uma época de
-- vinte jogos dava gigabytes de tráfego por tarde. O temporizador já saiu; falta
-- a outra metade — só pedir o que é novo.
--
-- Para isso, cada tabela precisa de saber quando foi tocada pela última vez.
-- Todas têm `updated_at` com um gatilho que o actualiza. Todas menos esta.
--
-- ## Porque é que faltava aqui, e porque é que faz falta
--
-- Os eventos de um jogo são escritos uma vez e nunca mais mexidos — daí só
-- terem `created_at`. Só que há uma excepção: **desfazer**. O `undone_at` é
-- posto por uma actualização, minutos depois de a linha nascer.
--
-- Sem `updated_at`, uma descarga incremental filtrada pelo `created_at` não via
-- esse desfazer. Um golo anulado no telemóvel do treinador continuava a contar
-- no tablet do adjunto, e nada na app explicava porquê.
--
-- Correr no Supabase → SQL Editor.

alter table match_events
  add column if not exists updated_at timestamptz not null default now();

-- As linhas que já existem ficam com a data de nascimento, e não com a de agora:
-- pôr `now()` em tudo fazia a primeira descarga de cada aparelho trazer o
-- histórico inteiro outra vez, que é precisamente o que se veio evitar.
update match_events set updated_at = coalesce(undone_at, created_at)
  where updated_at > coalesce(undone_at, created_at);

-- O mesmo gatilho das outras tabelas (definido na 0001).
drop trigger if exists match_events_touch on match_events;
create trigger match_events_touch
  before update on match_events
  for each row execute function touch_updated_at();

-- Sem índice, cada descarga passa a ser uma leitura da tabela toda para
-- responder «nada mudou» — mais barata na rede e mais cara na base. Com ele, a
-- pergunta responde-se sem tocar nas linhas antigas.
create index if not exists match_events_updated_idx on match_events (updated_at);

comment on column match_events.updated_at is
  'Última vez que a linha foi tocada. É por aqui que a app pede só o que mudou.';
