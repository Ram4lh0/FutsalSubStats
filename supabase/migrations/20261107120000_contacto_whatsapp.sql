/* ------------------------------------------- pedido de contacto por WhatsApp */
-- Contas escolhidas à mão (quem tem usado a app e com quem queremos falar).
-- Cada linha faz aparecer, na próxima vez que a conta abrir a app, um popup a
-- convidar para falar connosco pelo WhatsApp, na língua da app.
--
-- As linhas entram pelo SQL do painel (service_role), por email:
--   insert into contacto_whatsapp (user_id, nota)
--   select id, 'CFS Montsant' from auth.users where email = '...'
--   on conflict do nothing;
--
-- A app só lê a sua linha e só pode marcar quando a mostrou e o que escolheu.
-- `mostrado_em` preenchido = não volta a aparecer.

create table if not exists contacto_whatsapp (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nota text check (char_length(nota) <= 500),
  criado_em timestamptz not null default now(),
  mostrado_em timestamptz,
  resposta text check (resposta in ('whatsapp', 'agora_nao')),
  idioma text check (idioma in ('pt', 'en', 'es'))
);

alter table contacto_whatsapp enable row level security;

drop policy if exists contacto_whatsapp_ler_o_seu on contacto_whatsapp;
create policy contacto_whatsapp_ler_o_seu on contacto_whatsapp
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists contacto_whatsapp_marcar_o_seu on contacto_whatsapp;
create policy contacto_whatsapp_marcar_o_seu on contacto_whatsapp
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on contacto_whatsapp from anon, authenticated;
grant select on contacto_whatsapp to authenticated;
grant update (mostrado_em, resposta, idioma) on contacto_whatsapp to authenticated;
