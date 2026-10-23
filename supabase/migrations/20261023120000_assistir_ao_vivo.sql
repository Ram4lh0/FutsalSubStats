-- 20261023120000_assistir_ao_vivo.sql
--
-- "Assistir ao vivo" (add-on `ao-vivo`): um treinador regista o jogo e outro,
-- com acesso ao escalão, acompanha-o em direto no seu telemóvel.
--
-- Só acrescenta:
--
--   * `matches.live_enabled`: o interruptor "Assistir ao vivo" da preparação
--     do jogo. Desligado por omissão. Um jogo está ao vivo quando isto é
--     verdade e o `status` está entre o início e o fim (FINISHED já não é);
--     a app grava o `status` na linha do jogo enquanto ele decorre.
--   * `matches` e `match_events` na publicação `supabase_realtime`, para o
--     ecrã de acompanhamento receber as mudanças. A subscrição é filtrada pelo
--     jogo aberto e passa pela segurança por linha que já existe
--     (`matches_ler` e `match_events_ler`, ambas com `pode_ver_escalao`):
--     quem não pode ler o jogo não recebe nada. Nenhuma política muda aqui.
--   * O add-on `ao-vivo` nos cinco escalões do AMSAC, para o testar só lá.
--     Não entra em `addons_da_licenca_clube()`: os gatilhos da licença Clube
--     continuam a ligar só a `visao-geral-clube`.
--
-- Pode ser corrida mais do que uma vez.

alter table public.matches
  add column if not exists live_enabled boolean not null default false;

comment on column public.matches.live_enabled is
  'Assistir ao vivo (add-on ao-vivo): o jogo pode ser acompanhado em direto por quem tem acesso ao escalão.';

-- A lista "Jogos ao vivo" pergunta só pelos jogos com o interruptor ligado:
-- são poucos, e o índice parcial fica pequeno.
create index if not exists matches_ao_vivo
  on public.matches (team_id, status)
  where live_enabled;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_events'
  ) then
    alter publication supabase_realtime add table public.match_events;
  end if;
end $$;

-- O teste: só os escalões do AMSAC. Junta `ao-vivo` aos add-ons que já lá
-- estão, sem tirar nenhum nem mexer nos registos.
insert into public.team_stat_config (team_id, addons)
select t.id, array['ao-vivo']::text[]
  from public.teams t
 where t.club_id = '7c84153b-a105-49f1-8bf4-95a09d716ab2'
   and t.id in (
     '373ba731-b1ac-490f-947c-0f7c040561d1', -- Seniores
     'f6e5084c-0318-4e5c-8fbb-f55f73f3f69e', -- Sub-19
     'e1e0675d-2247-4847-b5fd-1b79f6ae5dd9', -- Juvenis
     '860859f4-d4ce-459d-9523-9154f9210575', -- Iniciados
     '265f6310-d5ad-4f35-a128-92bf930c8cd2'  -- Infantis
   )
on conflict (team_id) do update
   set addons = team_stat_config.addons || array['ao-vivo']::text[]
 where not ('ao-vivo' = any(team_stat_config.addons));
