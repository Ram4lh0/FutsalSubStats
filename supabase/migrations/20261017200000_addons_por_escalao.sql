-- 20261017200000_addons_por_escalao.sql
--
-- Add-ons por escalão: qualquer feature nova (uma vista no painel da época,
-- um passo extra no registo do jogo, …) nasce desligada e liga-se escalão a
-- escalão no painel de administração. O catálogo vive no código
-- (`src/domain/addons.js`); aqui só se guarda o que está ligado.
--
-- Os registos extra (remates, recuperações, …) continuam na coluna
-- `registos`: já há eventos e configs com eles, e não mudam de sítio.
--
-- Só se acrescenta uma coluna com valor por omissão. As versões da app que já
-- estão nos telemóveis pedem `select *` e ignoram o campo novo.
--
-- Pode ser corrida mais do que uma vez.

alter table team_stat_config
  add column if not exists addons text[] not null default '{}';

comment on column team_stat_config.addons is
  'Add-ons ligados neste escalão (ids de src/domain/addons.js). Só o painel escreve.';
