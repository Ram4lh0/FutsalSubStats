-- 0011_licencas_e_acessos.sql
--
-- Um clube com vários treinadores, cada um a ver só os seus escalões.
--
-- Esta é a migração que substitui a frase em que toda a segurança assentava:
--
--   clubs.owner_id = auth.uid()          "é meu porque fui eu que criei"
--
-- por outra:
--
--   tenho acesso ao escalão a que isto pertence
--
-- Ver `LICENCAS.md` para o desenho e para o que está por construir.
--
-- ## A ideia em três linhas
--
-- Os dados pertencem ao **clube**, não a quem os escreveu. Um treinador
-- associado regista jogos num escalão que não é dele e, se sair no fim da época,
-- fica tudo. O acesso é dado escalão a escalão, com dois níveis: `ver` e
-- `editar`.
--
-- ## Porquê funções em vez de subconsultas nas políticas
--
-- As políticas precisam de consultar `club_members` e `team_access`, que também
-- têm segurança por linha. Uma política que lê uma tabela protegida dispara a
-- política dessa tabela, que lê outra, e há caminhos que dão recursão infinita —
-- em produção, com utilizadores lá dentro.
--
-- As funções são `security definer`: correm com os privilégios de quem as criou
-- e ignoram a segurança por linha lá dentro. O `auth.uid()` continua a devolver
-- quem está a chamar, que é o que interessa. Cada uma tem `search_path` fixo,
-- senão um esquema com o mesmo nome de tabela mudava o que elas leem.
--
-- Correr no Supabase → SQL Editor.

/* ------------------------------------------------------------ a licença */

-- `treinador` é o valor por omissão de propósito: uma conta **nova** é sempre a
-- mais restrita, e a licença de Clube é concedida à mão, depois de combinada. O
-- caminho seguro é o que não exige que ninguém se lembre de nada.
--
-- As contas que já existem hoje são outra história: somos nós e os testadores,
-- e nenhum deles combinou licença nenhuma. Ficam com `clube`, senão esta
-- migração prendia-os a um escalão sem aviso — e o primeiro sinal seria alguém
-- a não conseguir criar o segundo escalão que já tinha na cabeça.
--
-- A distinção "antes" e "depois" é a criação da coluna, e é por isso que o
-- preenchimento vive dentro do `if`: correr esta migração duas vezes não pode
-- promover a `clube` toda a gente que entretanto se inscreveu.
do $$
declare ja_existia boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'licenca'
  ) into ja_existia;

  if not ja_existia then
    alter table profiles add column licenca text not null default 'treinador';
    update profiles set licenca = 'clube';
    raise notice 'licenca: coluna criada, % contas existentes ficaram com `clube`.',
      (select count(*) from profiles);
  else
    raise notice 'licenca: a coluna já existia — nada foi alterado.';
  end if;
end $$;

do $$ begin
  alter table profiles add constraint profiles_licenca_valida
    check (licenca in ('treinador', 'clube'));
exception when duplicate_object then null;
end $$;

comment on column profiles.licenca is
  'treinador = um clube e um escalão. clube = vários escalões e acesso partilhado.';

/* -------------------------------------------------- quem pertence a quem */

-- A associação de um treinador a um clube. Criada por nós quando autorizamos o
-- email que o gerente do clube nos manda, e removível pelo gerente — é o que
-- lhe permite tirar acesso a alguém que saiu.
--
-- Estar associado **não dá acesso a nada**. Só torna a pessoa escolhível na
-- lista de cada escalão. É deliberado: entrar no clube e ver os dados são duas
-- decisões diferentes, e a segunda é do gerente.
create table if not exists club_members (
  club_id uuid not null references clubs (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (club_id, user_id)
);

create index if not exists club_members_user_idx on club_members (user_id);

comment on table club_members is
  'Treinadores associados a um clube. Não dá acesso a dados — só torna a pessoa escolhível em cada escalão.';

/* ------------------------------------------------------ acesso a escalões */

create table if not exists team_access (
  team_id uuid not null references teams (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  -- `ver` mostra tudo e não deixa mexer em nada. `editar` deixa registar jogos,
  -- mexer no plantel e corrigir o passado.
  nivel text not null default 'ver' check (nivel in ('ver', 'editar')),
  criado_em timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_access_user_idx on team_access (user_id);

comment on table team_access is
  'Que treinadores vêem ou editam cada escalão. Uma linha por pessoa e escalão.';

/* ---------------------------------------------------------- as perguntas */

create or replace function sou_dono_do_clube(cl uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clubs c where c.id = cl and c.owner_id = auth.uid());
$$;

create or replace function pode_ver_clube(cl uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clubs c where c.id = cl and c.owner_id = auth.uid())
      or exists (select 1 from club_members m where m.club_id = cl and m.user_id = auth.uid());
$$;

create or replace function pode_ver_escalao(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from teams te join clubs c on c.id = te.club_id
       where te.id = t and c.owner_id = auth.uid())
      or exists (
      select 1 from team_access a where a.team_id = t and a.user_id = auth.uid());
$$;

create or replace function pode_editar_escalao(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from teams te join clubs c on c.id = te.club_id
       where te.id = t and c.owner_id = auth.uid())
      or exists (
      select 1 from team_access a
       where a.team_id = t and a.user_id = auth.uid() and a.nivel = 'editar');
$$;

-- O escalão a que um jogo pertence. As três tabelas penduradas no jogo —
-- convocatória, eventos e períodos em campo — resolvem o acesso por aqui, em vez
-- de repetirem o mesmo `join` seis vezes cada uma.
create or replace function escalao_do_jogo(m uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from matches where id = m;
$$;

/* -------------------------------------------- um escalão, se for treinador */

-- A licença de Treinador dá direito a um escalão. Está dita em três sítios — o
-- botão, o `repository.js` e aqui — e só esta vale para todas as versões da app
-- ao mesmo tempo, incluindo as que já estão instaladas nos telemóveis.
--
-- Conta só os escalões **activos**: apagar um escalão na app é arquivá-lo, e sem
-- esta condição quem apagasse o seu para recomeçar ficava sem poder criar outro.
create or replace function limite_de_escaloes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_licenca text;
  v_activos int;
begin
  if new.archived_at is not null then
    return new;
  end if;

  select p.licenca into v_licenca
    from clubs c join profiles p on p.id = c.owner_id
   where c.id = new.club_id;

  if v_licenca is distinct from 'clube' then
    select count(*) into v_activos
      from teams t
     where t.club_id = new.club_id
       and t.archived_at is null
       and t.id <> new.id;

    if v_activos >= 1 then
      raise exception 'A licença de treinador permite um escalão.'
        using errcode = 'check_violation', hint = 'licenca_treinador_um_escalao';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists teams_limite_de_escaloes on teams;
create trigger teams_limite_de_escaloes
  before insert or update of club_id, archived_at on teams
  for each row execute function limite_de_escaloes();

/* ================================================== as políticas, de novo */

alter table club_members enable row level security;
alter table team_access  enable row level security;

/* ------------------------------------------------------------- perfis */

-- Além do próprio, o gerente vê os perfis de quem associou ao clube. Sem isto,
-- a lista de treinadores mostrava identificadores em vez de nomes.
drop policy if exists profiles_self on profiles;

create policy profiles_ler on profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from club_members m
       where m.user_id = profiles.id and sou_dono_do_clube(m.club_id))
  );

create policy profiles_escrever on profiles
  for insert with check (id = auth.uid());

create policy profiles_atualizar on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

/* -------------------------------------------------------------- clubes */

drop policy if exists clubs_owner on clubs;

create policy clubs_ler on clubs
  for select using (pode_ver_clube(id));

-- Criar, mudar e apagar o clube é só do dono. Um treinador associado nunca mexe
-- no clube em si, mesmo tendo `editar` em todos os escalões dele.
create policy clubs_criar on clubs
  for insert with check (owner_id = auth.uid());

create policy clubs_atualizar on clubs
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy clubs_apagar on clubs
  for delete using (owner_id = auth.uid());

/* ------------------------------------------------------------- membros */

create policy club_members_ler on club_members
  for select using (user_id = auth.uid() or sou_dono_do_clube(club_id));

create policy club_members_gerir on club_members
  for all using (sou_dono_do_clube(club_id)) with check (sou_dono_do_clube(club_id));

/* -------------------------------------------------------------- acessos */

create policy team_access_ler on team_access
  for select using (
    user_id = auth.uid()
    or exists (select 1 from teams t where t.id = team_access.team_id and sou_dono_do_clube(t.club_id))
  );

create policy team_access_gerir on team_access
  for all
  using (exists (select 1 from teams t where t.id = team_access.team_id and sou_dono_do_clube(t.club_id)))
  with check (exists (select 1 from teams t where t.id = team_access.team_id and sou_dono_do_clube(t.club_id)));

/* ------------------------------------------------------------ escalões */

drop policy if exists teams_owner on teams;

create policy teams_ler on teams
  for select using (pode_ver_escalao(id));

-- Criar e remover escalões é do gerente, como pediste. Um treinador com `editar`
-- trabalha **dentro** do escalão; não cria nem apaga escalões.
create policy teams_criar on teams
  for insert with check (sou_dono_do_clube(club_id));

create policy teams_atualizar on teams
  for update using (sou_dono_do_clube(club_id)) with check (sou_dono_do_clube(club_id));

create policy teams_apagar on teams
  for delete using (sou_dono_do_clube(club_id));

/* ---------------------------------------------------------- competições */

drop policy if exists competitions_owner on competitions;

create policy competitions_ler on competitions
  for select using (pode_ver_escalao(team_id));

create policy competitions_escrever on competitions
  for all using (pode_editar_escalao(team_id)) with check (pode_editar_escalao(team_id));

/* ------------------------------------------------------------ jogadores */

drop policy if exists players_owner on players;

create policy players_ler on players
  for select using (pode_ver_escalao(team_id));

create policy players_escrever on players
  for all using (pode_editar_escalao(team_id)) with check (pode_editar_escalao(team_id));

/* ---------------------------------------------------------------- jogos */

drop policy if exists matches_owner on matches;

create policy matches_ler on matches
  for select using (pode_ver_escalao(team_id));

create policy matches_escrever on matches
  for all using (pode_editar_escalao(team_id)) with check (pode_editar_escalao(team_id));

/* -------------------------------------- convocatória, eventos e minutos */

drop policy if exists match_squad_owner on match_squad;

create policy match_squad_ler on match_squad
  for select using (pode_ver_escalao(escalao_do_jogo(match_id)));

create policy match_squad_escrever on match_squad
  for all using (pode_editar_escalao(escalao_do_jogo(match_id)))
  with check (pode_editar_escalao(escalao_do_jogo(match_id)));

drop policy if exists match_events_owner on match_events;

create policy match_events_ler on match_events
  for select using (pode_ver_escalao(escalao_do_jogo(match_id)));

-- Os eventos entram pelo `append_match_event`, que é `security invoker` — ou
-- seja, obedece a esta política em vez de a contornar. Um treinador com `ver`
-- não consegue cronometrar um jogo, que é o que se quer.
create policy match_events_escrever on match_events
  for all using (pode_editar_escalao(escalao_do_jogo(match_id)))
  with check (pode_editar_escalao(escalao_do_jogo(match_id)));

drop policy if exists player_stints_owner on player_stints;

create policy player_stints_ler on player_stints
  for select using (pode_ver_escalao(escalao_do_jogo(match_id)));

create policy player_stints_escrever on player_stints
  for all using (pode_editar_escalao(escalao_do_jogo(match_id)))
  with check (pode_editar_escalao(escalao_do_jogo(match_id)));
