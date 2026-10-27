/* ------------------------------------------- feedback a qualquer momento */
-- Um ícone discreto na barra de topo deixa mandar feedback quando se quiser,
-- fora dos dois popups de `feedback_inicial`. Cada mensagem é uma linha, com o
-- ecrã onde foi escrita, a versão e a plataforma, para se perceber o contexto.
--
-- Cada utilizador só insere as suas linhas e não lê nenhuma (nem as suas: não
-- há na app nenhum ecrã que as mostre). O painel local e o ciclo do painel
-- Feedback SubStats leem todas com a service_role; `importado` marca as que já
-- passaram para lá.

create table if not exists feedback_app (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 4000),
  ecra text check (char_length(ecra) <= 200),
  versao text check (char_length(versao) <= 40),
  plataforma text check (plataforma in ('ios', 'android', 'web')),
  importado boolean not null default false,
  created_at timestamptz not null default now()
);

alter table feedback_app enable row level security;

drop policy if exists feedback_app_inserir_o_seu on feedback_app;
create policy feedback_app_inserir_o_seu on feedback_app
  for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on feedback_app from anon, authenticated;
grant insert on feedback_app to authenticated;
