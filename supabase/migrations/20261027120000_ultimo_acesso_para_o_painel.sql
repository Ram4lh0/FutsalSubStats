/* ------------------------------- último acesso à app (para o painel) */
-- `auth.users.last_sign_in_at` só muda quando há login a sério, e a app guarda
-- a sessão: quem a abre todos os dias aparece como "entrou há semanas". O que
-- muda sempre que a app é aberta é a renovação do token de sessão
-- (`auth.sessions.refreshed_at`), com a precisão de cerca de uma hora (a
-- validade do token). Esta função só devolve essa data por utilizador, e só o
-- painel local (service_role) a pode chamar.

create or replace function painel_ultimos_acessos()
returns table (user_id uuid, ultimo_acesso timestamptz)
language sql
security definer
set search_path = ''
as $$
  select s.user_id, max(coalesce(s.refreshed_at, s.updated_at, s.created_at))
  from auth.sessions s
  group by s.user_id;
$$;

revoke all on function painel_ultimos_acessos() from public, anon, authenticated;
grant execute on function painel_ultimos_acessos() to service_role;
