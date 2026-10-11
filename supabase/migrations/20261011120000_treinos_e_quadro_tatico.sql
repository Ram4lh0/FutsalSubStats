-- 20261011120000_treinos_e_quadro_tatico.sql
--
-- A aba Treino: calendário de treinos com presenças, e o quadro tático com as
-- jogadas animadas.
--
-- Só se acrescenta. Nenhuma tabela nem coluna antiga muda de significado, por
-- isso as versões da app que já estão nos telemóveis não dão por nada.
--
-- Acesso: o mesmo dos jogos. Ver um escalão dá para ver os treinos e as
-- jogadas; editar o escalão dá para os mudar (`pode_ver_escalao` /
-- `pode_editar_escalao`, de 0011).

/* ------------------------------------------------------------ rotina */

-- A rotina semanal: "terças e quintas às 19h30, 90 minutos". Os treinos do
-- calendário nascem dela, no aparelho; a rotina em si é só a regra.
create table if not exists training_routines (
  id uuid primary key,
  team_id uuid not null references teams(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo, como o getDay()
  start_time text not null check (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  duration_min smallint not null default 90 check (duration_min between 10 and 600),
  location text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists training_routines_team_idx on training_routines (team_id);

/* ----------------------------------------------------------- treinos */

-- Um treino concreto, num dia. `edited` diz que foi mexido à mão (outra hora,
-- outro dia) e que a rotina já não lhe toca quando mudar.
create table if not exists training_sessions (
  id uuid primary key,
  team_id uuid not null references teams(id) on delete cascade,
  routine_id uuid references training_routines(id) on delete set null,
  date date not null,
  start_time text not null check (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  duration_min smallint not null default 90 check (duration_min between 10 and 600),
  location text,
  status text not null default 'AGENDADO' check (status in ('AGENDADO', 'CANCELADO')),
  edited boolean not null default false,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists training_sessions_team_date_idx on training_sessions (team_id, date);

/* --------------------------------------------------------- presenças */

-- Uma linha por jogador e por treino. O id é derivado no aparelho a partir do
-- par (treino, jogador), para dois telemóveis marcarem o mesmo jogador sem
-- criarem duas linhas.
create table if not exists training_attendance (
  id uuid primary key,
  session_id uuid not null references training_sessions(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  status text not null check (status in ('PRESENTE', 'FALTA_INJUSTIFICADA', 'FALTA_JUSTIFICADA', 'LESAO')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, player_id)
);
create index if not exists training_attendance_session_idx on training_attendance (session_id);

/* ----------------------------------------------------------- jogadas */

-- Uma jogada do quadro tático. `data` leva as peças e os frames (ver
-- src/domain/jogada.js); uma jogada típica são 2 a 5 KB.
--
-- `share_token` é o link público: aleatório, válido até `share_expires_at`
-- (30 dias). Gerar um novo token mata o anterior.
create table if not exists plays (
  id uuid primary key,
  team_id uuid not null references teams(id) on delete cascade,
  -- O clube do escalão, preenchido pelo servidor (gatilho abaixo). Serve a
  -- biblioteca do clube: ver as jogadas partilhadas sem ter acesso ao escalão.
  club_id uuid references clubs(id) on delete cascade,
  -- Quem a criou. É por aqui que se contam as 3 jogadas grátis.
  created_by uuid default auth.uid(),
  -- Partilhada na biblioteca do clube (só com licença Clube).
  shared_with_club boolean not null default false,
  title text not null,
  category text not null default 'MOVIMENTACAO',
  description text,
  data jsonb not null,
  share_token uuid unique,
  share_expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (octet_length(data::text) < 200000)
);
create index if not exists plays_team_idx on plays (team_id);
create index if not exists plays_biblioteca_idx on plays (club_id) where shared_with_club;

-- O clube vem sempre do escalão — nunca do que o aparelho mandar.
create or replace function plays_preencher_clube()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.club_id := (select club_id from teams where id = new.team_id);
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
drop trigger if exists plays_preencher_clube on plays;
create trigger plays_preencher_clube before insert or update on plays
  for each row execute function plays_preencher_clube();

/* -------------------------------------------------------- updated_at */

do $$
declare t text;
begin
  foreach t in array array['training_routines','training_sessions','training_attendance','plays'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format(
      'create trigger %I_touch before update on %I for each row execute function touch_updated_at()',
      t, t
    );
  end loop;
end $$;

/* --------------------------------------------------------------- RLS */

/* ------------------------------------------------ licença Clube */

-- O clube tem licença Clube ativa? É a do dono que conta: os treinadores
-- associados entram pela licença do clube, não pela deles.
create or replace function clube_tem_licenca_clube(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.licenca = 'clube' and license_is_active(p.id)
      from clubs cl join profiles p on p.id = cl.owner_id
     where cl.id = c
  ), false);
$$;
revoke all on function clube_tem_licenca_clube(uuid) from public;

-- Pode ver a biblioteca deste clube: é o dono ou treinador associado, e o
-- clube tem licença Clube.
create or replace function pode_ver_biblioteca(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select clube_tem_licenca_clube(c) and (
    exists (select 1 from clubs where id = c and owner_id = auth.uid())
    or exists (select 1 from club_members where club_id = c and user_id = auth.uid())
  );
$$;
revoke all on function pode_ver_biblioteca(uuid) from public;
grant execute on function pode_ver_biblioteca(uuid) to authenticated;

create or replace function escalao_do_treino(s uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from training_sessions where id = s;
$$;
revoke all on function escalao_do_treino(uuid) from public;
grant execute on function escalao_do_treino(uuid) to authenticated;

alter table training_routines   enable row level security;
alter table training_sessions   enable row level security;
alter table training_attendance enable row level security;
alter table plays               enable row level security;

drop policy if exists training_routines_ler on training_routines;
drop policy if exists training_routines_escrever on training_routines;
create policy training_routines_ler on training_routines
  for select using (pode_ver_escalao(team_id));
create policy training_routines_escrever on training_routines
  for all using (pode_editar_escalao(team_id)) with check (pode_editar_escalao(team_id));

drop policy if exists training_sessions_ler on training_sessions;
drop policy if exists training_sessions_escrever on training_sessions;
create policy training_sessions_ler on training_sessions
  for select using (pode_ver_escalao(team_id));
create policy training_sessions_escrever on training_sessions
  for all using (pode_editar_escalao(team_id)) with check (pode_editar_escalao(team_id));

drop policy if exists training_attendance_ler on training_attendance;
drop policy if exists training_attendance_escrever on training_attendance;
create policy training_attendance_ler on training_attendance
  for select using (pode_ver_escalao(escalao_do_treino(session_id)));
create policy training_attendance_escrever on training_attendance
  for all using (pode_editar_escalao(escalao_do_treino(session_id)))
  with check (pode_editar_escalao(escalao_do_treino(session_id)));

drop policy if exists plays_ler on plays;
drop policy if exists plays_escrever on plays;
create policy plays_ler on plays
  for select using (
    pode_ver_escalao(team_id)
    or (shared_with_club and deleted_at is null and pode_ver_biblioteca(club_id))
  );
create policy plays_escrever on plays
  for all using (pode_editar_escalao(team_id)) with check (pode_editar_escalao(team_id));

/* ------------------------------------------ 3 jogadas grátis */

-- Sem licença, cada conta cria até 3 jogadas — para sempre. O registo fica
-- nesta tabela, que a app só lê: apagar uma jogada não devolve a vaga, e
-- limpar o aparelho ou mudar de telemóvel também não.
create table if not exists free_play_creations (
  user_id uuid not null references profiles(id) on delete cascade,
  play_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, play_id)
);
alter table free_play_creations enable row level security;
drop policy if exists free_play_creations_ler on free_play_creations;
create policy free_play_creations_ler on free_play_creations
  for select using (user_id = auth.uid());

create or replace function plays_limite_gratis()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_usadas integer;
  v_clube uuid;
begin
  -- Já existe: é a metade "insert" de um upsert que vai ser update.
  if exists (select 1 from plays where id = new.id) then
    return new;
  end if;
  if auth.uid() is null or license_is_active(auth.uid()) then
    return new;
  end if;
  -- Treinador associado a um clube com licença: entra pela licença do dono.
  select club_id into v_clube from teams where id = new.team_id;
  if exists (
    select 1 from clubs cl where cl.id = v_clube and cl.owner_id <> auth.uid()
       and license_is_active(cl.owner_id)
  ) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('jogadas:' || auth.uid()::text, 0));
  if exists (select 1 from free_play_creations where user_id = auth.uid() and play_id = new.id) then
    return new;
  end if;
  select count(*) into v_usadas from free_play_creations where user_id = auth.uid();
  if v_usadas >= 3 then
    raise exception 'Three free plays have already been used.'
      using errcode = 'check_violation', hint = 'free_play_limit_reached';
  end if;
  insert into free_play_creations (user_id, play_id) values (auth.uid(), new.id)
    on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists plays_limite_gratis on plays;
create trigger plays_limite_gratis before insert on plays
  for each row execute function plays_limite_gratis();

-- Quantas jogadas grátis já gastou quem pergunta.
create or replace function my_free_plays_used()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from free_play_creations where user_id = auth.uid();
$$;
revoke all on function my_free_plays_used() from public;
grant execute on function my_free_plays_used() to authenticated;

/* ------------------------------------------------- link público */

-- A única porta para quem não tem conta: dado o token, devolve aquela jogada e
-- nada mais. Não há forma de listar jogadas nem de chegar a outro escalão.
-- Expirado, devolve só o aviso — sem os dados.
create or replace function jogada_publica(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  j plays%rowtype;
begin
  select * into j from plays
   where share_token = p_token and deleted_at is null;
  if not found then
    return jsonb_build_object('estado', 'NAO_EXISTE');
  end if;
  if j.share_expires_at is null or j.share_expires_at < now() then
    return jsonb_build_object('estado', 'EXPIRADO');
  end if;
  return jsonb_build_object(
    'estado', 'OK',
    'title', j.title,
    'category', j.category,
    'description', j.description,
    'data', j.data,
    'expires_at', j.share_expires_at
  );
end;
$$;
revoke all on function jogada_publica(uuid) from public;
grant execute on function jogada_publica(uuid) to anon, authenticated;

/* --------------------------------------------- marcas da sincronização */

-- As tabelas novas entram na pergunta leve: sem isto, um treino marcado noutro
-- telemóvel só chegava aqui quando outra tabela qualquer mudasse.
create or replace function sync_watermarks()
returns table(tabela text, marca timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select 'profiles'::text, max(updated_at) from profiles where id = auth.uid()
  union all select 'clubs', max(updated_at) from clubs
  union all select 'teams', max(updated_at) from teams
  union all select 'competitions', max(updated_at) from competitions
  union all select 'players', max(updated_at) from players
  union all select 'matches', max(updated_at) from matches
  union all select 'match_squad', max(updated_at) from match_squad
  union all select 'match_events', max(updated_at) from match_events
  union all select 'training_routines', max(updated_at) from training_routines
  union all select 'training_sessions', max(updated_at) from training_sessions
  union all select 'training_attendance', max(updated_at) from training_attendance
  union all select 'plays', max(updated_at) from plays;
$$;

revoke all on function sync_watermarks() from public;
grant execute on function sync_watermarks() to authenticated;
