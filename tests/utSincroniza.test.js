import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainingSessionMapper } from '../src/lib/data/mappers.js';

const base = { id: 't1', teamId: 'e1', date: '2026-11-06', startTime: '19:30', durationMin: 90, status: 'AGENDADO' };

test('a UT do treino vai para o servidor na coluna plan', () => {
  const plan = { tema: 'Transições', objetivos: '', material: '', exercicios: [{ id: 'x', parte: 'PRINCIPAL', nome: '4x4', duracao: 15, descricao: '', jogadas: [] }] };
  assert.deepEqual(trainingSessionMapper.toRow({ ...base, plan, planSujo: true }).plan, plan);
  assert.deepEqual(trainingSessionMapper.fromRow({ id: 't1', plan }).plan, plan);
});

test('a UT só vai para o servidor quando foi mudada neste aparelho', () => {
  assert.equal('plan' in trainingSessionMapper.toRow(base), false);
  assert.equal('plan' in trainingSessionMapper.toRow({ ...base, plan: null }), false);
  assert.equal('plan' in trainingSessionMapper.toRow({ ...base, plan: { tema: 'velha' } }), false);
  assert.equal(trainingSessionMapper.toRow({ ...base, plan: null, planSujo: true }).plan, null);
  assert.equal(trainingSessionMapper.fromRow({ id: 't1' }).planSujo, false);
  assert.equal(trainingSessionMapper.fromRow({ id: 't1' }).plan, null);
});
