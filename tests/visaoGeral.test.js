import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  andarSemanas,
  compararEscaloes,
  evolucaoSemanal,
  inicioDaSemana,
  resumoDoClube,
  semanaDe,
  semanaPorOmissao,
} from '../src/domain/visaoGeral.js';
import { ADDONS, addonsAtivos } from '../src/domain/addons.js';
import { MATCH_STATUS } from '../src/domain/constants.js';

// Sábado e domingo, 17 e 18 de outubro de 2026, à hora local.
const SAB = new Date(2026, 9, 17, 15, 0).getTime();
const DOM = new Date(2026, 9, 18, 11, 0).getTime();
const SAB_ANTERIOR = new Date(2026, 9, 10, 15, 0).getTime();

const jogo = (id, ts, status, nos, eles) => ({
  match: { id, scheduledAt: new Date(ts).toISOString(), opponentName: `Adv ${id}` },
  state: { status, teamScore: nos, opponentScore: eles },
});
const { FINISHED, DRAFT, SECOND_HALF_RUNNING } = MATCH_STATUS;

const escaloes = [
  {
    team: { id: 'sen', name: 'Seniores' },
    entries: [jogo('s1', SAB, FINISHED, 4, 2), jogo('s0', SAB_ANTERIOR, FINISHED, 1, 3)],
  },
  { team: { id: 's17', name: 'Sub-17' }, entries: [jogo('j1', DOM, FINISHED, 1, 1)] },
  { team: { id: 's15', name: 'Sub-15' }, entries: [jogo('i1', DOM, SECOND_HALF_RUNNING, 0, 2)] },
  { team: { id: 's13', name: 'Sub-13' }, entries: [jogo('n1', DOM, DRAFT, 0, 0)] },
  { team: { id: 's11', name: 'Sub-11' }, entries: [] },
];

test('a semana vai de segunda a domingo', () => {
  const inicio = new Date(inicioDaSemana(DOM));
  assert.equal(inicio.getDay(), 1);
  assert.equal(inicio.getDate(), 12);
  const s = semanaDe(SAB);
  assert.ok(SAB >= s.inicio && DOM < s.fim);
  assert.equal(new Date(andarSemanas(s, -1).inicio).getDate(), 5);
});

test('abre na semana atual se já se jogou, senão na do último jogo', () => {
  assert.equal(semanaPorOmissao(escaloes, DOM + 3600_000).inicio, semanaDe(SAB).inicio);
  // Terça-feira seguinte: ainda o fim de semana que passou.
  const terca = new Date(2026, 9, 20, 10).getTime();
  assert.equal(semanaPorOmissao(escaloes, terca).inicio, semanaDe(SAB).inicio);
  // Só com um jogo por jogar na semana, fica a anterior.
  const soAgendado = [{ team: { id: 'x' }, entries: [jogo('a', SAB_ANTERIOR, FINISHED, 1, 0), jogo('b', SAB, DRAFT, 0, 0)] }];
  assert.equal(semanaPorOmissao(soAgendado, DOM).inicio, semanaDe(SAB_ANTERIOR).inicio);
});

test('o resumo da semana conta resultados e golos', () => {
  const r = resumoDoClube(escaloes, semanaDe(SAB));
  assert.deepEqual(r.totais, {
    jogos: 4,
    terminados: 2,
    vitorias: 1,
    empates: 1,
    derrotas: 0,
    // O jogo a decorrer entra nos golos, não nos resultados.
    marcados: 5,
    sofridos: 5,
    aDecorrer: 1,
    agendados: 1,
  });
  assert.deepEqual(r.escaloes.map((e) => e.jogos.length), [1, 1, 1, 1, 0]);
});

test('na época toda entram todos os jogos', () => {
  const r = resumoDoClube(escaloes, null);
  assert.equal(r.totais.jogos, 5);
  assert.equal(r.escaloes[0].totais.derrotas, 1);
});

test('a comparação deixa de fora quem não jogou e ordena', () => {
  const r = resumoDoClube(escaloes, semanaDe(SAB));
  const sofridos = compararEscaloes(r, 'sofridos');
  assert.deepEqual(sofridos.map((l) => l.team.id), ['sen', 's15', 's17']);
  assert.deepEqual(compararEscaloes(r, 'diferenca').map((l) => l.valor), [2, 0, -2]);
});

test('a visão geral é um add-on desligado por omissão', () => {
  assert.ok(ADDONS['visao-geral-clube']);
  assert.ok(!ADDONS['visao-geral-clube'].paraTodos);
  assert.ok(!addonsAtivos(null).has('visao-geral-clube'));
  assert.ok(addonsAtivos({ addons: ['visao-geral-clube'] }).has('visao-geral-clube'));
});

test('a evolução tem uma linha por semana com jogos terminados, e o acumulado', () => {
  const ev = evolucaoSemanal(escaloes);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].inicio, semanaDe(SAB_ANTERIOR).inicio);
  assert.deepEqual([ev[0].semana.vitorias, ev[0].semana.derrotas], [0, 1]);
  // Na semana de 17–18: a vitória dos Seniores e o empate dos Sub-17 (o jogo
  // a decorrer e o por jogar ficam de fora).
  assert.deepEqual([ev[1].semana.vitorias, ev[1].semana.empates, ev[1].semana.marcados], [1, 1, 5]);
  assert.deepEqual([ev[1].acumulado.vitorias, ev[1].acumulado.derrotas, ev[1].acumulado.sofridos], [1, 1, 6]);
});
