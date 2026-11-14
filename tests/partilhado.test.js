// tests/partilhado.test.js — jogo com registo partilhado (domain/partilha.js e
// domain/partilhado.js): o papel, a hora, a fusão e o desfazer.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMatchState } from '../src/domain/reducer.js';
import { buildMatchState as buildMatchState182 } from './fixtures/reducer-1.8.2/reducer.js';
import * as A from '../src/domain/actions.js';
import { EVENT, LOCATION, MATCH_STATUS } from '../src/domain/constants.js';
import { REGISTO, corrigirRegisto, registar, registosDoJogo, resumoRegistos } from '../src/domain/registos.js';
import {
  MOTIVO,
  PAPEL,
  VERSAO,
  ePartilhado,
  eventosDaFusao,
  fusaoEmVigor,
  idDeFusao,
  impedimento,
  jogosParaJuntar,
  lerPartilha,
  levaHora,
  linhaDoTempo,
  mesmoJogo,
  metadataDeCriacao,
  partilhaTerminada,
  planoDeFusao,
  posicaoNoRelogio,
  posicaoPelaParte,
  guardaRedesAoMinuto,
  RELOGIO,
  metadataDoRelogio,
  relogioDosRegistos,
  resumoDosRegistos,
  resumoDosTempos,
} from '../src/domain/partilhado.js';

const MIN = 60_000;
const SEG = 1000;
// 14/11/2026, 15:00 em Lisboa (meio do dia: o "mesmo dia" não depende do fuso).
const T0 = new Date(2026, 10, 14, 15, 0, 0).getTime();
const START = { p1: 'GOALKEEPER', p2: 'FIXO', p3: 'LEFT_WINGER', p4: 'RIGHT_WINGER', p5: 'PIVOT' };
const NOMES = ['Ana', 'Bruno', 'Carlos', 'Diogo', 'Eduardo', 'Filipe', 'Gonçalo'];

function jogo(id, papel, { comCinco = true, extra = [] } = {}) {
  const match = {
    id,
    clubId: 'c1',
    teamId: 't1',
    opponentName: 'Sporting CP',
    scheduledAt: T0,
    periodDurationMs: 20 * MIN,
    createdAt: T0 - 60 * MIN,
  };
  const squad = [...NOMES, ...extra].map((name, i) => {
    const pid = i < NOMES.length ? `p${i + 1}` : `x${i + 1}`;
    return {
      id: `${id}-s${i + 1}`,
      matchId: id,
      playerId: pid,
      playerNameSnapshot: name,
      shirtNumberSnapshot: i + 1,
      initialPosition: comCinco ? START[pid] || null : null,
      initialLocation: comCinco && START[pid] ? LOCATION.COURT : LOCATION.BENCH,
    };
  });
  const ctx = { match, squad, events: [] };
  const criado = A.matchCreated({ matchId: id, currentPeriod: 0, timerStatus: 'STOPPED', teamScore: 0, opponentScore: 0 }, T0 - 30 * MIN);
  if (papel) criado.metadata = metadataDeCriacao(papel);
  por(ctx, criado);
  return ctx;
}

/** Como o `events.append`: seq, e a hora real nos eventos que a levam. */
function por(ctx, ev) {
  const partilhado = ePartilhado(ctx.events) || ePartilhado([ev]);
  if (partilhado && levaHora(ev.eventType) && ev.metadata?.hora == null) {
    ev.metadata = { ...(ev.metadata || {}), hora: ev.createdAt };
  }
  ev.seq = ctx.events.length + 1;
  ctx.events.push(ev);
  return ev;
}

const estado = (ctx, reducer = buildMatchState) => reducer(ctx.match, ctx.squad, ctx.events);
const gravar = (ctx, fabrica, now) => por(ctx, fabrica(estado(ctx), now));
const carregado = (ctx) => ({ match: ctx.match, squad: ctx.squad, events: ctx.events, state: estado(ctx) });

/**
 * O jogo dos Tempos: 1.ª parte com uma paragem de 2 min (dos 5 aos 7 de
 * relógio real), golo do p5 aos 6:00 de jogo, intervalo aos 23:00 de jogo,
 * 2.ª parte de 22 min, e um golo sofrido.
 */
function jogoDosTempos() {
  const ctx = jogo('mT', PAPEL.TEMPOS);
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  gravar(ctx, (s) => A.pauseClock(s, T0 + 5 * MIN), T0 + 5 * MIN);
  gravar(ctx, (s) => A.resumeClock(s, T0 + 7 * MIN), T0 + 7 * MIN);
  gravar(ctx, (s) => A.teamGoalBy(s, 'p5', T0 + 8 * MIN), T0 + 8 * MIN);
  gravar(ctx, (s) => A.finishFirstHalf(s, T0 + 25 * MIN), T0 + 25 * MIN);
  gravar(ctx, (s) => A.setSecondHalfLineup(s, { ...Object.fromEntries(Object.entries(START).map(([p, pos]) => [pos, p])) }, T0 + 34 * MIN), T0 + 34 * MIN);
  gravar(ctx, (s) => A.startSecondHalf(s, T0 + 35 * MIN), T0 + 35 * MIN);
  gravar(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 40 * MIN), T0 + 40 * MIN);
  gravar(ctx, (s) => A.finishMatch(s, T0 + 57 * MIN), T0 + 57 * MIN);
  return ctx;
}

function registo(ctx, dados, now) {
  return gravar(ctx, (s) => registar(s, dados, now), now);
}

function terminar(ctx, now) {
  return gravar(ctx, (s) => A.correction(s, { partilhado: { v: VERSAO, terminado: now } }, now), now);
}

/** Aplica um plano ao jogo base, como o `juntar`: os registos e depois a marca. */
function aplicar(base, outro, plano, n = 1) {
  for (const ev of plano.eventos) por(base, { ...ev });
  gravar(base, (s) => A.correction(s, { partilhado: { v: VERSAO, fusao: { com: outro.match.id, n, registos: plano.total } } }), T0 + 70 * MIN);
  gravar(outro, (s) => A.correction(s, { partilhado: { v: VERSAO, fundidoEm: { jogo: base.match.id, n } } }), T0 + 70 * MIN);
}

/* ------------------------------------------------------------------ papel */

test('um jogo normal não tem partilha', () => {
  const ctx = jogo('m0', null);
  assert.equal(ePartilhado(ctx.events), false);
  assert.deepEqual(lerPartilha(ctx.events), { papel: null, terminadoEm: null, fusao: null, fundidoEm: null, nFusoes: 0 });
  // Marcas soltas num jogo normal não fazem dele um jogo partilhado.
  gravar(ctx, (s) => A.correction(s, { partilhado: { v: 1, terminado: T0 } }), T0);
  assert.equal(lerPartilha(ctx.events).papel, null);
  assert.equal(lerPartilha(ctx.events).terminadoEm, null);
});

test('o papel vai no MATCH_CREATED e lê-se de volta', () => {
  assert.deepEqual(metadataDeCriacao(PAPEL.TEMPOS), { partilhado: { v: 1, papel: 'TEMPOS' } });
  assert.throws(() => metadataDeCriacao('OUTRO'));
  assert.equal(lerPartilha(jogo('a', PAPEL.TEMPOS).events).papel, PAPEL.TEMPOS);
  assert.equal(lerPartilha(jogo('b', PAPEL.REGISTOS).events).papel, PAPEL.REGISTOS);
});

test('o papel não muda o jogo: o reducer de hoje e o da 1.8.2 dão o mesmo que num jogo normal', () => {
  const normal = jogo('m1', null);
  const tempos = jogo('m1', PAPEL.TEMPOS);
  for (const ctx of [normal, tempos]) {
    gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
    gravar(ctx, (s) => A.teamGoalBy(s, 'p5', T0 + 3 * MIN), T0 + 3 * MIN);
    gravar(ctx, (s) => A.finishFirstHalf(s, T0 + 20 * MIN), T0 + 20 * MIN);
  }
  for (const reducer of [buildMatchState, buildMatchState182]) {
    const a = estado(normal, reducer);
    const b = estado(tempos, reducer);
    assert.equal(b.status, a.status);
    assert.equal(b.teamScore, 1);
    assert.equal(b.firstHalfMs, a.firstHalfMs);
    assert.deepEqual(b.warnings, a.warnings);
  }
});

test('o jogo dos Registos nunca começa: fica em rascunho e não conta como jogo', () => {
  const ctx = jogo('mR', PAPEL.REGISTOS, { comCinco: false });
  registo(ctx, { registo: REGISTO.REMATE, playerId: 'p2', resultado: 'FORA', x: 0.7, y: 0.4 }, T0 + MIN);
  terminar(ctx, T0 + 60 * MIN);
  const s = estado(ctx);
  assert.equal(s.status, MATCH_STATUS.DRAFT);
  assert.equal(s.startedAt, null);
  assert.equal(registosDoJogo(s).length, 1);
  assert.equal(estado(ctx, buildMatchState182).status, MATCH_STATUS.DRAFT);
});

test('terminar e reabrir os Registos', () => {
  const ctx = jogo('mR', PAPEL.REGISTOS, { comCinco: false });
  assert.equal(partilhaTerminada(lerPartilha(ctx.events), estado(ctx)), false);
  terminar(ctx, T0 + 60 * MIN);
  assert.equal(lerPartilha(ctx.events).terminadoEm, T0 + 60 * MIN);
  assert.equal(partilhaTerminada(lerPartilha(ctx.events), estado(ctx)), true);
  gravar(ctx, (s) => A.correction(s, { partilhado: { v: 1, reaberto: true } }), T0 + 61 * MIN);
  assert.equal(partilhaTerminada(lerPartilha(ctx.events), estado(ctx)), false);
});

test('os Tempos estão terminados quando o jogo acaba', () => {
  const ctx = jogo('mT', PAPEL.TEMPOS);
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  assert.equal(partilhaTerminada(lerPartilha(ctx.events), estado(ctx)), false);
  const fim = jogoDosTempos();
  assert.equal(partilhaTerminada(lerPartilha(fim.events), estado(fim)), true);
});

/* ------------------------------------------------------------------- hora */

test('só os eventos do relógio e os registos levam a hora, e só nos jogos partilhados', () => {
  assert.equal(levaHora(EVENT.CLOCK_PAUSED), true);
  assert.equal(levaHora(EVENT.STAT_RECORDED), true);
  assert.equal(levaHora(EVENT.SUBSTITUTION), false);
  const t = jogoDosTempos();
  const pausa = t.events.find((e) => e.eventType === EVENT.CLOCK_PAUSED);
  assert.equal(pausa.metadata.hora, T0 + 5 * MIN);
  // Golos, faltas e cartões também: é o que o aparelho dos Registos aponta.
  const golo = t.events.find((e) => e.eventType === EVENT.TEAM_GOAL_ADDED);
  assert.equal(golo.metadata.hora, T0 + 8 * MIN);
  assert.equal(levaHora(EVENT.YELLOW_CARD), true);
  assert.equal(levaHora(EVENT.TEAM_FOUL_ADDED), true);
  const normal = jogo('m0', null);
  const ev = gravar(normal, (s) => A.startFirstHalf(s, T0), T0);
  assert.equal(ev.metadata.hora, undefined);
});

test('a linha do tempo põe cada hora na parte e no minuto certos', () => {
  const pontos = linhaDoTempo(estado(jogoDosTempos()).events);
  const em = (h) => posicaoNoRelogio(pontos, h);
  // Antes do apito: minuto 0 da 1.ª parte.
  assert.deepEqual(em(T0 - 10 * MIN), { period: 1, matchElapsedMs: 0, periodElapsedMs: 0 });
  // A correr.
  assert.deepEqual(em(T0 + 3 * MIN), { period: 1, matchElapsedMs: 3 * MIN, periodElapsedMs: 3 * MIN });
  // Na paragem: o minuto em que o relógio parou.
  assert.deepEqual(em(T0 + 6 * MIN), { period: 1, matchElapsedMs: 5 * MIN, periodElapsedMs: 5 * MIN });
  // Depois de retomar: desconta os 2 minutos parados.
  assert.deepEqual(em(T0 + 8 * MIN), { period: 1, matchElapsedMs: 6 * MIN, periodElapsedMs: 6 * MIN });
  // No intervalo: o fim da 1.ª parte.
  assert.deepEqual(em(T0 + 30 * MIN), { period: 1, matchElapsedMs: 23 * MIN, periodElapsedMs: 23 * MIN });
  // 2.ª parte: o minuto do jogo continua, o da parte recomeça.
  assert.deepEqual(em(T0 + 36 * MIN), { period: 2, matchElapsedMs: 24 * MIN, periodElapsedMs: 1 * MIN });
  // Depois do fim: o fim.
  assert.deepEqual(em(T0 + 90 * MIN), { period: 2, matchElapsedMs: 45 * MIN, periodElapsedMs: 22 * MIN });
});

test('a linha do tempo usa a hora do aparelho e não a do servidor', () => {
  const t = jogoDosTempos();
  // Como chega ao outro aparelho: `createdAt` é a hora do envio (tudo no fim).
  const doServidor = t.events.map((e, i) => ({ ...e, createdAt: T0 + 3 * 60 * MIN + i }));
  const s = buildMatchState(t.match, t.squad, doServidor);
  const pos = posicaoNoRelogio(linhaDoTempo(s.events), T0 + 8 * MIN);
  assert.deepEqual(pos, { period: 1, matchElapsedMs: 6 * MIN, periodElapsedMs: 6 * MIN });
});

test('acertar o relógio e terminar num minuto escolhido', () => {
  const ctx = jogo('mT', PAPEL.TEMPOS);
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  // Aos 10 min reais, o relógio é atrasado 2 min.
  gravar(ctx, (s) => A.adjustClock(s, -2 * MIN, T0 + 10 * MIN), T0 + 10 * MIN);
  gravar(ctx, (s) => A.finishFirstHalf(s, T0 + 22 * MIN), T0 + 22 * MIN);
  gravar(ctx, (s) => A.startSecondHalf(s, T0 + 30 * MIN), T0 + 30 * MIN);
  // Esqueceram-se de terminar: carregam aos 70 min reais e escolhem o fim aos 40:00 de jogo.
  gravar(ctx, (s) => A.finishMatchAt(s, 40 * MIN, T0 + 70 * MIN), T0 + 70 * MIN);
  const pontos = linhaDoTempo(estado(ctx).events);
  assert.equal(posicaoNoRelogio(pontos, T0 + 12 * MIN).matchElapsedMs, 10 * MIN);
  assert.equal(posicaoNoRelogio(pontos, T0 + 22 * MIN).matchElapsedMs, 20 * MIN);
  assert.equal(posicaoNoRelogio(pontos, T0 + 40 * MIN).matchElapsedMs, 30 * MIN);
  // Um registo aos 65 min reais caía aos 55:00: fica no fim escolhido.
  assert.deepEqual(posicaoNoRelogio(pontos, T0 + 65 * MIN), { period: 2, matchElapsedMs: 40 * MIN, periodElapsedMs: 20 * MIN });
  assert.equal(posicaoNoRelogio([], T0), null);
});

/* --------------------------------------------------------- o mesmo jogo */

test('mesmoJogo: escalão, adversário (sem acentos nem maiúsculas) e dia', () => {
  const a = { id: 'a', teamId: 't1', opponentName: 'Leões de Porto Salvo', scheduledAt: T0 };
  assert.equal(mesmoJogo(a, { ...a, id: 'b', opponentName: '  leoes  de porto salvo ', scheduledAt: T0 + 3 * 60 * MIN }), true);
  assert.equal(mesmoJogo(a, { ...a }), false, 'o próprio jogo não conta');
  assert.equal(mesmoJogo(a, { ...a, id: 'b', teamId: 't2' }), false);
  assert.equal(mesmoJogo(a, { ...a, id: 'b', opponentName: 'Benfica' }), false);
  assert.equal(mesmoJogo(a, { ...a, id: 'b', scheduledAt: T0 + 24 * 60 * MIN }), false);
  assert.equal(mesmoJogo({ ...a, opponentName: '' }, { ...a, id: 'b', opponentName: '' }), false);
});

test('jogosParaJuntar: só o papel contrário, por fundir, com o motivo do que ainda falta', () => {
  const tempos = jogoDosTempos();
  const meu = { match: tempos.match, partilha: lerPartilha(tempos.events) };
  const cand = (ctx, sincronizado = true) => ({ ...carregado(ctx), partilha: lerPartilha(ctx.events), sincronizado });

  const pronto = jogo('r1', PAPEL.REGISTOS, { comCinco: false });
  terminar(pronto, T0 + 60 * MIN);
  const porTerminar = jogo('r2', PAPEL.REGISTOS, { comCinco: false });
  const porSubir = jogo('r3', PAPEL.REGISTOS, { comCinco: false });
  terminar(porSubir, T0 + 60 * MIN);
  const mesmoPapel = jogo('t2', PAPEL.TEMPOS);
  const normal = jogo('n1', null);
  const outroAdversario = jogo('r4', PAPEL.REGISTOS, { comCinco: false });
  outroAdversario.match.opponentName = 'Benfica';
  terminar(outroAdversario, T0 + 60 * MIN);
  const arquivado = jogo('r5', PAPEL.REGISTOS, { comCinco: false });
  arquivado.match.archivedAt = T0;
  const jaFundido = jogo('r6', PAPEL.REGISTOS, { comCinco: false });
  gravar(jaFundido, (s) => A.correction(s, { partilhado: { v: 1, fundidoEm: { jogo: 'zz', n: 1 } } }), T0);

  const lista = jogosParaJuntar(meu, [
    cand(pronto),
    cand(porTerminar),
    cand(porSubir, false),
    cand(mesmoPapel),
    cand(normal),
    cand(outroAdversario),
    cand(arquivado),
    cand(jaFundido),
  ]);
  assert.deepEqual(
    Object.fromEntries(lista.map((c) => [c.match.id, c.motivo])),
    { r1: null, r2: MOTIVO.NAO_TERMINADO, r3: MOTIVO.NAO_SINCRONIZADO }
  );
  // Um jogo normal não tem com quem se juntar.
  assert.deepEqual(jogosParaJuntar({ match: normal.match, partilha: lerPartilha(normal.events) }, [cand(pronto)]), []);
});

test('impedimento: fundido, por terminar, por sincronizar', () => {
  const t = jogoDosTempos();
  const base = { partilha: lerPartilha(t.events), state: estado(t) };
  assert.equal(impedimento({ ...base, sincronizado: true }), null);
  assert.equal(impedimento({ ...base, sincronizado: false }), MOTIVO.NAO_SINCRONIZADO);
  gravar(t, (s) => A.correction(s, { partilhado: { v: 1, fusao: { com: 'x', n: 1, registos: 0 } } }), T0);
  assert.equal(impedimento({ partilha: lerPartilha(t.events), state: estado(t), sincronizado: true }), MOTIVO.JA_FUNDIDO);
});

/* ------------------------------------------------------------------ fusão */

test('idDeFusao: sempre o mesmo, com forma de uuid, diferente por fusão e por jogo', () => {
  const id = idDeFusao('3f2b6c1e-0000-4000-8000-000000000001', 'mT', 1);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(id, idDeFusao('3f2b6c1e-0000-4000-8000-000000000001', 'mT', 1));
  assert.notEqual(id, idDeFusao('3f2b6c1e-0000-4000-8000-000000000001', 'mT', 2));
  assert.notEqual(id, idDeFusao('3f2b6c1e-0000-4000-8000-000000000001', 'mX', 1));
  assert.notEqual(id, idDeFusao('3f2b6c1e-0000-4000-8000-000000000002', 'mT', 1));
  const muitos = new Set(Array.from({ length: 2000 }, (_, i) => idDeFusao(`ev-${i}`, 'mT', 1)));
  assert.equal(muitos.size, 2000);
});

/** O jogo dos Registos que acompanha `jogoDosTempos()`. */
function jogoDosRegistos() {
  const r = jogo('mR', PAPEL.REGISTOS, { comCinco: false, extra: ['Hugo'] });
  // 3:00 da 1.ª parte.
  registo(r, { registo: REGISTO.REMATE, playerId: 'p2', resultado: 'DEFENDIDO', x: 0.8, y: 0.5 }, T0 + 3 * MIN);
  // Durante a paragem (relógio nos 5:00).
  registo(r, { registo: REGISTO.RECUPERACAO, playerId: 'p3', x: 0.4, y: 0.2 }, T0 + 6 * MIN);
  // O golo do p5 (Tempos: 6:00), tocado 5 s depois.
  registo(r, { registo: REGISTO.REMATE, playerId: 'p5', resultado: 'GOLO', x: 0.9, y: 0.5 }, T0 + 8 * MIN + 5 * SEG);
  // Um "golo" que os Tempos não têm.
  registo(r, { registo: REGISTO.REMATE, playerId: 'p4', resultado: 'GOLO', x: 0.9, y: 0.4 }, T0 + 15 * MIN);
  // No intervalo.
  registo(r, { registo: REGISTO.PERDA_BOLA, playerId: 'p2' }, T0 + 30 * MIN);
  // 2.ª parte, 1:00.
  registo(r, { registo: REGISTO.CANTO, equipa: 'THEM' }, T0 + 36 * MIN);
  // O golo sofrido (Tempos: 2.ª parte, 5:00 = 28:00 de jogo), tocado 20 s antes.
  registo(r, { registo: REGISTO.REMATE_ADV, resultado: 'GOLO', x: 0.1, y: 0.5 }, T0 + 40 * MIN - 20 * SEG);
  // De alguém que não está na convocatória dos Tempos.
  registo(r, { registo: REGISTO.RECUPERACAO, playerId: 'x8', x: 0.5, y: 0.5 }, T0 + 45 * MIN);
  // Um engano, desfeito: não passa.
  const engano = registo(r, { registo: REGISTO.PASSE_FALHADO, playerId: 'p1' }, T0 + 46 * MIN);
  gravar(r, (s) => A.undoEvent(s, engano, T0 + 46 * MIN + SEG), T0 + 46 * MIN + SEG);
  // Um corrigido: passa já com a correção.
  const trocado = registo(r, { registo: REGISTO.PASSE_FALHADO, playerId: 'p1' }, T0 + 50 * MIN);
  gravar(r, (s) => corrigirRegisto(s, { targetEventId: trocado.id, playerId: 'p3' }, T0 + 51 * MIN), T0 + 51 * MIN);
  terminar(r, T0 + 60 * MIN);
  return r;
}

test('planoDeFusao: os registos passam para o relógio dos Tempos', () => {
  const t = jogoDosTempos();
  const r = jogoDosRegistos();
  const plano = planoDeFusao({ base: carregado(t), outro: carregado(r), n: 1 });

  assert.equal(plano.total, 9);
  assert.equal(plano.eventos.length, 9);
  assert.deepEqual(plano.porRegisto, { remate: 3, recuperacao: 2, perda_bola: 1, canto: 1, remate_adv: 1, passe_falhado: 1 });
  assert.equal(plano.ignorados, 0);
  assert.equal(plano.semHora, 0);
  assert.equal(plano.registosNaBase, 0);

  const de = (registo, playerId = null) =>
    plano.eventos.filter((e) => e.metadata.registo === registo && (playerId == null || e.playerId === playerId));
  const tempo = (e) => [e.period, e.matchElapsedMs, e.periodElapsedMs];

  assert.deepEqual(tempo(de('remate', 'p2')[0]), [1, 3 * MIN, 3 * MIN]);
  assert.deepEqual(tempo(de('recuperacao', 'p3')[0]), [1, 5 * MIN, 5 * MIN]);
  assert.deepEqual(tempo(de('perda_bola')[0]), [1, 23 * MIN, 23 * MIN]);
  assert.deepEqual(tempo(de('canto')[0]), [2, 24 * MIN, 1 * MIN]);

  for (const e of plano.eventos) {
    assert.equal(e.eventType, EVENT.STAT_RECORDED);
    assert.equal(e.matchId, 'mT');
    assert.equal(e.id, e.clientEventId);
    assert.equal(e.metadata.fusao.de, 'mR');
    assert.equal(e.metadata.fusao.n, 1);
    assert.equal(e.id, idDeFusao(e.metadata.fusao.origem, 'mT', 1));
    assert.equal(e.syncedAt, null);
    assert.equal(e.undoneAt, null);
    assert.equal(typeof e.metadata.hora, 'number');
  }
  // O ponto e o resultado vêm tal e qual.
  assert.deepEqual([de('remate', 'p2')[0].metadata.x, de('remate', 'p2')[0].metadata.y, de('remate', 'p2')[0].metadata.resultado], [0.8, 0.5, 'DEFENDIDO']);
  // O passe corrigido passa com o jogador certo.
  assert.equal(de('passe_falhado').length, 1);
  assert.equal(de('passe_falhado')[0].playerId, 'p3');
});

test('planoDeFusao: o remate "golo" fica preso ao golo dos Tempos; sem par, não mexe no resultado', () => {
  const t = jogoDosTempos();
  const r = jogoDosRegistos();
  const base = carregado(t);
  const plano = planoDeFusao({ base, outro: carregado(r), n: 1 });
  assert.equal(plano.golosLigados, 2);
  assert.equal(plano.golosSemPar, 1);

  const nosso = base.state.goals.find((g) => g.team === 'US');
  const deles = base.state.goals.find((g) => g.team === 'THEM');
  const remate = (pid) => plano.eventos.find((e) => e.metadata.registo === 'remate' && e.playerId === pid);
  assert.equal(remate('p5').metadata.goloEventId, nosso.eventId);
  assert.equal(remate('p4').metadata.goloEventId, null);
  assert.equal(plano.eventos.find((e) => e.metadata.registo === 'remate_adv').metadata.goloEventId, deles.eventId);

  aplicar(t, r, plano);
  const s = estado(t);
  assert.equal(s.teamScore, 1);
  assert.equal(s.opponentScore, 1);
  assert.equal(s.status, MATCH_STATUS.FINISHED);
  const resumo = resumoRegistos(s, T0 + 80 * MIN);
  assert.equal(resumo.remates, 3);
  assert.equal(resumo.porResultado.GOLO, 2);
  assert.equal(resumo.rematesAdv, 1);
});

test('um golo já preso a um registo dos Tempos não é usado segunda vez', () => {
  const t = jogoDosTempos();
  const golo = estado(t).goals.find((g) => g.team === 'US');
  // Nos Tempos, o golo já tem o seu penálti.
  registo(t, { registo: REGISTO.PENALTI, playerId: 'p5', resultado: 'GOLO', goloEventId: golo.eventId, matchElapsedMs: 6 * MIN, period: 1 }, T0 + 58 * MIN);
  const r = jogo('mR', PAPEL.REGISTOS, { comCinco: false });
  registo(r, { registo: REGISTO.REMATE, playerId: 'p5', resultado: 'GOLO', x: 0.9, y: 0.5 }, T0 + 8 * MIN);
  terminar(r, T0 + 60 * MIN);
  const plano = planoDeFusao({ base: carregado(t), outro: carregado(r), n: 1 });
  assert.equal(plano.registosNaBase, 1);
  assert.equal(plano.golosLigados, 0);
  assert.equal(plano.golosSemPar, 1);
});

test('o marcador conta: um remate "golo" de outro jogador não fica com o golo', () => {
  const t = jogoDosTempos();
  const r = jogo('mR', PAPEL.REGISTOS, { comCinco: false });
  registo(r, { registo: REGISTO.REMATE, playerId: 'p2', resultado: 'GOLO', x: 0.9, y: 0.5 }, T0 + 8 * MIN);
  terminar(r, T0 + 60 * MIN);
  const plano = planoDeFusao({ base: carregado(t), outro: carregado(r), n: 1 });
  assert.equal(plano.golosLigados, 0);
  assert.equal(plano.eventos[0].metadata.goloEventId, null);
});

test('jogador que só está na convocatória dos Registos: o registo passa e vem avisado', () => {
  const plano = planoDeFusao({ base: carregado(jogoDosTempos()), outro: carregado(jogoDosRegistos()), n: 1 });
  assert.deepEqual(plano.foraDaConvocatoria, [{ playerId: 'x8', name: 'Hugo', number: 8, registos: 1 }]);
  assert.equal(plano.eventos.filter((e) => e.playerId === 'x8').length, 1);
});

test('a fusão só fica à vista com a marca; desfeita, os registos deixam de contar', () => {
  const t = jogoDosTempos();
  const r = jogoDosRegistos();
  const plano = planoDeFusao({ base: carregado(t), outro: carregado(r), n: 1 });

  // A meio (registos copiados, marca por pôr): nada à vista.
  for (const ev of plano.eventos) por(t, { ...ev });
  assert.equal(fusaoEmVigor(t.events), null);
  assert.equal(registosDoJogo(estado(t)).length, 0);

  gravar(t, (s) => A.correction(s, { partilhado: { v: 1, fusao: { com: 'mR', n: 1, registos: plano.total } } }), T0 + 70 * MIN);
  assert.equal(fusaoEmVigor(t.events), 1);
  assert.deepEqual(lerPartilha(t.events).fusao, { com: 'mR', n: 1, registos: 9 });
  assert.equal(registosDoJogo(estado(t)).length, 9);
  assert.equal(eventosDaFusao(t.events, 1).length, 9);

  // Por jogador, com o minuto: a recuperação do p3 na paragem.
  const lista = registosDoJogo(estado(t));
  const rec = lista.find((x) => x.registo === 'recuperacao' && x.playerId === 'p3');
  assert.deepEqual([rec.period, rec.matchElapsedMs], [1, 5 * MIN]);
  // Pela ordem do jogo, e não pela ordem em que chegaram.
  assert.deepEqual(lista.map((x) => x.matchElapsedMs), [...lista.map((x) => x.matchElapsedMs)].sort((a, b) => a - b));

  // Desfazer: uma marca, e deixam de se ler. O resto do jogo fica igual.
  gravar(t, (s) => A.correction(s, { partilhado: { v: 1, fusaoDesfeita: { n: 1 } } }), T0 + 80 * MIN);
  assert.equal(fusaoEmVigor(t.events), null);
  assert.equal(lerPartilha(t.events).fusao, null);
  assert.equal(lerPartilha(t.events).nFusoes, 1);
  assert.equal(registosDoJogo(estado(t)).length, 0);
  assert.equal(estado(t).teamScore, 1);
  assert.equal(estado(t).status, MATCH_STATUS.FINISHED);
});

test('juntar duas vezes não duplica; juntar outra vez depois de desfazer usa ids novos', () => {
  const t = jogoDosTempos();
  const r = jogoDosRegistos();
  const p1 = planoDeFusao({ base: carregado(t), outro: carregado(r), n: 1 });
  const outraVez = planoDeFusao({ base: carregado(t), outro: carregado(r), n: 1 });
  assert.deepEqual(outraVez.eventos.map((e) => e.id), p1.eventos.map((e) => e.id));

  aplicar(t, r, p1);
  assert.equal(lerPartilha(r.events).fundidoEm.jogo, 'mT');
  gravar(t, (s) => A.correction(s, { partilhado: { v: 1, fusaoDesfeita: { n: 1 } } }), T0 + 80 * MIN);
  gravar(r, (s) => A.correction(s, { partilhado: { v: 1, fusaoDesfeita: { n: 1 } } }), T0 + 80 * MIN);
  assert.equal(lerPartilha(r.events).fundidoEm, null);
  // O jogo dos Registos fica como estava, com os seus registos.
  assert.equal(registosDoJogo(estado(r)).length, 9);

  const n = Math.max(lerPartilha(t.events).nFusoes, lerPartilha(r.events).nFusoes) + 1;
  assert.equal(n, 2);
  const p2 = planoDeFusao({ base: carregado(t), outro: carregado(r), n });
  assert.equal(p2.total, 9);
  assert.equal(new Set([...p1.eventos, ...p2.eventos].map((e) => e.id)).size, 18);
  aplicar(t, r, p2, 2);
  assert.equal(registosDoJogo(estado(t)).length, 9);
});

test('versões antigas da app leem o jogo juntado sem avisos e com o mesmo resultado', () => {
  const t = jogoDosTempos();
  const r = jogoDosRegistos();
  aplicar(t, r, planoDeFusao({ base: carregado(t), outro: carregado(r), n: 1 }));
  const antigo = estado(t, buildMatchState182);
  const novo = estado(t);
  assert.equal(antigo.status, MATCH_STATUS.FINISHED);
  assert.equal(antigo.teamScore, novo.teamScore);
  assert.equal(antigo.opponentScore, novo.opponentScore);
  assert.equal(antigo.elapsedMatchMs, novo.elapsedMatchMs);
  assert.deepEqual(novo.warnings, []);
});

test('resumoDosTempos: o que o jogo dos Tempos tem', () => {
  const s = estado(jogoDosTempos());
  const r = resumoDosTempos(s);
  assert.deepEqual(r.resultado, { nos: 1, eles: 1 });
  assert.equal(r.partes, 2);
  assert.equal(r.duracaoMs, 45 * MIN);
  assert.equal(r.golos, 2);
  assert.equal(r.convocados, 7);
});

/* ----------------------------------------- o relógio dos Registos (1.39.0) */

const toque = (ctx, acao, parte, ms, hora) =>
  gravar(ctx, (s) => A.correction(s, metadataDoRelogio(acao, { parte, ms, hora }), hora), hora);

test('relógio dos Registos: começar, parar, retomar, terminar a parte e começar a seguinte', () => {
  const r = jogo('mR', PAPEL.REGISTOS, { comCinco: false });
  assert.deepEqual(relogioDosRegistos(r.events, T0), { parte: 0, aCorrer: false, emPausa: false, periodMs: 0, matchMs: 0, duracoes: {} });

  toque(r, RELOGIO.INICIO, 1, 0, T0);
  let c = relogioDosRegistos(r.events, T0 + 4 * MIN);
  assert.deepEqual([c.parte, c.aCorrer, c.periodMs, c.matchMs], [1, true, 4 * MIN, 4 * MIN]);

  toque(r, RELOGIO.PAUSA, 1, 5 * MIN, T0 + 5 * MIN);
  c = relogioDosRegistos(r.events, T0 + 9 * MIN);
  assert.deepEqual([c.aCorrer, c.periodMs], [false, 5 * MIN]);

  toque(r, RELOGIO.RETOMA, 1, 5 * MIN, T0 + 10 * MIN);
  c = relogioDosRegistos(r.events, T0 + 12 * MIN);
  assert.deepEqual([c.aCorrer, c.periodMs], [true, 7 * MIN]);

  toque(r, RELOGIO.FIM, 1, 20 * MIN, T0 + 25 * MIN);
  c = relogioDosRegistos(r.events, T0 + 30 * MIN);
  assert.deepEqual([c.parte, c.aCorrer, c.emPausa, c.periodMs, c.matchMs], [1, false, true, 20 * MIN, 20 * MIN]);
  assert.deepEqual(c.duracoes, { 1: 20 * MIN });

  // No intervalo o relógio não se pára nem se retoma.
  toque(r, RELOGIO.RETOMA, 1, 0, T0 + 31 * MIN);
  assert.equal(relogioDosRegistos(r.events, T0 + 32 * MIN).aCorrer, false);

  toque(r, RELOGIO.INICIO, 2, 0, T0 + 35 * MIN);
  c = relogioDosRegistos(r.events, T0 + 38 * MIN);
  assert.deepEqual([c.parte, c.aCorrer, c.emPausa, c.periodMs, c.matchMs], [2, true, false, 3 * MIN, 23 * MIN]);

  // O jogo dos Registos continua sem "começar" para o resto da app.
  assert.equal(estado(r).status, MATCH_STATUS.DRAFT);
  assert.equal(estado(r, buildMatchState182).status, MATCH_STATUS.DRAFT);
  assert.throws(() => metadataDoRelogio('OUTRA', { parte: 1 }));
});

test('posicaoPelaParte: a parte e o tempo dos Registos no relógio dos Tempos', () => {
  const s = estado(jogoDosTempos()); // 1.ª parte 23:00, 2.ª parte 22:00
  assert.deepEqual(posicaoPelaParte(s, 1, 4 * MIN), { period: 1, matchElapsedMs: 4 * MIN, periodElapsedMs: 4 * MIN });
  assert.deepEqual(posicaoPelaParte(s, 2, 3 * MIN), { period: 2, matchElapsedMs: 26 * MIN, periodElapsedMs: 3 * MIN });
  // Os relógios não batem ao segundo: nada passa do fim da parte nos Tempos.
  assert.deepEqual(posicaoPelaParte(s, 1, 24 * MIN), { period: 1, matchElapsedMs: 23 * MIN, periodElapsedMs: 23 * MIN });
  // Uma parte que os Tempos não tiveram cai no fim da última.
  assert.deepEqual(posicaoPelaParte(s, 3, 2 * MIN), { period: 2, matchElapsedMs: 45 * MIN, periodElapsedMs: 22 * MIN });
});

/** Como o ecrã dos Registos: a ação fica com a parte e o minuto do relógio dele. */
function apontar(ctx, fabrica, hora) {
  const ev = fabrica(estado(ctx), hora);
  const c = relogioDosRegistos(ctx.events, hora);
  if (c.parte) {
    ev.period = c.parte;
    ev.matchElapsedMs = c.matchMs;
    ev.periodElapsedMs = c.periodMs;
    if ([EVENT.TEAM_FOUL_ADDED, EVENT.OPPONENT_FOUL_ADDED, EVENT.YELLOW_CARD, EVENT.OPPONENT_YELLOW_CARD].includes(ev.eventType)) {
      ev.metadata = { ...ev.metadata, period: c.parte };
    }
  }
  return por(ctx, ev);
}

/** Os Tempos só com tempo: uma troca, um vermelho ao p4 na 2.ª parte, sem golos. */
function temposSoComTempo() {
  const ctx = jogo('mT', PAPEL.TEMPOS);
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  gravar(ctx, (s) => A.substitute(s, { playerOutId: 'p1', playerInId: 'p6', position: 'GOALKEEPER' }, T0 + 10 * MIN), T0 + 10 * MIN);
  gravar(ctx, (s) => A.finishFirstHalf(s, T0 + 20 * MIN), T0 + 20 * MIN);
  gravar(ctx, (s) => A.setSecondHalfLineup(s, { GOALKEEPER: 'p6', FIXO: 'p2', LEFT_WINGER: 'p3', RIGHT_WINGER: 'p4', PIVOT: 'p5' }, T0 + 29 * MIN), T0 + 29 * MIN);
  gravar(ctx, (s) => A.startSecondHalf(s, T0 + 30 * MIN), T0 + 30 * MIN);
  gravar(ctx, (s) => A.redCard(s, { playerId: 'p4' }, T0 + 40 * MIN), T0 + 40 * MIN);
  gravar(ctx, (s) => A.finishMatch(s, T0 + 50 * MIN), T0 + 50 * MIN);
  return ctx;
}

/** Os Registos com relógio: golos, faltas, amarelos e um remate que deu golo. */
function registosComRelogio() {
  const r = jogo('mR', PAPEL.REGISTOS, { comCinco: false });
  const I1 = T0 + 2000; // começa 2 s depois dos Tempos
  toque(r, RELOGIO.INICIO, 1, 0, I1);
  // 5:00 — golo do p5 com assistência do p3, e o remate que o deu.
  const golo = apontar(r, (s, h) => A.teamGoalBy(s, 'p5', h), I1 + 5 * MIN);
  gravar(r, (s) => A.attributeGoal(s, { targetEventId: golo.id, assistId: 'p3' }), I1 + 5 * MIN + 3000);
  gravar(r, (s) => A.attributeGoal(s, { targetEventId: golo.id, howScored: 'TRANSICAO' }), I1 + 5 * MIN + 6000);
  apontar(r, (s, h) => registar(s, { registo: REGISTO.REMATE, playerId: 'p5', resultado: 'GOLO', x: 0.9, y: 0.5, goloEventId: golo.id }, h), I1 + 5 * MIN);
  // 8:00 — falta do p2.
  const f = apontar(r, (s, h) => A.foul(s, EVENT.TEAM_FOUL_ADDED, h), I1 + 8 * MIN);
  gravar(r, (s) => A.attributeFoul(s, { targetEventId: f.id, playerId: 'p2' }), I1 + 8 * MIN + 4000);
  // 12:00 — golo sofrido (nos Tempos o GR já é o p6).
  apontar(r, (s, h) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, h), I1 + 12 * MIN);
  // 15:00 — amarelo ao p2.
  apontar(r, (s, h) => A.lateCard(s, { type: 'YELLOW', playerId: 'p2', matchElapsedMs: 0, period: 0 }, h), I1 + 15 * MIN);
  toque(r, RELOGIO.FIM, 1, 20 * MIN + 3000, I1 + 20 * MIN + 3000);
  const I2 = T0 + 30 * MIN + 1000;
  toque(r, RELOGIO.INICIO, 2, 0, I2);
  // 2.ª parte, 4:00 — segundo amarelo ao p2 e amarelo ao 9 deles; 6:00 — falta deles; 7:00 — golo sem marcador.
  apontar(r, (s, h) => A.lateCard(s, { type: 'YELLOW', playerId: 'p2', matchElapsedMs: 0, period: 0 }, h), I2 + 4 * MIN);
  apontar(r, (s, h) => A.lateOpponentYellow(s, { number: 9, matchElapsedMs: 0, period: 0 }, h), I2 + 4 * MIN);
  apontar(r, (s, h) => A.foul(s, EVENT.OPPONENT_FOUL_ADDED, h), I2 + 6 * MIN);
  apontar(r, (s, h) => A.goal(s, EVENT.TEAM_GOAL_ADDED, h), I2 + 7 * MIN);
  // Um golo deles marcado por engano e desfeito: não passa.
  const engano = apontar(r, (s, h) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, h), I2 + 8 * MIN);
  gravar(r, (s) => A.undoEvent(s, engano, I2 + 8 * MIN + 5000), I2 + 8 * MIN + 5000);
  toque(r, RELOGIO.FIM, 2, 20 * MIN, T0 + 51 * MIN);
  terminar(r, T0 + 52 * MIN);
  return r;
}

test('no jogo dos Registos os amarelos não expulsam e o resultado é o que lá se apontou', () => {
  const s = estado(registosComRelogio());
  assert.deepEqual([s.teamScore, s.opponentScore], [2, 1]);
  assert.equal(s.cards.length, 2);
  assert.notEqual(s.players.p2.status, 'EXPELLED');
  assert.deepEqual(resumoDosRegistos(s), { resultado: { nos: 2, eles: 1 }, golos: 3, faltas: 2, cartoes: 3, registos: 1, convocados: 7 });
});

test('fusão 1.39: golos, faltas, cartões e registos entram no jogo dos Tempos, na parte e minuto certos', () => {
  const t = temposSoComTempo();
  const r = registosComRelogio();
  const baseAntes = { ...carregado(t), events: [...t.events] };
  const antes = baseAntes.state;
  assert.deepEqual([antes.teamScore, antes.opponentScore], [0, 0]);
  const tempos = (s) => Object.fromEntries(Object.values(s.players).map((p) => [p.playerId, p.stints.map((x) => [x.startMatchMs, x.endMatchMs])]));
  const tempoAntes = tempos(antes);

  const plano = planoDeFusao({ base: carregado(t), outro: carregado(r), n: 1 });
  assert.deepEqual(plano.golos, { US: 2, THEM: 1 });
  assert.deepEqual(plano.faltas, { US: 1, THEM: 1 });
  assert.deepEqual(plano.cartoes, { nossos: 2, adversario: 1, semJogador: 0 });
  assert.equal(plano.total, 1);
  assert.equal(plano.golosLigados, 1);
  assert.equal(plano.golosSemPar, 0);
  assert.equal(plano.golosNaBase, 0);
  assert.equal(plano.semHora, 0);
  // 3 golos × 2 (golo + atribuição) + 2 faltas + 3 cartões + 1 registo.
  assert.equal(plano.eventos.length, 12);
  assert.equal(new Set(plano.eventos.map((e) => e.id)).size, 12);

  aplicar(t, r, plano);
  const s = estado(t);
  assert.deepEqual(s.warnings, []);
  assert.equal(s.status, MATCH_STATUS.FINISHED);
  assert.deepEqual([s.teamScore, s.opponentScore], [2, 1]);
  assert.deepEqual([s.halftimeTeamScore, s.halftimeOpponentScore], [1, 1]);

  // Golos: parte, minuto, marcador, assistência, tipo; o GR do golo sofrido é
  // quem estava à baliza nos Tempos a esse minuto (o p6, depois da troca).
  const [g1, g2, g3] = [...s.goals].sort((a, b) => a.matchElapsedMs - b.matchElapsedMs);
  assert.deepEqual([g1.team, g1.period, g1.matchElapsedMs, g1.scorerId, g1.assistId, g1.howScored], ['US', 1, 5 * MIN, 'p5', 'p3', 'TRANSICAO']);
  assert.deepEqual([g2.team, g2.period, g2.matchElapsedMs, g2.goalkeeperId], ['THEM', 1, 12 * MIN, 'p6']);
  assert.deepEqual([g3.team, g3.period, g3.matchElapsedMs, g3.scorerId], ['US', 2, 27 * MIN, null]);
  assert.equal(guardaRedesAoMinuto(baseAntes, 5 * MIN), 'p1');
  assert.equal(guardaRedesAoMinuto(baseAntes, 12 * MIN), 'p6');

  // O remate que deu golo fica preso ao golo copiado.
  const [remate] = registosDoJogo(s);
  assert.deepEqual([remate.registo, remate.resultado, remate.period, remate.matchElapsedMs], ['remate', 'GOLO', 1, 5 * MIN]);
  assert.equal(remate.goloEventId, g1.eventId);

  // Faltas e cartões, por parte.
  assert.deepEqual(s.fouls.map((f) => [f.team, f.period, f.matchElapsedMs, f.playerId]), [['US', 1, 8 * MIN, 'p2'], ['THEM', 2, 26 * MIN, null]]);
  const doP2 = s.cards.filter((c) => c.playerId === 'p2');
  assert.deepEqual(doP2.map((c) => [c.type, c.period, c.secondYellow]), [['YELLOW', 1, false], ['YELLOW', 2, true]]);
  assert.deepEqual(s.opponentCards.map((c) => [c.number, c.period]), [[9, 2]]);
  assert.equal(s.opponentExpulsions, 0);

  // O vermelho dos Tempos continua lá, e os tempos em campo não mexeram: o
  // segundo amarelo do p2 não o expulsa, só o p4 (vermelho nos Tempos) está fora.
  assert.equal(s.cards.filter((c) => c.type === 'RED' && c.playerId === 'p4').length, 1);
  assert.equal(s.players.p4.status, 'EXPELLED');
  assert.notEqual(s.players.p2.status, 'EXPELLED');
  assert.deepEqual(tempos(s), tempoAntes);
  assert.equal(s.elapsedMatchMs, antes.elapsedMatchMs);
});

test('fusão 1.39: sem a marca (ou desfeita) nada do que foi copiado conta', () => {
  const t = temposSoComTempo();
  const r = registosComRelogio();
  const plano = planoDeFusao({ base: carregado(t), outro: carregado(r), n: 1 });
  for (const ev of plano.eventos) por(t, { ...ev });
  let s = estado(t);
  assert.deepEqual([s.teamScore, s.goals.length, s.fouls.length, s.cards.length, s.opponentCards.length], [0, 0, 0, 1, 0]);

  gravar(t, (x) => A.correction(x, { partilhado: { v: 1, fusao: { com: 'mR', n: 1, registos: plano.total } } }), T0 + 70 * MIN);
  s = estado(t);
  assert.deepEqual([s.teamScore, s.opponentScore, s.goals.length, s.fouls.length, s.cards.length], [2, 1, 3, 2, 3]);
  assert.equal(eventosDaFusao(t.events, 1).length, 12);

  gravar(t, (x) => A.correction(x, { partilhado: { v: 1, fusaoDesfeita: { n: 1 } } }), T0 + 80 * MIN);
  s = estado(t);
  assert.deepEqual([s.teamScore, s.opponentScore, s.goals.length, s.fouls.length, s.cards.length], [0, 0, 0, 0, 1]);
  assert.equal(s.players.p4.status, 'EXPELLED');
});

test('fusão 1.39: cartão de quem não está na convocatória dos Tempos fica de fora e vem avisado', () => {
  const t = temposSoComTempo();
  const r = jogo('mR', PAPEL.REGISTOS, { comCinco: false, extra: ['Hugo'] });
  toque(r, RELOGIO.INICIO, 1, 0, T0);
  apontar(r, (s, h) => A.lateCard(s, { type: 'YELLOW', playerId: 'x8', matchElapsedMs: 0, period: 0 }, h), T0 + 3 * MIN);
  apontar(r, (s, h) => A.teamGoalBy(s, 'x8', h), T0 + 4 * MIN);
  terminar(r, T0 + 60 * MIN);
  const plano = planoDeFusao({ base: carregado(t), outro: carregado(r), n: 1 });
  assert.deepEqual(plano.cartoes, { nossos: 0, adversario: 0, semJogador: 1 });
  assert.deepEqual(plano.golos, { US: 1, THEM: 0 });
  assert.deepEqual(plano.foraDaConvocatoria.map((j) => [j.name, j.registos]), [['Hugo', 2]]);
  aplicar(t, r, plano);
  assert.equal(estado(t).teamScore, 1);
});

test('fusão 1.39: golos que o jogo dos Tempos já tinha ficam e vêm contados', () => {
  const plano = planoDeFusao({ base: carregado(jogoDosTempos()), outro: carregado(registosComRelogio()), n: 1 });
  assert.equal(plano.golosNaBase, 2);
});
