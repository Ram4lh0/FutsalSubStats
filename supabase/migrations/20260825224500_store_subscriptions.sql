-- Subscricoes compradas diretamente na App Store e Google Play.
-- O cliente nunca escreve nesta tabela: apenas funcoes com service role, depois
-- de confirmarem a compra junto da respetiva loja.
-- sem-politica: contem tokens e respostas das lojas; fica fechada ao cliente.

create table if not exists store_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  product_id text not null check (product_id in ('trainer_annual', 'club_annual')),
  original_transaction_id text not null,
  latest_transaction_id text,
  status text not null check (status in ('pending', 'trial', 'active', 'grace', 'expired', 'revoked')),
  expires_at timestamptz,
  auto_renews boolean,
  environment text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, original_transaction_id)
);

create index if not exists store_subscriptions_user_idx
  on store_subscriptions(user_id, expires_at desc);

create index if not exists store_subscriptions_latest_idx
  on store_subscriptions(platform, latest_transaction_id);

alter table store_subscriptions enable row level security;
revoke all on table store_subscriptions from anon, authenticated;

drop trigger if exists store_subscriptions_touch_updated_at on store_subscriptions;
create trigger store_subscriptions_touch_updated_at
before update on store_subscriptions
for each row execute function public.touch_updated_at();

-- Recalcula a autorizacao comum às duas lojas. O mesmo login vê a licença em
-- qualquer plataforma porque a fonte de verdade é o perfil, não o aparelho.
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
     case when product_id = 'club_annual' then 0 else 1 end,
     expires_at desc nulls first
   limit 1;

  if found then
    update profiles
       set licenca = case when v_best.product_id = 'club_annual' then 'clube' else 'treinador' end,
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

comment on table public.store_subscriptions is
  'Estado confirmado no servidor das subscricoes Apple e Google Play.';
