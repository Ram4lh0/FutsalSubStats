-- limpar_dados.sql — recomeçar do zero.
--
-- APAGA TUDO: clubes, escalões, competições, planteis, jogos e todos os eventos,
-- de TODAS as contas. Não há como desfazer.
--
-- O que NÃO é apagado: as contas de utilizador e os perfis. Quem já tinha login
-- continua a entrar; entra é numa app vazia.
--
-- Funciona antes ou depois da migração 0003: as tabelas que ainda não existirem
-- são simplesmente ignoradas.
--
-- Correr no Supabase → SQL Editor.

do $$
declare
  t text;
begin
  -- Pela ordem das dependências: filhos primeiro, pais no fim.
  foreach t in array array[
    'match_events',
    'player_stints',
    'match_squad',
    'matches',
    'competitions',
    'players',
    'teams',
    'clubs'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from %I', t);
      raise notice 'Limpo: %', t;
    else
      raise notice 'Ignorado (ainda não existe): %', t;
    end if;
  end loop;
end $$;

-- Confirmação: deve devolver zeros em toda a linha.
select
  (select count(*) from clubs) as clubes,
  (select count(*) from players) as jogadores,
  (select count(*) from matches) as jogos,
  (select count(*) from match_events) as eventos;
