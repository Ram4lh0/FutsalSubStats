-- Regista sessoes Stripe que expiraram antes de pagamento confirmado.

alter table public.license_purchases
  drop constraint if exists license_purchases_status_check;

alter table public.license_purchases
  add constraint license_purchases_status_check
  check (status in ('pending', 'paid', 'unmatched', 'failed', 'expired'));
