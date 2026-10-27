/* ------------------------------------------- feedback inicial (popup) */
-- Um popup pergunta a cada conta, uma única vez, onde ouviu falar de nós, um
-- email de contacto e o que está a achar da app. A linha desta tabela é ao
-- mesmo tempo a resposta e a marca de "já viu": quem fecha sem responder fica
-- com uma linha `respondido = false` e os campos vazios. Por ser no servidor, o
-- popup não volta a aparecer noutro dispositivo.
--
-- Uma linha por conta (a chave é o `user_id`). Cada utilizador só insere e lê a
-- sua; o painel local lê todas com a service_role.

create table if not exists feedback_inicial (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  respondido boolean not null default false,
  origem text check (char_length(origem) <= 500),
  email text check (char_length(email) <= 320),
  opiniao text check (char_length(opiniao) <= 4000),
  created_at timestamptz not null default now()
);

alter table feedback_inicial enable row level security;

drop policy if exists feedback_inicial_inserir_o_seu on feedback_inicial;
create policy feedback_inicial_inserir_o_seu on feedback_inicial
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists feedback_inicial_ler_o_seu on feedback_inicial;
create policy feedback_inicial_ler_o_seu on feedback_inicial
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on feedback_inicial from anon, authenticated;
grant select, insert on feedback_inicial to authenticated;
