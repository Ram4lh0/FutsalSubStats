-- Email escolhido depois do pagamento para ativar a licença na conta certa.
-- O email de pagamento pode vir de MB WAY, Apple Pay, cartão ou de outra pessoa.

alter table public.license_purchases
  add column if not exists account_email text,
  add column if not exists claimed_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at timestamptz;

create index if not exists license_purchases_account_email_idx
  on public.license_purchases (lower(account_email));

create index if not exists license_purchases_claimed_profile_idx
  on public.license_purchases (claimed_profile_id);

comment on column public.license_purchases.account_email is
  'Email escolhido pelo cliente para ativar a conta da app depois do pagamento Stripe.';

comment on column public.license_purchases.claimed_at is
  'Data em que a compra foi associada a uma conta da app.';
