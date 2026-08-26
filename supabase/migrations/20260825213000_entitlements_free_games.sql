-- Licencas ativas e quatro arranques gratuitos por conta.
--
-- A tabela de utilizacoes e um livro-razão: nao referencia `matches` de
-- proposito. Apagar um jogo nao apaga nem devolve uma utilizacao.

alter table public.profiles
  add column if not exists license_status text not null default 'none',
  add column if not exists license_source text;

do $$ begin
  alter table public.profiles add constraint profiles_license_status_valid
    check (license_status in ('none', 'trial', 'active', 'grace', 'expired', 'revoked'));
exception when duplicate_object then null;
end $$;

-- Preserva as contas que ja existiam antes do modelo gratuito. As compras
-- Stripe com validade futura tambem continuam ativas.
update public.profiles
   set license_status = 'active',
       license_source = coalesce(license_source, 'legacy')
 where license_status = 'none'
   and created_at < now();

create or replace function public.license_is_active(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (p.license_status in ('trial', 'active', 'grace'))
       and (p.license_expires_at is null or p.license_expires_at > now())
      from profiles p where p.id = p_user
  ), false);
$$;

create table if not exists free_game_starts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid not null,
  started_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

create index if not exists free_game_starts_user_idx
  on public.free_game_starts(user_id, started_at);

alter table free_game_starts enable row level security;

drop policy if exists free_game_starts_read_own on free_game_starts;
create policy free_game_starts_read_own on free_game_starts
  for select using (user_id = auth.uid());

revoke insert, update, delete on public.free_game_starts from anon, authenticated;
grant select on public.free_game_starts to authenticated;

create or replace function public.my_entitlement()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_profile profiles%rowtype;
  v_used integer;
  v_active boolean;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_profile from profiles where id = v_user;
  select count(*) into v_used from free_game_starts where user_id = v_user;
  v_active := license_is_active(v_user);

  return jsonb_build_object(
    'licenseActive', v_active,
    'plan', case when v_active then v_profile.licenca else null end,
    'licenseStatus', v_profile.license_status,
    'licenseExpiresAt', v_profile.license_expires_at,
    'freeGamesUsed', v_used,
    'freeGamesRemaining', greatest(0, 4 - v_used),
    'teamLimit', case when v_active and v_profile.licenca = 'clube' then 5 else 1 end
  );
end;
$$;

grant execute on function public.my_entitlement() to authenticated;

create or replace function public.claim_match_start(p_match_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_team uuid;
  v_used integer;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select team_id into v_team from matches where id = p_match_id;
  if v_team is null or not pode_editar_escalao(v_team) then
    raise exception 'Match not found or not editable' using errcode = '42501';
  end if;

  if license_is_active(v_user) then
    return jsonb_build_object('allowed', true, 'licensed', true,
      'freeGamesUsed', (select count(*) from free_game_starts where user_id = v_user),
      'freeGamesRemaining', 4);
  end if;

  -- Uma conta so pode consumir um numero de cada vez, mesmo que dois
  -- dispositivos carreguem em Comecar no mesmo instante.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  if exists (select 1 from free_game_starts where user_id = v_user and match_id = p_match_id) then
    select count(*) into v_used from free_game_starts where user_id = v_user;
    return jsonb_build_object('allowed', true, 'licensed', false,
      'alreadyCounted', true, 'freeGamesUsed', v_used,
      'freeGamesRemaining', greatest(0, 4 - v_used));
  end if;

  select count(*) into v_used from free_game_starts where user_id = v_user;
  if v_used >= 4 then
    return jsonb_build_object('allowed', false, 'reason', 'free_limit_reached',
      'freeGamesUsed', v_used, 'freeGamesRemaining', 0);
  end if;

  insert into free_game_starts(user_id, match_id) values (v_user, p_match_id);
  v_used := v_used + 1;
  return jsonb_build_object('allowed', true, 'licensed', false,
    'freeGamesUsed', v_used, 'freeGamesRemaining', greatest(0, 4 - v_used));
end;
$$;

grant execute on function public.claim_match_start(uuid) to authenticated;

-- Depois do quarto arranque, nem uma versao antiga da app consegue criar mais
-- jogos no servidor. Os jogos ja existentes continuam legiveis e editaveis.
create or replace function public.enforce_match_creation_entitlement()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and not license_is_active(auth.uid())
     and (select count(*) from free_game_starts where user_id = auth.uid()) >= 4 then
    raise exception 'Four free games have already been used.'
      using errcode = 'check_violation', hint = 'free_game_limit_reached';
  end if;
  return new;
end;
$$;

drop trigger if exists matches_entitlement_before_create on public.matches;
create trigger matches_entitlement_before_create
  before insert on public.matches
  for each row execute function public.enforce_match_creation_entitlement();

-- Um plano Clube inclui no maximo cinco escaloes; Treinador e gratuito incluem
-- um. Esta regra substitui o limite antigo que tratava Clube como ilimitado.
create or replace function public.limite_de_escaloes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_licenca text;
  v_limite integer := 1;
  v_activos integer;
begin
  if new.archived_at is not null then return new; end if;

  select c.owner_id, p.licenca into v_owner, v_licenca
    from clubs c join profiles p on p.id = c.owner_id
   where c.id = new.club_id;

  if license_is_active(v_owner) and v_licenca = 'clube' then v_limite := 5; end if;

  select count(*) into v_activos from teams t
   where t.club_id = new.club_id and t.archived_at is null and t.id <> new.id;
  if v_activos >= v_limite then
    raise exception 'This account has reached its team limit.'
      using errcode = 'check_violation', hint = 'team_license_limit_reached';
  end if;
  return new;
end;
$$;

drop trigger if exists teams_limite_de_escaloes on public.teams;
create trigger teams_limite_de_escaloes
  before insert or update of club_id, archived_at on public.teams
  for each row execute function public.limite_de_escaloes();
