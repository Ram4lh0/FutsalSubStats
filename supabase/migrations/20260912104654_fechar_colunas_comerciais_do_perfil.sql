-- 20260912104654_fechar_colunas_comerciais_do_perfil.sql
--
-- C1 da auditoria de 12/09/2026: `profiles_atualizar` e `profiles_escrever`
-- restringem a LINHA (`id = auth.uid()`), mas o Postgres concede privilégios
-- por TABELA, não por linha. `authenticated` tinha `UPDATE`/`INSERT` sobre
-- TODAS as colunas de `profiles` (o grant automático do Supabase em cada
-- tabela nova), e a RLS nunca olha para colunas — só para linhas. Resultado:
-- um utilizador autenticado conseguia fazer PATCH a `licenca`,
-- `license_status`, `license_source`, `license_expires_at` e aos campos
-- `stripe_*` na sua própria linha. Confirmado a sério num perfil sintético:
-- depois da alteração, `my_entitlement()` passou a devolver uma licença de
-- clube activa, sem pagar nada.
--
-- ATENÇÃO a quem for mexer aqui outra vez: um `revoke ... (coluna) on tabela`
-- só remove um grant que tenha sido dado *por coluna*. Se continuar a existir
-- o grant de tabela inteira (o que havia até agora), esse revoke não faz
-- nada — a tabela inteira continua aberta. Por isso este ficheiro revoga o
-- `INSERT`/`UPDATE` da tabela toda e volta a conceder só nas colunas que o
-- cliente realmente usa.
--
-- O que o cliente realmente precisa (confirmado em src/lib/data/sync.js):
-- `sb.from('profiles').upsert({ id, email })`, para garantir que o perfil
-- existe. Mais nada. A leitura da licença é sempre um select. Quem escreve os
-- campos comerciais a sério são rotinas de servidor — o painel
-- (tools/painel), o Worker do Stripe (website/worker/billing.ts) e as Edge
-- Functions de compras — todas com a chave de serviço, que ignora RLS e
-- grants por completo. `anon` nunca devia lá chegar: a política exige
-- `auth.uid() = id`, e `auth.uid()` é sempre nulo sem sessão.

revoke insert, update on public.profiles from authenticated, anon;

grant insert (id, email) on public.profiles to authenticated;
grant update (name, email) on public.profiles to authenticated;

-- Mesma falha, mesma forma: o dono do clube podia escrever
-- `apagar_conta_ao_remover` e `criado_por_convite` em `club_members` — os
-- campos que o Worker (website/worker/club-staff.ts) usa para decidir se
-- apaga a conta da app inteira ao remover alguém da equipa técnica. A app em
-- si nunca escreve nesta tabela (só faz select — ver src/lib/data/acessos.js);
-- toda a escrita real passa pelo Worker, com chave de serviço. Ver C2 na
-- mesma auditoria.

revoke insert, update on public.club_members from authenticated, anon;
grant insert (club_id, user_id, criado_por) on public.club_members to authenticated;
grant update (club_id, user_id, criado_por) on public.club_members to authenticated;
