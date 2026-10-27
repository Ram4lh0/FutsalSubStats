// tests/feedback-rapido.test.js — quando aparece o ícone de feedback da barra de
// topo e o que ele envia.

import test from 'node:test';
import assert from 'node:assert/strict';

import { mostrarFeedbackRapido, plataformaDe, linhaFeedback, MAX_TEXTO } from '../src/lib/feedbackRapido.js';

test('o ícone só aparece com sessão, fora da demonstração e fora do jogo ao vivo', () => {
  const base = { userId: 'u1', demo: false, pathname: '/team/dashboard' };
  assert.equal(mostrarFeedbackRapido(base), true);
  assert.equal(mostrarFeedbackRapido({ ...base, userId: null }), false);
  assert.equal(mostrarFeedbackRapido({ ...base, demo: true }), false);
  assert.equal(mostrarFeedbackRapido({ ...base, pathname: '/match/live/' }), false);
  // Os outros ecrãs do jogo (relatório, edição) continuam a ter o ícone.
  assert.equal(mostrarFeedbackRapido({ ...base, pathname: '/match/report' }), true);
});

test('a plataforma é ios, android ou web', () => {
  assert.equal(plataformaDe({ getPlatform: () => 'ios' }), 'ios');
  assert.equal(plataformaDe({ getPlatform: () => 'android' }), 'android');
  assert.equal(plataformaDe({ getPlatform: () => 'electron' }), 'web');
  assert.equal(plataformaDe(undefined), 'web');
});

test('a linha enviada vem limpa e dentro dos limites da tabela', () => {
  assert.equal(linhaFeedback({ texto: '   ' }), null);
  const l = linhaFeedback({ texto: '  o botão é pequeno  ', pathname: '/team', versao: '1.17.0', plataforma: 'ios' });
  assert.deepEqual(l, { texto: 'o botão é pequeno', ecra: '/team', versao: '1.17.0', plataforma: 'ios' });
  const longo = linhaFeedback({ texto: 'a'.repeat(MAX_TEXTO + 10), plataforma: 'web' });
  assert.equal(longo.texto.length, MAX_TEXTO);
  assert.equal(longo.ecra, null);
  assert.equal(longo.versao, null);
});
