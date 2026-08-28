# Checklist para ficar tudo acabado

Este ficheiro lista o que ainda falta configurar fora do codigo para a nova versao ficar pronta em Android, iOS, web e backend.

## 1. Supabase

### Migrations da base de dados

Aplicar as migrations novas no projeto Supabase:

- `supabase/migrations/20260825200312_competition_rules.sql`
- `supabase/migrations/20260825213000_entitlements_free_games.sql`
- `supabase/migrations/20260825224500_store_subscriptions.sql`

Comando recomendado:

```powershell
cd C:\FutsalSubStats
supabase db push
```

Depois confirmar no Supabase que existem:

- colunas novas nas competicoes para tipo de tempo e limite de convocados;
- tabela `free_game_starts`;
- tabela `store_subscriptions`;
- funcao/RPC `claim_match_start`;
- funcao/RPC `my_entitlement`;
- funcao `recompute_store_entitlement`.

### Edge Functions

Fazer deploy destas funcoes:

```powershell
cd C:\FutsalSubStats
supabase functions deploy verify-store-purchase
supabase functions deploy app-store-notifications
supabase functions deploy google-play-notifications
```

### Secrets das Edge Functions

Adicionar/confirmar secrets:

```powershell
supabase secrets set APP_STORE_BUNDLE_ID=com.FutsalSubStats.app
supabase secrets set APP_STORE_ISSUER_ID=...
supabase secrets set APP_STORE_KEY_ID=...
supabase secrets set APP_STORE_PRIVATE_KEY=...
supabase secrets set GOOGLE_PLAY_PACKAGE_NAME=com.FutsalSubStats.app
supabase secrets set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

Notas:

- `SUPABASE_SERVICE_ROLE_KEY` nunca pode ir para o frontend.
- `APP_STORE_PRIVATE_KEY` deve ser a chave `.p8` da App Store Connect, com quebras de linha preservadas.
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` deve ser o JSON completo da service account com acesso a Google Play Android Developer API.

## 2. Auth no Supabase

### Registo por email

Confirmar em:

```text
Supabase Dashboard > Authentication > Providers > Email
```

Verificar:

- Email provider ativo;
- confirma se queres email confirmation ligada ou desligada;
- URL do site configurado.

### Login Google

Ativar em:

```text
Supabase Dashboard > Authentication > Providers > Google
```

Adicionar:

- Google Client ID;
- Google Client Secret.

No Google Cloud, autorizar este redirect:

```text
https://bkfkpfhcysuyiotwkaty.supabase.co/auth/v1/callback
```

### Login Apple

Ativar em:

```text
Supabase Dashboard > Authentication > Providers > Apple
```

Configurar no Apple Developer:

- App ID: `com.FutsalSubStats.app`;
- Service ID para web/login;
- Sign in with Apple ativo;
- redirect URL do Supabase:

```text
https://bkfkpfhcysuyiotwkaty.supabase.co/auth/v1/callback
```

## 3. Produtos nas lojas

Criar os produtos/subscricoes anuais nas duas lojas com estes IDs exatos:

- `trainer_annual`
- `club_annual`

### Google Play Console

Configurar:

- subscricoes anuais;
- 14 dias gratis antes da primeira cobranca;
- precos localizados;
- app em faixa de teste;
- Google Play Billing ativo;
- Google Play Developer API ligada;
- service account com permissoes para ler compras e subscricoes.

### App Store Connect

Configurar:

- subscriptions anuais;
- 14 dias gratis antes da primeira cobranca;
- produtos com os mesmos IDs;
- precos localizados;
- app em TestFlight;
- chave App Store Server API.

## 4. Notificacoes das lojas

### App Store Server Notifications

No App Store Connect, configurar endpoint:

```text
https://bkfkpfhcysuyiotwkaty.supabase.co/functions/v1/app-store-notifications
```

Eventos importantes:

- compra inicial;
- renovacao;
- cancelamento;
- expiracao;
- refund;
- falha de pagamento.

### Google Real-time Developer Notifications

No Google Play Console:

- criar/usar topico Pub/Sub;
- configurar Real-time Developer Notifications;
- apontar para a Edge Function:

```text
https://bkfkpfhcysuyiotwkaty.supabase.co/functions/v1/google-play-notifications
```

Confirmar que a service account tem acesso ao Pub/Sub e a Google Play Developer API.

## 5. URLs e redirects

Confirmar no Supabase:

```text
Authentication > URL Configuration
```

URLs a permitir:

```text
http://localhost:3000
https://futsalsubstats.vercel.app
https://futsal-sub-stats.pages.dev
com.FutsalSubStats.app://auth/callback
```

Usar o dominio final real, se for diferente dos exemplos acima.

## 6. Android

### Testar debug

Ja passou no teu PC:

```powershell
cd C:\FutsalSubStats\android
.\gradlew.bat assembleDebug
```

### Gerar AAB para Play Store

```powershell
cd C:\FutsalSubStats\android
.\gradlew.bat bundleRelease
```

Output esperado:

```text
C:\FutsalSubStats\android\app\build\outputs\bundle\release\app-release.aab
```

Antes de enviar para a Play Store, confirmar:

- `versionCode` aumentou;
- `versionName` esta correto;
- `key.properties` existe localmente;
- keystore de release esta certo;
- produtos `trainer_annual` e `club_annual` existem na Play Console.

## 7. iOS

### Sincronizar Capacitor

```powershell
cd C:\FutsalSubStats
npx cap sync ios
```

Se o `npx cap` falhar no Windows por causa do erro do Node, usar o workaround que ja funcionou:

```powershell
node -e "const os=require('node:os'); os.userInfo=()=>({shell:process.env.ComSpec||'cmd.exe'}); process.argv=['node','cap','sync','ios']; require('./node_modules/@capacitor/cli/bin/capacitor')"
```

### Codemagic/TestFlight

Confirmar:

- App ID `com.FutsalSubStats.app`;
- Apple Distribution Certificate valido;
- provisioning profile App Store valido;
- profile importado no Codemagic;
- workflow iOS usa o bundle id certo;
- build sobe para TestFlight.

## 8. Testes funcionais obrigatorios

### Competicoes

Testar:

- criar competicao corrida;
- criar competicao cronometrada;
- editar tipo de tempo;
- definir limite de convocados;
- escolher `Sem limite`;
- criar competicao diretamente durante a criacao de jogo;
- confirmar que o jogo herda as regras da competicao.

### Jogos gratis

Testar com conta nova:

- iniciar primeiro jogo;
- iniciar segundo jogo;
- iniciar terceiro jogo;
- iniciar quarto jogo;
- tentar iniciar quinto jogo;
- apagar um jogo e confirmar que nao devolve creditos;
- tutorial nao consome jogos.

### Licencas

Testar:

- sem licenca: bloqueia depois dos quatro jogos;
- treinador: permite uma conta e um escalao;
- clube: permite varios treinadores e ate cinco escaloes;
- restaurar compras;
- entrar noutro dispositivo e reconhecer a licenca.

### Compras

Testar em sandbox/closed test:

- compra treinador;
- compra clube;
- trial de 14 dias;
- renovacao;
- cancelamento;
- expiracao;
- refund;
- falha de pagamento;
- restaurar compra;
- login noutro dispositivo com a mesma conta.

### Sincronizacao

Testar:

- criar plantel num dispositivo e ver noutro;
- criar competicao num dispositivo e ver noutro;
- fazer jogo offline;
- terminar jogo;
- confirmar que o jogo completo sobe para a base de dados;
- confirmar que outro dispositivo recebe resultado, eventos, assistencias, faltas e tempo em campo.

## 9. Deploy web

Confirmar que o website/app web esta atualizado:

```powershell
cd C:\FutsalSubStats
npm run check
npm run build
```

Depois fazer deploy no sistema que estiver a servir a web app, por exemplo Vercel/Cloudflare.

## 10. GitHub

Antes de publicar builds:

```powershell
cd C:\FutsalSubStats
git status
git add .
git commit -m "Implement free games, subscriptions and tutorial"
git pull --rebase origin main
git push origin main
```

Se houver conflito, resolver primeiro e so depois fazer `git rebase --continue`.

## Estado atual

Feito no codigo:

- competicoes com regras novas;
- layout de tablet corrigido;
- registo aberto por email/password, Google e Apple;
- quatro jogos gratis com validacao backend;
- area de licencas;
- integracao direta com Google Play Billing e StoreKit 2;
- Edge Functions para validacao/notificacoes das lojas;
- tutorial opcional com dados demo;
- testes JS passaram;
- Android debug compilou no PC.

Ainda falta fora do codigo:

- aplicar migrations no Supabase;
- deploy das Edge Functions;
- configurar secrets;
- ativar Google/Apple providers;
- criar subscricoes nas lojas;
- configurar notificacoes das lojas;
- testar compras em ambiente real de teste;
- gerar AAB release e IPA/TestFlight.
