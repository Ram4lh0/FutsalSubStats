// Mapa de calor dos remates: os pontos contados por zona 5 m × 5 m.
import test from 'node:test';
import assert from 'node:assert/strict';
import { zonasDeCalor } from '../src/domain/registos.js';

test('zonasDeCalor: conta por zona, golos à parte, ignora pontos sem sítio', () => {
  const z = zonasDeCalor([
    { x: 0.9, y: 0.5, resultado: 'GOLO' },
    { x: 0.93, y: 0.6, resultado: 'DEFENDIDO' },
    { x: 0.1, y: 0.1 },
    { x: null, y: null },
    { x: 1, y: 1 }, // canto: fica na última zona, não fora da grelha
  ]);
  assert.equal(z.celulas.length, 32);
  assert.equal(z.total, 4);
  const em = (col, lin) => z.celulas.find((c) => c.col === col && c.lin === lin);
  assert.deepEqual([em(7, 2).n, em(7, 2).golos], [2, 1]);
  assert.equal(em(0, 0).n, 1);
  assert.equal(em(7, 3).n, 1);
  assert.equal(z.max, 2);
});

test('zonasDeCalor: sem pontos dá tudo a zero', () => {
  const z = zonasDeCalor([]);
  assert.equal(z.total, 0);
  assert.equal(z.max, 0);
});
