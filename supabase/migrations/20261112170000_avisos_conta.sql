/* -------------------------------------------------- avisos a uma conta */
-- Mensagens escritas à mão para uma conta (agradecer, pedir desculpa, avisar).
-- Cada linha aparece uma vez, num popup, na próxima abertura da app; o texto
-- vem daqui, por isso um aviso novo não precisa de update da app.
--
-- As linhas entram pelo SQL do painel (service_role):
--   insert into avisos_conta (user_id, titulo, mensagem)
--   select id, 'Obrigado!', 'Texto...' from auth.users where email = '...';
--
-- A app só lê as suas linhas e só pode marcar quando as mostrou.

create table if not exists avisos_conta (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 120),
  mensagem text not null check (char_length(mensagem) between 1 and 2000),
  nota text check (char_length(nota) <= 500),
  criado_em timestamptz not null default now(),
  mostrado_em timestamptz
);

create index if not exists avisos_conta_por_mostrar
  on avisos_conta (user_id, criado_em) where mostrado_em is null;

alter table avisos_conta enable row level security;

drop policy if exists avisos_conta_ler_os_seus on avisos_conta;
create policy avisos_conta_ler_os_seus on avisos_conta
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists avisos_conta_marcar_os_seus on avisos_conta;
create policy avisos_conta_marcar_os_seus on avisos_conta
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on avisos_conta from anon, authenticated;
grant select on avisos_conta to authenticated;
grant update (mostrado_em) on avisos_conta to authenticated;
