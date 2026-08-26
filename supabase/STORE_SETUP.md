# Configuracao das lojas

## Produtos

Criar uma subscricao anual com 14 dias gratuitos em cada loja, usando exatamente:

- `trainer_annual`
- `club_annual`

## Secrets das Edge Functions

```powershell
supabase secrets set APPLE_ISSUER_ID=...
supabase secrets set APPLE_KEY_ID=...
supabase secrets set APPLE_PRIVATE_KEY="...conteudo do ficheiro p8..."
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON="...json completo..."
```

## Deploy

```powershell
supabase functions deploy verify-store-purchase
supabase functions deploy app-store-notifications --no-verify-jwt
supabase functions deploy google-play-notifications --no-verify-jwt
```

Configurar App Store Server Notifications V2 para:
`https://<project-ref>.supabase.co/functions/v1/app-store-notifications`.

Configurar Google Play RTDN / Pub/Sub push para:
`https://<project-ref>.supabase.co/functions/v1/google-play-notifications`.

