-- apagar_capturas.sql — deitar fora a época inventada das capturas.
--
-- Apaga o CD Ribeira Alta e tudo o que veio com ele. Mais nada: cada passo é
-- limitado aos identificadores deste clube, por isso os dados reais da conta
-- ficam onde estão.
--
-- Porque não é uma linha só: `delete from clubs` sozinho rebenta com
--
--   23503: update or delete on table "players" violates foreign key constraint
--          "match_squad_player_id_fkey"
--
-- A cascata leva os clubes → escalões → jogadores à frente, mas `match_squad`
-- aponta para `players` com ON DELETE RESTRICT, e essa restrição existe de
-- propósito: um jogador que já foi convocado não se apaga, senão a ficha de um
-- jogo passado deixava de fazer sentido. Enfraquecê-la para poder limpar uma
-- época de mentira seria estragar a proteção que interessa.
--
-- A saída é a mesma da migração 0006: apagar por ordem, dos filhos para os
-- pais, e deixar as chaves em paz.
--
-- Correr no Supabase → SQL Editor.

do $$
declare
  clubes uuid[];
  jogos uuid[];
begin
  select coalesce(array_agg(id), '{}') into clubes
    from clubs where name = 'CD Ribeira Alta';

  if cardinality(clubes) = 0 then
    raise notice 'Não há nada a apagar — o clube das capturas já não existe.';
    return;
  end if;

  select coalesce(array_agg(id), '{}') into jogos
    from matches where club_id = any(clubes);

  -- Dos filhos para os pais. Cada passo deixa o seguinte sem nada a apontar-lhe.
  delete from player_stints where match_id = any(jogos);
  delete from match_events  where match_id = any(jogos);
  delete from match_squad   where match_id = any(jogos);
  delete from matches       where id       = any(jogos);
  delete from competitions  where team_id in (select id from teams where club_id = any(clubes));
  delete from players       where club_id  = any(clubes);
  delete from teams         where club_id  = any(clubes);
  delete from clubs         where id       = any(clubes);

  raise notice 'CD Ribeira Alta apagado: % jogo(s) e tudo o que tinham dentro.',
    cardinality(jogos);
end $$;

-- Confirmação: tem de devolver zero.
select count(*) as sobra from clubs where name = 'CD Ribeira Alta';
