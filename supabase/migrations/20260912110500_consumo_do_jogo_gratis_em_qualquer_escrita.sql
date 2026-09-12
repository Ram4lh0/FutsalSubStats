-- 20260912110500_consumo_do_jogo_gratis_em_qualquer_escrita.sql
--
-- A3 + A4 da auditoria de 12/09/2026, na mesma função porque são a mesma
-- causa vista de dois lados.
--
-- A3 — o limite de 4 jogos grátis pode ser contornado: o gatilho
-- `enforce_match_creation_entitlement()` só CONFERIA a contagem em
-- `free_game_starts` (`>= 4` bloqueia); nunca a INCREMENTAVA. Quem regista o
-- consumo é só o RPC `claim_match_start`. Uma conta sem licença que crie
-- jogos por um INSERT direto a `matches` (sem passar pelo RPC) nunca fica
-- com nada em `free_game_starts` — a contagem fica sempre em zero, e o
-- gatilho deixa passar para sempre. Confirmado a sério: 5 jogos criados
-- assim, contador em 0.
--
-- A4 — o quarto jogo pode deixar de sincronizar depois de consumido: o
-- gatilho é `before insert`, e o Postgres corre gatilhos BEFORE INSERT de um
-- `insert ... on conflict do update` ANTES de saber se vai haver conflito.
-- Sincronizar (upsert) um jogo já existente e já legitimamente contado
-- disparava o mesmo gatilho outra vez, via o ramo de insert, e podia
-- rebentar com "limite atingido" mesmo sem estar a criar jogo nenhum novo.
--
-- A correção junta as duas coisas na mesma transação, no próprio gatilho:
--
--   1. Se `new.id` já existe em `matches`, isto não é uma criação — é um
--      upsert de sincronização a resolver-se como update. Não se mexe em
--      nada. (Resolve A4.)
--   2. Caso contrário, é mesmo uma criação nova. Se a conta tem licença
--      activa, passa sem mais. Senão, autoriza e REGISTA o consumo na mesma
--      transação — a mesma linha que o `claim_match_start` teria registado,
--      com `on conflict do nothing` para não rebentar se o RPC já a tiver
--      registado primeiro. (Resolve A3: agora não há forma de criar um jogo
--      sem que o consumo fique gravado, seja qual for o caminho.)
--
-- `claim_match_start` continua a existir tal e qual — serve para a app saber
-- de antemão, com uma resposta amigável, se ainda há jogos grátis, sem
-- esperar por um erro do Postgres. Chamá-lo antes de criar o jogo continua a
-- funcionar: o `on conflict do nothing` do passo 2 vê a linha que ele já
-- registou e não conta a dobrar.

create or replace function public.enforce_match_creation_entitlement()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_used integer;
begin
  -- Passo 1 (A4): já existe? Isto não é uma criação, é a metade "insert" de
  -- um upsert que vai resolver-se como update. Não é um jogo novo a começar.
  if exists (select 1 from matches where id = new.id) then
    return new;
  end if;

  if auth.uid() is null or license_is_active(auth.uid()) then
    return new;
  end if;

  -- Mesmo bloqueio por conta que o claim_match_start usa: duas escritas
  -- concorrentes da mesma conta não podem ambas ler "ainda há 1" e passar.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  -- Já registado (o claim_match_start correu primeiro para este jogo)? Não
  -- conta a dobrar — só confirma que pode passar.
  if exists (select 1 from free_game_starts where user_id = auth.uid() and match_id = new.id) then
    return new;
  end if;

  select count(*) into v_used from free_game_starts where user_id = auth.uid();
  if v_used >= 4 then
    raise exception 'Four free games have already been used.'
      using errcode = 'check_violation', hint = 'free_game_limit_reached';
  end if;

  -- Passo 2 (A3): autorizar e registar o consumo na mesma transação que cria
  -- o jogo, sem depender de o cliente ter chamado o RPC primeiro.
  insert into free_game_starts (user_id, match_id)
    values (auth.uid(), new.id)
    on conflict (user_id, match_id) do nothing;

  return new;
end;
$$;

comment on function public.enforce_match_creation_entitlement is
  'Bloqueia E regista o consumo do jogo grátis no mesmo INSERT em matches — cobre tanto quem passa pelo RPC claim_match_start como um INSERT direto. Deixa passar sem tocar em nada quando new.id já existe (upsert de sincronização, não uma criação nova).';
