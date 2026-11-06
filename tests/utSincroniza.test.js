import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainingSessionMapper } from '../src/lib/data/mappers.js';

const base = { id: 't1', teamId: 'e1', date: '2026-11-06', startTime: '19:30', durationMin: 90, status: 'AGENDADO' };

test('a UT do treino vai para o servidor na coluna plan', () => {
  const plan = { tema: 'Transições', objetivos: '', material: '', exercicios: [{ id: 'x', parte: 'PRINCIPAL', nome: '4x4', duracao: 15, descricao: '', jogadas: [] }] };
  assert.deepEqual(trainingSessionMapper.toRow({ ...base, plan }).plan, plan);
  assert.deepEqual(trainingSessionMapper.fromRow({ id: 't1', plan }).plan, plan);
});

test('uma linha que ainda não conhece a UT não a apaga no servidor', () => {
  assert.equal('plan' in trainingSessionMapper.toRow(base), false);
  assert.equal(trainingSessionMapper.toRow({ ...base, plan: null }).plan, null);
  assert.equal(trainingSessionMapper.fromRow({ id: 't1' }).plan, null);
});
