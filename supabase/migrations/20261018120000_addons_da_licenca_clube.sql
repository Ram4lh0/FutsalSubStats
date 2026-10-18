-- 20261018120000_addons_da_licenca_clube.sql
--
-- A "Visão geral do clube" (add-on `visao-geral-clube`, 1.10.0) é para todas
-- as contas com licença Clube. A 18/10/2026 ligou-se à mão nos 17 escalões das
-- 5 contas Clube que havia; isto faz o mesmo sozinho daqui para a frente:
--
--   * quando um perfil passa a ter licença Clube activa (era outra coisa, ou
--     estava inactiva), os escalões de todos os seus clubes recebem o add-on;
--   * quando se cria um escalão num clube cujo dono tem licença Clube activa,
--     o escalão nasce com o add-on.
--
-- "Activa" é a mesma regra da app (src/lib/license.js): estado 'trial',
-- 'active' ou 'grace' e `license_expires_at` vazio ou no futuro.
--
-- Só acrescenta: junta os ids que faltam a `team_stat_config.addons`, não
-- tira nenhum, não mexe nos `registos` nem nos outros add-ons. Desligar no
-- painel continua a valer: renovar uma licença que já estava activa não volta
-- a ligar nada. Perder a licença Clube também não desliga nada aqui (a app é
-- que decide o que mostrar a quem não tem licença).
--
-- A app só lê `team_stat_config`, por isso não precisa de versão nova: a linha
-- chega aos telemóveis na sincronização seguinte, como quando se liga no
-- painel.
--
-- Pode ser corrida mais do que uma vez.

-- Os add-ons que vêm com a licença Clube. Um add-on novo para todos os
-- clubes entra aqui (numa migração nova), e só afecta o que mudar depois.
create or replace function addons_da_licenca_clube()
returns text[] language sql immutable set search_path = public as $$
  select array['visao-geral-clube']::text[]
$$;

create or replace function licenca_clube_activa(p_licenca text, p_estado text, p_expira timestamptz)
returns boolean language sql stable set search_path = public as $$
  select p_licenca = 'clube'
     and p_estado in ('trial', 'active', 'grace')
     and (p_expira is null or p_expira > now())
$$;

-- Junta os add-ons da licença Clube aos escalões dados, criando a linha de
-- config se ainda não houver.
create or replace function ligar_addons_da_licenca_clube(p_escaloes uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into team_stat_config (team_id, addons)
  select t.id, addons_da_licenca_clube()
    from teams t
   where t.id = any(p_escaloes)
  on conflict (team_id) do update
     set addons = team_stat_config.addons || array(
           select a from unnest(excluded.addons) a
            where not (a = any(team_stat_config.addons))
         )
   where not (team_stat_config.addons @> excluded.addons);
end $$;

-- Perfil passa a Clube activo.
create or replace function addons_ao_passar_a_clube()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if licenca_clube_activa(new.licenca, new.license_status, new.license_expires_at)
     and (tg_op = 'INSERT'
          or not licenca_clube_activa(old.licenca, old.license_status, old.license_expires_at)) then
    perform ligar_addons_da_licenca_clube(array(
      select t.id from teams t join clubs c on c.id = t.club_id where c.owner_id = new.id
    ));
  end if;
  return null;
end $$;

drop trigger if exists profiles_addons_da_licenca_clube on profiles;
create trigger profiles_addons_da_licenca_clube
  after insert or update of licenca, license_status, license_expires_at on profiles
  for each row execute function addons_ao_passar_a_clube();

-- Escalão novo num clube de dono Clube activo.
create or replace function addons_no_escalao_novo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from clubs c join profiles p on p.id = c.owner_id
     where c.id = new.club_id
       and licenca_clube_activa(p.licenca, p.license_status, p.license_expires_at)
  ) then
    perform ligar_addons_da_licenca_clube(array[new.id]);
  end if;
  return null;
end $$;

drop trigger if exists teams_addons_da_licenca_clube on teams;
create trigger teams_addons_da_licenca_clube
  after insert on teams
  for each row execute function addons_no_escalao_novo();

-- Nada disto é para chamar pela API.
revoke all on function addons_da_licenca_clube() from public, anon, authenticated;
revoke all on function licenca_clube_activa(text, text, timestamptz) from public, anon, authenticated;
revoke all on function ligar_addons_da_licenca_clube(uuid[]) from public, anon, authenticated;
revoke all on function addons_ao_passar_a_clube() from public, anon, authenticated;
revoke all on function addons_no_escalao_novo() from public, anon, authenticated;

comment on function ligar_addons_da_licenca_clube is
  'Junta addons_da_licenca_clube() a team_stat_config.addons dos escalões dados. Só acrescenta.';
comment on trigger profiles_addons_da_licenca_clube on profiles is
  'Quando a conta passa a ter licença Clube activa, os escalões dos seus clubes recebem os add-ons do Clube.';
comment on trigger teams_addons_da_licenca_clube on teams is
  'Um escalão novo num clube de dono com licença Clube activa nasce com os add-ons do Clube.';
