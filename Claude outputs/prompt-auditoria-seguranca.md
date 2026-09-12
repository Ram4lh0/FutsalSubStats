# Prompt para nova conversa — auditoria geral e de segurança da Futsal SubStats

Cola isto tal e qual numa conversa nova (idealmente com acesso ao repositório e ao MCP do Supabase, como esta teve).

---

## Contexto

Repositório: `Ram4lh0/FutsalSubStats` no GitHub, branch `main`.
Projeto Supabase: "Futsal Subs & Stats", ref `bkfkpfhcysuyiotwkaty`.

Stack: Next.js 16 com export estático (`output: 'export'`), empacotado num invólucro nativo com Capacitor 8 (iOS/Android). Backend é só Supabase (Postgres + Auth + RLS + Edge Functions). Há compras dentro da app (licenças "treinador" e "clube") via StoreKit2 (iOS) e Google Play Billing (Android), com validação e reconciliação feitas por Edge Functions.

Arquitetura de dados: offline-first. O IndexedDB no aparelho (`src/lib/data/local.js`) é a fonte de verdade local; `src/lib/data/repository.js` é a única camada que a interface usa para ler/escrever dados; `src/lib/data/sync.js` trata da sincronização (`push()` envia linhas `dirty` para o Supabase, `pull()` descarrega e junta o que veio do servidor, nunca sobrescrevendo uma linha local ainda não sincronizada). Há também um mecanismo de atualização ao vivo do código web (sem passar pela loja), descrito em `ATUALIZACOES.md`, usando `@capgo/capacitor-updater` e uma tabela `app_bundles`.

A segurança real vive nas políticas de RLS do Postgres e nas Edge Functions — tudo o que existe do lado do cliente (React) para esconder botões ou ecrãs é apenas conforto de interface, nunca a fronteira de segurança real. Isto é um princípio que o projeto tenta seguir sempre, e é o que esta auditoria deve confirmar linha a linha, não presumir.

Há também uma ferramenta de administração local (`tools/painel/`, correndo com `npm run painel`) que usa a chave de serviço do Supabase para conceder licenças manualmente, criar contas, associar clubes, etc. Corre só em `localhost`, nunca é exposta à app nem à internet.

## Objetivo desta auditoria

Quero um "check geral" honesto ao estado atual do projeto, com três focos, por ordem de importância:

1. **Segurança, sobretudo à volta de compras/licenças.** A pergunta central: existe alguma forma de um utilizador (ou de alguém a fazer pedidos HTTP diretos, sem usar a app) obter uma licença, estender uma licença, ou fazer parecer que pagou, sem ter passado por uma compra verdadeira e validada pelo servidor da Apple/Google? E, de forma mais ampla: há alguma ação na app — apagar, editar, ver dados de outro clube, etc. — que devia estar bloqueada e não está, ou que só está bloqueada no React e não no Postgres?
2. **Se a lógica de uso offline faz sentido.** Um treinador sem rede num pavilhão tem de continuar a conseguir trabalhar, e os dados têm de chegar ao servidor depois, sem se perderem, duplicarem, nem ficarem trocados entre clubes/escalões.
3. **Se os consumos da base de dados estão razoáveis** — queries caras, coisas a serem lidas mais vezes do que precisavam, uso de armazenamento/bandwidth que possa estar a crescer sem necessidade.

Quero factos verificados no código e na base de dados reais, não hipóteses. Sempre que apontares um problema, mostra o ficheiro/linha ou a política/função exata, e um cenário concreto de como se explora (ou como se comprova que não é explorável).

## Pistas já confirmadas — não partas do zero

Já corri `mcp__Supabase__get_advisors` (security) e `list_tables`/`list_edge_functions` nesta base de dados agora mesmo. Usa isto como ponto de partida e aprofunda, não te limites a repetir:

**RLS sem políticas nenhumas** (INFO, mas confirma se é intencional): `app_bundles`, `license_purchases`, `store_subscriptions` têm RLS ativado mas **zero políticas**. Isto significa que, por omissão, nem o próprio dono consegue ler essas linhas via `anon`/`authenticated` — só a chave de serviço (usada nas Edge Functions) lá chega. Verifica se alguma parte da app tenta ler estas tabelas diretamente do cliente (ex: mostrar histórico de compras em `src/app/account/page.jsx`) — se sim, está silenciosamente a devolver vazio, não é um "buraco" mas é um bug funcional. Se nada lê diretamente, tudo bem, mas vale a pena um comentário na migração a dizer que é por omissão.

**`search_path` mutável** (WARN): a função `public.append_match_event` não tem `search_path` fixo. É o clássico vetor de "search_path hijacking" em funções `SECURITY DEFINER` do Postgres. Confirma se é mesmo `SECURITY DEFINER`, e se for, corrige com `SET search_path = public, pg_temp` (ou equivalente) — e confere se há outras funções `SECURITY DEFINER` no schema com o mesmo problema que o linter não tenha apanhado.

**Funções `SECURITY DEFINER` chamáveis por `anon` (13) e por `authenticated` (14)** via `/rest/v1/rpc/...` — a maioria (`pode_editar_escalao`, `pode_ver_clube`, `sou_dono_do_clube`, etc.) são helpers pensados para serem usados *dentro* de políticas RLS, mas o Postgres/PostgREST também os expõe como endpoints RPC diretos. Duas merecem atenção séria:
- `license_is_active(p_user uuid)` — recebe um `p_user` arbitrário. Um pedido não autenticado (`anon`) a `/rest/v1/rpc/license_is_active?p_user=<qualquer-uuid>` consegue descobrir se uma conta qualquer tem licença ativa? Se sim, é fuga de informação sobre terceiros a quem nem sequer tem de estar autenticado. Testa isto a sério (com `curl` contra o endpoint real, sem token, ou com um token de outro utilizador).
- `claim_match_start(p_match_id uuid)` e `enforce_match_creation_entitlement()` — são chamáveis por `anon`. Confirma se o corpo da função valida `auth.uid()` internamente (rejeita se for `null`) antes de fazer seja o que for. Se não validar, um pedido anónimo pode estar a "reivindicar" o início de um jogo de outra pessoa, ou a contornar um limite de entitlement.

Como corrigir os que forem confirmados como indevidos: `REVOKE EXECUTE ON FUNCTION ... FROM anon, authenticated;` e voltar a conceder só ao papel que precisa, ou mudar para `SECURITY INVOKER` onde fizer sentido.

**Proteção de password fugida desativada** (WARN): "Leaked Password Protection" está desligada no Auth. Simples de ligar no painel do Supabase (Auth → Policies), vale a pena recomendar.

**Edge Functions existentes** (`mcp__Supabase__list_edge_functions`): `atualizacao` (verify_jwt: false — intencional, documentado em `ATUALIZACOES.md`), `verify-store-purchase` (verify_jwt: true), `app-store-notifications` (verify_jwt: false), `google-play-notifications` (verify_jwt: false), `verify-apple-purchase-v2` (verify_jwt: true, a mais recente, versão 10).

As duas com `verify_jwt: false` que recebem *webhooks das lojas* (`app-store-notifications`, `google-play-notifications`) são o ponto mais sensível de todo o sistema de compras: como não podem exigir um JWT do Supabase (é a Apple/Google que lhes fala diretamente), a única coisa que impede alguém de enviar um POST fabricado a dizer "este utilizador comprou a licença clube" é a função verificar, ela própria, a autenticidade da mensagem:
- `app-store-notifications`: tem de validar a cadeia de assinatura JWS do payload da App Store Server Notifications V2 contra os certificados raiz da Apple (não basta decodificar o JWT sem verificar assinatura).
- `google-play-notifications`: tem de validar o token do Pub/Sub (OIDC token da subscrição push, ou um segredo partilhado no URL) antes de confiar no conteúdo.

Lê o código destas duas funções (`supabase/functions/app-store-notifications/index.ts` e `supabase/functions/google-play-notifications/index.ts`) linha a linha e confirma se essa verificação existe mesmo, e se falha em modo seguro (rejeita) quando a verificação não bate certo. Isto é provavelmente o sítio com maior potencial de dar licenças grátis a quem quiser, se estiver mal feito.

Também audita `verify-apple-purchase-v2` e `verify-store-purchase`: confirma que validam o recibo/transação contra o servidor da Apple/Google (não confiam apenas no que o cliente diz que comprou), que associam a compra ao `auth.uid()` do pedido autenticado (e não a um `user_id` que o cliente possa enviar no corpo, o que permitiria à conta A validar o recibo da conta B), e que há proteção contra reprocessar o mesmo `transactionId`/`purchaseToken` duas vezes (idempotência — evitar que reenviar a mesma notificação estenda a licença repetidamente).

## Outras áreas a cobrir

- **Todas as políticas RLS de escrita** (`INSERT`/`UPDATE`/`DELETE`) em `clubs`, `teams`, `players`, `matches`, `match_squad`, `match_events`, `team_access`, `club_members` — confirma que cada uma corresponde exatamente à regra de negócio esperada (só o dono edita o clube, só quem tem acesso de edição ao escalão mexe nos jogadores/jogos desse escalão, etc.) e que não há nenhuma tabela com uma política `USING (true)` demasiado permissiva por engano.
- **A conta `profiles`**: confirma que um utilizador autenticado normal **não consegue** fazer `UPDATE` a `licenca`, `license_status`, `license_source` ou `license_expires_at` na sua própria linha via REST direto (isto teria de estar bloqueado por RLS ou por uma política de colunas) — só as Edge Functions com chave de serviço é que podem tocar nesses campos. Este é o ataque mais óbvio a testar: "consigo eu próprio, autenticado, fazer um PATCH a `/rest/v1/profiles?id=eq.<o-meu-id>` com `{"licenca":"clube","license_status":"active"}` e ficar com a app a pensar que paguei?"
- **`free_game_starts`**: perceber a lógica de limite de jogos grátis e confirmar que não dá para contornar (ex: apagar e recriar o jogo, ou mandar pedidos diretos ao RPC saltando a Edge Function que decide `allowed`).
- **Sincronização offline** (`src/lib/data/sync.js`, `src/lib/data/repository.js`, `src/lib/data/local.js`): percorre a lógica de `push`/`pull`/merge à procura de: perda de dados (uma escrita que fica presa e nunca sobe), duplicação (o mesmo jogo/evento a ser enviado duas vezes), fuga entre clubes (um `pull` a trazer dados de um clube a que o utilizador não devia ter acesso — isto seria mais um sintoma de RLS mal feita do lado do servidor do que da lógica de sync em si, mas vale a pena confirmar que o `pull` não assume que "o que veio do servidor é sempre meu"), e o caso dos jogadores marcados para apagar (`pendingDelete`, implementado recentemente) — confirma que apagar localmente e nunca mais voltar a ter rede não deixa a linha "presa" para sempre nem contorna a regra de negócio de que um jogador com histórico de jogos não pode ser apagado (essa regra vive hoje só em `repository.js`, do lado do cliente — um pedido direto `DELETE /rest/v1/players?id=eq.<id>` contorna-a? devia haver uma proteção ao nível da base de dados também, ex: uma FK com `ON DELETE RESTRICT` a partir de `match_squad`, ou um trigger).
- **A ferramenta `tools/painel/`**: confirma que realmente só corre em `localhost` (ver `tools/painel/guardas.mjs`, função `hostAceite`) e que a chave de serviço nunca é exposta a um pedido vindo de fora — não é suposto ser atingível pela app nem pela internet, mas vale a pena confirmar que a guarda de Host não tem folgas (ex: aceitar `X-Forwarded-Host` ou outro cabeçalho manipulável).
- **O mecanismo de atualização ao vivo (`app_bundles` / função `atualizacao`)**: a função usa `verify_jwt: false` de propósito (documentado). Confirma que, mesmo assim, não dá para um pedido malicioso inserir ou ativar um pacote (isso devia ser impossível via REST direto porque a tabela não tem políticas de escrita para `anon`/`authenticated` — confirma que é mesmo assim) e que o checksum do pacote é verificado pelo plugin antes de aplicar.
- **`npm run check` / `tools/check-security.mjs`**: lê o que este script já cobre hoje e avalia se está desatualizado ou se falta alguma verificação óbvia (chaves secretas coladas no código, `NEXT_PUBLIC_` a expor algo que não devia, etc.).
- **Consumo de base de dados**: corre `mcp__Supabase__get_advisors` com `type: "performance"` também (só pedi "security" nesta conversa), vê se há queries sem índice a percorrer tabelas grandes (`match_events` já tem ~2000 linhas, vai crescer), confirma que o `pull()` de sync não está a descarregar mais do que precisa a cada vez (idealmente só o que mudou desde a última sincronização), e que não há nenhum polling desnecessariamente frequente (ex: a verificação de atualização de bundle, ou alguma subscrição Realtime, a correr com mais frequência do que faz sentido).

## Formato do relatório

Por ordem de gravidade (crítico → alto → médio → baixo → nota). Para cada achado: ficheiro/política/função exata, o cenário concreto de exploração (ou a prova de que está protegido), e a correção sugerida. Sinaliza claramente o que já confirmaste estar bem feito, não só o que está mal — um relatório só de problemas não diz se o resto foi verificado ou nem chegou a ser olhado.
