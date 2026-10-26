// tests/registos.test.js — registos extra por escalão (domain/registos.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMatchState } from '../src/domain/reducer.js';
import { buildMatchState as buildMatchState182 } from './fixtures/reducer-1.8.2/reducer.js';
import * as A from '../src/domain/actions.js';
import { EVENT, LOCATION, UNDOABLE_EVENTS } from '../src/domain/constants.js';
import {
  CATALOGO,
  REGISTO,
  REGISTOS,
  arredondar,
  corrigirRegisto,
  marcadores,
  registar,
  registosDoJogo,
  registosLigados,
  resumoRegistos,
  temRegistos,
  validarListaDeRegistos,
} from '../src/domain/registos.js';

const MIN = 60_000;
const T0 = 1_700_000_000_000;
const match = { id: 'm1', clubId: 'c1', periodDurationMs: 20 * MIN };
const START = { p1: 'GOALKEEPER', p2: 'FIXO', p3: 'LEFT_WINGER', p4: 'RIGHT_WINGER', p5: 'PIVOT' };

function makeSquad() {
  return ['Ana', 'Bruno', 'Carlos', 'Diogo', 'Eduardo', 'Filipe', 'Gonçalo'].map((name, i) => {
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

function novoJogo() {
  return { squad: makeSquad(), events: [] };
}

function estado(ctx, reducer = buildMatchState) {
  return reducer(match, ctx.squad, ctx.events);
}

/** Grava um evento como a app faz e devolve-o. */
function gravar(ctx, factory, now) {
  const ev = factory(estado(ctx), now);
  ev.seq = ctx.events.length + 1;
  ctx.events.push(ev);
  return ev;
}

function desfazer(ctx, alvo, now) {
  return gravar(ctx, (s) => A.undoEvent(s, alvo, now), now);
}

/* ------------------------------------------------------------- catálogo */

test('catálogo: os registos pela ordem certa (fase 1 e remates do adversário)', () => {
  assert.deepEqual(REGISTOS, ['remate', 'defesa_gr', 'recuperacao', 'fora', 'canto', 'acao', 'remate_adv']);
  assert.equal(CATALOGO.fora.por, 'equipa');
  assert.equal(CATALOGO.canto.ponto, false);
});

test('registosLigados corta o que não existe e segue a ordem do catálogo', () => {
  const ligados = registosLigados(['canto', 'xpto', 'remate', 'remate']);
  assert.deepEqual([...ligados], ['remate', 'canto']);
  assert.equal(registosLigados(null).size, 0);
  assert.equal(registosLigados(undefined).size, 0);
});

test('um registo indisponível no catálogo não se liga nem se valida', () => {
  const antes = CATALOGO.acao.disponivel;
  try {
    CATALOGO.acao.disponivel = false;
    assert.deepEqual([...registosLigados(['acao', 'remate'])], ['remate']);
    assert.ok(validarListaDeRegistos(['acao']).erro);
  } finally {
    CATALOGO.acao.disponivel = antes;
  }
});

test('validarListaDeRegistos recusa ids desconhecidos', () => {
  assert.deepEqual(validarListaDeRegistos(['canto', 'remate']), { registos: ['remate', 'canto'] });
  const mau = validarListaDeRegistos(['remate', 'nota']);
  assert.match(mau.erro, /nota/);
  assert.deepEqual(mau.desconhecidos, ['nota']);
  assert.ok(validarListaDeRegistos('remate').erro);
  assert.deepEqual(validarListaDeRegistos([]), { registos: [] });
});

/* -------------------------------------------------------------- fábrica */

test('fábrica: forma do evento e arredondamento a três casas', () => {
  const ctx = novoJogo();
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const ev = gravar(
    ctx,
    (s) => registar(s, { registo: 'remate', playerId: 'p5', resultado: 'DEFENDIDO', x: 0.81234, y: 0.4296 }, T0 + MIN),
    T0 + MIN
  );
  assert.equal(ev.eventType, EVENT.STAT_RECORDED);
  assert.equal(ev.playerId, 'p5');
  assert.deepEqual(ev.metadata, {
    v: 1,
    registo: 'remate',
    equipa: 'US',
    resultado: 'DEFENDIDO',
    x: 0.812,
    y: 0.43,
  });
  assert.equal(ev.matchElapsedMs, MIN);
  assert.equal(arredondar(1.7), 1);
  assert.equal(arredondar(-0.2), 0);
  assert.equal(arredondar(null), null);
});

test('fábrica: fora encosta à linha lateral; canto é da equipa e sem ponto', () => {
  const ctx = novoJogo();
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const fora = gravar(ctx, (s) => registar(s, { registo: 'fora', equipa: 'THEM', x: 0.3, y: 0.62 }, T0), T0);
  assert.equal(fora.playerId, null);
  assert.equal(fora.metadata.equipa, 'THEM');
  assert.equal(fora.metadata.y, 1);
  assert.equal(fora.metadata.x, 0.3);
  const canto = gravar(ctx, (s) => registar(s, { registo: 'canto', equipa: 'US', x: 0.5, y: 0.5 }, T0), T0);
  assert.equal('x' in canto.metadata, false);
  assert.equal(canto.metadata.equipa, 'US');
});

test('fábrica: recusa registo desconhecido, resultado inválido ou jogador em falta', () => {
  const st = estado(novoJogo());
  assert.throws(() => registar(st, { registo: 'nota', playerId: 'p1' }));
  assert.throws(() => registar(st, { registo: 'remate', playerId: 'p1', resultado: 'GOLAÇO' }));
  assert.throws(() => registar(st, { registo: 'recuperacao' }));
  assert.throws(() => registar(st, { registo: 'acao', playerId: 'p1' }));
});

test('STAT_RECORDED desfaz-se com o DESFAZER; STAT_CORRECTED não', () => {
  assert.ok(UNDOABLE_EVENTS.has(EVENT.STAT_RECORDED));
  assert.ok(!UNDOABLE_EVENTS.has(EVENT.STAT_CORRECTED));
});

/* -------------------------------------------------------------- leitura */

test('correção aplica-se: jogador, resultado, ponto e minuto', () => {
  const ctx = novoJogo();
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const r = gravar(
    ctx,
    (s) => registar(s, { registo: 'remate', playerId: 'p3', resultado: 'FORA', x: 0.7, y: 0.2 }, T0 + 2 * MIN),
    T0 + 2 * MIN
  );
  gravar(
    ctx,
    (s) =>
      corrigirRegisto(
        s,
        { targetEventId: r.id, playerId: 'p4', resultado: 'POSTE', x: 0.9, y: 0.5, matchElapsedMs: 90_000, period: 1 },
        T0 + 3 * MIN
      ),
    T0 + 3 * MIN
  );
  const [lido] = registosDoJogo(estado(ctx));
  assert.equal(lido.playerId, 'p4');
  assert.equal(lido.resultado, 'POSTE');
  assert.equal(lido.x, 0.9);
  assert.equal(lido.matchElapsedMs, 90_000);
  assert.equal(lido.corrigido, true);
});

test('correção não faz um remate passar a golo nem deixar de o ser', () => {
  const ctx = novoJogo();
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const r = gravar(ctx, (s) => registar(s, { registo: 'remate', playerId: 'p3', resultado: 'FORA' }, T0), T0);
  assert.throws(() => corrigirRegisto(estado(ctx), { targetEventId: r.id, resultado: 'GOLO' }));
  // Mesmo que alguém o grave à força, a leitura não o aplica.
  const forcado = A.makeEvent(estado(ctx), EVENT.STAT_CORRECTED, {
    metadata: { v: 1, targetEventId: r.id, resultado: 'GOLO' },
  });
  forcado.seq = ctx.events.length + 1;
  ctx.events.push(forcado);
  assert.equal(registosDoJogo(estado(ctx))[0].resultado, 'FORA');
});

test('desfazer tira o registo (e a correção dele deixa de contar)', () => {
  const ctx = novoJogo();
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const r = gravar(ctx, (s) => registar(s, { registo: 'recuperacao', playerId: 'p2', x: 0.2, y: 0.3 }, T0), T0);
  assert.equal(registosDoJogo(estado(ctx)).length, 1);
  assert.equal(estado(ctx).lastUndoable?.id, r.id);
  desfazer(ctx, r, T0 + MIN);
  assert.equal(registosDoJogo(estado(ctx)).length, 0);
  assert.equal(temRegistos(estado(ctx)), false);
});

test('a frio, um registo com undoneAt também desaparece', () => {
  const ctx = novoJogo();
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const r = gravar(ctx, (s) => registar(s, { registo: 'canto', equipa: 'THEM' }, T0), T0);
  r.undoneAt = T0 + MIN;
  assert.equal(registosDoJogo(estado(ctx)).length, 0);
});

test('remate GOLO fica ligado ao golo e desaparece com o golo desfeito', () => {
  const ctx = novoJogo();
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const golo = gravar(ctx, (s) => A.teamGoalBy(s, 'p5', T0 + MIN), T0 + MIN);
  const remate = gravar(
    ctx,
    (s) => registar(s, { registo: 'remate', playerId: 'p5', resultado: 'GOLO', x: 0.9, y: 0.5, goloEventId: golo.id }, T0 + MIN),
    T0 + MIN
  );
  assert.equal(remate.metadata.goloEventId, golo.id);
  let st = estado(ctx);
  assert.equal(st.teamScore, 1);
  assert.equal(resumoRegistos(st, T0 + MIN).jogadores.find((j) => j.playerId === 'p5').golosRemate, 1);

  desfazer(ctx, golo, T0 + 2 * MIN);
  st = estado(ctx);
  assert.equal(st.teamScore, 0);
  assert.equal(registosDoJogo(st).length, 0);
});

test('remate GOLO também desaparece se o golo for tirado com TEAM_GOAL_REMOVED', () => {
  const ctx = novoJogo();
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const golo = gravar(ctx, (s) => A.teamGoalBy(s, 'p5', T0 + MIN), T0 + MIN);
  gravar(
    ctx,
    (s) => registar(s, { registo: 'remate', playerId: 'p5', resultado: 'GOLO', goloEventId: golo.id }, T0 + MIN),
    T0 + MIN
  );
  gravar(ctx, (s) => A.goal(s, EVENT.TEAM_GOAL_REMOVED, T0 + 2 * MIN), T0 + 2 * MIN);
  assert.equal(registosDoJogo(estado(ctx)).length, 0);
});

test('registo desconhecido (fase 2) é ignorado sem partir nada', () => {
  const ctx = novoJogo();
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const futuro = A.makeEvent(estado(ctx), EVENT.STAT_RECORDED, {
    playerId: 'p2',
    metadata: { v: 2, registo: 'duelo', equipa: 'US', resultado: 'GANHO' },
  });
  futuro.seq = ctx.events.length + 1;
  ctx.events.push(futuro);
  gravar(ctx, (s) => registar(s, { registo: 'acao', playerId: 'p2', resultado: 'POSITIVA' }, T0), T0);
  const st = estado(ctx);
  assert.deepEqual(registosDoJogo(st).map((r) => r.registo), ['acao']);
  assert.deepEqual(st.warnings, []);
});

/* --------------------------------------------------------------- resumo */

function jogoComRegistos() {
  const ctx = novoJogo();
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const r = (dados, minuto) => gravar(ctx, (s) => registar(s, dados, T0 + minuto * MIN), T0 + minuto * MIN);
  r({ registo: 'remate', playerId: 'p5', resultado: 'DEFENDIDO', x: 0.8, y: 0.4 }, 1);
  r({ registo: 'remate', playerId: 'p5', resultado: 'FORA', x: 0.7, y: 0.1 }, 2);
  r({ registo: 'remate', playerId: 'p3', resultado: 'BLOQUEADO', x: 0.6, y: 0.6 }, 3);
  const golo = gravar(ctx, (s) => A.teamGoalBy(s, 'p3', T0 + 4 * MIN), T0 + 4 * MIN);
  r({ registo: 'remate', playerId: 'p3', resultado: 'GOLO', x: 0.9, y: 0.5, goloEventId: golo.id }, 4);
  r({ registo: 'recuperacao', playerId: 'p2', x: 0.3, y: 0.5 }, 5);
  r({ registo: 'recuperacao', playerId: 'p2', x: 0.4, y: 0.5 }, 6);
  r({ registo: 'defesa_gr', playerId: 'p1', x: 0.1, y: 0.5 }, 7);
  r({ registo: 'fora', equipa: 'US', x: 0.5, y: 0.1 }, 8);
  r({ registo: 'fora', equipa: 'THEM', x: 0.5, y: 0.9 }, 8);
  r({ registo: 'canto', equipa: 'THEM' }, 9);
  r({ registo: 'acao', playerId: 'p4', resultado: 'POSITIVA' }, 9);
  r({ registo: 'acao', playerId: 'p4', resultado: 'NEGATIVA' }, 9);
  r({ registo: 'acao', playerId: 'p4', resultado: 'POSITIVA' }, 9);
  return ctx;
}

test('resumo: totais da equipa e linha por jogador', () => {
  const ctx = jogoComRegistos();
  const st = estado(ctx);
  const r = resumoRegistos(st, T0 + 10 * MIN);
  assert.equal(r.remates, 4);
  assert.equal(r.rematesBaliza, 2);
  assert.deepEqual(r.porResultado, { GOLO: 1, DEFENDIDO: 1, BLOQUEADO: 1, FORA: 1, POSTE: 0 });
  assert.equal(r.recuperacoes, 2);
  assert.equal(r.defesas, 1);
  assert.deepEqual(r.foras, { US: 1, THEM: 1 });
  assert.deepEqual(r.cantos, { US: 0, THEM: 1 });
  assert.deepEqual(r.acoes, { positivas: 2, negativas: 1 });
  assert.ok(r.tipos.has('acao') && r.tipos.has('canto'));

  const p2 = r.jogadores.find((j) => j.playerId === 'p2');
  // 2 recuperações em 10 minutos em campo = 2 por 10 min.
  assert.equal(p2.recuperacoes, 2);
  assert.equal(p2.recup10, 2);
  const p4 = r.jogadores.find((j) => j.playerId === 'p4');
  assert.equal(p4.positivas, 2);
  assert.equal(p4.negativas, 1);
  const p3 = r.jogadores.find((j) => j.playerId === 'p3');
  assert.deepEqual([p3.remates, p3.rematesBaliza, p3.golosRemate], [2, 1, 1]);
  // Quem não entrou nem tem registos não aparece.
  assert.equal(r.jogadores.find((j) => j.playerId === 'p7'), undefined);
});

test('recup./10 min só com pelo menos um minuto em campo', () => {
  const ctx = novoJogo();
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  gravar(ctx, (s) => registar(s, { registo: 'recuperacao', playerId: 'p2' }, T0 + 10_000), T0 + 10_000);
  const r = resumoRegistos(estado(ctx), T0 + 30_000);
  assert.equal(r.jogadores.find((j) => j.playerId === 'p2').recup10, null);
});

test('marcadores: só os que têm ponto, com filtro por registo', () => {
  const st = estado(jogoComRegistos());
  const todos = marcadores(st);
  // 4 remates + 2 recuperações + 1 defesa + 2 foras (o canto e as ações não têm ponto).
  assert.equal(todos.length, 9);
  const remates = marcadores(st, { registos: ['remate'] });
  assert.equal(remates.length, 4);
  assert.equal(remates.find((m) => m.resultado === 'GOLO').cor, '#22c55e');
  const foras = marcadores(st, { registos: ['fora'] });
  assert.deepEqual(foras.map((m) => m.y).sort(), [0, 1]);
});

test('sem registos: resumo vazio e nada para desenhar', () => {
  const ctx = novoJogo();
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  const st = estado(ctx);
  assert.equal(resumoRegistos(st, T0).total, 0);
  assert.deepEqual(marcadores(st), []);
  assert.equal(temRegistos(st), false);
});

/* ------------------------------------------------------- compatibilidade */

/**
 * Um jogo inteiro com registos pelo meio: golos, faltas, substituição,
 * intervalo, correção a frio e um registo desfeito.
 */
function jogoCompleto({ comRegistos }) {
  const ctx = novoJogo();
  const reg = (dados, t) => comRegistos && gravar(ctx, (s) => registar(s, dados, t), t);
  gravar(ctx, (s) => A.startFirstHalf(s, T0), T0);
  reg({ registo: 'remate', playerId: 'p5', resultado: 'DEFENDIDO', x: 0.8, y: 0.4 }, T0 + MIN);
  const golo = gravar(ctx, (s) => A.teamGoalBy(s, 'p5', T0 + 2 * MIN), T0 + 2 * MIN);
  reg({ registo: 'remate', playerId: 'p5', resultado: 'GOLO', goloEventId: golo.id }, T0 + 2 * MIN);
  gravar(ctx, (s) => A.foul(s, EVENT.TEAM_FOUL_ADDED, T0 + 3 * MIN), T0 + 3 * MIN);
  reg({ registo: 'recuperacao', playerId: 'p2', x: 0.2, y: 0.5 }, T0 + 4 * MIN);
  gravar(
    ctx,
    (s) => A.substitute(s, { playerOutId: 'p3', playerInId: 'p6', position: 'LEFT_WINGER' }, T0 + 5 * MIN),
    T0 + 5 * MIN
  );
  reg({ registo: 'canto', equipa: 'THEM' }, T0 + 6 * MIN);
  const engano = reg({ registo: 'fora', equipa: 'US', x: 0.4, y: 0 }, T0 + 6 * MIN);
  if (engano) desfazer(ctx, engano, T0 + 6 * MIN + 1000);
  gravar(ctx, (s) => A.pauseClock(s, T0 + 7 * MIN), T0 + 7 * MIN);
  gravar(ctx, (s) => A.resumeClock(s, T0 + 8 * MIN), T0 + 8 * MIN);
  gravar(ctx, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, T0 + 9 * MIN), T0 + 9 * MIN);
  reg({ registo: 'defesa_gr', playerId: 'p1', x: 0.1, y: 0.4 }, T0 + 10 * MIN);
  gravar(ctx, (s) => A.finishFirstHalf(s, T0 + 11 * MIN), T0 + 11 * MIN);
  const T1 = T0 + 16 * MIN;
  gravar(
    ctx,
    (s) => A.setSecondHalfLineup(s, { GOALKEEPER: 'p1', FIXO: 'p2', LEFT_WINGER: 'p6', RIGHT_WINGER: 'p4', PIVOT: 'p7' }, T1),
    T1
  );
  gravar(ctx, (s) => A.startSecondHalf(s, T1), T1);
  reg({ registo: 'acao', playerId: 'p7', resultado: 'NEGATIVA' }, T1 + MIN);
  gravar(ctx, (s) => A.foul(s, EVENT.OPPONENT_FOUL_ADDED, T1 + 2 * MIN), T1 + 2 * MIN);
  const r = reg({ registo: 'remate', playerId: 'p7', resultado: 'FORA', x: 0.7, y: 0.3 }, T1 + 3 * MIN);
  gravar(ctx, (s) => A.finishMatch(s, T1 + 10 * MIN), T1 + 10 * MIN);
  if (r) gravar(ctx, (s) => corrigirRegisto(s, { targetEventId: r.id, resultado: 'POSTE' }, T1 + 30 * MIN), T1 + 30 * MIN);
  return ctx;
}

/** O que interessa comparar entre versões: resultado, tempos, faltas, golos. */
function essencial(st) {
  return {
    status: st.status,
    teamScore: st.teamScore,
    opponentScore: st.opponentScore,
    halftime: [st.halftimeTeamScore, st.halftimeOpponentScore],
    elapsedMatchMs: st.elapsedMatchMs,
    firstHalfMs: st.firstHalfMs,
    secondHalfMs: st.secondHalfMs,
    finishedAt: st.finishedAt,
    court: st.court,
    fouls: st.fouls,
    goals: st.goals,
    cards: st.cards,
    penalties: st.penalties,
    players: Object.fromEntries(
      Object.entries(st.players).map(([id, p]) => [id, { status: p.status, position: p.position, stints: p.stints }])
    ),
  };
}

/** O mesmo jogo, sem os registos (nem os desfazer que apontam para eles). */
function semRegistos(ctx) {
  const stat = new Set(
    ctx.events.filter((e) => e.eventType.startsWith('STAT_')).map((e) => e.id)
  );
  return {
    squad: ctx.squad,
    events: ctx.events.filter(
      (e) => !stat.has(e.id) && !(e.eventType === EVENT.EVENT_UNDONE && stat.has(e.metadata?.targetEventId))
    ),
  };
}

test('o reducer atual não mexe no resultado, tempos nem faltas com STAT_* pelo meio', () => {
  const ctx = jogoCompleto({ comRegistos: true });
  const com = estado(ctx);
  const sem = estado(semRegistos(ctx));
  assert.deepEqual(essencial(com), essencial(sem));
  assert.deepEqual(com.warnings, []);
  const lidos = registosDoJogo(com);
  assert.deepEqual(lidos.map((x) => x.registo), ['remate', 'remate', 'recuperacao', 'canto', 'defesa_gr', 'acao', 'remate']);
  assert.equal(lidos.at(-1).resultado, 'POSTE');
});

test('compatibilidade: o reducer da 1.8.2 lê um jogo com STAT_* e dá o mesmo resultado e tempos', () => {
  const ctxCom = jogoCompleto({ comRegistos: true });
  const ctxSem = semRegistos(ctxCom);
  const antigoCom = buildMatchState182(match, ctxCom.squad, ctxCom.events);
  const antigoSem = buildMatchState182(match, ctxSem.squad, ctxSem.events);
  const atual = buildMatchState(match, ctxCom.squad, ctxCom.events);

  // A 1.8.2 ignora os tipos que não conhece: tudo o resto fica igual.
  assert.deepEqual(essencial(antigoCom), essencial(antigoSem));
  assert.deepEqual(essencial(antigoCom), essencial(atual));
  // E só deixa um aviso, que nenhum ecrã mostra.
  assert.ok(antigoCom.warnings.length > 0);
  assert.ok(antigoCom.warnings.every((w) => /STAT_(RECORDED|CORRECTED)/.test(w)));
});

/* ------------------------------------------------------------------ CSV */

test('CSV: as colunas dos registos só aparecem num jogo que os tem', async () => {
  const { matchSummaryCsv, matchEventsCsv } = await import('../src/lib/data/exporter.js');
  const matchRow = { ...match, opponentName: 'Adversário', scheduledAt: T0, homeOrAway: 'HOME' };
  const com = estado(jogoCompleto({ comRegistos: true }));
  const sem = estado(semRegistos(jogoCompleto({ comRegistos: true })));

  const csvCom = matchSummaryCsv({ club: { name: 'Clube' }, match: matchRow, state: com });
  const csvSem = matchSummaryCsv({ club: { name: 'Clube' }, match: matchRow, state: sem });
  assert.match(csvCom, /Remates;À baliza;Recuperações;Defesas;Ações \+;Ações −/);
  assert.match(csvCom, /Cantos \(nós-eles\);0-1/);
  assert.doesNotMatch(csvSem, /À baliza/);
  assert.doesNotMatch(csvSem, /Cantos \(nós-eles\)/);

  const eventos = matchEventsCsv({ match: matchRow, state: com });
  assert.match(eventos, /Remate · #5 · Defendido/);
  assert.match(eventos, /;remate;DEFENDIDO;0\.8;0\.4/);
});

/* ------------------------------------------------------------ etiquetas */

test('cada registo tem nome e resultados nas três línguas', async () => {
  const { registoLabel, eventLabel } = await import('../src/lib/format.js');
  const { definirIdioma } = await import('../src/lib/i18n/index.js');
  const jogadores = { p7: { number: 7, name: 'Zé' } };
  const esperado = {
    pt: ['Remate · #7 · Defendido', 'Fora · a favor deles', 'Ação negativa · #7'],
    en: ['Shot · #7 · Saved', 'Kick-in · theirs', 'Negative action · #7'],
    es: ['Tiro · #7 · Parado', 'Saque de banda · a su favor', 'Acción negativa · #7'],
  };
  try {
    for (const [lingua, [remate, fora, acao]] of Object.entries(esperado)) {
      definirIdioma(lingua);
      assert.equal(registoLabel({ registo: 'remate', playerId: 'p7', resultado: 'DEFENDIDO' }, jogadores), remate);
      assert.equal(registoLabel({ registo: 'fora', equipa: 'THEM' }, jogadores), fora);
      assert.equal(
        eventLabel('STAT_RECORDED', { playerId: 'p7', metadata: { registo: 'acao', resultado: 'NEGATIVA' } }, jogadores),
        acao
      );
    }
  } finally {
    definirIdioma('pt');
  }
  // Um registo que esta versão não conhece fica com o nome genérico.
  assert.equal(eventLabel('STAT_RECORDED', { metadata: { registo: 'duelo' } }), 'Registo');
  assert.equal(eventLabel('STAT_CORRECTED'), 'Registo corrigido');
});

test('contagem por jogador para os números dos botões do cartão', async () => {
  const { contagemPorJogador } = await import('../src/domain/registos.js');
  const c = contagemPorJogador(estado(jogoComRegistos()));
  assert.deepEqual(c.get('p5'), { remate: 2, recuperacao: 0, defesa_gr: 0, positivas: 0, negativas: 0 });
  assert.deepEqual(c.get('p4'), { remate: 0, recuperacao: 0, defesa_gr: 0, positivas: 2, negativas: 1 });
  assert.equal(c.get('p1').defesa_gr, 1);
  assert.equal(c.has('p7'), false);
});

test('remate do adversário: é sempre deles, com resultado e ponto', () => {
  const st = { matchId: 'm1', currentPeriod: 1, events: [], goals: [], players: {} };
  const ev = registar(st, { registo: REGISTO.REMATE_ADV, equipa: 'US', resultado: 'DEFENDIDO', x: 0.12, y: 0.4 }, 1);
  assert.equal(ev.metadata.equipa, 'THEM', 'nunca nosso');
  assert.equal(ev.metadata.resultado, 'DEFENDIDO');
  assert.equal(ev.metadata.x, 0.12);
  assert.equal(ev.playerId, null);
  assert.throws(() => registar(st, { registo: REGISTO.REMATE_ADV, resultado: 'POSITIVA' }, 1));
});

test('remate do adversário com golo: sai da lista quando o golo é desfeito', () => {
  const ev = registar(
    { matchId: 'm1', currentPeriod: 1, events: [], goals: [], players: {} },
    { registo: REGISTO.REMATE_ADV, resultado: 'GOLO', x: 0.1, y: 0.5, goloEventId: 'g1' },
    1
  );
  assert.equal(ev.metadata.goloEventId, 'g1');
  const comGolo = { events: [ev], goals: [{ eventId: 'g1', team: 'THEM' }], players: {} };
  assert.equal(registosDoJogo(comGolo).length, 1);
  assert.equal(registosDoJogo({ ...comGolo, goals: [] }).length, 0);
  const r = resumoRegistos({ ...comGolo, players: {} }, 0);
  assert.equal(r.rematesAdv, 1);
  assert.equal(r.rematesAdvBaliza, 1);
  assert.equal(r.porResultadoAdv.GOLO, 1);
});
