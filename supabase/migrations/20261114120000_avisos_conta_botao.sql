/* -------------------------------------------------- botão nos avisos */
-- Um aviso pode ter um botão que abre uma ligação (ex.: a conversa de WhatsApp).
--   insert into avisos_conta (user_id, titulo, mensagem, botao_texto, botao_link)
--   select id, '...', '...', 'Abrir WhatsApp', 'https://wa.me/351911034493'
--   from auth.users where email = '...';
alter table avisos_conta
  add column if not exists botao_texto text check (char_length(botao_texto) between 1 and 60),
  add column if not exists botao_link text check (char_length(botao_link) <= 500 and botao_link ~ '^https://');
