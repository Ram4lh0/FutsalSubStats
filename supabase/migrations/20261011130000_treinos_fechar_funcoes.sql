-- 20261011130000_treinos_fechar_funcoes.sql
--
-- Fechar as funções novas do treino. O Supabase dá EXECUTE ao anon e ao
-- authenticated por omissão em cada função nova; o `revoke ... from public`
-- da migração anterior não chega. Só o `jogada_publica` (o link do WhatsApp)
-- é para quem não tem conta. As de gatilho e a da licença não são para chamar
-- de fora: correm dentro de outras funções `security definer`.
revoke execute on function public.clube_tem_licenca_clube(uuid) from anon, authenticated;
revoke execute on function public.plays_limite_gratis() from anon, authenticated;
revoke execute on function public.plays_preencher_clube() from anon, authenticated;
revoke execute on function public.pode_ver_biblioteca(uuid) from anon;
revoke execute on function public.escalao_do_treino(uuid) from anon;
revoke execute on function public.my_free_plays_used() from anon;
