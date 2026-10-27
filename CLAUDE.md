@AGENTS.md

## Contexto deste projeto
- Começa por `CONTEXTO-DO-PROJETO.md` (mapa técnico) e, se precisares de perceber o código, por `graphify-out/GRAPH_REPORT.md`: mapa do código gerado pelo Graphify, com as comunidades (ex.: "Faturação e checkout Stripe", "Ecrã do jogo ao vivo") e os pontos centrais. Usa-o para saber que ficheiros uma alteração toca antes de pesquisar o repositório inteiro.
- O mapa pode estar desatualizado: compara o commit indicado no relatório com `git rev-parse HEAD` e, se for preciso, corre `graphify update .` (sem custo de API).
- Decisões de produto, feedback de treinadores e estado comercial vivem no cérebro: `C:\Cerebro_Obsidian\cerebro\01-futsal-substats\`. Quando uma decisão importante for tomada aqui, regista-a em `decisoes/` lá.
