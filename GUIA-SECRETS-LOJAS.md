# Guia para encontrar as secrets das lojas

Este ficheiro explica onde encontrar cada valor para configurar as Edge Functions do Supabase que validam compras da App Store e Google Play.

Nunca metas estas chaves no GitHub, no codigo da app, nem em variaveis `NEXT_PUBLIC_*`.

## Como gravar as secrets no Supabase

Corre os comandos a partir da pasta do projeto:

```powershell
cd C:\FutsalSubStats

npx supabase secrets set APP_STORE_BUNDLE_ID=com.FutsalSubStats.app
npx supabase secrets set APP_STORE_ISSUER_ID="db7fea04-1514-4e5f-a17c-2ff8dbb94cea"
npx supabase secrets set APP_STORE_KEY_ID="39GNCA9U76" 
npx supabase secrets set 

$appleKey = @"
-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgxuANRtQm4SWlWXIP
w/BtbizkgaWO1h/2c6lt/x3ZGeSgCgYIKoZIzj0DAQehRANCAATXfjqzduWHD9hZ
ws0RX/6OyMp7wpJqBghe/2lzwxDrK0cvLQLuEeXYDEjxnfvezy4zUom/lwja73Kt
U+P908EY
-----END PRIVATE KEY-----
"@
npx supabase secrets set APP_STORE_PRIVATE_KEY="$appleKey"

GOOGLE_PLAY_PACKAGE_NAME=com.FutsalSubStats.app
npx supabase secrets set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON="..."
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."
```

Se uma chave tiver quebras de linha, aspas ou JSON grande, usa aspas e cola com cuidado. No PowerShell, se der erro, o mais seguro e editar uma variavel temporaria e depois enviar, mas primeiro tenta simples.

## APP_STORE_BUNDLE_ID

Valor:

```text
com.FutsalSubStats.app
```

Onde confirmar:

1. Abre Apple Developer.
2. Vai a Certificates, Identifiers & Profiles.
3. Entra em Identifiers.
4. Abre a app Futsal SubStats.
5. O Bundle ID tem de ser `com.FutsalSubStats.app`.

Este valor tambem deve bater certo com o iOS, Codemagic e App Store Connect.

## APP_STORE_ISSUER_ID

Onde encontrar:

1. Abre App Store Connect.
2. Vai a Users and Access.
3. Entra no separador Integrations.
4. Entra em App Store Connect API.
5. O Issuer ID aparece no topo da pagina.

E um UUID grande. Exemplo de formato:

```text
aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
```

## APP_STORE_KEY_ID

Onde encontrar:

1. Abre App Store Connect.
2. Vai a Users and Access.
3. Entra em Integrations.
4. Entra em App Store Connect API.
5. Na lista de chaves, escolhe a chave que criaste para a app/backend.
6. Copia o Key ID.

O Key ID e curto, tipo:

```text
ABC123DEFG
```

## APP_STORE_PRIVATE_KEY

Onde encontrar:

1. Quando crias uma chave em App Store Connect API, a Apple deixa descarregar um ficheiro `.p8`.
2. Esse ficheiro so pode ser descarregado uma vez.
3. Abre o `.p8` num editor de texto.
4. Copia tudo, incluindo:

```text
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
```

Importante:

- Nao partilhes este ficheiro.
- Nao o metas no GitHub.
- Se perderes o `.p8`, tens de revogar a chave antiga e criar outra.

## GOOGLE_PLAY_PACKAGE_NAME

Valor:

```text
com.FutsalSubStats.app
```

Onde confirmar:

1. Abre Google Play Console.
2. Entra na app Futsal SubStats.
3. No painel da app, confirma o Nome do pacote.
4. Deve aparecer `com.FutsalSubStats.app`.

Tem de bater certo com o `applicationId` do Android.

## GOOGLE_PLAY_SERVICE_ACCOUNT_JSON

Esta e a chave JSON de uma conta de servico da Google Cloud com acesso a Google Play Developer API.

Onde criar/encontrar:

1. Abre Google Play Console.
2. Vai a Setup.
3. Entra em API access.
4. Liga a app a um projeto Google Cloud, se ainda nao estiver.
5. Cria uma Service Account.
6. Entra no Google Cloud Console dessa Service Account.
7. Vai a Keys.
8. Cria uma nova chave do tipo JSON.
9. Descarrega o ficheiro `.json`.
10. Volta a Google Play Console > API access.
11. Da permissao a essa Service Account.

Permissoes recomendadas para comecar:

- Ver apps e informacao da app.
- Gerir pedidos/assinaturas/compras, se aparecer essa opcao.
- Acesso suficiente para ler/validar compras e subscricoes.

Depois abre o ficheiro `.json` e copia o conteudo inteiro como valor de:

```text
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
```

O JSON comeca parecido com isto:

```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "..."
}
```

Importante:

- Cola o JSON inteiro.
- Nao alteres `\n` dentro da `private_key`.
- Nao metas este ficheiro no GitHub.

## SUPABASE_SERVICE_ROLE_KEY

Onde encontrar:

1. Abre Supabase.
2. Entra no projeto `bkfkpfhcysuyiotwkaty`.
3. Vai a Project Settings.
4. Entra em API.
5. Procura Project API keys.
6. Copia a chave `service_role`.

Muito importante:

- A `service_role` ignora RLS.
- Nunca pode ir para frontend, app Android, app iOS, website publico ou GitHub.
- So deve ficar nas Supabase Edge Functions/secrets.

## Depois de configurar

Depois de meteres as secrets, redeploya as functions para garantir que leem os valores novos:

```powershell
npx supabase functions deploy verify-store-purchase
npx supabase functions deploy app-store-notifications
npx supabase functions deploy google-play-notifications
```

Depois testa:

1. Abrir Definicoes > Licencas na app instalada.
2. Confirmar que aparecem produtos/precos da loja.
3. Fazer compra de teste.
4. Confirmar que a app atribui a licenca.
5. Confirmar no Supabase que o perfil ficou com a licenca correta.
6. Testar Restaurar compras.

## URLs dos webhooks/notificacoes

Estas URLs devem ser usadas nas lojas quando pedirem endpoint de notificacoes:

```text
https://bkfkpfhcysuyiotwkaty.supabase.co/functions/v1/app-store-notifications
https://bkfkpfhcysuyiotwkaty.supabase.co/functions/v1/google-play-notifications
```

