-- 20261113120000_analise_de_video.sql
--
-- Análise de vídeo (add-on 'analise-video', subaba da aba Treino).
--
-- O vídeo nunca é nosso: guarda-se só o link do YouTube (não listado) e os
-- tempos dos clipes. Quatro tabelas:
--
--   * video_analyses    um vídeo (um jogo ou um treino), com título e data;
--   * video_clips       os momentos marcados: início e fim em milissegundos,
--                       categoria, subtipo, valência, jogadores e nota;
--   * video_sessions    listas ordenadas de clipes (podem juntar clipes de
--                       várias análises). Com `share_token`, é também o link
--                       público que se manda a um jogador;
--   * video_clip_talks  "já falámos": uma linha por clipe e jogador.
--
-- Só se acrescenta. Nenhuma tabela nem coluna antiga muda de significado.
--
-- Acesso: o mesmo dos treinos. Ver o escalão dá para ver; editar o escalão dá
-- para mexer (`pode_ver_escalao` / `pode_editar_escalao`, de 0011).

/* ------------------------------------------------------------ análises */

-- `provider` diz de onde vem o vídeo. Hoje só 'youtube' (e o id vai em
-- `youtube_id`); outra fonte no futuro é um valor novo e uma coluna nova, sem
-- tocar nos clipes nem nas sessões.
create table if not exists video_analyses (
  id uuid primary key,
  team_id uuid not null references teams(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  provider text not null default 'youtube',
  youtube_id text,
  match_id uuid references matches(id) on delete set null,
  recorded_on date,
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider <> 'youtube' or youtube_id ~ '^[A-Za-z0-9_-]{11}$')
);
create index if not exists video_analyses_team_idx on video_analyses (team_id);

/* -------------------------------------------------------------- clipes */

-- `category` e `subtype` são os ids do catálogo da app (src/domain/
-- analiseVideo.js). Sem `check`: o catálogo cresce na app, e uma versão antiga
-- no telemóvel de alguém não pode ver os seus clipes recusados por isso.
-- `player_ids` são jogadores do plantel; um jogador apagado fica como id
-- solto, que a app ignora.
create table if not exists video_clips (
  id uuid primary key,
  analysis_id uuid not null references video_analyses(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null,
  category text,
  subtype text,
  valence text check (valence in ('bom', 'corrigir', 'neutro')),
  player_ids uuid[] not null default '{}',
  note text check (char_length(note) <= 2000),
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_ms > start_ms),
  check (cardinality(player_ids) <= 40)
);
create index if not exists video_clips_analysis_idx on video_clips (analysis_id);
create index if not exists video_clips_team_idx on video_clips (team_id);

/* ------------------------------------------------------------- sessões */

-- `clip_ids` é a ordem da sessão. `player_id` preenche-se quando a sessão é o
-- que se partilhou com um jogador. `share_token` é o link público: aleatório,
-- válido até `share_expires_at` (30 dias). Um token novo mata o anterior.
create table if not exists video_sessions (
  id uuid primary key,
  team_id uuid not null references teams(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  clip_ids uuid[] not null default '{}',
  player_id uuid references players(id) on delete set null,
  share_token uuid unique,
  share_expires_at timestamptz,
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(clip_ids) <= 500)
);
create index if not exists video_sessions_team_idx on video_sessions (team_id);

/* ----------------------------------------------------------- conversas */

-- Uma linha por clipe e jogador. O id é derivado no aparelho a partir do par,
-- para dois telemóveis marcarem "já falámos" sem criarem duas linhas.
-- `talked_at` a nulo é "ainda não falámos" (desmarcar não apaga a linha).
create table if not exists video_clip_talks (
  id uuid primary key,
  clip_id uuid not null references video_clips(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  talked_at timestamptz,
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clip_id, player_id)
);
create index if not exists video_clip_talks_team_idx on video_clip_talks (team_id);

/* ------------------------------------------- o escalão vem sempre do pai */

-- O escalão de um clipe é o da sua análise, e o de uma conversa é o do seu
-- clipe — nunca o que o aparelho mandar. Sem isto, quem edita o escalão A
-- podia pendurar clipes numa análise do escalão B. Corre antes da segurança
-- por linha, que avalia a linha já corrigida. Quem criou também não muda.
create or replace function video_clips_preencher()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.team_id := coalesce(
    (select team_id from video_analyses where id = new.analysis_id), new.team_id);
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
drop trigger if exists video_clips_preencher on video_clips;
create trigger video_clips_preencher before insert or update on video_clips
  for each row execute function video_clips_preencher();

create or replace function video_clip_talks_preencher()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.team_id := coalesce(
    (select team_id from video_clips where id = new.clip_id), new.team_id);
  return new;
end;
$$;
drop trigger if exists video_clip_talks_preencher on video_clip_talks;
create trigger video_clip_talks_preencher before insert or update on video_clip_talks
  for each row execute function video_clip_talks_preencher();

create or replace function video_manter_autor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;
drop trigger if exists video_analyses_autor on video_analyses;
create trigger video_analyses_autor before update on video_analyses
  for each row execute function video_manter_autor();
drop trigger if exists video_sessions_autor on video_sessions;
create trigger video_sessions_autor before update on video_sessions
  for each row execute function video_manter_autor();

-- Funções de gatilho: não são para chamar de fora.
revoke all on function video_clips_preencher() from public, anon, authenticated;
revoke all on function video_clip_talks_preencher() from public, anon, authenticated;
revoke all on function video_manter_autor() from public, anon, authenticated;

/* -------------------------------------------------------- updated_at */

do $$
declare t text;
begin
  foreach t in array array['video_analyses','video_clips','video_sessions','video_clip_talks'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format(
      'create trigger %I_touch before update on %I for each row execute function touch_updated_at()',
      t, t
    );
  end loop;
end $$;

/* --------------------------------------------------------------- RLS */

alter table video_analyses   enable row level security;
alter table video_clips      enable row level security;
alter table video_sessions   enable row level security;
alter table video_clip_talks enable row level security;

drop policy if exists video_analyses_ler on video_analyses;
drop policy if exists video_analyses_escrever on video_analyses;
create policy video_analyses_ler on video_analyses
  for select using (pode_ver_escalao(team_id));
create policy video_analyses_escrever on video_analyses
  for all using (pode_editar_escalao(team_id)) with check (pode_editar_escalao(team_id));

drop policy if exists video_clips_ler on video_clips;
drop policy if exists video_clips_escrever on video_clips;
create policy video_clips_ler on video_clips
  for select using (pode_ver_escalao(team_id));
create policy video_clips_escrever on video_clips
  for all using (pode_editar_escalao(team_id)) with check (pode_editar_escalao(team_id));

drop policy if exists video_sessions_ler on video_sessions;
drop policy if exists video_sessions_escrever on video_sessions;
create policy video_sessions_ler on video_sessions
  for select using (pode_ver_escalao(team_id));
create policy video_sessions_escrever on video_sessions
  for all using (pode_editar_escalao(team_id)) with check (pode_editar_escalao(team_id));

drop policy if exists video_clip_talks_ler on video_clip_talks;
drop policy if exists video_clip_talks_escrever on video_clip_talks;
create policy video_clip_talks_ler on video_clip_talks
  for select using (pode_ver_escalao(team_id));
create policy video_clip_talks_escrever on video_clip_talks
  for all using (pode_editar_escalao(team_id)) with check (pode_editar_escalao(team_id));

/* ------------------------------------------------- link público */

-- A única porta para quem não tem conta: dado o token, devolve o título da
-- sessão e os clipes dela (pela ordem da sessão), e nada mais — sem nomes de
-- jogadores, sem o resto da análise, sem forma de listar outras sessões.
-- Só entram clipes do mesmo escalão da sessão. Expirado, devolve só o aviso.
create or replace function sessao_video_publica(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s video_sessions%rowtype;
  v_clipes jsonb;
begin
  select * into s from video_sessions
   where share_token = p_token and deleted_at is null;
  if not found then
    return jsonb_build_object('estado', 'NAO_EXISTE');
  end if;
  if s.share_expires_at is null or s.share_expires_at < now() then
    return jsonb_build_object('estado', 'EXPIRADO');
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', c.id,
             'start_ms', c.start_ms,
             'end_ms', c.end_ms,
             'category', c.category,
             'subtype', c.subtype,
             'valence', c.valence,
             'note', c.note,
             'provider', a.provider,
             'youtube_id', a.youtube_id,
             'analysis_title', a.title
           ) order by o.ord), '[]'::jsonb)
    into v_clipes
    from unnest(s.clip_ids) with ordinality as o(clip_id, ord)
    join video_clips c on c.id = o.clip_id
    join video_analyses a on a.id = c.analysis_id
   where c.deleted_at is null
     and a.deleted_at is null
     and c.team_id = s.team_id;

  return jsonb_build_object(
    'estado', 'OK',
    'title', s.title,
    'clips', v_clipes,
    'expires_at', s.share_expires_at
  );
end;
$$;
revoke all on function sessao_video_publica(uuid) from public;
grant execute on function sessao_video_publica(uuid) to anon, authenticated;

/* ------------------------------------------------------------ Realtime */

-- Dois treinadores com a mesma análise aberta: o clipe que um marca aparece
-- no outro. A app subscreve as linhas do escalão aberto (`team_id=eq.<id>`);
-- o que cada um recebe passa pela segurança por linha de cima.
do $$
declare t text;
begin
  foreach t in array array['video_analyses','video_clips','video_sessions','video_clip_talks'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

/* --------------------------------------------- marcas da sincronização */

-- As tabelas novas entram na pergunta leve: sem isto, um clipe marcado noutro
-- aparelho só chegava aqui quando outra tabela qualquer mudasse.
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
  union all select 'plays', max(updated_at) from plays
  union all select 'team_stat_config', max(updated_at) from team_stat_config
  union all select 'video_analyses', max(updated_at) from video_analyses
  union all select 'video_clips', max(updated_at) from video_clips
  union all select 'video_sessions', max(updated_at) from video_sessions
  union all select 'video_clip_talks', max(updated_at) from video_clip_talks;
$$;

revoke all on function sync_watermarks() from public;
grant execute on function sync_watermarks() to authenticated;
