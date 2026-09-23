-- 20260923170000_promo_treinador_30_dias_desde_criacao.sql
--
-- Troca a promo de Treinador (20260923150000, estendida em 20260923160000)
-- de uma data fixa (primeiro 15/10, depois 31/10) para 30 dias corridos a
-- contar da data de criação de CADA conta — em vez de todas expirarem no
-- mesmo dia.
--
-- Deixa de haver data-limite de elegibilidade: passa a ser o comportamento
-- normal para qualquer conta nova a partir de agora, não só uma promoção
-- pontual com prazo para acabar.

-- 1) Contas que já tinham a promo (data fixa, até 31/10): recalcula para
--    created_at + 30 dias.
update public.profiles
   set license_expires_at = created_at + interval '30 days'
 where license_source = 'promo_outubro_2026'
   and license_status = 'trial';

-- 2) Gatilho de novas contas: já não há data-limite de elegibilidade — toda
--    a conta nova recebe 30 dias de Treinador a contar de agora.
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), new.email)
  on conflict (id) do nothing;

  update public.profiles
     set licenca = 'treinador',
         license_status = 'trial',
         license_source = 'promo_outubro_2026',
         license_expires_at = now() + interval '30 days'
   where id = new.id;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
