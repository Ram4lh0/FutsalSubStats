-- 20260923160000_promo_treinador_estende_ate_31_outubro.sql
--
-- Estende a promoção de Treinador (20260923150000) de 15/10 para
-- 31/10/2026 às 23:59 (hora de Lisboa). Só toca nas contas que já tinham
-- esta promo concedida (license_source = 'promo_outubro_2026'), e atualiza
-- a janela do gatilho para as contas que ainda vão nascer.

-- 1) Contas que já tinham a promo: empurra a validade para 31/10.
update public.profiles
   set license_expires_at = '2026-10-31 23:59:59+01'::timestamptz
 where license_source = 'promo_outubro_2026'
   and license_status = 'trial';

-- 2) Gatilho de novas contas: janela e validade passam para 31/10.
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), new.email)
  on conflict (id) do nothing;

  if now() < '2026-11-01 00:00:00+01'::timestamptz then
    update public.profiles
       set licenca = 'treinador',
           license_status = 'trial',
           license_source = 'promo_outubro_2026',
           license_expires_at = '2026-10-31 23:59:59+01'::timestamptz
     where id = new.id;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
