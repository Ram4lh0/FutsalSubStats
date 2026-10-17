<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Features novas nascem como add-on

Qualquer feature nova para treinadores (uma vista no painel da época, um passo
extra no registo do jogo, um bloco no intervalo ou no resumo, algo no treino)
nasce como **add-on desligado por omissão**, que se liga escalão a escalão no
painel de administração (`npm run painel`, "gerir" de cada conta). Não é
preciso pedir: faz parte de implementar a feature.

1. Entrada em `ADDONS` em `src/domain/addons.js`: id estável, `grupo`, `nome`
   (como aparece no painel), `depende` (ex.: `['remate']`). O painel mostra-a
   sozinho, no grupo certo.
2. No ecrã: `const addons = useAddons(teamId)` (`src/lib/useAddons.js`) e só
   mostrar a feature com `addons.has('o-id')`.
3. Testes em `tests/addons.test.js` (o teste do catálogo apanha ids repetidos,
   grupos e dependências que não existem).
4. Desligar um add-on esconde a feature, nunca apaga dados. Dados novos vão
   em campos novos (por exemplo em `metadata` dos eventos), nunca mudando o
   significado do que já está gravado.

Exceções, só se o António disser: correções, melhorias a algo que já existe
para todos, e features que ele diga explicitamente que são para todos
(`paraTodos: true` no catálogo).

A config é do escalão (`team_stat_config.addons`, e `registos` para os
registos extra): quem tem acesso a um escalão herda os add-ons dele.
