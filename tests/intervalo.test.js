// tests/intervalo.test.js — os números que o ecrã do intervalo desenha.
//
// Estados montados à mão, como em dashboard.test.js: o que se testa é a
// leitura, não o reducer.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  amarelosAdversario,
  faltasPorJogador,
  golosPorTipoNoJogo,
  mediaEmCampo,
} from '../src/domain/intervalo.js';

test('média em campo conta com quem ainda não jogou', () => {
  const linhas = [{ courtMs: 600_000 }, { courtMs: 300_000 }, { courtMs: 0 }];
  assert.equal(mediaEmCampo(linhas), 300_000);
  assert.equal(mediaEmCampo([]), 0);
});

test('faltas: só quem fez, da mais para a menos, e em risco quem tem amarelo', () => {
  const linhas = [
    { playerId: 'a', number: 4, name: 'A', fouls: 1, yellows: 0, reds: 0 },
    { playerId: 'b', number: 7, name: 'B', fouls: 0, yellows: 0, reds: 0 },
    { playerId: 'c', number: 9, name: 'C', fouls: 3, yellows: 1, reds: 0 },
    { playerId: 'd', number: 10, name: 'D', fouls: 1, yellows: 1, reds: 0 },
    { playerId: 'e', number: 11, name: 'E', fouls: 2, yellows: 2, reds: 1 },
  ];
  const r = faltasPorJogador(linhas);
  assert.deepEqual(
    r.map((x) => [x.playerId, x.fouls, x.emRisco]),
    [
      ['c', 3, true],
      ['e', 2, false], // já expulso: deixou de estar «em risco»
      ['d', 1, true],
      ['a', 1, false],
    ]
  );
});

test('amarelos do adversário: à bica primeiro, expulsos depois', () => {
  const state = {
    opponentCards: [
      { number: 10, matchElapsedMs: 120_000, secondYellow: false },
      { number: 7, matchElapsedMs: 300_000, secondYellow: false },
      { number: 10, matchElapsedMs: 900_000, secondYellow: true },
      { number: 3, matchElapsedMs: 600_000, secondYellow: false },
    ],
  };
  const r = amarelosAdversario(state);
  assert.deepEqual(
    r.map((x) => [x.number, x.expulso, x.amarelosMs]),
    [
      [3, false, [600_000]],
      [7, false, [300_000]],
      [10, true, [120_000, 900_000]],
    ]
  );
  assert.deepEqual(amarelosAdversario({}), []);
});

test('tipos de golo de um jogo: ignora golos sem tipo e separa marcados de sofridos', () => {
  const state = {
    goals: [
      { team: 'US', howScored: 'TRANSICAO' },
      { team: 'US', howScored: 'TRANSICAO' },
      { team: 'US', howScored: null },
      { team: 'THEM', howScored: 'ERRO_INDIVIDUAL' },
      { team: 'THEM', howScored: 'CANTO' },
    ],
  };
  const nossos = Object.fromEntries(golosPorTipoNoJogo(state, 'US').map((f) => [f.chave, f.valor]));
  assert.equal(nossos.TRANSICAO, 2);
  assert.equal(Object.values(nossos).reduce((a, b) => a + b, 0), 2);
  assert.equal('ERRO_INDIVIDUAL' in nossos, false);

  const deles = Object.fromEntries(golosPorTipoNoJogo(state, 'THEM').map((f) => [f.chave, f.valor]));
  assert.equal(deles.ERRO_INDIVIDUAL, 1);
  assert.equal(deles.CANTO, 1);
});
