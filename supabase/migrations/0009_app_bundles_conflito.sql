-- 0009_app_bundles_conflito.sql
--
-- Corrige o índice único da `app_bundles` para o `upsert` o conseguir usar.
--
-- ## O que estava mal
--
-- A migração 0008 criou isto:
--
--   create unique index app_bundles_versao_plataforma
--     on app_bundles (versao, coalesce(plataforma, 'todas'));
--
-- O `coalesce` estava lá por uma boa razão: em Postgres, dois nulos nunca são
-- iguais, por isso um índice único sobre `(versao, plataforma)` deixava passar
-- vinte linhas com a mesma versão e a plataforma a nulo — que é justamente o
-- caso normal, o pacote que serve as duas.
--
-- Só que um índice sobre uma **expressão** não serve para o que o script de
-- publicação precisa. O `upsert` do PostgREST traduz-se em
-- `on conflict (versao, plataforma)`, e o Postgres vai procurar um índice único
-- sobre exactamente essas duas colunas. Não encontra a expressão, e recusa:
--
--   there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- ## O que passa a estar
--
-- O Postgres 15 trouxe uma forma de dizer "aqui, os nulos contam como iguais".
-- É exactamente o que o `coalesce` estava a imitar à mão, e agora sobre as
-- colunas verdadeiras — que é o que o `on conflict` sabe encontrar.
--
-- Os projetos do Supabase são todos 15 ou mais recentes; em qualquer coisa mais
-- antiga esta migração não corre.
--
-- Correr no Supabase → SQL Editor.

drop index if exists app_bundles_versao_plataforma;

create unique index if not exists app_bundles_versao_plataforma
  on app_bundles (versao, plataforma) nulls not distinct;

comment on index app_bundles_versao_plataforma is
  'Uma linha por versão e plataforma. O `nulls not distinct` é o que faz o upsert do script de publicação funcionar para os pacotes que servem as duas plataformas.';
