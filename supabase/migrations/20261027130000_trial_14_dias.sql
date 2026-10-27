-- 20261027130000_trial_14_dias.sql
--
-- O período grátis (Treinador em trial) das contas novas passa de 30 para
-- 14 dias, a contar da criação da conta.
--
-- Só muda o gatilho de novas contas. As contas que já existem mantêm a
-- data de fim que têm (não se mexe em license_expires_at).

create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), new.email)
  on conflict (id) do nothing;

  update public.profiles
     set licenca = 'treinador',
         license_status = 'trial',
         license_source = 'promo_outubro_2026',
         license_expires_at = now() + interval '14 days'
   where id = new.id;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
