// tests/domain.test.js — corre com `npm test` (node --test).
// Simula um jogo completo e verifica os cálculos da secção 8 da especificação.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMatchState,
  countOnCourt,
  foulsInPeriod,
  foulsTotal,
  powerPlayAtivo,
} from '../src/domain/reducer.js';
import { readClock, fmt, periodProgress } from '../src/domain/clock.js';
import {
  clubAggregate,
  playerMatchStats,
  powerPlayTotals,
  powerPlayAggregate,
} from '../src/domain/stats.js';
import * as A from '../src/domain/actions.js';
import * as V from '../src/domain/validation.js';
import {
  penaltyBoard,
  openPenalties,
  canStartPenalty,
  canReplaceExpelled,
  PENALTY_STATUS,
} from '../src/domain/penalties.js';
import {
  EVENT,
  MATCH_STATUS,
  PLAYER_MATCH_STATUS,
  LOCATION,
  FOUL_LIMIT,
  timingOf,
  timingConfig,
} from '../src/domain/constants.js';

const MIN = 60_000;
const T0 = 1_700_000_000_000;

const match = { id: 'm1', clubId: 'c1', periodDurationMs: 20 * MIN };

const NAMES = ['Ana', 'Bruno', 'Carlos', 'Diogo', 'Eduardo', 'Filipe', 'Gonçalo', 'Hugo'];
const START = {
  p1: 'GOALKEEPER',
  p2: 'FIXO',
  p3: 'LEFT_WINGER',
  p4: 'RIGHT_WINGER',
  p5: 'PIVOT',
};

function makeSquad() {
  return NAMES.map((name, i) => {
    const id = `p${i + 1}`;
    return {
      id: `s${i + 1}`,
      matchId: 'm1',
      playerId: id,
      playerNameSnapshot: name,
      shirtNumberSnapshot: i + 1,
      initialPosition: START[id] || null,
      initialLocation: START[id] ? LOCATION.COURT : LOCATION.BENCH,
    };
  });
}

/** Grava um evento como a aplicação faz: cria a partir do estado actual e reconstrói. */
function step(ctx, factory, now) {
  const st = buildMatchState(match, ctx.squad, ctx.events);
  const ev = factory(st, now);
  ev.seq = ctx.events.length + 1;
  ctx.events.push(ev);
  return buildMatchState(match, ctx.squad, ctx.events);
}

function playFullMatch() {
  const ctx = { squad: makeSquad(), events: [] };
  let st;

  st = step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  st = step(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T0 + 1 * MIN), T0 + 1 * MIN);

  // 2' — sai Carlos (ala esquerdo), entra Filipe
  st = step(
    ctx,
    (s) => A.substitute(s, { playerOutId: 'p3', playerInId: 'p6', position: 'LEFT_WINGER' }, T0 + 2 * MIN),
    T0 + 2 * MIN
  );

  // 5' — relógio parado durante 1 minuto real
  st = step(ctx, (s) => A.pauseClock(s, T0 + 5 * MIN), T0 + 5 * MIN);
  st = step(ctx, (s) => A.resumeClock(s, T0 + 6 * MIN), T0 + 6 * MIN);

  st = step(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T0 + 8 * MIN), T0 + 8 * MIN);

  // 10' de jogo (chegamos lá aos 11' reais por causa da pausa)
  st = step(ctx, (s) => A.finishFirstHalf(s, T0 + 11 * MIN), T0 + 11 * MIN);

  // Intervalo de 5 minutos reais — não conta para ninguém.
  const T1 = T0 + 16 * MIN;
  const lineup = {
    GOALKEEPER: 'p1',
    FIXO: 'p2',
    LEFT_WINGER: 'p6',
    RIGHT_WINGER: 'p4',
    PIVOT: 'p7',
  };
  st = step(ctx, (s) => A.setSecondHalfLineup(s, lineup, T1), T1);
  st = step(ctx, (s) => A.startSecondHalf(s, T1), T1);

  st = step(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T1 + 1 * MIN), T1 + 1 * MIN);
  st = step(ctx, (s) => A.expelPlayer(s, { playerId: 'p2' }, T1 + 3 * MIN), T1 + 3 * MIN);
  st = step(ctx, (s) => A.finishMatch(s, T1 + 10 * MIN), T1 + 10 * MIN);

  return { ctx, st };
}

test('relógio: acumulado + tempo desde o arranque', () => {
  const st = { timerStatus: 'RUNNING', timerStartedAt: T0, elapsedMatchMs: 5000, periodElapsedMs: 5000 };
  assert.equal(readClock(st, T0 + 3000).matchMs, 8000);
  const paused = { ...st, timerStatus: 'PAUSED', timerStartedAt: null };
  assert.equal(readClock(paused, T0 + 99999).matchMs, 5000);
});

test('fmt formata MM:SS e aceita minutos acima de 59', () => {
  assert.equal(fmt(0), '00:00');
  assert.equal(fmt(160_000), '02:40');
  assert.equal(fmt(65 * MIN), '65:00');
});

test('a duração da parte é uma referência: o relógio passa dela sem parar', () => {
  const ctx = { squad: makeSquad(), events: [] };
  let st = step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const limit = match.periodDurationMs; // 20 minutos

  const aos5 = periodProgress(st, limit, T0 + 5 * MIN);
  assert.equal(aos5.over, false);
  assert.equal(fmt(aos5.remainingMs), '15:00');
  assert.equal(aos5.overtimeMs, 0);

  const aos20 = periodProgress(st, limit, T0 + 20 * MIN);
  assert.equal(aos20.over, true, 'aos 20:00 certos já está no limite');

  // Passado o limite o cronómetro continua — quem termina a parte é o utilizador.
  const aos23 = periodProgress(st, limit, T0 + 23 * MIN);
  assert.equal(aos23.over, true);
  assert.equal(fmt(aos23.overtimeMs), '03:00');
  assert.equal(fmt(aos23.periodMs), '23:00');
  assert.equal(st.status, MATCH_STATUS.FIRST_HALF_RUNNING, 'não pára sozinho');

  // E o tempo a mais conta para os jogadores como qualquer outro.
  st = step(ctx, (s) => A.finishFirstHalf(s, T0 + 23 * MIN), T0 + 23 * MIN);
  assert.equal(st.firstHalfMs, 23 * MIN);
  assert.equal(playerMatchStats(st.players.p1, st.elapsedMatchMs).courtMs, 23 * MIN);
});

test('o cinco inicial conta como primeira entrada de cada jogador', () => {
  const ctx = { squad: makeSquad(), events: [] };
  const st = step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  assert.equal(countOnCourt(st), 5);
  for (const id of Object.keys(START)) assert.equal(st.players[id].stints.length, 1);
  assert.equal(st.players.p6.stints.length, 0);
});

test('o tempo não avança com o cronómetro parado', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const st = step(ctx, (s) => A.pauseClock(s, T0 + 5 * MIN), T0 + 5 * MIN);
  assert.equal(readClock(st, T0 + 30 * MIN).matchMs, 5 * MIN);
  assert.equal(st.status, MATCH_STATUS.FIRST_HALF_PAUSED);
});

test('jogo completo: tempos em campo, banco e entradas', () => {
  const { st } = playFullMatch();
  const clock = st.elapsedMatchMs;

  assert.equal(st.status, MATCH_STATUS.FINISHED);
  assert.equal(clock, 20 * MIN, 'o intervalo e a pausa não contam para o tempo de jogo');
  assert.equal(st.teamScore, 2);
  assert.equal(st.opponentScore, 1);
  assert.equal(st.halftimeTeamScore, 2);
  assert.equal(st.halftimeOpponentScore, 0);
  assert.equal(st.firstHalfMs, 10 * MIN);
  assert.equal(st.secondHalfMs, 10 * MIN);

  const s = (id) => playerMatchStats(st.players[id], clock);

  // Ana: as duas partes inteiras
  assert.equal(s('p1').courtMs, 20 * MIN);
  assert.equal(s('p1').entries, 2, 'começar a 2.ª parte cria uma nova entrada');
  assert.equal(s('p1').benchMs, 0);

  // Carlos: só os primeiros 2 minutos
  assert.equal(s('p3').courtMs, 2 * MIN);
  assert.equal(s('p3').entries, 1);
  assert.equal(s('p3').benchMs, 18 * MIN);

  // Filipe: entrou aos 2' e fez a 2.ª parte inteira
  assert.equal(s('p6').courtMs, 18 * MIN);
  assert.equal(s('p6').entries, 2);
  assert.equal(s('p6').avgStintMs, 9 * MIN);
  assert.equal(s('p6').benchMs, 2 * MIN);
  assert.equal(s('p6').longestStintMs, 10 * MIN);

  // Bruno: expulso aos 13' de jogo — o tempo posterior não conta como banco
  const bruno = s('p2');
  assert.equal(bruno.expelled, true);
  assert.equal(st.players.p2.expelledAtMatchMs, 13 * MIN);
  assert.equal(bruno.courtMs, 13 * MIN);
  assert.equal(bruno.benchMs, 0);
  assert.equal(bruno.entries, 2);

  // Hugo: convocado mas nunca jogou
  assert.equal(s('p8').courtMs, 0);
  assert.equal(s('p8').entries, 0);
  assert.equal(s('p8').benchMs, 20 * MIN);

  // Gonçalo: só a 2.ª parte
  assert.equal(s('p7').courtMs, 10 * MIN);
  assert.equal(s('p7').entries, 1);
  assert.equal(s('p7').benchMs, 10 * MIN);
});

test('o intervalo não pode ser "retomado" como se fosse a primeira parte', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  let st = step(ctx, (s) => A.finishFirstHalf(s, T0 + 10 * MIN), T0 + 10 * MIN);
  assert.equal(st.status, MATCH_STATUS.HALFTIME);

  // Um evento de relógio no intervalo é ignorado: sem esta guarda, o jogo voltava
  // a "1.ª parte a correr" com o campo vazio e sem forma de sair.
  st = step(ctx, (s) => A.resumeClock(s, T0 + 12 * MIN), T0 + 12 * MIN);
  assert.equal(st.status, MATCH_STATUS.HALFTIME);
  assert.equal(st.timerStatus, 'PAUSED');
  assert.equal(readClock(st, T0 + 30 * MIN).matchMs, 10 * MIN);
});

test('a expulsão deixa a equipa em inferioridade e impede o regresso', () => {
  const { ctx } = playFullMatch();
  const beforeFinish = ctx.events.filter((e) => e.eventType !== EVENT.MATCH_FINISHED);
  const st = buildMatchState(match, ctx.squad, beforeFinish);
  assert.equal(countOnCourt(st), 4);
  assert.equal(st.players.p2.status, PLAYER_MATCH_STATUS.EXPELLED);
  assert.ok(V.validateSubstitution(st, { playerOutId: 'p1', playerInId: 'p2' }));
  assert.equal(V.validateReplacement(st, { playerInId: 'p8', position: 'FIXO' }), null);
});

test('os 2 minutos só arrancam quando o utilizador manda', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  let st = step(ctx, (s) => A.expelPlayer(s, { playerId: 'p2' }, T0 + 5 * MIN), T0 + 5 * MIN);

  // Expulso mas ainda sem contagem: fica à espera de uma decisão.
  let board = penaltyBoard(st, 5 * MIN);
  assert.equal(board.length, 1);
  assert.equal(board[0].status, PENALTY_STATUS.PENDING);
  assert.equal(board[0].number, 2);

  // O jogo esteve parado dois minutos; a contagem começa só ao recomeçar.
  st = step(ctx, (s) => A.startPenalty(s, { playerId: 'p2' }, T0 + 7 * MIN), T0 + 7 * MIN);
  assert.equal(st.penalties[0].startMatchMs, 7 * MIN, 'arranca no instante escolhido');

  board = penaltyBoard(st, 8 * MIN);
  assert.equal(board[0].status, PENALTY_STATUS.RUNNING);
  assert.equal(fmt(board[0].remainingMs), '02:00', 'a sanção é de 3 minutos');

  assert.equal(penaltyBoard(st, 10 * MIN)[0].status, PENALTY_STATUS.DONE);
  assert.equal(penaltyBoard(st, 10 * MIN)[0].remainingMs, 0);
  assert.equal(openPenalties(st, 10 * MIN).length, 0, 'some do ecrã quando cumpre');

  assert.ok(canStartPenalty(st, 'p2'), 'não se inicia duas vezes');
  assert.ok(canStartPenalty(st, 'p1'), 'só para quem está expulso');
});

test('a contagem dos 2 minutos pára com o cronómetro', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx, (s) => A.expelPlayer(s, { playerId: 'p2' }, T0 + 5 * MIN), T0 + 5 * MIN);
  step(ctx, (s) => A.startPenalty(s, { playerId: 'p2' }, T0 + 5 * MIN), T0 + 5 * MIN);
  // Cronómetro parado ao fim de 1 minuto de sanção.
  const st = step(ctx, (s) => A.pauseClock(s, T0 + 6 * MIN), T0 + 6 * MIN);

  const clockMs = readClock(st, T0 + 20 * MIN).matchMs; // 14 minutos reais parado
  assert.equal(clockMs, 6 * MIN, 'o relógio de jogo não andou');
  const board = penaltyBoard(st, clockMs);
  assert.equal(board[0].status, PENALTY_STATUS.RUNNING);
  assert.equal(fmt(board[0].remainingMs), '02:00', 'ainda faltam dois minutos de jogo');
});

test('a sanção pode ser terminada à mão por decisão do árbitro', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx, (s) => A.expelPlayer(s, { playerId: 'p2' }, T0 + 5 * MIN), T0 + 5 * MIN);
  step(ctx, (s) => A.startPenalty(s, { playerId: 'p2' }, T0 + 5 * MIN), T0 + 5 * MIN);
  const st = step(ctx, (s) => A.endPenalty(s, { playerId: 'p2' }, T0 + 6 * MIN), T0 + 6 * MIN);

  assert.equal(penaltyBoard(st, 6 * MIN)[0].status, PENALTY_STATUS.DONE);
  assert.equal(st.penalties[0].endedEarly, true);
  assert.equal(st.penalties[0].endedReason, 'MANUAL');
});

test('um golo do adversário termina sozinho a sanção — é sempre golo sofrido', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx, (s) => A.expelPlayer(s, { playerId: 'p2' }, T0 + 5 * MIN), T0 + 5 * MIN);
  step(ctx, (s) => A.startPenalty(s, { playerId: 'p2' }, T0 + 5 * MIN), T0 + 5 * MIN);

  // Um golo NOSSO não altera nada: a regra beneficia quem tem mais jogadores.
  let st = step(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T0 + 5.5 * MIN), T0 + 5.5 * MIN);
  assert.equal(penaltyBoard(st, 5.5 * MIN)[0].status, PENALTY_STATUS.RUNNING);

  st = step(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 6 * MIN), T0 + 6 * MIN);
  assert.equal(penaltyBoard(st, 6 * MIN)[0].status, PENALTY_STATUS.DONE);
  assert.equal(st.penalties[0].endedReason, 'GOAL_CONCEDED');
  assert.equal(st.penalties[0].endedMatchMs, 6 * MIN);

  // Golo registado por engano: a sanção volta a correr com o tempo que faltava.
  st = step(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_REMOVED, T0 + 6.2 * MIN), T0 + 6.2 * MIN);
  const board = penaltyBoard(st, 6.2 * MIN);
  assert.equal(board[0].status, PENALTY_STATUS.RUNNING);
  assert.equal(fmt(board[0].remainingMs), '01:48');
});

test('cada golo sofrido liberta apenas um jogador, o da sanção mais antiga', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx, (s) => A.expelPlayer(s, { playerId: 'p2' }, T0 + 4 * MIN), T0 + 4 * MIN);
  step(ctx, (s) => A.startPenalty(s, { playerId: 'p2' }, T0 + 4 * MIN), T0 + 4 * MIN);
  step(ctx, (s) => A.expelPlayer(s, { playerId: 'p3' }, T0 + 5 * MIN), T0 + 5 * MIN);
  step(ctx, (s) => A.startPenalty(s, { playerId: 'p3' }, T0 + 5 * MIN), T0 + 5 * MIN);

  const st = step(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 5.5 * MIN), T0 + 5.5 * MIN);
  const board = penaltyBoard(st, 5.5 * MIN);
  const p2 = board.find((x) => x.playerId === 'p2');
  const p3 = board.find((x) => x.playerId === 'p3');
  assert.equal(p2.status, PENALTY_STATUS.DONE, 'sai o que foi expulso primeiro');
  assert.equal(p3.status, PENALTY_STATUS.RUNNING, 'o segundo continua a cumprir');
});

test('golos guardam marcador e assistência, atribuídos depois do apito', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);

  // Botão "G" do cartão: o marcador já vai no próprio evento do golo.
  let st = step(ctx, (s) => A.teamGoalBy(s, 'p5', T0 + 3 * MIN), T0 + 3 * MIN);
  assert.equal(st.teamScore, 1);
  assert.equal(st.goals.length, 1);
  assert.equal(st.goals[0].scorerId, 'p5');
  assert.equal(st.goals[0].assistId, null);

  // A assistência chega num evento separado, sem tocar no anterior.
  const goalId = st.goals[0].eventId;
  st = step(
    ctx,
    (s) => A.attributeGoal(s, { targetEventId: goalId, assistId: 'p3' }, T0 + 3.2 * MIN),
    T0 + 3.2 * MIN
  );
  assert.equal(st.goals[0].assistId, 'p3');
  assert.equal(st.teamScore, 1, 'atribuir não mexe no resultado');

  // Botão "+": golo primeiro, marcador depois.
  st = step(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T0 + 6 * MIN), T0 + 6 * MIN);
  const second = st.goals[1].eventId;
  assert.equal(st.goals[1].scorerId, null);
  st = step(
    ctx,
    (s) => A.attributeGoal(s, { targetEventId: second, scorerId: 'p3' }, T0 + 6.1 * MIN),
    T0 + 6.1 * MIN
  );

  const clockMs = 10 * MIN;
  const p5 = playerMatchStats(st.players.p5, clockMs, { goals: st.goals });
  const p3 = playerMatchStats(st.players.p3, clockMs, { goals: st.goals });
  assert.equal(p5.goals, 1);
  assert.equal(p5.assists, 0);
  assert.equal(p3.goals, 1);
  assert.equal(p3.assists, 1);

  // Anular o golo anula a atribuição junto, porque tudo é recalculado.
  ctx.events.find((e) => e.id === goalId).undoneAt = T0 + 7 * MIN;
  const after = buildMatchState(match, ctx.squad, ctx.events);
  assert.equal(after.teamScore, 1);
  assert.equal(after.goals.length, 1);
  assert.equal(playerMatchStats(after.players.p5, clockMs, { goals: after.goals }).goals, 0);
});

test('autogolo conta para o resultado mas não para nenhum marcador nosso', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);

  let st = step(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T0 + 3 * MIN), T0 + 3 * MIN);
  const golo = st.goals[0];
  st = step(
    ctx,
    (s) => A.attributeGoal(s, { targetEventId: golo.eventId, scorerId: null, ownGoal: true }, T0 + 3.1 * MIN),
    T0 + 3.1 * MIN
  );

  assert.equal(st.teamScore, 1, 'o resultado sobe na mesma');
  assert.equal(st.goals[0].ownGoal, true);
  assert.equal(st.goals[0].scorerId, null);
  const opts = { goals: st.goals };
  for (const id of Object.keys(st.players)) {
    assert.equal(playerMatchStats(st.players[id], 5 * MIN, opts).goals, 0);
  }
});

test('os golos sofridos ficam no guarda-redes que estava em campo', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);

  // p1 é o guarda-redes inicial.
  let st = step(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 2 * MIN), T0 + 2 * MIN);
  assert.equal(st.goals[0].goalkeeperId, 'p1', 'guardado sem ninguém ter de responder');

  // Troca de guarda-redes: o golo seguinte é do outro.
  st = step(
    ctx,
    (s) => A.substitute(s, { playerOutId: 'p1', playerInId: 'p6', position: 'GOALKEEPER' }, T0 + 4 * MIN),
    T0 + 4 * MIN
  );
  st = step(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 6 * MIN), T0 + 6 * MIN);

  const opts = { goals: st.goals };
  assert.equal(playerMatchStats(st.players.p1, 8 * MIN, opts).conceded, 1);
  assert.equal(playerMatchStats(st.players.p6, 8 * MIN, opts).conceded, 1);
  assert.equal(playerMatchStats(st.players.p2, 8 * MIN, opts).conceded, 0, 'só conta a quem está à baliza');

  // Um golo nosso não conta como sofrido a ninguém.
  st = step(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T0 + 7 * MIN), T0 + 7 * MIN);
  assert.equal(st.goals[2].goalkeeperId, null);
});

test('estatísticas do clube incluem jogadores novos e dados atuais do plantel', () => {
  const roster = [
    { id: 'p1', name: 'Ana Silva', shirtNumber: 99 },
    { id: 'p9', name: 'Inês', shirtNumber: 9 },
  ];
  const ctx = { squad: makeSquad(), events: [] };
  let st = step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  st = step(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T0 + MIN, { scorerId: 'p1' }), T0 + MIN);

  const agg = clubAggregate([{ match, state: st }], roster);

  assert.equal(agg.perPlayer.p1.name, 'Ana Silva');
  assert.equal(agg.perPlayer.p1.number, 99);
  assert.equal(agg.perPlayer.p1.matches, 1);
  assert.equal(agg.perPlayer.p9.name, 'Inês');
  assert.equal(agg.perPlayer.p9.matches, 0);
  assert.equal(agg.perPlayer.p9.courtMs, 0);
});

test('dois amarelos no mesmo jogo contam como um vermelho, não como dois amarelos', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);

  let st = step(ctx, (s) => A.yellowCard(s, { playerId: 'p2' }, T0 + 3 * MIN), T0 + 3 * MIN);
  let s2 = playerMatchStats(st.players.p2, 3 * MIN, { cards: st.cards });
  assert.equal(s2.yellows, 1);
  assert.equal(s2.reds, 0);
  assert.equal(s2.expulsions, 0);
  assert.equal(st.players.p2.status, PLAYER_MATCH_STATUS.ON_COURT, 'um amarelo não expulsa');

  // Segundo amarelo: expulsa e a contagem de cartões muda de natureza.
  st = step(ctx, (s) => A.yellowCard(s, { playerId: 'p2' }, T0 + 7 * MIN), T0 + 7 * MIN);
  s2 = playerMatchStats(st.players.p2, 7 * MIN, { cards: st.cards });
  assert.equal(s2.yellows, 0, 'os dois amarelos deixam de ser contados como amarelos');
  assert.equal(s2.reds, 1, 'passam a valer um vermelho');
  assert.equal(s2.expulsions, 1);
  assert.equal(s2.bySecondYellow, true);

  // A expulsão é real: fecha o período, liberta a posição e abre a sanção.
  assert.equal(st.players.p2.status, PLAYER_MATCH_STATUS.EXPELLED);
  assert.equal(st.players.p2.expelledAtMatchMs, 7 * MIN);
  assert.equal(countOnCourt(st), 4);
  assert.equal(playerMatchStats(st.players.p2, 20 * MIN, {}).courtMs, 7 * MIN);
  assert.equal(penaltyBoard(st, 7 * MIN)[0].status, PENALTY_STATUS.PENDING);
});

test('um vermelho directo expulsa e conta um vermelho', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const st = step(ctx, (s) => A.redCard(s, { playerId: 'p4' }, T0 + 2 * MIN), T0 + 2 * MIN);
  const s4 = playerMatchStats(st.players.p4, 2 * MIN, { cards: st.cards });
  assert.equal(s4.reds, 1);
  assert.equal(s4.yellows, 0);
  assert.equal(s4.expulsions, 1);
  assert.equal(st.players.p4.status, PLAYER_MATCH_STATUS.EXPELLED);
  assert.equal(countOnCourt(st), 4);
});

test('anular o segundo amarelo devolve o jogador ao campo', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx, (s) => A.yellowCard(s, { playerId: 'p2' }, T0 + 3 * MIN), T0 + 3 * MIN);
  step(ctx, (s) => A.yellowCard(s, { playerId: 'p2' }, T0 + 7 * MIN), T0 + 7 * MIN);

  const second = ctx.events.filter((e) => e.eventType === EVENT.YELLOW_CARD)[1];
  second.undoneAt = T0 + 7.5 * MIN;
  const st = buildMatchState(match, ctx.squad, ctx.events);

  assert.equal(st.players.p2.status, PLAYER_MATCH_STATUS.ON_COURT);
  assert.equal(countOnCourt(st), 5);
  const s2 = playerMatchStats(st.players.p2, 8 * MIN, { cards: st.cards });
  assert.equal(s2.yellows, 1, 'volta a ser um amarelo simples');
  assert.equal(s2.reds, 0);
});

test('faltas acumuladas: contagem por parte, total do jogo e limite dos 10 metros', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);

  let st;
  for (let i = 1; i <= 4; i++) {
    st = step(ctx, (s) => A.foul(s, EVENT.TEAM_FOUL_ADDED, T0 + i * MIN), T0 + i * MIN);
  }
  assert.equal(foulsInPeriod(st, 'US'), 4);
  assert.equal(foulsInPeriod(st, 'THEM'), 0, 'as faltas de cada equipa são independentes');
  assert.ok(foulsInPeriod(st, 'US') < FOUL_LIMIT, 'ainda não está no limite');

  st = step(ctx, (s) => A.foul(s, EVENT.TEAM_FOUL_ADDED, T0 + 5 * MIN), T0 + 5 * MIN);
  assert.equal(foulsInPeriod(st, 'US'), FOUL_LIMIT, 'à quinta fica em risco');

  st = step(ctx, (s) => A.foul(s, EVENT.TEAM_FOUL_ADDED, T0 + 6 * MIN), T0 + 6 * MIN);
  assert.ok(foulsInPeriod(st, 'US') > FOUL_LIMIT, 'a sexta já dá livre de 10 metros');

  // Enganou-se a marcar: retira a última da parte em curso.
  st = step(ctx, (s) => A.foul(s, EVENT.TEAM_FOUL_REMOVED, T0 + 6.5 * MIN), T0 + 6.5 * MIN);
  assert.equal(foulsInPeriod(st, 'US'), 5);

  // A contagem zera na segunda parte, mas o total do jogo soma as duas.
  st = step(ctx, (s) => A.finishFirstHalf(s, T0 + 10 * MIN), T0 + 10 * MIN);
  const T1 = T0 + 15 * MIN;
  st = step(ctx, (s) => A.setSecondHalfLineup(s, { GOALKEEPER: 'p1' }, T1), T1);
  st = step(ctx, (s) => A.startSecondHalf(s, T1), T1);
  assert.equal(foulsInPeriod(st, 'US'), 0, 'a segunda parte começa a zero');
  assert.equal(foulsInPeriod(st, 'US', 1), 5, 'a primeira parte fica registada');

  st = step(ctx, (s) => A.foul(s, EVENT.TEAM_FOUL_ADDED, T1 + 1 * MIN), T1 + 1 * MIN);
  st = step(ctx, (s) => A.foul(s, EVENT.OPPONENT_FOUL_ADDED, T1 + 2 * MIN), T1 + 2 * MIN);
  assert.equal(foulsInPeriod(st, 'US'), 1);
  assert.equal(foulsTotal(st, 'US'), 6, 'total do jogo: 5 + 1');
  assert.equal(foulsTotal(st, 'THEM'), 1);
});

test('as faltas guardam o jogador nosso envolvido: quem a fez ou quem a sofreu', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);

  let st = step(ctx, (s) => A.foul(s, EVENT.TEAM_FOUL_ADDED, T0 + 2 * MIN), T0 + 2 * MIN);
  const primeira = st.fouls[0];
  assert.equal(primeira.playerId, null, 'o contador sobe antes de saber o autor');

  st = step(
    ctx,
    (s) => A.attributeFoul(s, { targetEventId: primeira.eventId, playerId: 'p2' }, T0 + 2.1 * MIN),
    T0 + 2.1 * MIN
  );
  assert.equal(st.fouls[0].playerId, 'p2');
  assert.equal(foulsInPeriod(st, 'US'), 1, 'atribuir não soma outra falta');

  // Segunda falta do mesmo jogador, e uma do adversário sem autor.
  st = step(ctx, (s) => A.foul(s, EVENT.TEAM_FOUL_ADDED, T0 + 4 * MIN), T0 + 4 * MIN);
  const segunda = st.fouls[1];
  st = step(
    ctx,
    (s) => A.attributeFoul(s, { targetEventId: segunda.eventId, playerId: 'p2' }, T0 + 4.1 * MIN),
    T0 + 4.1 * MIN
  );
  st = step(ctx, (s) => A.foul(s, EVENT.OPPONENT_FOUL_ADDED, T0 + 5 * MIN), T0 + 5 * MIN);

  // A falta do adversário guarda quem a SOFREU, não quem a fez.
  const doAdversario = st.fouls.find((f) => f.team === 'THEM');
  st = step(
    ctx,
    (s) => A.attributeFoul(s, { targetEventId: doAdversario.eventId, playerId: 'p3' }, T0 + 5.1 * MIN),
    T0 + 5.1 * MIN
  );

  const opts = { fouls: st.fouls };
  assert.equal(playerMatchStats(st.players.p2, 6 * MIN, opts).fouls, 2);
  assert.equal(playerMatchStats(st.players.p2, 6 * MIN, opts).foulsSuffered, 0);
  assert.equal(playerMatchStats(st.players.p3, 6 * MIN, opts).fouls, 0, 'sofrer não é cometer');
  assert.equal(playerMatchStats(st.players.p3, 6 * MIN, opts).foulsSuffered, 1);
  assert.equal(foulsTotal(st, 'THEM'), 1, 'continua a contar como falta da equipa deles');
});

test('repor jogador após expulsão abre uma nova entrada', () => {
  const { ctx } = playFullMatch();
  const events = ctx.events.filter((e) => e.eventType !== EVENT.MATCH_FINISHED);
  const c2 = { squad: ctx.squad, events };
  const T = T0 + 16 * MIN + 5 * MIN;
  let st = step(c2, (s) => A.replaceAfterExpulsion(s, { playerInId: 'p8', position: 'FIXO' }, T), T);
  assert.equal(countOnCourt(st), 5);
  st = step(c2, (s) => A.finishMatch(s, T0 + 16 * MIN + 10 * MIN), T0 + 16 * MIN + 10 * MIN);
  const hugo = playerMatchStats(st.players.p8, st.elapsedMatchMs);
  assert.equal(hugo.entries, 1);
  assert.equal(hugo.courtMs, 5 * MIN);
});

test('a alteração de posição não cria entradas nem fecha períodos', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const st = step(
    ctx,
    (s) => A.changePosition(s, { playerId: 'p5', fromPosition: 'PIVOT', toPosition: 'FIXO' }, T0 + 3 * MIN),
    T0 + 3 * MIN
  );
  assert.equal(st.players.p5.position, 'FIXO');
  assert.equal(st.players.p2.position, 'PIVOT', 'os dois jogadores trocam de posição');
  assert.equal(st.players.p5.stints.length, 1);
  assert.equal(st.players.p2.stints.length, 1);
  assert.equal(countOnCourt(st), 5);
});

test('desfazer uma substituição repõe o estado anterior', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(
    ctx,
    (s) => A.substitute(s, { playerOutId: 'p3', playerInId: 'p6', position: 'LEFT_WINGER' }, T0 + 2 * MIN),
    T0 + 2 * MIN
  );
  const sub = ctx.events.find((e) => e.eventType === EVENT.SUBSTITUTION);
  sub.undoneAt = T0 + 2.5 * MIN; // é o que events.markUndone faz na base de dados
  const st = buildMatchState(match, ctx.squad, ctx.events);
  assert.equal(st.court.LEFT_WINGER, 'p3');
  assert.equal(st.players.p6.stints.length, 0);
  assert.equal(playerMatchStats(st.players.p3, 5 * MIN).courtMs, 5 * MIN);
});

test('exemplo da especificação: 8:00 em 3 entradas dá 2:40 de média', () => {
  const player = {
    playerId: 'x',
    name: 'António',
    number: 10,
    status: PLAYER_MATCH_STATUS.ON_BENCH,
    expelledAtMatchMs: null,
    availableFromMs: 0,
    stints: [
      { stintNumber: 1, startMatchMs: 0, endMatchMs: 160_000 },
      { stintNumber: 2, startMatchMs: 310_000, endMatchMs: 480_000 },
      { stintNumber: 3, startMatchMs: 800_000, endMatchMs: 950_000 },
    ],
  };
  const s = playerMatchStats(player, 40 * MIN);
  assert.equal(s.courtMs, 480_000);
  assert.equal(s.entries, 3);
  assert.equal(fmt(s.avgStintMs), '02:40');
  assert.equal(fmt(s.longestStintMs), '02:50');
});

test('desfazer não alcança a parte anterior', () => {
  const ctx = { squad: makeSquad(), events: [] };
  let st = step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  st = step(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T0 + MIN), T0 + MIN);
  assert.equal(st.lastUndoable?.eventType, EVENT.TEAM_GOAL_ADDED, 'na 1.ª parte desfaz-se o golo');

  st = step(ctx, (s) => A.finishFirstHalf(s, T0 + 10 * MIN), T0 + 10 * MIN);
  const lineup = { GOALKEEPER: 'p1', FIXO: 'p2', LEFT_WINGER: 'p3', RIGHT_WINGER: 'p4', PIVOT: 'p5' };
  const T1 = T0 + 15 * MIN;
  st = step(ctx, (s) => A.setSecondHalfLineup(s, lineup, T1), T1);
  st = step(ctx, (s) => A.startSecondHalf(s, T1), T1);
  assert.equal(st.lastUndoable, null, 'começada a 2.ª parte, o golo da 1.ª já não se desfaz');

  st = step(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T1 + MIN), T1 + MIN);
  assert.equal(st.lastUndoable?.eventType, EVENT.TEAM_GOAL_ADDED, 'o golo da 2.ª parte já se desfaz');
});

test('validações: convocatória, cinco inicial e transições', () => {
  assert.ok(V.validateSquadSelection(new Array(15).fill(0).map((_, i) => `p${i}`)));
  // Três é o mínimo; com dois nem se começa.
  assert.ok(V.validateSquadSelection(['p1', 'p2']));
  assert.equal(V.validateSquadSelection(['p1', 'p2', 'p3']), null);
  assert.ok(V.validateLineup({ GOALKEEPER: 'p1', FIXO: 'p1' }, ['p1']));

  const ctx = { squad: makeSquad(), events: [] };
  let st = buildMatchState(match, ctx.squad, []);
  assert.equal(st.status, MATCH_STATUS.READY);
  assert.equal(V.canStartFirstHalf(st), null);
  st = step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  assert.ok(V.canFinishMatch(st), 'não se pode terminar o jogo antes da 2.ª parte');
  assert.equal(V.canFinishMatch(st, { allowAbandon: true }), null);
});

test('o tipo de jogo define a duração da parte e da sanção', () => {
  assert.equal(timingConfig({ timing: 'TIMED' }).periodDurationMs, 20 * MIN);
  assert.equal(timingConfig({ timing: 'TIMED' }).penaltyDurationMs, 2 * MIN);
  assert.equal(timingConfig({ timing: 'UNTIMED' }).periodDurationMs, 30 * MIN);
  assert.equal(timingConfig({ timing: 'UNTIMED' }).penaltyDurationMs, 3 * MIN);
  // Jogos antigos, sem o campo, lêem-se como corridos.
  assert.equal(timingOf({}), 'UNTIMED');
  assert.equal(timingOf(null), 'UNTIMED');
});

test('durante a sanção a equipa não pode voltar aos cinco', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  let st = step(ctx, (s) => A.redCard(s, { playerId: 'p2' }, T0 + 2 * MIN), T0 + 2 * MIN);

  // Expulso mas sem contagem iniciada: também não se repõe.
  assert.ok(canReplaceExpelled(st, 2 * MIN, 2 * MIN));

  st = step(
    ctx,
    (s) => A.startPenalty(s, { playerId: 'p2', durationMs: 2 * MIN }, T0 + 2 * MIN),
    T0 + 2 * MIN
  );
  assert.ok(canReplaceExpelled(st, 3 * MIN, 2 * MIN), 'com a sanção a correr, não');
  assert.equal(canReplaceExpelled(st, 4 * MIN, 2 * MIN), null, 'cumpridos os 2 min, sim');

  // Golo sofrido liberta a posição antes do tempo.
  const ctx2 = { squad: makeSquad(), events: [] };
  step(ctx2, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx2, (s) => A.redCard(s, { playerId: 'p2' }, T0 + 2 * MIN), T0 + 2 * MIN);
  step(
    ctx2,
    (s) => A.startPenalty(s, { playerId: 'p2', durationMs: 2 * MIN }, T0 + 2 * MIN),
    T0 + 2 * MIN
  );
  let st2 = step(ctx2, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T0 + 2.5 * MIN), T0 + 2.5 * MIN);
  assert.ok(canReplaceExpelled(st2, 2.5 * MIN, 2 * MIN), 'um golo nosso não liberta nada');
  st2 = step(ctx2, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 3 * MIN), T0 + 3 * MIN);
  assert.equal(canReplaceExpelled(st2, 3 * MIN, 2 * MIN), null, 'golo sofrido liberta a posição');
});

/* --------------------------------------------------------- igualdade numérica */

test('com o mesmo número de expulsos, um golo não repõe ninguém', () => {
  // 5v5, um expulso de cada lado: 4v4. Ninguém está em inferioridade, por isso
  // um golo não devolve jogador nenhum — nem a nós nem a eles.
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx, (s) => A.redCard(s, { playerId: 'p2' }, T0 + 2 * MIN), T0 + 2 * MIN);
  step(
    ctx,
    (s) => A.startPenalty(s, { playerId: 'p2', durationMs: 2 * MIN }, T0 + 2 * MIN),
    T0 + 2 * MIN
  );
  let st = step(ctx, (s) => A.opponentExpulsion(s, 1, T0 + 2 * MIN), T0 + 2 * MIN);
  assert.equal(st.opponentExpulsions, 1);

  st = step(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 3 * MIN), T0 + 3 * MIN);
  assert.ok(
    canReplaceExpelled(st, 3 * MIN, 2 * MIN),
    'a 4 contra 4, o golo sofrido não encurta a sanção'
  );
  assert.equal(st.penalties[0].endedMatchMs, null);

  // Eles voltam aos cinco: agora sim, o próximo golo devolve o nosso jogador.
  st = step(ctx, (s) => A.opponentExpulsion(s, -1, T0 + 3.5 * MIN), T0 + 3.5 * MIN);
  assert.equal(st.opponentExpulsions, 0);
  st = step(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 3.6 * MIN), T0 + 3.6 * MIN);
  assert.equal(canReplaceExpelled(st, 3.6 * MIN, 2 * MIN), null);
  assert.equal(st.penalties[0].endedReason, 'GOAL_CONCEDED');
});

test('o contador de expulsões do adversário não desce abaixo de zero', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const st = step(ctx, (s) => A.opponentExpulsion(s, -1, T0 + 1 * MIN), T0 + 1 * MIN);
  assert.equal(st.opponentExpulsions, 0);
});

/* -------------------------------------------------------------------- 5v4 */

/** Como makeSquad, mas com as posições preferidas preenchidas. */
function squadComPosicoes() {
  return makeSquad().map((row) => ({
    ...row,
    preferredPosition: row.playerId === 'p1' ? 'GOALKEEPER' : 'UNIVERSAL',
  }));
}

test('5v4: um jogador de campo à baliza abre e fecha o período sozinho', () => {
  const ctx = { squad: squadComPosicoes(), events: [] };
  const build = () => buildMatchState(match, ctx.squad, ctx.events);

  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  assert.equal(build().powerPlays.length, 0, 'com o guarda-redes na baliza, nada');

  // 5' — sai a guarda-redes, entra um universal para a baliza.
  let st = step(
    ctx,
    (s) => A.substitute(s, { playerOutId: 'p1', playerInId: 'p6', position: 'GOALKEEPER' }, T0 + 5 * MIN),
    T0 + 5 * MIN
  );
  assert.equal(st.powerPlays.length, 1);
  assert.equal(st.powerPlays[0].startMatchMs, 5 * MIN);
  assert.equal(st.powerPlays[0].endMatchMs, null, 'ainda a decorrer');
  assert.equal(powerPlayAtivo(st), true);

  // 8' — volta a guarda-redes: o período fecha.
  st = step(
    ctx,
    (s) => A.substitute(s, { playerOutId: 'p6', playerInId: 'p1', position: 'GOALKEEPER' }, T0 + 8 * MIN),
    T0 + 8 * MIN
  );
  assert.equal(st.powerPlays[0].endMatchMs, 8 * MIN);
  assert.equal(powerPlayAtivo(st), false);

  const totais = powerPlayTotals(st, st.elapsedMatchMs);
  assert.equal(totais.count, 1);
  assert.equal(totais.totalMs, 3 * MIN);
});

test('5v4: o botão liga quando é o próprio guarda-redes a subir', () => {
  const ctx = { squad: squadComPosicoes(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);

  let st = step(ctx, (s) => A.setPowerPlay(s, true, T0 + 2 * MIN), T0 + 2 * MIN);
  assert.equal(powerPlayAtivo(st), true);
  assert.equal(st.powerPlays[0].manual, true, 'marcado à mão, não detetado');

  st = step(ctx, (s) => A.setPowerPlay(s, false, T0 + 4 * MIN), T0 + 4 * MIN);
  assert.equal(powerPlayAtivo(st), false);
  assert.equal(powerPlayTotals(st, st.elapsedMatchMs).totalMs, 2 * MIN);
});

test('5v4: o botão também desliga um automatismo que se enganou', () => {
  const ctx = { squad: squadComPosicoes(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  let st = step(
    ctx,
    (s) => A.substitute(s, { playerOutId: 'p1', playerInId: 'p6', position: 'GOALKEEPER' }, T0 + 5 * MIN),
    T0 + 5 * MIN
  );
  assert.equal(powerPlayAtivo(st), true);

  st = step(ctx, (s) => A.setPowerPlay(s, false, T0 + 6 * MIN), T0 + 6 * MIN);
  assert.equal(powerPlayAtivo(st), false, 'o treinador tem a última palavra');
  assert.equal(powerPlayTotals(st, st.elapsedMatchMs).totalMs, 1 * MIN);

  // Trocar de guarda-redes é situação nova: o automatismo volta a mandar.
  st = step(
    ctx,
    (s) => A.substitute(s, { playerOutId: 'p6', playerInId: 'p7', position: 'GOALKEEPER' }, T0 + 7 * MIN),
    T0 + 7 * MIN
  );
  assert.equal(powerPlayAtivo(st), true);
});

test('5v4: sem posição registada não se inventa nada', () => {
  // Plantel antigo, importado sem posições: passar o jogo inteiro marcado como
  // 5v4 seria pior do que não medir.
  const ctx = { squad: makeSquad(), events: [] };
  const st = step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  assert.equal(powerPlayAtivo(st), false);
  assert.equal(st.powerPlays.length, 0);
});

test('5v4: o intervalo fecha o período e não o arrasta para a 2.ª parte', () => {
  const ctx = { squad: squadComPosicoes(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx, (s) => A.setPowerPlay(s, true, T0 + 2 * MIN), T0 + 2 * MIN);
  let st = step(ctx, (s) => A.finishFirstHalf(s, T0 + 10 * MIN), T0 + 10 * MIN);

  assert.equal(st.powerPlays.length, 1);
  assert.equal(st.powerPlays[0].endMatchMs, 10 * MIN);

  const T1 = T0 + 15 * MIN;
  const lineup = { GOALKEEPER: 'p1', FIXO: 'p2', LEFT_WINGER: 'p3', RIGHT_WINGER: 'p4', PIVOT: 'p5' };
  step(ctx, (s) => A.setSecondHalfLineup(s, lineup, T1), T1);
  st = step(ctx, (s) => A.startSecondHalf(s, T1), T1);
  assert.equal(powerPlayAtivo(st), false, 'a 2.ª parte começa limpa');
  assert.equal(powerPlayTotals(st, st.elapsedMatchMs).totalMs, 8 * MIN);
});

/* ------------------------------------------------- resultado ao intervalo */

test('corrigir um golo da 1.ª parte corrige também o resultado ao intervalo', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T0 + 3 * MIN), T0 + 3 * MIN);
  let st = step(ctx, (s) => A.finishFirstHalf(s, T0 + 10 * MIN), T0 + 10 * MIN);
  assert.equal(st.halftimeTeamScore, 1);

  const T1 = T0 + 15 * MIN;
  const lineup = { GOALKEEPER: 'p1', FIXO: 'p2', LEFT_WINGER: 'p3', RIGHT_WINGER: 'p4', PIVOT: 'p5' };
  step(ctx, (s) => A.setSecondHalfLineup(s, lineup, T1), T1);
  step(ctx, (s) => A.startSecondHalf(s, T1), T1);
  st = step(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T1 + 2 * MIN), T1 + 2 * MIN);
  assert.equal(st.teamScore, 2);
  assert.equal(st.halftimeTeamScore, 1, 'um golo da 2.ª parte não mexe no intervalo');

  // Afinal o segundo golo tinha sido aos 5' da 1.ª parte, registado tarde.
  const golo = st.goals[1];
  st = step(
    ctx,
    (s) =>
      A.attributeGoal(
        s,
        { targetEventId: golo.eventId, matchElapsedMs: 5 * MIN, period: 1 },
        T1 + 3 * MIN
      ),
    T1 + 3 * MIN
  );
  assert.equal(st.teamScore, 2, 'o resultado final não muda');
  assert.equal(st.halftimeTeamScore, 2, 'o intervalo passa a contar os dois');
});

/* ------------------------------------ a segunda parte começa com o campo cheio */

test('não se começa a 2.ª parte com menos de cinco em campo', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  let st = step(ctx, (s) => A.finishFirstHalf(s, T0 + 10 * MIN), T0 + 10 * MIN);

  const T1 = T0 + 15 * MIN;
  // Só quatro: falta o pivot.
  const quatro = { GOALKEEPER: 'p1', FIXO: 'p2', LEFT_WINGER: 'p3', RIGHT_WINGER: 'p4' };
  st = step(ctx, (s) => A.setSecondHalfLineup(s, quatro, T1), T1);
  assert.equal(V.canStartSecondHalf(st)?.chave, 'validacao.coloqueParaSegunda');

  const cinco = { ...quatro, PIVOT: 'p5' };
  st = step(ctx, (s) => A.setSecondHalfLineup(s, cinco, T1), T1);
  assert.equal(V.canStartSecondHalf(st), null, 'com os cinco, avança');
});

test('com menos de cinco disponíveis, exige-se o que houver', () => {
  // Convocatória de quatro: não há quinto para pôr, e o jogo tem de poder seguir.
  const squad = makeSquad().slice(0, 4);
  const ctx = { squad, events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  let st = step(ctx, (s) => A.finishFirstHalf(s, T0 + 10 * MIN), T0 + 10 * MIN);

  const T1 = T0 + 15 * MIN;
  st = step(
    ctx,
    (s) => A.setSecondHalfLineup(s, { GOALKEEPER: 'p1', FIXO: 'p2', LEFT_WINGER: 'p3' }, T1),
    T1
  );
  assert.deepEqual(V.canStartSecondHalf(st), {
    chave: 'validacao.soHaDisponiveis',
    valores: { n: 4 },
  });

  st = step(
    ctx,
    (s) =>
      A.setSecondHalfLineup(
        s,
        { GOALKEEPER: 'p1', FIXO: 'p2', LEFT_WINGER: 'p3', RIGHT_WINGER: 'p4' },
        T1
      ),
    T1
  );
  assert.equal(V.canStartSecondHalf(st), null, 'os quatro que há chegam');
});

test('um expulso deixa de contar para os disponíveis', () => {
  const squad = makeSquad().slice(0, 5);
  const ctx = { squad, events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx, (s) => A.redCard(s, { playerId: 'p5' }, T0 + 2 * MIN), T0 + 2 * MIN);
  let st = step(ctx, (s) => A.finishFirstHalf(s, T0 + 10 * MIN), T0 + 10 * MIN);
  assert.equal(V.availableCount(st), 4, 'cinco convocados menos um expulso');

  const T1 = T0 + 15 * MIN;
  st = step(
    ctx,
    (s) =>
      A.setSecondHalfLineup(
        s,
        { GOALKEEPER: 'p1', FIXO: 'p2', LEFT_WINGER: 'p3', RIGHT_WINGER: 'p4' },
        T1
      ),
    T1
  );
  assert.equal(V.canStartSecondHalf(st), null);
});

/* ------------------------------- a sanção atravessa o intervalo (Leis do Jogo) */

test('a sanção por cumprir continua na 2.ª parte, e a equipa entra reduzida', () => {
  // As Leis do Jogo contam os dois minutos em TEMPO DE JOGO. Ao contrário das
  // faltas acumuladas, que zeram por período, o que falta da sanção transita.
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx, (s) => A.redCard(s, { playerId: 'p2' }, T0 + 9 * MIN), T0 + 9 * MIN);
  step(
    ctx,
    (s) => A.startPenalty(s, { playerId: 'p2', durationMs: 2 * MIN }, T0 + 9 * MIN),
    T0 + 9 * MIN
  );
  // Antes do apito, com quatro em campo e a sanção a correr, o lugar do expulso
  // continua trancado.
  assert.ok(canReplaceExpelled(buildMatchState(match, ctx.squad, ctx.events), 10 * MIN, 2 * MIN));

  // A parte acaba com meio minuto de sanção por cumprir.
  let st = step(ctx, (s) => A.finishFirstHalf(s, T0 + 10.5 * MIN), T0 + 10.5 * MIN);
  assert.equal(st.penalties[0].endedMatchMs, null, 'não é fechada pelo apito');

  const T1 = T0 + 15 * MIN;
  // Com a sanção a correr, a equipa entra com quatro — cinco seria infração.
  assert.equal(V.expectedOnCourt(st), 4);

  const cinco = { GOALKEEPER: 'p1', FIXO: 'p6', LEFT_WINGER: 'p3', RIGHT_WINGER: 'p4', PIVOT: 'p5' };
  st = step(ctx, (s) => A.setSecondHalfLineup(s, cinco, T1), T1);
  assert.equal(V.canStartSecondHalf(st)?.chave, 'validacao.sancaoPorCumprir');

  const quatro = { GOALKEEPER: 'p1', FIXO: 'p6', LEFT_WINGER: 'p3', RIGHT_WINGER: 'p4' };
  st = step(ctx, (s) => A.setSecondHalfLineup(s, quatro, T1), T1);
  assert.equal(V.canStartSecondHalf(st), null, 'com quatro, avança');
});

test('cumpridos os dois minutos na 2.ª parte, a equipa volta aos cinco', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx, (s) => A.redCard(s, { playerId: 'p2' }, T0 + 9 * MIN), T0 + 9 * MIN);
  step(
    ctx,
    (s) => A.startPenalty(s, { playerId: 'p2', durationMs: 2 * MIN }, T0 + 9 * MIN),
    T0 + 9 * MIN
  );
  const st = step(ctx, (s) => A.finishFirstHalf(s, T0 + 10.5 * MIN), T0 + 10.5 * MIN);

  // Aos 11 minutos de jogo cumprem-se os dois minutos contados desde os 9.
  assert.equal(canReplaceExpelled(st, 11 * MIN, 2 * MIN), null);
});

test('com dois expulsos, cumprir uma sanção liberta um lugar — não os dois', () => {
  // O erro: olhava-se para "há alguma sanção a correr?" e trancava-se o campo
  // inteiro. Com dois expulsos e uma das sanções já cumprida, a equipa joga com
  // quatro — um dos lugares tem de voltar a poder ser preenchido.
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);

  // Dois expulsos, as duas contagens a andar.
  step(ctx, (s) => A.redCard(s, { playerId: 'p2' }, T0 + 1 * MIN), T0 + 1 * MIN);
  step(
    ctx,
    (s) => A.startPenalty(s, { playerId: 'p2', durationMs: 2 * MIN }, T0 + 1 * MIN),
    T0 + 1 * MIN
  );
  step(ctx, (s) => A.redCard(s, { playerId: 'p3' }, T0 + 2 * MIN), T0 + 2 * MIN);
  let st = step(
    ctx,
    (s) => A.startPenalty(s, { playerId: 'p3', durationMs: 2 * MIN }, T0 + 2 * MIN),
    T0 + 2 * MIN
  );

  assert.equal(countOnCourt(st), 3, 'a jogar com três');
  assert.ok(canReplaceExpelled(st, 2.5 * MIN, 2 * MIN), 'as duas a correr: nada a repor');

  // Aos 3 minutos cumpre-se a primeira (começou ao minuto 1).
  assert.equal(
    canReplaceExpelled(st, 3 * MIN, 2 * MIN),
    null,
    'cumprida uma, um dos lugares abre'
  );

  // Preenchido esse lugar, o outro continua trancado até à sua vez.
  st = step(
    ctx,
    (s) => A.replaceAfterExpulsion(s, { playerInId: 'p6', position: 'FIXO' }, T0 + 3 * MIN),
    T0 + 3 * MIN
  );
  assert.equal(countOnCourt(st), 4);
  assert.ok(
    canReplaceExpelled(st, 3 * MIN, 2 * MIN),
    'o segundo lugar espera pela sua sanção'
  );

  // Aos 4 minutos cumpre-se a segunda, e a equipa pode voltar aos cinco.
  assert.equal(canReplaceExpelled(st, 4 * MIN, 2 * MIN), null);
});

test('um golo sofrido com dois expulsos devolve um jogador, não dois', () => {
  const ctx = { squad: makeSquad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  for (const [id, min] of [['p2', 1], ['p3', 2]]) {
    step(ctx, (s) => A.redCard(s, { playerId: id }, T0 + min * MIN), T0 + min * MIN);
    step(
      ctx,
      (s) => A.startPenalty(s, { playerId: id, durationMs: 2 * MIN }, T0 + min * MIN),
      T0 + min * MIN
    );
  }
  const st = step(
    ctx,
    (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 2.5 * MIN),
    T0 + 2.5 * MIN
  );

  // A mais antiga terminou; a outra continua.
  assert.equal(st.penalties[0].endedReason, 'GOAL_CONCEDED');
  assert.equal(st.penalties[1].endedMatchMs, null);
  assert.equal(
    canReplaceExpelled(st, 2.5 * MIN, 2 * MIN),
    null,
    'abre um lugar logo a seguir ao golo'
  );
});

/* ------------------------------------------------- o 5v4 ao longo da época */

test('5v4 da época: saldo, tempo e quem lá esteve', () => {
  const ctx = { squad: squadComPosicoes(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);

  // 5' abre o 5v4 — a guarda-redes sai, entra o p6 para a baliza.
  step(
    ctx,
    (s) => A.substitute(s, { playerOutId: 'p1', playerInId: 'p6', position: 'GOALKEEPER' }, T0 + 5 * MIN),
    T0 + 5 * MIN
  );
  // 6' marcamos, 7' sofremos: um de cada, ambos dentro da janela.
  step(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, T0 + 6 * MIN), T0 + 6 * MIN);
  step(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 7 * MIN), T0 + 7 * MIN);
  // 8' fecha.
  const st = step(
    ctx,
    (s) => A.substitute(s, { playerOutId: 'p6', playerInId: 'p1', position: 'GOALKEEPER' }, T0 + 8 * MIN),
    T0 + 8 * MIN
  );
  // 9' sofremos outro, já fora do 5v4 — não pode contar.
  const fim = step(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 9 * MIN), T0 + 9 * MIN);

  const pp = powerPlayAggregate([{ state: fim }]);

  assert.equal(pp.periodos, 1);
  assert.equal(pp.jogosCom, 1);
  assert.equal(pp.totalMs, 3 * MIN, 'dos 5 aos 8 minutos');
  assert.equal(pp.golosA, 1);
  assert.equal(pp.golosContra, 1, 'o golo aos 9 minutos ficou de fora');
  assert.equal(pp.saldo, 0);
  assert.equal(pp.mediaPorJogoMs, 3 * MIN);

  // O p6 entrou exactamente com o 5v4 e saiu com ele: leva os três minutos.
  const p6 = pp.jogadores.find((j) => j.playerId === 'p6');
  assert.equal(p6.ms, 3 * MIN, 'o tempo de quem esteve lá a leva toda');

  // A guarda-redes saiu quando aquilo começou: não leva nada.
  assert.equal(pp.jogadores.some((j) => j.playerId === 'p1'), false);
});

test('sem 5v4 nenhum, o agregado é todo zeros e não divide por zero', () => {
  const ctx = { squad: squadComPosicoes(), events: [] };
  const st = step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const pp = powerPlayAggregate([{ state: st }]);

  assert.equal(pp.periodos, 0);
  assert.equal(pp.jogosCom, 0);
  assert.equal(pp.mediaPorJogoMs, 0, 'a média por jogo sem jogos é zero, não NaN');
  assert.deepEqual(pp.jogadores, []);
});
