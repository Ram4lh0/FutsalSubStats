-- 0008_pacotes_de_atualizacao.sql
--
-- A tabela que decide qual é a versão web mais recente de cada plataforma.
--
-- Publicar uma atualização passa a ser inserir uma linha aqui. A função
-- `atualizacao` lê-a, compara com a versão que o telemóvel diz ter, e responde.
--
-- Três colunas merecem explicação, porque são as que impedem estragos:
--
--   `minima_nativa`  — um pacote web pode precisar de uma casca nativa recente
--                      (um plugin novo, uma permissão). Sem esta coluna, um
--                      telemóvel com a versão antiga da loja recebia código que
--                      chama coisas que ele não tem, e rebentava ao abrir.
--
--   `percentagem`    — lançamento faseado. Sem revisão da loja pelo meio, um
--                      erro chega a toda a gente ao mesmo tempo; com 10% aqui,
--                      chega a um em cada dez e há tempo de o travar.
--
--   `ativo`          — o interruptor. Desligar uma linha faz os telemóveis
--                      voltarem à melhor versão anterior na verificação
--                      seguinte. É o botão de emergência.
--
-- Correr no Supabase → SQL Editor.

-- sem-politica: esta tabela não é para o cliente. É lida pela função
-- `atualizacao`, que corre no servidor com a chave de serviço. Uma política que
-- deixasse `anon` ler daria a qualquer pessoa a lista de todos os pacotes e os
-- seus endereços — incluindo os que estão desligados por terem defeitos.
create table if not exists app_bundles (
  id uuid primary key default gen_random_uuid(),

  -- Semver. É o que o plugin compara com o que tem instalado.
  versao text not null,

  -- 'ios', 'android', ou nulo para as duas.
  plataforma text check (plataforma in ('ios', 'android')),

  url text not null,
  checksum text not null,           -- sha256 do zip, em hexadecimal

  minima_nativa text,               -- versão nativa mínima (versionName)
  percentagem int not null default 100 check (percentagem between 0 and 100),
  ativo boolean not null default false,

  notas text,
  criado_em timestamptz not null default now()
);

create unique index if not exists app_bundles_versao_plataforma
  on app_bundles (versao, coalesce(plataforma, 'todas'));

create index if not exists app_bundles_ativos
  on app_bundles (ativo, plataforma, criado_em desc);

-- Ninguém lê isto pela app.
--
-- A tabela é consultada pela função `atualizacao`, que corre no servidor com a
-- chave de serviço. Deixá-la aberta ao cliente anónimo daria a qualquer pessoa
-- a lista de todos os pacotes e os seus endereços — incluindo os que estão
-- desligados por terem defeitos.
alter table app_bundles enable row level security;

-- Sem políticas: nem `anon` nem `authenticated` lêem ou escrevem. Só a chave de
-- serviço, que ignora o RLS por desenho, e que nunca sai do servidor.

comment on table app_bundles is
  'Pacotes web para atualizações ao vivo. Escrito pelo script de publicação, lido pela função atualizacao.';
