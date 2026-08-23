-- 0019_marcas_leves_de_sync.sql
--
-- Antes de descarregar todas as tabelas, a app pergunta só a maior marca de
-- alteração visível por tabela. Se nada mudou, poupa os `select *` de clubes,
-- escalões, plantéis, jogos, convocatórias e eventos.

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
  union all select 'match_events', max(updated_at) from match_events;
$$;

revoke all on function sync_watermarks() from public;
grant execute on function sync_watermarks() to authenticated;

comment on function sync_watermarks() is
  'Marcas máximas das tabelas visíveis ao utilizador actual, usadas pela app para evitar descargas completas sem alterações.';
