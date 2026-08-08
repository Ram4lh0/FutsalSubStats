-- 0006_apagar_conta_por_ordem.sql
--
-- A `delete_my_account` da migração 0005 não funcionava, e a razão vale a pena
-- ficar escrita.
--
-- Contava com a corrente de `on delete cascade` para levar tudo à frente. Só que
-- há sete chaves estrangeiras que apontam para dentro dessa corrente **sem**
-- cascata, e algumas de propósito:
--
--   match_squad.player_id      → players   ON DELETE RESTRICT
--   match_events.player_id     → players   (sem ação)
--   match_events.player_in_id  → players   (sem ação)
--   match_events.player_out_id → players   (sem ação)
--   match_events.created_by    → profiles  (sem ação)
--   match_events.undone_by     → profiles  (sem ação)
--   player_stints.player_id    → players   (sem ação)
--
-- A do `match_squad` existe para impedir que se apague um jogador que já foi
-- convocado — apagá-lo reescreveria a ficha de um jogo passado. É uma proteção
-- que se quer manter no dia a dia.
--
-- Enfraquecer as sete para o caso raro de alguém apagar a conta seria pagar
-- caro por pouco. O que se faz aqui é o contrário: apagar por ordem, dos filhos
-- para os pais, e deixar as proteções em paz.
--
-- Correr no Supabase → SQL Editor. Substitui a versão anterior da função.

create or replace function delete_my_account() returns void as $$
declare
  quem uuid := auth.uid();
  meus_clubes uuid[];
  meus_jogos uuid[];
begin
  if quem is null then
    raise exception 'Não há sessão iniciada.';
  end if;

  select coalesce(array_agg(id), '{}') into meus_clubes
    from clubs where owner_id = quem;

  select coalesce(array_agg(id), '{}') into meus_jogos
    from matches where club_id = any(meus_clubes);

  -- Dos filhos para os pais. Cada passo deixa o seguinte sem nada a apontar-lhe.
  delete from player_stints where match_id  = any(meus_jogos);
  delete from match_events  where match_id  = any(meus_jogos);
  delete from match_squad   where match_id  = any(meus_jogos);
  delete from matches       where id        = any(meus_jogos);
  delete from competitions  where team_id in (select id from teams where club_id = any(meus_clubes));
  delete from players       where club_id   = any(meus_clubes);
  delete from teams         where club_id   = any(meus_clubes);
  delete from clubs         where id        = any(meus_clubes);

  -- E só no fim a conta. O perfil desaparece com ela, por cascata.
  delete from auth.users where id = quem;
end;
$$ language plpgsql security definer set search_path = public, auth;

comment on function delete_my_account() is
  'Apaga a conta de quem chama e tudo o que lhe pertence, pela ordem das dependências. Sem volta a dar.';

revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
