# Reducer da versão 1.8.2

Cópia intocada de `src/domain/reducer.js` e das suas dependências no commit
`7efc040` (versão 1.8.2, a que está nos telemóveis quando chegam os registos
por escalão). Serve só para `tests/registos.test.js` provar que uma versão
antiga, ao ler um jogo com eventos `STAT_*`, dá o mesmo resultado e os mesmos
tempos.

Não editar. Para regenerar:

    git show 7efc040:src/domain/reducer.js > tests/fixtures/reducer-1.8.2/reducer.js
