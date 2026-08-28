# Futsal SubStats — website

Landing page responsiva da aplicação Futsal SubStats, com demonstração interativa de um jogo, apresentação das funcionalidades, modo offline, estatísticas, licenças e contactos.

## Desenvolvimento local

Requisitos:

- Node.js 22.13 ou superior
- npm

```bash
npm install
npm run dev
```

## Validação e build

```bash
npm run lint
npm run build
```

O build produz o artefacto de produção em `dist/`, preparado para um runtime Cloudflare Worker.

## Pagamentos Stripe

O site tem dois endpoints no Worker:

- `POST /api/stripe/checkout` — cria uma sessão Stripe Checkout anual.
- `POST /api/stripe/webhook` — recebe o Stripe, valida a assinatura e guarda a compra no Supabase.
- `POST /api/stripe/claim` — associa a compra ao email que o cliente escolhe para entrar na app.

No Stripe, cria dois produtos/preços de pagamento único anual:

- Treinador, guardando o `price_...` em `STRIPE_PRICE_TREINADOR_ANUAL`
- Clube, guardando o `price_...` em `STRIPE_PRICE_CLUBE_ANUAL`

Depois configura estes secrets no Cloudflare Worker:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_PRICE_TREINADOR_ANUAL
npx wrangler secret put STRIPE_PRICE_CLUBE_ANUAL
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Opcional, se quiseres forçar o destino do convite Supabase:

```bash
npx wrangler secret put SUPABASE_INVITE_REDIRECT_URL
```

Valor recomendado:

```text
https://futsalsubstats.vercel.app/password/
```

O webhook no Stripe deve apontar para:

```text
https://futsalsubstats.r4m.workers.dev/api/stripe/webhook
```

Eventos necessários:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

Quando o pagamento fica concluído, o Stripe volta ao site com o `session_id`.
O site mostra a mensagem de boas-vindas e pergunta qual é o email da conta da app.
Isto evita depender do email usado no pagamento, que pode vir de Apple Pay, MB WAY,
cartão de outra pessoa ou de uma conta Stripe diferente.

Depois de o cliente indicar o email, o Worker:

- procura `profiles.email`;
- se a conta existir, atualiza `profiles.licenca` e `profiles.license_expires_at`;
- se a conta ainda não existir, cria um convite Supabase Auth para escolher palavra-passe;
- marca a compra como `paid` em `license_purchases`, com `account_email` e `claimed_at`.

Todas as licenças terminam a 30 de junho, no fim da época. Enquanto o cliente ainda não escolhe o email da conta, a compra fica em `license_purchases` com estado `unmatched`.

Para enviar convites a clientes reais, configura em Supabase Auth:

- Site URL da app: `https://futsalsubstats.vercel.app`
- Template de email `Invite user` a apontar para `/password/?th={{ .TokenHash }}&tipo=invite`
- SMTP próprio em produção, porque o SMTP padrão do Supabase é limitado e não é indicado para envio a clientes finais.

Nota fiscal: a fatura/recibo do Stripe não substitui necessariamente uma fatura certificada portuguesa. Para clubes, confirma a emissão em software certificado ou Portal das Finanças.

## Estrutura principal

- `app/page.tsx` — conteúdo e interações da landing page
- `app/translations.ts` — textos em português, inglês e espanhol
- `app/globals.css` — design e comportamento responsivo
- `public/` — ícones e imagem de partilha

O conteúdo visual da landing page é frontend. Os pagamentos usam endpoints no Cloudflare Worker e atualizam o Supabase com service role apenas no servidor.
