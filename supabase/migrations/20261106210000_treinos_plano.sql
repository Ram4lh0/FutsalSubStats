-- A unidade de treino (UT) de cada treino passa a viver no servidor, para
-- sincronizar entre os telemóveis do clube. Até aqui ficava só no aparelho
-- onde foi escrita (localStorage).
--
-- Formato: { tema, objetivos, material, exercicios: [{ id, parte, nome,
-- duracao, descricao, jogadas: [uuid] }] }. As regras de acesso são as da
-- linha do treino (RLS de training_sessions), não há nada a acrescentar.

alter table training_sessions add column if not exists plan jsonb;
