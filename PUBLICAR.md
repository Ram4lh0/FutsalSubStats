# Pôr a app no ar

Dez minutos, sem cartão de crédito. No fim ficas com um endereço que abre em
qualquer lado — iPad, telemóvel, computador de outra pessoa.

## 1. Criar conta na Vercel

[vercel.com/signup](https://vercel.com/signup) — o plano gratuito (Hobby) chega
e sobra para uso pessoal.

## 2. Publicar a partir da pasta

Na pasta `futsal-web`, no terminal:

```
npx vercel login
npx vercel
```

O primeiro comando abre o browser para entrares. O segundo faz as perguntas da
primeira publicação — aceita tudo por omissão:

- *Set up and deploy?* → **Y**
- *Which scope?* → a tua conta
- *Link to existing project?* → **N**
- *Project name* → `futsal` (ou o que quiseres; entra no endereço)
- *In which directory is your code located?* → **./**
- *Want to modify these settings?* → **N**

## 3. Dar-lhe as chaves do Supabase

O `.env.local` fica no teu computador e não é enviado. As variáveis têm de ser
registadas na Vercel:

```
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
```

Cola o valor de cada uma quando for pedido (os mesmos que estão no `.env.local`).

## 4. Publicar a sério

```
npx vercel --prod
```

No fim aparece o endereço, algo como `https://futsal.vercel.app`. Guarda-o.

## 5. Autorizar o endereço no Supabase

No painel do Supabase → **Authentication → URL Configuration**:

- **Site URL**: o endereço da Vercel
- **Redirect URLs**: acrescenta o mesmo endereço

Sem isto a confirmação de email manda-te para `localhost` e não funciona fora de
casa.

## 6. Instalar no iPad

Abre o endereço no Safari → **Partilhar** → **Adicionar ao ecrã principal**.

Fica um ícone com um campo de futsal, abre em ecrã inteiro sem barra do browser,
e comporta-se como uma app. Os dados continuam a ser gravados no dispositivo
primeiro e a subir para o Supabase quando há rede — um jogo inteiro num pavilhão
sem cobertura funciona na mesma.

## Depois, para atualizar

Sempre que quiseres publicar alterações:

```
npx vercel --prod
```

Se preferires que publique sozinho a cada alteração, põe o código no GitHub e
liga o repositório na Vercel (Add New → Project → Import). A partir daí, cada
`git push` publica.

## Notas

**A pasta `.env.local` nunca vai para lado nenhum.** Está no `.gitignore` e a
Vercel ignora-a. As chaves vivem nas variáveis de ambiente do projeto.

**A região está definida para Paris** (`cdg1` no `vercel.json`), que é a mais
perto se o teu projeto Supabase estiver na Europa. Menos viagem, menos espera.

**O endereço é público.** Qualquer pessoa que o conheça vê o ecrã de entrada,
mas sem conta não vê dados nenhuns — a Row Level Security garante que cada
treinador só lê os seus.
