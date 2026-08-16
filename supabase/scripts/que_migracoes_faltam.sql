-- que_migracoes_faltam.sql — quais das migrações já foram aplicadas.
--
-- As migrações têm sido coladas à mão no SQL Editor, e ninguém guarda a conta de
-- quais é que já lá estão. Este guião pergunta à própria base de dados: em vez
-- de consultar um registo, procura a marca que cada migração deixa — uma tabela,
-- uma coluna, um índice, uma função.
--
-- Só lê. Não muda nada.
--
--   Supabase → SQL Editor → colar → Run

select
  '0008 · pacotes de atualização'   as migracao,
  to_regclass('public.app_bundles') is not null as aplicada,
  'tabela app_bundles'              as marca
union all select
  '0009 · índice do upsert',
  exists (select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'app_bundles_versao_plataforma'
             and indexdef ilike '%nulls not distinct%'),
  'índice com `nulls not distinct` — sem isso o publicar:pacote falha'
union all select
  '0010 · um clube por conta',
  exists (select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'clubs_um_por_dono'),
  'índice único clubs_um_por_dono'
union all select
  '0011 · licenças e acessos',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles' and column_name = 'licenca'),
  'coluna profiles.licenca'
union all select
  '0011 · tabelas de acesso',
  to_regclass('public.club_members') is not null
    and to_regclass('public.team_access') is not null,
  'club_members e team_access'
union all select
  '0011 · políticas reescritas',
  exists (select 1 from pg_policies
           where schemaname = 'public' and tablename = 'teams' and policyname = 'teams_ler'),
  'a política teams_ler substituiu teams_owner'
order by migracao;
