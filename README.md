# Futsal ao Vivo — versão Next.js + Supabase

A app de acompanhamento de jogos, agora com contas e dados na nuvem. Continua a
funcionar sem rede: tudo se grava primeiro no dispositivo e sobe quando houver
ligação.

## Arranque em cinco passos

### 1. Criar o projeto Supabase

Em [supabase.com](https://supabase.com) → **New project**. Guardar a palavra-passe
da base de dados. A região mais próxima é a melhor escolha.

### 2. Correr as migrações

No painel do Supabase → **SQL Editor** → colar e executar, por esta ordem:

1. `supabase/migrations/0001_init.sql` — tabelas, tipos, Row Level Security
2. `supabase/migrations/0002_apelidos_e_tempo.sql` — apelidos e tipo de tempo

### 3. Configurar a app

```bash
cp .env.local.example .env.local
```

Preencher com os valores de **Project Settings → API**:

- `NEXT_PUBLIC_SUPABASE_URL` — o endereço do projeto
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — a chave `anon` (é pública por desenho: quem
  protege os dados é a Row Level Security, não o segredo da chave)

### 4. Instalar e correr

```bash
npm install
npm run dev
```

A app fica em `http://localhost:3000`. Para abrir no iPad da mesma rede, usar o
endereço IP do computador em vez de `localhost`.

### 5. Testes

```bash
npm test
```

Corre os cálculos do domínio e a fila de sincronização (com um servidor
simulado, sem rede).

## Como está organizado

| Pasta | O que lá está |
| --- | --- |
| `src/domain` | Regras do jogo. Não sabe o que é um ecrã nem uma base de dados. |
| `src/lib/data` | Cópia local (IndexedDB), tradução para SQL e fila de sincronização. |
| `src/lib/supabase` | O cliente. É o único ficheiro que conhece o Supabase. |
| `src/app` | Páginas (App Router). |
| `src/components` | Peças de interface reutilizadas. |
| `supabase/migrations` | Esquema da base de dados. |

## Decisões que valem a pena conhecer

**O jogo é uma lista de eventos.** O estado nunca é guardado; é recalculado a
partir dos eventos sempre que é preciso. Corrigir um engano é acrescentar um
evento, não apagar história.

**Escrever é local; sincronizar é depois.** Nenhuma ação do jogo espera pelo
servidor. Um jogo inteiro decorre sem rede e sobe no fim.

**Reenviar é seguro.** Cada evento leva um identificador próprio e o servidor
ignora repetições, por isso uma ligação que vai e vem nunca duplica um golo.

**Sem Supabase configurado a app continua a funcionar**, guardada apenas no
dispositivo — útil para experimentar antes de montar o resto.

## Páginas

| Rota | O que faz |
| --- | --- |
| `/login` | Entrar ou criar conta. |
| `/dashboard` | Os meus clubes, backup e restauro, atalho para um jogo em curso. |
| `/clubs/new`, `/clubs/[id]/edit` | Dados do clube, incluindo apelido e tipo de tempo. |
| `/clubs/[id]` | Resumo: totais e últimos jogos. |
| `/clubs/[id]/roster` | Plantel com filtros, ordenação e exportação. |
| `/clubs/[id]/matches` | Histórico de jogos. |
| `/clubs/[id]/statistics` | Estatísticas por jogador. |
| `/clubs/[id]/players/…` | Criar, editar e ficha do jogador. |
| `/clubs/[id]/matches/new` | Assistente de criação em quatro etapas. |
| `/matches/[id]/setup` | Convocatória e cinco inicial. |
| `/matches/[id]/live` | O jogo: cronómetro, campo, banco, sanções e intervalo. |
| `/matches/[id]/summary` | Resumo, correções e exportação. |
| `/matches/[id]/events` | Histórico de ações, com anulação. |

## O que ficou por verificar

O ambiente onde este código foi escrito não tem acesso ao registo npm, por isso
os testes cobrem o domínio e a sincronização (que correm em Node puro) mas as
páginas React nunca foram abertas num browser. Se algo falhar no arranque, o
erro do `npm run dev` diz logo onde.
