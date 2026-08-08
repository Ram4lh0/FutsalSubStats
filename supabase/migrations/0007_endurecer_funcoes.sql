-- 0007_endurecer_funcoes.sql
--
-- Duas correções de segurança encontradas numa auditoria ao esquema.
--
-- 1. `handle_new_user` corre com `security definer` — os privilégios de quem a
--    criou, não de quem a dispara — mas sem `search_path` fixo. Uma função assim
--    resolve os nomes das tabelas pelo caminho de pesquisa de quem a chama, e
--    quem conseguir criar um objeto num esquema anterior no caminho passa a
--    decidir que tabela é escrita. É o aviso `function_search_path_mutable` do
--    verificador do próprio Supabase.
--
--    Aqui o risco prático é baixo — no Supabase um utilizador normal não cria
--    tabelas — mas uma função privilegiada com caminho aberto é dívida que não
--    vale a pena carregar.
--
-- 2. As funções de gatilho não precisam de privilégios especiais, mas ganham o
--    mesmo tratamento: caminho fixo, sem surpresas.
--
-- Correr no Supabase → SQL Editor.

create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

create or replace function enforce_squad_limit() returns trigger as $$
begin
  if (select count(*) from match_squad where match_id = new.match_id) > 14 then
    raise exception 'Máximo de 14 convocados por jogo';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

create or replace function match_inherits_club_timing() returns trigger as $$
begin
  -- O tipo de tempo vem do escalão, mas pode ser mudado jogo a jogo: um
  -- particular pode ser corrido mesmo num escalão que joga cronometrado.
  if new.timing is null then
    select t.timing into new.timing from teams t where t.id = new.team_id;
    new.timing := coalesce(new.timing, 'UNTIMED');
  end if;
  new.period_duration_ms := case when new.timing = 'TIMED' then 1200000 else 1800000 end;
  new.penalty_duration_ms := case when new.timing = 'TIMED' then 120000 else 180000 end;
  return new;
end;
$$ language plpgsql set search_path = public;

/* ------------------------------------------------- porta dos eventos */

-- A função que recebe os eventos é `security invoker`: corre com os direitos de
-- quem a chama, e portanto a segurança por linha aplica-se. Fica explícito quem
-- a pode chamar, para não depender do que estiver por omissão.
revoke all on function append_match_event(jsonb) from public, anon;
grant execute on function append_match_event(jsonb) to authenticated;
