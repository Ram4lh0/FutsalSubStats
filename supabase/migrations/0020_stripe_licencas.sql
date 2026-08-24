-- Licenças pagas por Stripe Checkout.
-- O Worker usa a service role para escrever aqui; o cliente nunca recebe essa chave.

alter table public.profiles
  add column if not exists license_expires_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_last_checkout_session_id text,
  add column if not exists stripe_last_payment_intent_id text;

comment on column public.profiles.license_expires_at is
  'Fim da licença anual atribuída depois de pagamento confirmado no Stripe.';

-- sem-politica: tabela operacional fechada ao cliente; só o Worker com service role escreve.
create table if not exists license_purchases (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  email text not null,
  plan text not null check (plan in ('treinador', 'clube')),
  status text not null check (status in ('pending', 'paid', 'unmatched', 'failed')),
  amount_total integer,
  currency text,
  customer_name text,
  customer_tax_id text,
  license_expires_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists license_purchases_email_idx
  on license_purchases (lower(email));

create index if not exists license_purchases_status_idx
  on license_purchases (status);

drop trigger if exists license_purchases_touch_updated_at on license_purchases;
create trigger license_purchases_touch_updated_at
before update on license_purchases
for each row execute function public.touch_updated_at();

alter table license_purchases enable row level security;

-- Sem políticas públicas: é uma tabela operacional. A service role do Worker
-- contorna RLS; anon/authenticated não devem ler nem escrever compras.
revoke all on table license_purchases from anon, authenticated;

comment on table public.license_purchases is
  'Histórico de pagamentos Stripe para ativação e reconciliação de licenças.';
