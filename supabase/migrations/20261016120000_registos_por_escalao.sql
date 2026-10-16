-- 20261016120000_registos_por_escalao.sql
--
-- Registos extra no jogo ao vivo, ligados por escalão: remates, defesas do
-- GR, recuperações, foras, cantos e ações +/−. Plano completo em
-- PLANO-REGISTOS-POR-ESCALAO.md.
--
-- Só se acrescenta. Nenhuma tabela nem coluna antiga muda de significado; as
-- versões da app que já estão nos telemóveis ignoram os tipos de evento novos
-- (o reducer da 1.8.x põe um aviso em `state.warnings` e segue).
--
-- ORDEM: esta migração vai para produção ANTES de qualquer build que envie
-- `STAT_RECORDED`. Uma app nova a enviar um tipo que o enum não conhece
-- encrava a fila de sincronização.
--
-- Pode ser corrida mais do que uma vez.

/* ---------------------------------------------------- tipos de evento */

-- STAT_RECORDED: um registo (remate, recuperação, …). Qual é vai em
-- `metadata.registo`; um registo novo, daqui para a frente, é só um valor
-- novo lá dentro, sem migração.
--
-- STAT_CORRECTED: correção a frio de um registo (resultado, jogador, ponto,
-- minuto). Aponta para ele por `metadata.targetEventId`, como as correções
-- das faltas. Apagar continua a ser `EVENT_UNDONE` ao vivo e `undone_at` a
-- frio.
--
-- O `append_match_event` (versão da 0024) faz o cast do tipo e aceita estes
-- valores sem mais nada.
alter type match_event_type add value if not exists 'STAT_RECORDED';
alter type match_event_type add value if not exists 'STAT_CORRECTED';

/* ------------------------------------------- configuração por escalão */

-- Que registos tem cada escalão ligados. Só de leitura para a app: quem
-- escreve é o painel de administração (tools/painel), com a chave de
-- serviço.
--
-- Uma tabela à parte, e não uma coluna em `teams`, porque a app faz upsert de
-- `teams` com o grant da tabela inteira e há versões antigas em campo. Fechar
-- uma coluna em `teams` arriscava partir a sincronização delas; uma tabela
-- nova sem grant de escrita é segura desde o primeiro dia.
create table if not exists team_stat_config (
  team_id uuid primary key references teams (id) on delete cascade,
  -- ex.: {remate,recuperacao,defesa_gr,fora,canto,acao}
  registos text[] not null default '{}',
  -- reservado à fase 2 (pesos das notas, …)
  opcoes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

drop trigger if exists team_stat_config_touch on team_stat_config;
create trigger team_stat_config_touch before update on team_stat_config
  for each row execute function touch_updated_at();

alter table team_stat_config enable row level security;

drop policy if exists team_stat_config_ler on team_stat_config;
create policy team_stat_config_ler on team_stat_config
  for select using (pode_ver_escalao(team_id));

-- Nenhuma política de escrita, e nenhum grant de escrita: a app só lê.
revoke insert, update, delete, truncate on team_stat_config from authenticated, anon;
revoke all on team_stat_config from anon;
grant select on team_stat_config to authenticated;

/* --------------------------------------------- marcas da sincronização */

-- A configuração entra na pergunta leve: sem isto, ligar um registo no painel
-- só chegava ao telemóvel quando outra tabela qualquer mudasse.
create or replace function sync_watermarks()
returns table(tabela text, marca timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select 'profiles'::text, max(updated_at) from profiles where id = auth.uid()
  union all select 'clubs', max(updated_at) from clubs
  union all select 'teams', max(updated_at) from teams
  union all select 'competitions', max(updated_at) from competitions
  union all select 'players', max(updated_at) from players
  union all select 'matches', max(updated_at) from matches
  union all select 'match_squad', max(updated_at) from match_squad
  union all select 'match_events', max(updated_at) from match_events
  union all select 'training_routines', max(updated_at) from training_routines
  union all select 'training_sessions', max(updated_at) from training_sessions
  union all select 'training_attendance', max(updated_at) from training_attendance
  union all select 'plays', max(updated_at) from plays
  union all select 'team_stat_config', max(updated_at) from team_stat_config;
$$;

revoke all on function sync_watermarks() from public;
grant execute on function sync_watermarks() to authenticated;
