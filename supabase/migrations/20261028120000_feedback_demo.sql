/* ------------------------------------------ feedback do jogo de experiência */
-- No fim da demonstração pede-se a opinião e um email. Quem experimenta ainda
-- não tem conta, por isso não pode ir para `feedback_inicial` (uma linha por
-- conta): fica aqui, uma linha por resposta.
--
-- Qualquer pessoa pode inserir (anon incluído) e ninguém lê pela app. O painel
-- local lê tudo com a service_role e mostra-o na aba Feedback, com o momento
-- "demo". Os limites de tamanho são a única defesa contra lixo; se aparecer
-- spam, fecha-se o insert do anon.

create table if not exists feedback_demo (
  id uuid primary key default gen_random_uuid(),
  opiniao text not null check (char_length(opiniao) between 1 and 4000),
  email text check (char_length(email) <= 320),
  versao text check (char_length(versao) <= 40),
  plataforma text check (plataforma in ('ios', 'android', 'web')),
  created_at timestamptz not null default now()
);

alter table feedback_demo enable row level security;

drop policy if exists feedback_demo_inserir on feedback_demo;
create policy feedback_demo_inserir on feedback_demo
  for insert to anon, authenticated
  with check (true);

revoke all on feedback_demo from anon, authenticated;
grant insert on feedback_demo to anon, authenticated;
