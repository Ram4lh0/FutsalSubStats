-- 20260923150000_promo_treinador_ate_15_outubro.sql
--
-- Promoção: todas as contas criadas a partir de 23/09/2026 (inclusive) ficam
-- automaticamente com uma licença de Treinador activa até 15/10/2026 às
-- 23:59 (hora de Lisboa) — sem precisar de a pedir no painel nem de passar
-- pelos 4 jogos grátis (ver `license_is_active` / `my_entitlement()` em
-- 20260825213000_entitlements_free_games.sql).
--
-- A partir de 16/10/2026 as contas novas voltam ao comportamento normal
-- (license_status = 'none', só os 4 jogos grátis) — não é preciso reverter
-- nada manualmente, a função já só concede a promoção dentro da janela.
--
-- Datas assumidas em hora de Lisboa (UTC+1 em setembro/outubro — ainda em
-- horário de verão nessa altura do ano).
--
-- Não mexe em contas que já tinham outro `license_status` (ex.: 'active' de
-- uma compra Stripe/legado) — só nas que estavam mesmo por licenciar.

-- 1) Backfill: contas já criadas desde 23/09 que ainda não tinham licença.
update public.profiles
   set licenca = 'treinador',
       license_status = 'trial',
       license_source = 'promo_outubro_2026',
       license_expires_at = '2026-10-15 23:59:59+01'::timestamptz
 where license_status = 'none'
   and created_at >= '2026-09-23 00:00:00+01'::timestamptz;

-- 2) Dali para a frente: quem se registar até 15/10/2026 (23:59, Lisboa)
--    recebe a mesma licença automaticamente ao criar a conta.
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), new.email)
  on conflict (id) do nothing;

  if now() < '2026-10-16 00:00:00+01'::timestamptz then
    update public.profiles
       set licenca = 'treinador',
           license_status = 'trial',
           license_source = 'promo_outubro_2026',
           license_expires_at = '2026-10-15 23:59:59+01'::timestamptz
     where id = new.id;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
