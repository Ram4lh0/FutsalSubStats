-- 20261108200000_treinos_realtime.sql
--
-- Treinos em tempo real entre aparelhos (1.34.6).
--
--   * `training_sessions` e `training_attendance` na publicação
--     `supabase_realtime`. A app subscreve os treinos do escalão aberto
--     (`team_id=eq.<id>`) e as presenças; o que cada um recebe passa pela
--     segurança por linha que já existe nas duas tabelas. Nenhuma política
--     muda aqui.
--   * O aviso só serve para dizer "esta linha mudou": a app pede a linha
--     inteira ao servidor, porque com a identidade de réplica por omissão a
--     UT (`plan`, jsonb grande) pode não vir no aviso quando não mudou.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'training_sessions'
  ) then
    alter publication supabase_realtime add table public.training_sessions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'training_attendance'
  ) then
    alter publication supabase_realtime add table public.training_attendance;
  end if;
end $$;
