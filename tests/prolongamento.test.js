// tests/prolongamento.test.js — prolongamento e desempate por penáltis.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMatchState, foulsInPeriod } from '../src/domain/reducer.js';
import { matchStatsTable } from '../src/domain/stats.js';
import * as A from '../src/domain/actions.js';
import * as V from '../src/domain/validation.js';
import { EVENT, MATCH_STATUS, LOCATION } from '../src/domain/constants.js';
import {
  faseDoJogo,
  resumoPenaltis,
  inicioDoPeriodo,
  teveProlongamento,
  elegiveisPenaltis,
  guardaRedesDosPenaltis,
} from '../src/domain/prolongamento.js';

const MIN = 60_000;
const T0 = 1_700_000_000_000;
const match = { id: 'm1', clubId: 'c1', periodDurationMs: 20 * MIN };
const START = { p1: 'GOALKEEPER', p2: 'FIXO', p3: 'LEFT_WINGER', p4: 'RIGHT_WINGER', p5: 'PIVOT' };
const CINCO = { GOALKEEPER: 'p1', FIXO: 'p2', LEFT_WINGER: 'p3', RIGHT_WINGER: 'p4', PIVOT: 'p5' };

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
function step(ctx, f, now) {
  const st = buildMatchState(match, ctx.squad, ctx.events);
  const ev = f(st, now);
  ev.seq = ctx.events.length + 1;
  ctx.events.push(ev);
  return buildMatchState(match, ctx.squad, ctx.events);
}

/** Jogo 1–1 até ao fim da 2.ª parte (20' + 20', relógio sempre a andar). */
function ateAoFimDaSegunda() {
  const ctx = { squad: squad(), events: [] };
  step(ctx, (s) => A.startFirstHalf(s, T0), T0);
  step(ctx, (s) => A.teamGoalBy(s, 'p5', T0 + 5 * MIN), T0 + 5 * MIN);
  step(ctx, (s) => A.finishFirstHalf(s, T0 + 20 * MIN), T0 + 20 * MIN);
  step(ctx, (s) => A.setSecondHalfLineup(s, CINCO, T0 + 30 * MIN), T0 + 30 * MIN);
  step(ctx, (s) => A.startSecondHalf(s, T0 + 30 * MIN), T0 + 30 * MIN);
  step(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 45 * MIN), T0 + 45 * MIN);
  return ctx;
}

test('fim da 2.ª parte empatado → pausa do prolongamento, sem terminar o jogo', () => {
  const ctx = ateAoFimDaSegunda();
  const st = step(ctx, (s) => A.finishPeriod(s, 'PROLONGAMENTO', T0 + 50 * MIN), T0 + 50 * MIN);
  assert.equal(st.status, MATCH_STATUS.HALFTIME);
  assert.equal(st.currentPeriod, 2);
  assert.equal(faseDoJogo(st), 'PAUSA_PROL');
  assert.equal(st.secondHalfMs, 20 * MIN);
  assert.equal(st.elapsedMatchMs, 40 * MIN);
  assert.equal(st.penaltis, null);
});

test('prolongamento: duas partes, relógio do jogo continua, minutos contam, golos contam', () => {
  const ctx = ateAoFimDaSegunda();
  step(ctx, (s) => A.finishPeriod(s, 'PROLONGAMENTO', T0 + 50 * MIN), T0 + 50 * MIN);
  step(ctx, (s) => A.setSecondHalfLineup(s, CINCO, T0 + 52 * MIN), T0 + 52 * MIN);
  let st = buildMatchState(match, ctx.squad, ctx.events);
  assert.equal(V.canStartExtraTime(st), null);
  st = step(ctx, (s) => A.startExtraTime(s, T0 + 52 * MIN), T0 + 52 * MIN);
  assert.equal(st.currentPeriod, 3);
  assert.equal(faseDoJogo(st), 'PROL1');
  assert.equal(inicioDoPeriodo(st, 3), 40 * MIN);
  st = step(ctx, (s) => A.teamGoalBy(s, 'p4', T0 + 55 * MIN), T0 + 55 * MIN);
  assert.equal(st.goals.at(-1).period, 3);
  assert.equal(st.goals.at(-1).matchElapsedMs, 43 * MIN);
  st = step(ctx, (s) => A.finishPeriod(s, 'PROLONGAMENTO', T0 + 57 * MIN), T0 + 57 * MIN);
  assert.equal(faseDoJogo(st), 'PAUSA_PROL2');
  assert.equal(st.periodosMs[3], 5 * MIN);
  step(ctx, (s) => A.setSecondHalfLineup(s, CINCO, T0 + 58 * MIN), T0 + 58 * MIN);
  st = step(ctx, (s) => A.startExtraTime(s, T0 + 58 * MIN), T0 + 58 * MIN);
  assert.equal(st.currentPeriod, 4);
  assert.equal(faseDoJogo(st), 'PROL2');
  st = step(ctx, (s) => A.finishMatch(s, T0 + 63 * MIN), T0 + 63 * MIN);
  assert.equal(st.status, MATCH_STATUS.FINISHED);
  assert.equal(st.elapsedMatchMs, 50 * MIN);
  assert.equal(st.periodosMs[4], 5 * MIN);
  assert.equal(st.teamScore, 2);
  assert.ok(teveProlongamento(st));
  // O guarda-redes jogou os 50 minutos.
  const gr = matchStatsTable(st, T0 + 63 * MIN).find((p) => p.playerId === 'p1');
  assert.equal(gr.courtMs, 50 * MIN);
  // O prolongamento não mexe no resultado ao intervalo.
  assert.equal(st.halftimeTeamScore, 1);
});

test('faltas: as da 2.ª parte continuam a acumular no prolongamento', () => {
  const ctx = ateAoFimDaSegunda();
  step(ctx, (s) => A.foul(s, EVENT.TEAM_FOUL_ADDED, T0 + 46 * MIN), T0 + 46 * MIN);
  step(ctx, (s) => A.foul(s, EVENT.TEAM_FOUL_ADDED, T0 + 47 * MIN), T0 + 47 * MIN);
  step(ctx, (s) => A.finishPeriod(s, 'PROLONGAMENTO', T0 + 50 * MIN), T0 + 50 * MIN);
  step(ctx, (s) => A.setSecondHalfLineup(s, CINCO, T0 + 52 * MIN), T0 + 52 * MIN);
  step(ctx, (s) => A.startExtraTime(s, T0 + 52 * MIN), T0 + 52 * MIN);
  const st = step(ctx, (s) => A.foul(s, EVENT.TEAM_FOUL_ADDED, T0 + 53 * MIN), T0 + 53 * MIN);
  assert.equal(foulsInPeriod(st, 'US'), 3);
  assert.equal(foulsInPeriod(st, 'US', 2), 2);
  assert.equal(foulsInPeriod(st, 'US', 1), 0);
});

test('penáltis direto da 2.ª parte: não contam para o resultado', () => {
  const ctx = ateAoFimDaSegunda();
  let st = step(ctx, (s) => A.finishPeriod(s, 'PENALTIS', T0 + 50 * MIN), T0 + 50 * MIN);
  assert.equal(faseDoJogo(st), 'PENALTIS');
  assert.ok(st.penaltis);
  assert.equal(V.canStartExtraTime(st)?.chave, 'validacao.semProlongamento');
  st = step(ctx, (s) => A.startShootout(s, { ordem: ['p5', 'p4', 'p3'], primeiro: 'US' }), T0 + 51 * MIN);
  assert.deepEqual(st.penaltis.ordem, ['p5', 'p4', 'p3']);
  st = step(ctx, (s) => A.shootoutKick(s, { team: 'US', playerId: 'p5', zona: 'BE', resultado: 'GOLO' }), T0 + 52 * MIN);
  st = step(ctx, (s) => A.shootoutKick(s, { team: 'THEM', goalkeeperId: 'p1', zona: 'AD', mergulho: 'BE', resultado: 'GOLO' }), T0 + 52 * MIN);
  const r = resumoPenaltis(st.penaltis);
  assert.equal(r.nos, 1);
  assert.equal(r.eles, 1);
  assert.equal(r.proximaEquipa, 'US');
  assert.equal(r.proximoMarcador, 'p4');
  assert.equal(st.teamScore, 1);
  assert.equal(st.opponentScore, 1);
  st = step(ctx, (s) => A.finishMatch(s, T0 + 60 * MIN), T0 + 60 * MIN);
  assert.equal(st.status, MATCH_STATUS.FINISHED);
  assert.equal(st.elapsedMatchMs, 40 * MIN);
  assert.equal(st.secondHalfMs, 20 * MIN);
});

test('fim da 2.ª parte do prolongamento leva sempre a penáltis', () => {
  const ctx = ateAoFimDaSegunda();
  step(ctx, (s) => A.finishPeriod(s, 'PROLONGAMENTO', T0 + 50 * MIN), T0 + 50 * MIN);
  step(ctx, (s) => A.setSecondHalfLineup(s, CINCO, T0 + 51 * MIN), T0 + 51 * MIN);
  step(ctx, (s) => A.startExtraTime(s, T0 + 51 * MIN), T0 + 51 * MIN);
  step(ctx, (s) => A.finishPeriod(s, 'PROLONGAMENTO', T0 + 56 * MIN), T0 + 56 * MIN);
  step(ctx, (s) => A.setSecondHalfLineup(s, CINCO, T0 + 57 * MIN), T0 + 57 * MIN);
  let st = step(ctx, (s) => A.startExtraTime(s, T0 + 57 * MIN), T0 + 57 * MIN);
  assert.equal(V.canFinishPeriod(st, 'PROLONGAMENTO')?.chave, 'validacao.prolongamentoJaAcabou');
  st = step(ctx, (s) => A.finishPeriod(s, 'PENALTIS', T0 + 62 * MIN), T0 + 62 * MIN);
  assert.equal(faseDoJogo(st), 'PENALTIS');
  // Quem acabou em campo: o guarda-redes do desempate por omissão.
  assert.equal(guardaRedesDosPenaltis(st), 'p1');
  const ordem = elegiveisPenaltis(st).map((p) => p.playerId);
  assert.deepEqual(ordem, ['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p1']);
});

test('decisão dos penáltis: antecipada nos cinco e morte súbita', () => {
  const k = (team, resultado) => ({ team, resultado });
  // 3 golos contra 0 depois de 3 cada: eles só têm mais 2 → acabou.
  let r = resumoPenaltis({
    primeiro: 'US',
    kicks: [k('US', 'GOLO'), k('THEM', 'FORA'), k('US', 'GOLO'), k('THEM', 'DEFENDIDO'), k('US', 'GOLO'), k('THEM', 'DEFENDIDO')],
  });
  assert.equal(r.decidido, true);
  assert.equal(r.vencedor, 'US');
  // 3–2 depois de 3 nossos e 2 deles: ainda não.
  r = resumoPenaltis({
    primeiro: 'US',
    kicks: [k('US', 'GOLO'), k('THEM', 'GOLO'), k('US', 'GOLO'), k('THEM', 'GOLO'), k('US', 'GOLO')],
  });
  assert.equal(r.decidido, false);
  assert.equal(r.proximaEquipa, 'THEM');
  // 5–5: morte súbita; 6.º par 1–0 decide.
  const cinco = [];
  for (let i = 0; i < 5; i++) cinco.push(k('THEM', 'GOLO'), k('US', 'GOLO'));
  r = resumoPenaltis({ primeiro: 'THEM', kicks: cinco });
  assert.equal(r.decidido, false);
  assert.equal(r.morteSubita, true);
  assert.equal(r.proximaEquipa, 'THEM');
  r = resumoPenaltis({ primeiro: 'THEM', kicks: [...cinco, k('THEM', 'DEFENDIDO')] });
  assert.equal(r.decidido, false);
  r = resumoPenaltis({ primeiro: 'THEM', kicks: [...cinco, k('THEM', 'DEFENDIDO'), k('US', 'GOLO')] });
  assert.equal(r.decidido, true);
  assert.equal(r.vencedor, 'US');
  // A ordem dá a volta: com 2 na lista, o 3.º penálti é do primeiro.
  r = resumoPenaltis({ primeiro: 'US', ordem: ['a', 'b'], kicks: [k('US', 'GOLO'), k('THEM', 'GOLO'), k('US', 'GOLO'), k('THEM', 'GOLO')] });
  assert.equal(r.proximoMarcador, 'a');
});

test('jogos antigos continuam iguais (sem prolongamento nem penáltis)', () => {
  const ctx = ateAoFimDaSegunda();
  const st = step(ctx, (s) => A.finishMatch(s, T0 + 50 * MIN), T0 + 50 * MIN);
  assert.equal(st.penaltis, null);
  assert.equal(teveProlongamento(st), false);
  assert.equal(st.secondHalfMs, 20 * MIN);
});

test('painel da época: prolongamentos, desempates, conversão e defesas', async () => {
  const { penaltisDaEpoca, golosPorFaixa } = await import('../src/domain/dashboard.js');
  const ctx = ateAoFimDaSegunda();
  step(ctx, (s) => A.finishPeriod(s, 'PROLONGAMENTO', T0 + 50 * MIN), T0 + 50 * MIN);
  step(ctx, (s) => A.setSecondHalfLineup(s, CINCO, T0 + 51 * MIN), T0 + 51 * MIN);
  step(ctx, (s) => A.startExtraTime(s, T0 + 51 * MIN), T0 + 51 * MIN);
  step(ctx, (s) => A.teamGoalBy(s, 'p2', T0 + 52 * MIN), T0 + 52 * MIN);
  step(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 53 * MIN), T0 + 53 * MIN);
  step(ctx, (s) => A.finishPeriod(s, 'PROLONGAMENTO', T0 + 56 * MIN), T0 + 56 * MIN);
  step(ctx, (s) => A.setSecondHalfLineup(s, CINCO, T0 + 57 * MIN), T0 + 57 * MIN);
  step(ctx, (s) => A.startExtraTime(s, T0 + 57 * MIN), T0 + 57 * MIN);
  step(ctx, (s) => A.finishPeriod(s, 'PENALTIS', T0 + 62 * MIN), T0 + 62 * MIN);
  step(ctx, (s) => A.startShootout(s, { ordem: ['p5', 'p4'], primeiro: 'US' }), T0 + 63 * MIN);
  step(ctx, (s) => A.shootoutKick(s, { team: 'US', playerId: 'p5', zona: 'BE', resultado: 'GOLO' }), T0 + 63 * MIN);
  step(ctx, (s) => A.shootoutKick(s, { team: 'THEM', goalkeeperId: 'p1', zona: 'BD', mergulho: 'BD', resultado: 'DEFENDIDO' }), T0 + 63 * MIN);
  step(ctx, (s) => A.shootoutKick(s, { team: 'US', playerId: 'p4', zona: 'FORA', resultado: 'FORA' }), T0 + 64 * MIN);
  const st = step(ctx, (s) => A.finishMatch(s, T0 + 70 * MIN), T0 + 70 * MIN);
  const entries = [{ match: { id: 'm1' }, state: st }];
  const d = penaltisDaEpoca(entries);
  assert.equal(d.prolongamentos, 1);
  assert.equal(d.jogos, 1);
  assert.equal(d.ganhos, 1);
  assert.deepEqual([d.nossos.golos, d.nossos.batidos], [1, 2]);
  assert.equal(d.deles.defendidos, 1);
  assert.equal(d.porGuardaRedes[0].playerId, 'p1');
  assert.equal(d.porJogador[0].playerId, 'p5');
  // Os golos do prolongamento não entram nas faixas das duas partes.
  const f = golosPorFaixa(entries);
  assert.deepEqual([f.prolongamento.marcados, f.prolongamento.sofridos], [1, 1]);
  const nasPartes = [...f.primeira, ...f.segunda].reduce((a, x) => a + x.marcados + x.sofridos, 0);
  assert.equal(nasPartes, 2);
});

test('os PDF do jogo e do painel saem com o prolongamento e os penáltis', async () => {
  const { gerarPdfJogo } = await import('../src/lib/pdf/relatorioJogo.js');
  const { gerarPdfPainel } = await import('../src/lib/pdf/relatorioPainel.js');
  const { textoResumoWhatsApp } = await import('../src/lib/resumoWhatsApp.js');
  const ctx = ateAoFimDaSegunda();
  step(ctx, (s) => A.finishPeriod(s, 'PROLONGAMENTO', T0 + 50 * MIN), T0 + 50 * MIN);
  step(ctx, (s) => A.setSecondHalfLineup(s, CINCO, T0 + 51 * MIN), T0 + 51 * MIN);
  step(ctx, (s) => A.startExtraTime(s, T0 + 51 * MIN), T0 + 51 * MIN);
  step(ctx, (s) => A.finishPeriod(s, 'PROLONGAMENTO', T0 + 56 * MIN), T0 + 56 * MIN);
  step(ctx, (s) => A.setSecondHalfLineup(s, CINCO, T0 + 57 * MIN), T0 + 57 * MIN);
  step(ctx, (s) => A.startExtraTime(s, T0 + 57 * MIN), T0 + 57 * MIN);
  step(ctx, (s) => A.finishPeriod(s, 'PENALTIS', T0 + 62 * MIN), T0 + 62 * MIN);
  step(ctx, (s) => A.startShootout(s, { ordem: ['p5'], primeiro: 'US' }), T0 + 63 * MIN);
  step(ctx, (s) => A.shootoutKick(s, { team: 'US', playerId: 'p5', zona: 'BE', resultado: 'GOLO' }), T0 + 63 * MIN);
  step(ctx, (s) => A.shootoutKick(s, { team: 'THEM', goalkeeperId: 'p1', zona: 'BD', mergulho: 'BD', resultado: 'DEFENDIDO' }), T0 + 63 * MIN);
  const state = step(ctx, (s) => A.finishMatch(s, T0 + 70 * MIN), T0 + 70 * MIN);
  const m = { ...match, opponentName: 'Minerva', homeOrAway: 'HOME', status: 'FINISHED' };
  const jogo = await gerarPdfJogo({ club: { name: 'Clube' }, match: m, state, team: { name: 'Sub-15' } });
  assert.ok(jogo.size > 5000);
  const painel = await gerarPdfPainel({ club: { name: 'Clube' }, team: { name: 'Sub-15' }, entries: [{ match: m, state }], roster: [], parteMs: 20 * MIN });
  assert.ok(painel.size > 5000);
  const texto = textoResumoWhatsApp({ state, match: m, ourName: 'Nós', opponentName: 'Minerva' });
  assert.match(texto, /a\.p\. \(1–0 g\.p\.\)/);
});

test('penáltis de um jogador: os que bateu e, se foi GR, os que enfrentou', async () => {
  const { penaltisDoAtleta } = await import('../src/domain/dashboard.js');
  const ctx = ateAoFimDaSegunda();
  step(ctx, (s) => A.finishPeriod(s, 'PENALTIS', T0 + 50 * MIN), T0 + 50 * MIN);
  step(ctx, (s) => A.startShootout(s, { ordem: ['p5', 'p4'], primeiro: 'US' }), T0 + 51 * MIN);
  step(ctx, (s) => A.shootoutKick(s, { team: 'US', playerId: 'p5', zona: 'BE', resultado: 'GOLO' }), T0 + 51 * MIN);
  step(ctx, (s) => A.shootoutKick(s, { team: 'THEM', goalkeeperId: 'p1', zona: 'AD', mergulho: 'BE', resultado: 'GOLO' }), T0 + 51 * MIN);
  step(ctx, (s) => A.shootoutKick(s, { team: 'US', playerId: 'p4', zona: 'FORA', resultado: 'FORA' }), T0 + 52 * MIN);
  step(ctx, (s) => A.shootoutKick(s, { team: 'THEM', goalkeeperId: 'p1', zona: 'BD', mergulho: 'BD', resultado: 'DEFENDIDO' }), T0 + 52 * MIN);
  const st = step(ctx, (s) => A.finishMatch(s, T0 + 60 * MIN), T0 + 60 * MIN);
  const entries = [{ match: { id: 'm1' }, state: st }];
  const p5 = penaltisDoAtleta(entries, 'p5');
  assert.deepEqual(p5.batidos.map((k) => k.zona), ['BE']);
  assert.equal(p5.golos, 1);
  const gr = penaltisDoAtleta(entries, 'p1');
  assert.equal(gr.comoGr.length, 2);
  assert.equal(gr.grDefendidos, 1);
  assert.equal(gr.jogos, 1);
  assert.equal(penaltisDoAtleta(entries, 'p7').jogos, 0);
});

test('PDF do atleta sai com a baliza dos penáltis (marcador e GR)', async () => {
  const { gerarPdfAtleta } = await import('../src/lib/pdf/relatorioPainel.js');
  const ctx = ateAoFimDaSegunda();
  step(ctx, (s) => A.finishPeriod(s, 'PENALTIS', T0 + 50 * MIN), T0 + 50 * MIN);
  step(ctx, (s) => A.startShootout(s, { ordem: ['p5'], primeiro: 'US' }), T0 + 51 * MIN);
  step(ctx, (s) => A.shootoutKick(s, { team: 'US', playerId: 'p5', zona: 'BE', resultado: 'GOLO' }), T0 + 51 * MIN);
  step(ctx, (s) => A.shootoutKick(s, { team: 'THEM', goalkeeperId: 'p1', zona: 'FORA', mergulho: 'BD', resultado: 'FORA' }), T0 + 51 * MIN);
  step(ctx, (s) => A.shootoutKick(s, { team: 'US', playerId: 'p5', zona: 'BE', resultado: 'DEFENDIDO' }), T0 + 52 * MIN);
  const state = step(ctx, (s) => A.finishMatch(s, T0 + 60 * MIN), T0 + 60 * MIN);
  const m = { ...match, opponentName: 'Minerva', homeOrAway: 'HOME', status: 'FINISHED' };
  const entries = [{ match: m, state }];
  for (const [id, nome, num] of [['p5', 'E', 5], ['p1', 'A', 1]]) {
    const pdf = await gerarPdfAtleta({ player: { id, name: nome, shirtNumber: num }, club: { name: 'Clube' }, team: { name: 'Sub-15' }, entries });
    assert.ok(pdf.size > 3000);
  }
});
