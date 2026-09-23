# Contexto do projeto — Futsal SubStats

Lê isto primeiro, antes de qualquer outro `.md` do repositório. Serve para uma
IA nova (ou uma pessoa nova) perceber em cinco minutos o que é isto, onde vive
cada peça, e para onde ir a seguir. Os outros ficheiros `.md` na raiz têm o
detalhe; este é o mapa.

Se algum facto aqui contradisser o que vês no código ou num painel (Supabase,
Stripe, App Store Connect, Play Console), **confia no que vês agora** — este
documento é escrito num momento e o projeto continua a andar. Mais abaixo, em
[Zonas onde a documentação pode estar desatualizada](#zonas-onde-a-documentação-pode-estar-desatualizada),
diz-se explicitamente onde isso é mais provável.

---

## 1. O que é o Futsal SubStats

Uma app para treinadores de futsal apontarem o jogo ao vivo, à beira do campo,
com o polegar: quem está em campo, o cronómetro (que respeita as paragens),
golos, assistências, faltas, cartões, os dois minutos de inferioridade, o
guarda-redes avançado (5v4), tudo isto **sem internet** — sincroniza sozinha
quando houver rede.

O argumento central: um treinador sabe de cor quem marcou, mas ninguém se
lembra de quanto tempo cada jogador esteve em campo — e é esse número que
decide as rotações da semana seguinte e as conversas com os pais nos escalões
de formação.

Depois do jogo: tempo em campo por jogador, participações em golos, golos por
parte, correção a frio (que recalcula tudo, incluindo o resultado ao
intervalo), exportação para CSV. Organização: clube → escalões → competições →
jogos, com plantel e histórico por jogador ao longo da época. Três idiomas:
português, inglês, espanhol.

Detalhe completo das funcionalidades: `SITE.md`, secção 3.

---

## 2. As três formas de usar a app — e são o MESMO código

Um único código-fonte Next.js (`src/`, na raiz do repositório) serve três
destinos:

1. **App Store (iPhone/iPad)** — o `next build` gera uma exportação estática
   (pasta `out/`), que o **Capacitor** embrulha num binário nativo iOS. O
   código corre dentro do aparelho, sem precisar de rede para abrir — só a
   sincronização precisa.
2. **Google Play (Android)** — o mesmo `out/`, embrulhado pelo Capacitor outra
   vez, desta vez para Android. Não há "versão Android" separada para manter:
   é o mesmo `out/` duas vezes.
3. **Browser / PC** — o mesmo código Next.js, servido como site normal a
   partir da **Vercel**, em `https://futsalsubstats.vercel.app`. Quem abre
   este endereço num computador ou telemóvel usa a app completa, sem instalar
   nada.

App ID (Capacitor): `com.futsalsubstats.app` (confirmado no código; alguma
documentação mais antiga escreve `com.FutsalSubStats.app` — é o mesmo
identificador, os stores tratam-no sem distinguir maiúsculas).

**Duas vias de atualização diferentes para o que está dentro das apps
nativas**, e é importante não as confundir:

- **Build nativo novo** (Codemagic ou GitHub Actions → TestFlight / Play
  Console): obrigatório quando muda algo em `android/` ou `ios/`, ou quando se
  acrescenta um plugin nativo novo. Passa por revisão da loja (App Store leva
  dias; TestFlight interno não leva revisão nenhuma).
- **Pacote OTA** (`npm run publicar:pacote`, ver `ATUALIZACOES.md`): manda só
  o código web (`src/`) para os telemóveis em minutos, sem passar pela loja,
  através de `@capgo/capacitor-updater`. Não pode pedir nada que o invólucro
  nativo instalado ainda não tenha (ver a tabela em `ATUALIZACOES.md` §1). O
  pacote nasce sempre desligado (`ativo = false`) e só se liga depois de
  testado num aparelho a sério.

O site na Vercel **não** é afetado por nenhuma destas duas vias — está sempre
na versão mais recente do `main`, assim que se corre `npm run build` +
deploy.

---

## 3. O site (`website/`) — um projeto separado

Dentro do mesmo repositório, mas é **outro projeto Next.js/vinext,
independente**, com o seu próprio `package.json`, deploy e propósito:

- **Onde**: pasta `website/`.
- **O que é**: a landing page pública de apresentação e venda — não é a app
  que os treinadores usam para apontar jogos, é o material de vendas e a porta
  de entrada para comprar uma licença pelo browser.
- **Onde corre**: **Cloudflare Workers** (não Vercel, não Cloudflare Pages —
  apesar de `SITE.md` mencionar Pages como plano inicial, o que está montado e
  a funcionar hoje é um Worker via `wrangler`). Endereço:
  `https://futsalsubstats.r4m.workers.dev`.
- **Deploy**: dentro de `website/`, `npm run build` (ou o mais seguro,
  `npx --no-install vinext build`) seguido de `npx wrangler deploy`. Detalhes
  e armadilhas do Windows em `SITE.md`, secção final.
- **É também aqui que vive o Stripe** — ver secção 5.

Resumindo a relação: **app = produto**, o que o treinador usa em campo, em
três embalagens (App Store, Play Store, browser). **Website = montra e
balcão de pagamento**, só para quem ainda não é cliente ou quer comprar pelo
browser.

---

## 4. Onde vive a base de dados

**Supabase**, projeto `bkfkpfhcysuyiotwkaty`. Um único projeto serve a app
(nas três embalagens) e o website.

- **Postgres**, com **RLS (Row Level Security) em todas as tabelas** — a
  segurança está no servidor, não no ecrã. A frase que ancora quase tudo:
  acesso aos dados de um escalão é decidido por quem tem posse/acesso a esse
  escalão (`club_members` / `team_access`), não pelo ecrã que os mostra.
- **Auth** — email/password hoje; login por Google e por Apple estão no plano
  (`CHECKLIST-PARA-FICAR-ACABADO.md`, secção 2), confirmar estado atual no
  painel antes de assumir que já estão ligados.
- **Storage** — bucket público `pacotes`, onde vivem os zips dos pacotes OTA.
- **Edge Functions**, as mais importantes:
  - `atualizacao` — responde à app quando pergunta se há pacote OTA novo.
  - `verify-store-purchase` — valida uma compra feita dentro da app (App
    Store / Google Play) do lado do servidor.
  - `app-store-notifications` / `google-play-notifications` — recebem os
    webhooks de servidor das duas lojas (renovação, cancelamento, reembolso,
    etc.) e voltam a perguntar à própria Apple/Google qual é o estado
    verdadeiro, em vez de confiar cegamente no que a notificação diz.

Modelo de dados, em resumo: `clubs` → `teams` (chamados "escalões" na app) →
`players` / `matches` / `match_squad` / `match_events` / `player_stints` /
`competitions`. Licenciamento: `profiles.licenca` (`'treinador'` ou
`'clube'`) decide quantos escalões uma conta pode ter — ver `LICENCAS.md`
para o desenho completo e o que já está construído.

**A app é offline-first**: os dados nascem no aparelho (ou no browser) e uma
fila de sincronização (`src/lib/data/sync.js`) envia-os ao Supabase quando há
rede. Isto é a razão de existir de vários dos avisos espalhados pelos outros
documentos (ex.: nunca reinterpretar um campo antigo, só acrescentar — há
sempre versões antigas da app em campo).

---

## 5. Pagamentos — duas vias, deliberadamente separadas

### 5.1 Dentro das apps nativas (iOS e Android) — pelas lojas

Segundo as regras da Apple e da Google, uma compra feita **dentro** da app
tem de passar pelo sistema de pagamento deles, não pelo Stripe:

- **iOS**: StoreKit 2, através de um plugin nativo próprio
  (`FutsalBillingPlugin`, registado em `SceneDelegate.swift`). Produtos:
  `Treinador` e `Clube`.
- **Android**: Google Play Billing. Produtos: `licenca_treinador_anual` e
  `licenca_clube_anual`.
- Ambas as licenças são subscrições anuais com 14 dias grátis, mais um
  esquema de **4 jogos grátis** sem licença nenhuma, validado no servidor
  (RPC `claim_match_start`, tabela `free_game_starts`) para não dar para
  contornar apagando dados locais.
- A compra é sempre **confirmada no servidor** (`verify-store-purchase`) e
  mantida atualizada pelos webhooks das lojas — nunca se confia só no que o
  telemóvel diz.

Ver `CHECKLIST-PARA-FICAR-ACABADO.md` (o que falta ligar fora do código) e
`DIAGNOSTICO-COMPRAS-IOS.md` (histórico de um bug real de registo do plugin
no iOS, já corrigido na 1.5.1).

### 5.2 No website — pelo Stripe

O `website/worker` tem três rotas:

- `POST /api/stripe/checkout` — cria uma sessão Stripe Checkout (redireciona
  para uma página do Stripe; **não há Stripe.js/Elements nem chave
  publicável em lado nenhum do código** — é só sessão de checkout
  server-side).
- `POST /api/stripe/webhook` — recebe a confirmação do Stripe, valida a
  assinatura, e regista a compra.
- `POST /api/stripe/claim` — depois de pagar, o comprador indica o email da
  conta da app (pode ser diferente do email usado no pagamento — MB WAY,
  Apple Pay, cartão de terceiro). O Worker então: se a conta já existir,
  atualiza `profiles.licenca` / `profiles.license_expires_at`; se não
  existir, cria um convite Supabase Auth para essa pessoa escolher
  password. A compra fica registada em `license_purchases`.
- Todas as licenças (compradas onde forem) terminam a **30 de junho**, fim de
  época, independentemente da data de compra.

Segredos (chaves Stripe, price IDs, credenciais Supabase) vivem **só** como
`wrangler secret` no Cloudflare Worker do site — nunca no repositório, nunca
num `NEXT_PUBLIC_`. **Nesta mesma sessão de trabalho, o site foi mudado de
chaves de teste do Stripe para chaves de produção (live mode)** — os 6
segredos (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_TREINADOR_ANUAL`, `STRIPE_PRICE_CLUBE_ANUAL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`) foram confirmados presentes via
`wrangler secret list`. Vale a pena confirmar com uma compra real pequena se
ainda não tiver sido feita.

Detalhe técnico completo: `website/README.md`.

---

## 6. Sobre a regra 3.1.3(f) da Apple — cuidado ao ler `SITE.md`

`SITE.md` foi escrito quando o plano era publicar a app iOS como
**"companheira gratuita de uma ferramenta web"** (regra 3.1.3(f)), o que
proibiria qualquer compra ou botão de compra dentro da app. Essa secção
(`SITE.md` §6) diz explicitamente para a app nunca ligar para o site nem ter
compras dentro dela.

**Isso já não bate certo com o resto do projeto**: `CHECKLIST-PARA-FICAR-
ACABADO.md` e `DIAGNOSTICO-COMPRAS-IOS.md` descrevem compras nativas dentro
da app, já em desenvolvimento avançado (StoreKit 2 + Google Play Billing,
com subscrições e trial). Isto sugere que o modelo de negócio evoluiu do
"companion app gratuita" para "app com compras dentro, mais uma via
alternativa de compra no site" — o que é perfeitamente possível (a Apple
também aceita apps com in-app purchase normal), mas muda as regras da 3.1.3(f)
que já não se aplicariam.

**Não assumas nenhum dos dois modelos sem confirmar o estado atual** — olha
para o código de faturação (`src/lib/` relacionado com compras, os workflows
do Codemagic, e o que está de facto ativo em App Store Connect / Play
Console) antes de dar conselhos sobre o que a app "pode" ou "não pode" fazer
em relação a preços e compras.

---

## 7. Publicação e CI/CD, em resumo

| Destino | Como | Ficheiro/guia |
|---|---|---|
| Web (Vercel) | `npm run build` na raiz + deploy Vercel | `PUBLICAR.md` |
| Website (Cloudflare Worker) | dentro de `website/`, build + `wrangler deploy` | `SITE.md` (fim), `website/README.md` |
| iOS → TestFlight | Codemagic (`ios-testflight`) ou GitHub Actions (`.github/workflows/ios-testflight.yml`) | `TESTFLIGHT.md`, `GITHUB-ACTIONS-IOS.md` |
| iOS → App Store | mesma compilação, depois submissão manual/`asc` | `APPSTORE.md` |
| Android → Play Store | Codemagic (`android-preview` para APK de teste a cada push; `android-google-play` para AAB assinado) | `PUBLICAR-ANDROID.md` |
| Pacote OTA (JS dentro das apps já instaladas) | `npm run publicar:pacote -- X.Y.Z` | `ATUALIZACOES.md` |

Antes de qualquer publicação: `npm run check` (verificadores próprios em
`tools/` — imports, propriedades de componentes, e a suite de testes; não
substitui `npm run build`).

**Armadilha já vivida nesta sessão**: `wrangler deploy` sozinho publica o
que já estiver em `dist/` — não recompila nada. Sem correr `npm run build`
antes, publica-se código antigo sem erro nenhum a avisar.

---

## 8. Convenções do repositório

- **Tudo em português** — comentários, nomes de variáveis e funções, nomes de
  ficheiros de documentação, mensagens de commit. Segue esse tom ao escrever
  código ou texto novo aqui.
- Endereços da app nunca se escrevem à mão — saem todos de `src/lib/routes.js`
  (ver `MUDANCAS.md` para a razão: a app é uma exportação estática, sem
  servidor, e não pode ter páginas com ids no caminho do URL).
- Segurança por linha (RLS) em todas as tabelas, sem exceção; qualquer tabela
  nova precisa de política própria — `tools/check-security.mjs` verifica isto
  a cada `npm run check`.
- Chaves de serviço (`SUPABASE_SERVICE_ROLE_KEY` e equivalentes) nunca entram
  no repositório nem em variáveis `NEXT_PUBLIC_` — vivem só no ambiente de
  quem publica, ou como secrets do Cloudflare Worker / Codemagic / GitHub
  Actions.
- Migrações em `supabase/migrations/`, nomeadas por data; aplicar sempre pela
  ordem cronológica.

---

## 9. Mapa dos outros documentos

| Ficheiro | Serve para |
|---|---|
| `SITE.md` | Conteúdo, tom e requisitos do site de apresentação (ler a ressalva da secção 6 acima) |
| `LICENCAS.md` | Modelo de licenças/acessos multi-utilizador — desenho e o que já está construído |
| `APPSTORE.md` | Checklist de submissão à App Store (conta de demo, privacidade, ficha) |
| `TESTFLIGHT.md` | Instalar via TestFlight interno, sem revisão da Apple |
| `PUBLICAR-ANDROID.md` | Do zero à Play Store — regra dos 12 testadores/14 dias, keystore, ficha |
| `ATUALIZACOES.md` | Mecanismo de pacotes OTA (Capgo) — o que pode e não pode ir por aí |
| `GITHUB-ACTIONS-IOS.md` | Alternativa ao Codemagic para compilar e enviar iOS |
| `DIAGNOSTICO-COMPRAS-IOS.md` | Histórico de um bug real de compras no iOS (plugin não registado), corrigido na 1.5.1 |
| `CHECKLIST-PARA-FICAR-ACABADO.md` | O que falta configurar fora do código (migrações, secrets, providers, produtos nas lojas) — o mais "estado atual" dos documentos |
| `GUIA-SECRETS-LOJAS.md` | Guia de segredos para as lojas (Apple/Google) |
| `MUDANCAS.md` | Histórico técnico de uma ronda de mudanças (rotas, 5v4, expulsões do adversário) |
| `PUBLICAR.md` | Deploy do site principal (a app) na Vercel |
| `website/README.md` | Detalhe técnico do site: Stripe, estrutura, variáveis |
| `AGENTS.md` (via `CLAUDE.md`) | Nota genérica do Next.js sobre breaking changes — não é específica deste projeto |

---

## Zonas onde a documentação pode estar desatualizada

Vale a pena confirmar antes de agir com base só no texto:

- **Se a app já foi publicada na App Store/Play Store**, ou se ainda está só
  em TestFlight/teste fechado. `SITE.md` diz que ainda não foi publicada;
  `CHECKLIST-PARA-FICAR-ACABADO.md` e `DIAGNOSTICO-COMPRAS-IOS.md` (mais
  recentes) descrevem trabalho já avançado de subscrições nas lojas.
- **O modelo de monetização dentro da app iOS** — ver secção 6 acima.
- **Se os providers de login Google/Apple já estão ativos** no Supabase Auth.
- **Se os produtos de subscrição já existem** de facto no App Store Connect e
  na Play Console (o `CHECKLIST` lista isto como pendente).
- **Versão atual**: `package.json` da raiz tinha `1.5.5` na última leitura; a
  versão do pacote OTA mais recente publicado pode estar à frente disso (ver
  tabela `app_bundles` no Supabase para o valor exato e se está `ativo`).
