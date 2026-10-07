// tests/escaloes.test.js — os escalões aparecem do mais velho para o mais novo.

import test from 'node:test';
import assert from 'node:assert/strict';

import { compararEscaloes, idadeDoEscalao } from '../src/domain/escaloes.js';

const ordenar = (nomes) => nomes.map((name) => ({ name })).sort(compararEscaloes).map((t) => t.name);

test('seniores primeiro, depois os sub do mais velho para o mais novo', () => {
  assert.deepEqual(
    ordenar(['Sub-11', 'Sub-13', 'Seniores', 'Sub-9', 'Sub-15']),
    ['Seniores', 'Sub-15', 'Sub-13', 'Sub-11', 'Sub-9'],
  );
});

test('reconhece os nomes tradicionais e as variantes de "sub"', () => {
  assert.equal(idadeDoEscalao('Juniores'), 19);
  assert.equal(idadeDoEscalao('Iniciados B'), 15);
  assert.equal(idadeDoEscalao('U17'), 17);
  assert.equal(idadeDoEscalao('sub 13 femininos'), 13);
  assert.equal(idadeDoEscalao('Prebenjamín'), 9);
});

test('nomes que não se reconhecem vão para o fim, por ordem alfabética', () => {
  assert.deepEqual(
    ordenar(['Equipa B', 'Sub-11', 'Academia', 'Seniores']),
    ['Seniores', 'Sub-11', 'Academia', 'Equipa B'],
  );
});

test('o mesmo escalão desempata pelo nome', () => {
  assert.deepEqual(ordenar(['Sub-13 B', 'Sub-13 A', 'Infantis']), ['Infantis', 'Sub-13 A', 'Sub-13 B']);
});
