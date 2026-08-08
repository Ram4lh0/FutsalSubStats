-- 0005_apagar_conta.sql
--
-- Apagar a conta a partir de dentro da app.
--
-- A Apple exige isto de qualquer app onde se possa criar conta: tem de dar para
-- a apagar sem mandar email a ninguém nem esperar por resposta. E é o que está
-- certo — quem se inscreveu sozinho deve poder sair sozinho.
--
-- Como funciona: a app não pode tocar em `auth.users` — nenhum cliente pode, e
-- ainda bem. Esta função corre com os direitos de quem a criou (`security
-- definer`) e apaga apenas a linha de quem a chamou (`auth.uid()`). Não recebe
-- argumentos de propósito: assim não há como pedir a eliminação de outra pessoa.
--
-- O resto desaparece sozinho, pela corrente de `on delete cascade` já definida
-- em 0001:
--
--   auth.users → profiles → clubs → teams → competitions
--                                         → players
--                                         → matches → match_squad
--                                                   → match_events
--
-- Correr no Supabase → SQL Editor.

create or replace function delete_my_account() returns void as $$
declare
  quem uuid := auth.uid();
begin
  if quem is null then
    raise exception 'Não há sessão iniciada.';
  end if;

  -- A corrente de cascatas trata dos clubes, escalões, planteis, jogos e
  -- eventos. Fica aqui explícito para quem ler não ter de ir confirmar.
  delete from auth.users where id = quem;
end;
$$ language plpgsql security definer set search_path = public, auth;

comment on function delete_my_account() is
  'Apaga a conta de quem chama e tudo o que lhe pertence. Sem volta a dar.';

-- Só quem tem sessão iniciada. `security definer` sem esta linha seria uma porta
-- aberta a qualquer visitante anónimo.
revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
