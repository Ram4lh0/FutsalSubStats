create schema if not exists disponibilidade;
revoke all on schema disponibilidade from public;

-- sem-politica: acesso apenas através das funções abaixo.
create table disponibilidade.formularios (
  match_id uuid primary key references public.matches(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default (statement_timestamp() + interval '192 hours'),
  pavilhao_casa text,
  link_casa text
);

-- sem-politica: acesso apenas através das funções abaixo.
create table disponibilidade.respostas (
  match_id uuid not null references disponibilidade.formularios(match_id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  estado text not null check (estado in ('vai', 'nao', 'pendente')),
  motivo text check (char_length(motivo) <= 500 and estado <> 'vai'),
  nome text not null check (char_length(btrim(nome)) between 1 and 100),
  atualizado timestamptz not null default clock_timestamp(),
  primary key (match_id, player_id)
);
create index on disponibilidade.respostas (player_id);

alter table disponibilidade.formularios enable row level security;
alter table disponibilidade.respostas enable row level security;
revoke all on all tables in schema disponibilidade from public, anon, authenticated;

create function public.disponibilidade_criar(p_jogo uuid, p_pavilhao text, p_link text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_escalao uuid;
  v_form disponibilidade.formularios;
begin
  select m.team_id into v_escalao from public.matches m where m.id = p_jogo;
  if auth.uid() is null or v_escalao is null
      or not coalesce(public.pode_editar_escalao(v_escalao), false)
      or not exists (select 1 from public.team_stat_config c
                     where c.team_id = v_escalao and 'disponibilidade-convocatoria' = any(c.addons)) then
    return jsonb_build_object('estado', 'indisponivel');
  end if;
  insert into disponibilidade.formularios as f (match_id, pavilhao_casa, link_casa)
  values (p_jogo, left(p_pavilhao, 100), left(p_link, 500))
  on conflict (match_id) do update set
    token = case when f.expires_at <= statement_timestamp() then gen_random_uuid() else f.token end,
    expires_at = case when f.expires_at <= clock_timestamp()
                      then statement_timestamp() + interval '192 hours' else f.expires_at end,
    pavilhao_casa = excluded.pavilhao_casa, link_casa = excluded.link_casa
  returning * into v_form;
  return jsonb_build_object('estado', 'ok', 'token', v_form.token, 'expira', v_form.expires_at);
end;
$$;

create function public.disponibilidade_respostas(p_jogo uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is not null and exists (
    select 1 from public.matches m where m.id = p_jogo
      and public.pode_ver_escalao(m.team_id)
  ) then coalesce((
    select jsonb_object_agg(r.player_id, jsonb_build_object(
      'estado', r.estado, 'motivo', r.motivo, 'nome', r.nome, 'atualizado', r.atualizado))
    from disponibilidade.respostas r where r.match_id = p_jogo
  ), '{}'::jsonb) end;
$$;

create function public.disponibilidade_publica(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case when f.expires_at <= statement_timestamp()
      then jsonb_build_object('estado', 'expirado')
      else jsonb_build_object(
        'estado', 'ok', 'equipa', t.name, 'adversario', m.opponent_name,
        'data', m.scheduled_at, 'local', m.home_or_away,
        'pavilhao', coalesce(nullif(m.venue, ''), case when m.home_or_away = 'HOME' then f.pavilhao_casa end),
        'link', coalesce(nullif(m.venue_url, ''), case when m.home_or_away = 'HOME' and nullif(m.venue, '') is null then f.link_casa end),
        'competicao', coalesce(c.name, m.competition), 'expira', f.expires_at,
        'atletas', coalesce((
          select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.name, 'numero', p.shirt_number)
                            order by p.shirt_number, p.name, p.id)
          from public.players p where p.team_id = m.team_id and p.is_active
        ), '[]'::jsonb)
      ) end
    from disponibilidade.formularios f
    join public.matches m on m.id = f.match_id
    join public.teams t on t.id = m.team_id
    left join public.competitions c on c.id = m.competition_id
    where f.token = p_token
  ), jsonb_build_object('estado', 'indisponivel'));
$$;

create function public.disponibilidade_responder(p_token uuid, p_atleta uuid, p_estado text, p_motivo text, p_nome text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_form disponibilidade.formularios;
  v_escalao uuid;
begin
  select f.* into v_form from disponibilidade.formularios f where f.token = p_token for share;
  if not found then return 'indisponivel'; end if;
  if v_form.expires_at <= clock_timestamp() then return 'expirado'; end if;

  p_nome := regexp_replace(coalesce(p_nome, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  p_motivo := case when p_estado <> 'vai' then nullif(btrim(p_motivo), '') end;
  if p_estado is null or p_estado not in ('vai', 'nao', 'pendente')
     or char_length(p_nome) not between 1 and 100 or char_length(p_motivo) > 500 then
    return 'invalido';
  end if;

  select m.team_id into v_escalao from public.matches m where m.id = v_form.match_id;
  if not exists (
    select 1 from public.players p where p.id = p_atleta and p.team_id = v_escalao and p.is_active
  ) then return 'indisponivel'; end if;

  insert into disponibilidade.respostas (match_id, player_id, estado, motivo, nome)
    values (v_form.match_id, p_atleta, p_estado, p_motivo, p_nome)
  on conflict (match_id, player_id) do update set
    estado = excluded.estado, motivo = excluded.motivo, nome = excluded.nome, atualizado = clock_timestamp();
  return 'ok';
end;
$$;

revoke execute on function public.disponibilidade_criar(uuid, text, text),
  public.disponibilidade_respostas(uuid),
  public.disponibilidade_publica(uuid),
  public.disponibilidade_responder(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.disponibilidade_criar(uuid, text, text),
  public.disponibilidade_respostas(uuid) to authenticated;
grant execute on function public.disponibilidade_publica(uuid),
  public.disponibilidade_responder(uuid, uuid, text, text, text) to anon, authenticated;
