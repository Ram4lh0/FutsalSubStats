// tests/jogada.test.js — as jogadas do quadro tático e a animação entre frames.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acrescentarFrame,
  apagarFrame,
  duracaoTotal,
  frameNoInstante,
  jogadaNova,
  moverPeca,
  normalizar,
  posicoesNoInstante,
  resolverPosicoes,
  tirarPeca,
} from '../src/domain/jogada.js';

function exemplo() {
  // Um jogador que corre em linha reta em dois frames, e outro parado.
  return normalizar({
    campo: 'inteiro',
    pecas: [
      { id: 'a', tipo: 'jogador', lado: 'nos', num: 7 },
      { id: 'b', tipo: 'jogador', lado: 'nos', num: 9 },
    ],
    frames: [
      { dur: 1000, pos: { a: [100, 100], b: [500, 250] } },
      { dur: 1000, pos: { a: [300, 100] } },
      { dur: 2000, pos: { a: [500, 100] } },
    ],
  });
}

test('um frame herda as posições que não escreve', () => {
  const r = resolverPosicoes(exemplo());
  assert.deepEqual(r[2].b, [500, 250]);
  assert.deepEqual(r[1].a, [300, 100]);
});

test('a duração é a soma das passagens (o primeiro frame não conta)', () => {
  assert.equal(duracaoTotal(exemplo()), 3000);
  assert.equal(frameNoInstante(exemplo(), 0), 0);
  assert.equal(frameNoInstante(exemplo(), 1000), 1);
  assert.equal(frameNoInstante(exemplo(), 2999), 1);
  assert.equal(frameNoInstante(exemplo(), 3000), 2);
});

test('nos frames as peças estão exatamente onde foram postas', () => {
  const d = exemplo();
  assert.deepEqual(posicoesNoInstante(d, 0).a, [100, 100]);
  assert.deepEqual(posicoesNoInstante(d, 1000).a.map(Math.round), [300, 100]);
  assert.deepEqual(posicoesNoInstante(d, 3000).a, [500, 100]);
});

test('entre frames a peça desliza — não salta — e quem está parado não mexe', () => {
  const d = exemplo();
  let anterior = posicoesNoInstante(d, 0).a[0];
  for (let t = 50; t <= 3000; t += 50) {
    const x = posicoesNoInstante(d, t).a[0];
    assert.ok(x >= anterior - 0.001, `andou para trás em t=${t}`);
    assert.ok(x - anterior < 30, `salto de ${x - anterior} em t=${t}`);
    anterior = x;
    assert.deepEqual(posicoesNoInstante(d, t).b, [500, 250]);
  }
});

test('parte do repouso devagar, e não para no frame do meio', () => {
  const d = exemplo();
  // Primeiros 100 ms: a partir do repouso anda menos do que em linha reta.
  const inicio = posicoesNoInstante(d, 100).a[0] - 100;
  assert.ok(inicio < 20, `arranque demasiado brusco: ${inicio}`);
  // À volta do frame do meio (1000 ms) continua a andar: o movimento segue.
  const antes = posicoesNoInstante(d, 950).a[0];
  const depois = posicoesNoInstante(d, 1050).a[0];
  assert.ok(depois - antes > 5, 'parou no frame do meio');
});

test('apagar um frame do meio não muda as posições dos que ficam', () => {
  const d = exemplo();
  const sem = apagarFrame(d, 1);
  const r = resolverPosicoes(sem);
  assert.equal(sem.frames.length, 2);
  assert.deepEqual(r[1].a, [500, 100]);
  // Apagar o primeiro: o segundo passa a ser a partida, com tudo escrito.
  const semPrimeiro = apagarFrame(d, 0);
  assert.deepEqual(resolverPosicoes(semPrimeiro)[0], { a: [300, 100], b: [500, 250] });
});

test('editar: frame novo herda tudo, mover só mexe nesse frame', () => {
  let d = jogadaNova('meio');
  d = acrescentarFrame(d, 0);
  d = moverPeca(d, 1, 'n5', [950, 300]);
  const r = resolverPosicoes(d);
  assert.deepEqual(r[1].n5, [950, 300]);
  assert.notDeepEqual(r[0].n5, [950, 300]);
  d = tirarPeca(d, 'n5');
  assert.equal(d.pecas.some((p) => p.id === 'n5'), false);
  assert.equal('n5' in d.frames[1].pos, false);
});

test('mover limita ao campo', () => {
  const d = moverPeca(jogadaNova('inteiro'), 0, 'bola', [1200, -30]);
  assert.deepEqual(d.frames[0].pos.bola, [1000, 0]);
});

test('normalizar aguenta dados estragados', () => {
  const d = normalizar({ frames: [{ dur: -1 }], pecas: [null, { id: 'x' }] });
  assert.equal(d.frames[0].dur, 1000);
  assert.equal(d.pecas.length, 1);
  assert.equal(d.campo, 'meio');
  assert.equal(normalizar(null).frames.length, 1);
});
