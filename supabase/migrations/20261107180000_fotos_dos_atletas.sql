/* ------------------------------------------------------- fotos dos atletas */
-- Uma foto pequena por jogador (128 px, ~10 KB), guardada como `data:` URL.
--
-- Porquê uma tabela e não o Storage: a conta apaga-se por SQL
-- (`0006_apagar_conta_por_ordem.sql`), e o SQL não consegue apagar ficheiros do
-- Storage. Aqui a foto vai com o jogador: apagar o jogador, o escalão, o clube
-- ou a conta apaga a foto na mesma operação (on delete cascade).
--
-- Porquê à parte da tabela `players`: o plantel sincroniza muitas vezes, e
-- não deve arrastar as fotos de cada vez. Esta tabela só desce quando uma foto
-- muda (marca `updated_at`, como as outras).
--
-- Quem vê e quem escreve: as mesmas regras do plantel (pode_ver_escalao /
-- pode_editar_escalao). O `team_id` não vem do aparelho: é sempre o do jogador,
-- posto pelo gatilho, para ninguém conseguir pendurar uma foto num jogador de
-- outro escalão.

create table if not exists player_photos (
  player_id uuid primary key references players(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  data text not null check (data like 'data:image/%' and char_length(data) <= 40000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_photos_team on player_photos(team_id);

create or replace function player_photos_escalao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Corre com as permissões de quem pede: um jogador que esta conta não vê dá
  -- team_id nulo e o insert é recusado.
  select p.team_id into new.team_id from players p where p.id = new.player_id;
  return new;
end;
$$;

drop trigger if exists player_photos_escalao on player_photos;
create trigger player_photos_escalao
  before insert or update on player_photos
  for each row execute function player_photos_escalao();

drop trigger if exists player_photos_touch on player_photos;
create trigger player_photos_touch
  before update on player_photos
  for each row execute function touch_updated_at();

alter table player_photos enable row level security;

drop policy if exists player_photos_ler on player_photos;
create policy player_photos_ler on player_photos
  for select to authenticated
  using (pode_ver_escalao(team_id));

drop policy if exists player_photos_escrever on player_photos;
create policy player_photos_escrever on player_photos
  for all to authenticated
  using (pode_editar_escalao(team_id))
  with check (pode_editar_escalao(team_id));

revoke all on player_photos from anon;
grant select, insert, update, delete on player_photos to authenticated;
