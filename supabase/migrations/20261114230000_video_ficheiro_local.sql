-- 20261114230000_video_ficheiro_local.sql
--
-- Análise de vídeo: vídeos do computador (1.41.1).
--
-- Uma análise passa a poder vir de um ficheiro que fica no aparelho do
-- treinador (`provider = 'local'`), além do YouTube. O vídeo NUNCA é enviado:
-- aqui guarda-se só o bastante para o reconhecer quando ele o voltar a
-- escolher — nome, tamanho, data de modificação, tipo e duração.
--
--   { "name": "jogo.mp4", "size": 5795000000, "type": "video/mp4",
--     "lastModified": 1794000000000, "durationMs": 5400000 }
--
-- Só se acrescenta: uma coluna nova, a nulo em todas as análises que já
-- existem (que continuam a ser do YouTube). Os clipes e as sessões não mudam,
-- porque só guardam tempos.

alter table video_analyses add column if not exists local_file jsonb;

-- Uma análise local tem de dizer que ficheiro é; e a coluna é pequena de
-- propósito, para ninguém a usar para guardar outra coisa (muito menos vídeo).
alter table video_analyses drop constraint if exists video_analyses_local_file_check;
alter table video_analyses add constraint video_analyses_local_file_check check (
  (provider <> 'local' or (local_file is not null and jsonb_typeof(local_file) = 'object'
                           and coalesce(local_file->>'name', '') <> ''))
  and (local_file is null or pg_column_size(local_file) <= 2048)
);

-- O link público não muda: continua a devolver `provider` e `youtube_id` de
-- cada clipe. Um clipe de um vídeo local vem com `provider = 'local'` e sem
-- `youtube_id`, e a página pública diz que esse vídeo só existe no aparelho
-- do treinador (a app não cria links para sessões com vídeos locais).
