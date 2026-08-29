-- Aceita os IDs reais configurados na Play Console, mantendo os IDs antigos
-- como compatibilidade para builds/lojas que ainda os possam usar.

alter table public.store_subscriptions
  drop constraint if exists store_subscriptions_product_id_check;

alter table public.store_subscriptions
  add constraint store_subscriptions_product_id_check
  check (
    product_id in (
      'licenca_treinador_anual',
      'licenca_clube_anual',
      'Treinador',
      'Clube',
      'trainer_annual',
      'club_annual'
    )
  );

create or replace function public.recompute_store_entitlement(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_best store_subscriptions%rowtype;
  v_has_store boolean;
begin
  select exists(
    select 1 from store_subscriptions where user_id = p_user
  ) into v_has_store;

  select * into v_best
    from store_subscriptions
   where user_id = p_user
     and status in ('trial', 'active', 'grace')
     and (expires_at is null or expires_at > now())
   order by
     case when product_id in ('licenca_clube_anual', 'Clube', 'club_annual') then 0 else 1 end,
     expires_at desc nulls first
   limit 1;

  if found then
    update profiles
       set licenca = case
             when v_best.product_id in ('licenca_clube_anual', 'Clube', 'club_annual') then 'clube'
             else 'treinador'
           end,
           license_status = v_best.status,
           license_source = v_best.platform,
           license_expires_at = v_best.expires_at
     where id = p_user;
  elsif v_has_store and exists (
    select 1 from profiles
     where id = p_user and license_source in ('ios', 'android')
  ) then
    update profiles
       set license_status = 'expired',
           license_expires_at = (
             select max(expires_at) from store_subscriptions where user_id = p_user
           )
     where id = p_user;
  end if;
end;
$$;

revoke all on function public.recompute_store_entitlement(uuid) from public, anon, authenticated;
grant execute on function public.recompute_store_entitlement(uuid) to service_role;
