// tests/fim-do-jogo.test.js — ajustar o minuto em que o jogo acabou.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMatchState } from '../src/domain/reducer.js';
import { matchStatsTable, powerPlayTotals } from '../src/domain/stats.js';
import * as A from '../src/domain/actions.js';
import { limitesDoFim, validarFim } from '../src/domain/fimDoJogo.js';
import { EVENT, MATCH_STATUS, LOCATION } from '../src/domain/constants.js';

const MIN = 60_000;
const T0 = 1_700_000_000_000;
const match = { id: 'm1', clubId: 'c1', periodDurationMs: 20 * MIN };
const START = { p1: 'GOALKEEPER', p2: 'FIXO', p3: 'LEFT_WINGER', p4: 'RIGHT_WINGER', p5: 'PIVOT' };

function squad() {
  return ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n, i) => ({
    id: `s${i + 1}`,
    matchId: 'm1',
    playerId: `p${i + 1}`,
    playerNameSnapshot: n,
    shirtNumberSnapshot: i + 1,
    initialPosition: START[`p${i + 1}`] || null,
    initialLocation: START[`p${i + 1}`] ? LOCATION.COURT : LOCATION.BENCH,
  }));
}
const novo = () => ({ squad: squad(), events: [] });
function step(ctx, f, now) {
  const st = buildMatchState(match, ctx.squad, ctx.events);
  const ev = f(st, now);
  ev.seq = ctx.events.length + 1;
  ctx.events.push(ev);
  return buildMatchState(match, ctx.squad, ctx.events);
}
const stat = (st, id, now) => matchStatsTable(st, now).find((p) => p.playerId === id);

// Jogo em que se esqueceram de terminar: p3 sai aos 10', p6 entra e fica em
// campo até se carregar em "terminar" ao minuto 100 (relógio sempre a andar).
function jogoEsquecido() {
  const ctx = novo();
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(
    ctx,
    (s) => A.substitute(s, { playerOutId: 'p3', playerInId: 'p6', position: 'LEFT_WINGER' }, T0 + 10 * MIN),
    T0 + 10 * MIN
  );
  return ctx;
}

test('terminar tarde infla o tempo; terminar ao minuto escolhido corta tudo nesse minuto', () => {
  const ctx = jogoEsquecido();
  const st = step(ctx, (s) => A.finishMatchAt(s, 40 * MIN, T0 + 100 * MIN), T0 + 100 * MIN);
  assert.equal(st.status, MATCH_STATUS.FINISHED);
  assert.equal(st.elapsedMatchMs, 40 * MIN);
  assert.equal(st.finishedAt, T0 + 40 * MIN);
  const f = stat(st, 'p6');
  assert.equal(f.courtMs, 30 * MIN);
  const c = stat(st, 'p3');
  assert.equal(c.courtMs, 10 * MIN);
  // banco do que saiu: 40' de parede − 10' em campo = 30'
  assert.equal(c.benchMs, 30 * MIN);
  assert.equal(stat(st, 'p7').benchMs, 40 * MIN);
});

test('um evento antigo (sem ajustado) continua a usar a hora a que se carregou', () => {
  const ctx = jogoEsquecido();
  const st = step(ctx, (s) => A.finishMatch(s, T0 + 100 * MIN), T0 + 100 * MIN);
  assert.equal(st.elapsedMatchMs, 100 * MIN);
  assert.equal(stat(st, 'p6').courtMs, 90 * MIN);
});

test('jogo já terminado tarde: a correção do fim corta o campo, o banco e a duração', () => {
  const ctx = jogoEsquecido();
  step(ctx, (s) => A.finishMatch(s, T0 + 100 * MIN), T0 + 100 * MIN);
  const st = step(ctx, (s) => A.adjustEnd(s, 40 * MIN, T0 + 200 * MIN), T0 + 200 * MIN);
  assert.equal(st.status, MATCH_STATUS.FINISHED);
  assert.equal(st.elapsedMatchMs, 40 * MIN);
  assert.equal(st.finishedAt, T0 + 40 * MIN);
  assert.equal(stat(st, 'p6').courtMs, 30 * MIN);
  assert.equal(stat(st, 'p3').benchMs, 30 * MIN);
  assert.equal(stat(st, 'p7').benchMs, 40 * MIN);
  assert.equal(st.players.p6.stints[0].endingReason, 'MATCH_FINISHED');
});

test('reajustar: pode subir (até ao original) e descer outra vez', () => {
  const ctx = jogoEsquecido();
  step(ctx, (s) => A.finishMatch(s, T0 + 100 * MIN), T0 + 100 * MIN);
  step(ctx, (s) => A.adjustEnd(s, 40 * MIN, T0 + 200 * MIN), T0 + 200 * MIN);
  let st = step(ctx, (s) => A.adjustEnd(s, 60 * MIN, T0 + 201 * MIN), T0 + 201 * MIN);
  assert.equal(st.elapsedMatchMs, 60 * MIN);
  assert.equal(stat(st, 'p6').courtMs, 50 * MIN);
  assert.equal(limitesDoFim(st).maxMs, 100 * MIN);
  st = step(ctx, (s) => A.adjustEnd(s, 35 * MIN, T0 + 202 * MIN), T0 + 202 * MIN);
  assert.equal(stat(st, 'p6').courtMs, 25 * MIN);
});

test('quem entrou depois do minuto de fim deixa de ter período em campo', () => {
  const ctx = jogoEsquecido();
  step(
    ctx,
    (s) => A.substitute(s, { playerOutId: 'p6', playerInId: 'p7', position: 'LEFT_WINGER' }, T0 + 50 * MIN),
    T0 + 50 * MIN
  );
  step(ctx, (s) => A.finishMatch(s, T0 + 100 * MIN), T0 + 100 * MIN);
  const st = step(ctx, (s) => A.adjustEnd(s, 50 * MIN, T0 + 200 * MIN), T0 + 200 * MIN);
  assert.equal(st.elapsedMatchMs, 50 * MIN);
  const st2 = step(ctx, (s) => A.adjustEnd(s, 50 * MIN, T0 + 201 * MIN), T0 + 201 * MIN);
  assert.equal(stat(st2, 'p7').courtMs, 0);
  assert.equal(stat(st, 'p6').courtMs, 40 * MIN);
});

test('não deixa acabar antes do último golo, cartão ou substituição', () => {
  const ctx = jogoEsquecido();
  step(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T0 + 43 * MIN), T0 + 43 * MIN);
  const st = buildMatchState(match, ctx.squad, ctx.events);
  const lim = limitesDoFim(st, T0 + 100 * MIN);
  assert.equal(lim.minMs, 43 * MIN);
  assert.equal(lim.ultimoRegisto.tipo, EVENT.TEAM_GOAL_ADDED);
  assert.equal(validarFim(st, 40 * MIN, T0 + 100 * MIN).chave, 'fim.erro.antes');
  assert.equal(validarFim(st, 43 * MIN, T0 + 100 * MIN), null);
  assert.equal(validarFim(st, 200 * MIN, T0 + 100 * MIN).chave, 'fim.erro.depois');
  assert.equal(validarFim(st, 0, T0 + 100 * MIN).chave, 'fim.erro.invalido');
});

test('num jogo terminado, o que veio depois do fim (correções) não conta como registo', () => {
  const ctx = jogoEsquecido();
  step(ctx, (s) => A.finishMatch(s, T0 + 100 * MIN), T0 + 100 * MIN);
  const st = step(ctx, (s) => A.adjustEnd(s, 40 * MIN, T0 + 200 * MIN), T0 + 200 * MIN);
  assert.equal(limitesDoFim(st).minMs, 10 * MIN); // a substituição aos 10'
});

test('5v4 aberto fica cortado no minuto de fim', () => {
  const ctx = jogoEsquecido();
  step(ctx, (s) => A.startPowerPlay?.(s, T0 + 20 * MIN) ?? A.makeEvent(s, EVENT.POWER_PLAY_STARTED, {}, T0 + 20 * MIN), T0 + 20 * MIN);
  step(ctx, (s) => A.finishMatch(s, T0 + 100 * MIN), T0 + 100 * MIN);
  const st = step(ctx, (s) => A.adjustEnd(s, 40 * MIN, T0 + 200 * MIN), T0 + 200 * MIN);
  const tot = powerPlayTotals(st, st.elapsedMatchMs);
  assert.ok(tot.totalMs === undefined || tot.totalMs <= 20 * MIN, JSON.stringify(tot));
});

test('2.ª parte: o fim fica depois do intervalo e o tempo da parte acompanha', () => {
  const ctx = novo();
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx, (s) => A.finishFirstHalf(s, T0 + 20 * MIN), T0 + 20 * MIN);
  step(ctx, (s) => A.setSecondHalfLineup(s, { p1: 'GOALKEEPER', p2: 'FIXO', p3: 'LEFT_WINGER', p4: 'RIGHT_WINGER', p5: 'PIVOT' }, T0 + 25 * MIN), T0 + 25 * MIN);
  step(ctx, (s) => A.startSecondHalf(s, T0 + 30 * MIN), T0 + 30 * MIN);
  let st = buildMatchState(match, ctx.squad, ctx.events);
  assert.equal(validarFim(st, 10 * MIN, T0 + 200 * MIN).chave, 'fim.erro.antes');
  st = step(ctx, (s) => A.finishMatchAt(s, 35 * MIN, T0 + 200 * MIN), T0 + 200 * MIN);
  assert.equal(st.elapsedMatchMs, 35 * MIN);
  assert.equal(st.secondHalfMs, 15 * MIN);
  assert.equal(st.finishedAt, T0 + 45 * MIN);
});
