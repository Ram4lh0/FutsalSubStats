// tests/analise.test.js — o relatório pós-jogo e a análise da época
// (domain/analise.js; add-ons 'relatorio-pos-jogo', 'analise-indicadores' e
// 'analise-posicoes', 19/11/2026).
//
// Como em tests/dashboard.test.js, os jogos são montados à mão: o que está em
// causa é a leitura de um jogo fechado. Os registos entram como eventos
// `STAT_RECORDED`, que é o que domain/registos.js lê.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analisePorPosicao,
  desempenhoIndividual,
  espelhoDoJogo,
  indicadoresDaEquipa,
  indicadoresDoAtleta,
  por40,
  rematesDaEquipa,
  tempoDeJogo,
  ultimosJogos,
} from '../src/domain/analise.js';
import { CATALOGO, REGISTO, contagemPorJogador, registar, resumoRegistos } from '../src/domain/registos.js';
import { ADDONS, addonsAtivos, problemasDoCatalogo } from '../src/domain/addons.js';

const MIN = 60_000;
let seq = 0;

/** Um registo (evento STAT_RECORDED) ao minuto `min`. */
function reg(registo, { playerId = null, equipa = 'US', resultado = null, goloEventId = null, min = 1 } = {}) {
  seq += 1;
  return {
    id: `e${seq}`,
    seq,
    eventType: 'STAT_RECORDED',
    playerId,
    period: min >= 20 ? 2 : 1,
    matchElapsedMs: min * MIN,
    metadata: { v: 1, registo, equipa, ...(resultado ? { resultado } : {}), ...(goloEventId ? { goloEventId } : {}) },
  };
}

function golo(team, { id, scorerId = null, assistId = null, min = 5, onCourtIds = null, goalkeeperId = null, ownGoal = false } = {}) {
  return { eventId: id, team, period: min >= 20 ? 2 : 1, matchElapsedMs: min * MIN, scorerId, assistId, ownGoal, goalkeeperId, howScored: null, onCourtIds };
}

function emCampo(playerId, name, number, ms, extra = {}) {
  return { playerId, name, number, status: 'ON_BENCH', stints: [{ startMatchMs: 0, endMatchMs: ms }], ...extra };
}

function jogo({ id = 'j1', quando = 1, golos = [], faltas = [], cartoes = [], opponentCards = [], expulsosDeles = 0, eventos = [], jogadores = {} } = {}) {
  return {
    match: { id, scheduledAt: quando, opponentName: 'ADV' },
    state: {
      status: 'FINISHED',
      teamScore: golos.filter((g) => g.team === 'US').length,
      opponentScore: golos.filter((g) => g.team === 'THEM').length,
      firstHalfMs: 20 * MIN,
      elapsedMatchMs: 40 * MIN,
      finishedAt: 1,
      goals: golos,
      fouls: faltas,
      cards: cartoes,
      opponentCards,
      opponentExpulsions: expulsosDeles,
      events: eventos,
      players: jogadores,
    },
  };
}

const linha = (linhas, id) => linhas.find((l) => l.id === id);

/* ------------------------------------------------------------ catálogo */

test('os registos e add-ons novos estão no catálogo, desligados por omissão', () => {
  assert.equal(CATALOGO.duelo.por, 'jogador');
  assert.deepEqual(CATALOGO.duelo.resultados, ['GANHO', 'PERDIDO']);
  assert.equal(CATALOGO.oportunidade_criada.por, 'equipa');
  assert.ok(CATALOGO.oportunidade_criada.jogadorOpcional);
  assert.ok(CATALOGO.oportunidade_falhada.jogadorOpcional);
  assert.deepEqual(CATALOGO.acao.opcoes, ['negativa']);
  for (const id of ['relatorio-pos-jogo', 'analise-indicadores', 'analise-posicoes']) {
    assert.ok(ADDONS[id], id);
    assert.equal(addonsAtivos(null).has(id), false, `${id} desligado por omissão`);
    assert.ok(addonsAtivos({ addons: [id] }).has(id));
  }
  assert.deepEqual(problemasDoCatalogo(), []);
});

test('oportunidades: nossas com jogador, do adversário sem ele', () => {
  const st = { matchId: 'm1', currentPeriod: 1, events: [], goals: [], players: {} };
  const nossa = registar(st, { registo: REGISTO.OPORTUNIDADE_CRIADA, equipa: 'US', playerId: 'p3' }, 1);
  assert.equal(nossa.playerId, 'p3');
  assert.equal(nossa.metadata.equipa, 'US');
  const deles = registar(st, { registo: REGISTO.OPORTUNIDADE_FALHADA, equipa: 'THEM', playerId: 'p3' }, 1);
  assert.equal(deles.playerId, null, 'uma oportunidade deles nunca é de um jogador nosso');
  assert.equal(deles.metadata.equipa, 'THEM');
  const semQuem = registar(st, { registo: REGISTO.OPORTUNIDADE_CRIADA, equipa: 'US' }, 1);
  assert.equal(semQuem.playerId, null);
  assert.throws(() => registar(st, { registo: REGISTO.DUELO, playerId: 'p1', resultado: 'POSITIVA' }, 1));
  assert.throws(() => registar(st, { registo: REGISTO.DUELO, resultado: 'GANHO' }, 1), /jogador/);
});

test('duelos e oportunidades no resumo do jogo e nos números do cartão', () => {
  const { state } = jogo({
    jogadores: { p1: emCampo('p1', 'Ana', 1, 40 * MIN) },
    eventos: [
      reg('duelo', { playerId: 'p1', resultado: 'GANHO' }),
      reg('duelo', { playerId: 'p1', resultado: 'GANHO' }),
      reg('duelo', { playerId: 'p1', resultado: 'PERDIDO' }),
      reg('oportunidade_criada', { playerId: 'p1' }),
      reg('oportunidade_criada', { equipa: 'THEM' }),
      reg('oportunidade_falhada', { playerId: 'p1' }),
    ],
  });
  const r = resumoRegistos(state, 1);
  assert.deepEqual(r.dueloGeral, { total: 3, ganhos: 2 });
  assert.deepEqual(r.opCriadas, { US: 1, THEM: 1 });
  assert.deepEqual(r.opFalhadas, { US: 1, THEM: 0 });
  const j = r.jogadores.find((x) => x.playerId === 'p1');
  assert.equal(j.duelosG, 3);
  assert.equal(j.duelosGGanhos, 2);
  assert.equal(j.opCriadas, 1);
  assert.equal(j.opFalhadas, 1);
  const c = contagemPorJogador(state).get('p1');
  assert.equal(c.duelosGanhos, 2);
  assert.equal(c.duelosPerdidos, 1);
  assert.equal(c.oportunidade_criada, 1);
  assert.equal(c.oportunidade_falhada, 1);
});

/* --------------------------------------------------------- um jogo */

test('remates: um golo sem remate registado conta como remate à baliza', () => {
  const { state } = jogo({
    golos: [
      golo('US', { id: 'g1', scorerId: 'p1' }), // com remate registado
      golo('US', { id: 'g2', scorerId: 'p2' }), // pelo botão do golo, sem remate
      golo('US', { id: 'g3', ownGoal: true }), // autogolo deles: não é remate nosso
    ],
    eventos: [
      reg('remate', { playerId: 'p1', resultado: 'GOLO', goloEventId: 'g1' }),
      reg('remate', { playerId: 'p1', resultado: 'FORA' }),
      reg('remate', { playerId: 'p2', resultado: 'BLOQUEADO' }),
      reg('remate', { playerId: 'p2', resultado: 'POSTE' }),
      reg('remate', { playerId: 'p2', resultado: 'DEFENDIDO' }),
    ],
  });
  const r = rematesDaEquipa(state, 'US');
  assert.equal(r.total, 6);
  assert.equal(r.aBaliza, 3, 'golo registado + defendido + golo solto');
  assert.equal(r.fora, 1);
  assert.equal(r.bloqueados, 1);
  assert.equal(r.poste, 1);
  assert.equal(r.golos, 2);
  assert.deepEqual(r.golosSoltos.map((g) => g.eventId), ['g2']);
  assert.equal(rematesDaEquipa(state, 'THEM'), null, 'sem remates deles registados: sem dados');
  assert.equal(rematesDaEquipa(state, 'THEM', { ligado: true }).total, 0, 'com o registo ligado, zero é zero');
});

test('espelho: golos, oportunidades, remates partidos, faltas, cartões e duelos', () => {
  const { state } = jogo({
    golos: [golo('US', { id: 'g1', scorerId: 'p1' }), golo('THEM', { id: 'g2' })],
    faltas: [{ team: 'US' }, { team: 'US' }, { team: 'THEM' }],
    cartoes: [
      { playerId: 'p1', type: 'YELLOW' },
      { playerId: 'p2', type: 'YELLOW' },
      { playerId: 'p2', type: 'YELLOW', secondYellow: true },
    ],
    opponentCards: [{ number: 7, eventId: 'oc1' }],
    expulsosDeles: 1,
    eventos: [
      reg('remate', { playerId: 'p1', resultado: 'GOLO', goloEventId: 'g1' }),
      reg('remate', { playerId: 'p1', resultado: 'FORA' }),
      reg('remate_adv', { equipa: 'THEM', resultado: 'GOLO', goloEventId: 'g2' }),
      reg('remate_adv', { equipa: 'THEM', resultado: 'DEFENDIDO' }),
      reg('remate_adv', { equipa: 'THEM', resultado: 'POSTE' }),
      reg('oportunidade_criada', { playerId: 'p1' }),
      reg('oportunidade_criada', { playerId: 'p2' }),
      reg('oportunidade_criada', { equipa: 'THEM' }),
      reg('oportunidade_falhada', { playerId: 'p2' }),
      reg('duelo', { playerId: 'p1', resultado: 'GANHO' }),
      reg('duelo', { playerId: 'p1', resultado: 'PERDIDO' }),
      reg('duelo_def', { playerId: 'p2', resultado: 'GANHO' }),
    ],
  });
  const l = espelhoDoJogo(state);
  assert.deepEqual(l.map((x) => x.id), [
    'golos', 'opCriadas', 'remates', 'aBaliza', 'fora', 'bloqueados', 'poste', 'opFalhadas', 'faltas', 'amarelos', 'vermelhos', 'duelosGanhos',
  ]);
  assert.deepEqual([linha(l, 'golos').US, linha(l, 'golos').THEM], [1, 1]);
  assert.deepEqual([linha(l, 'opCriadas').US, linha(l, 'opCriadas').THEM], [2, 1]);
  assert.deepEqual([linha(l, 'remates').US, linha(l, 'remates').THEM], [2, 3]);
  assert.deepEqual([linha(l, 'aBaliza').US, linha(l, 'aBaliza').THEM], [1, 2]);
  assert.deepEqual([linha(l, 'poste').US, linha(l, 'poste').THEM], [0, 1]);
  assert.ok(linha(l, 'aBaliza').sub);
  assert.deepEqual([linha(l, 'opFalhadas').US, linha(l, 'opFalhadas').THEM], [1, 0]);
  assert.deepEqual([linha(l, 'faltas').US, linha(l, 'faltas').THEM], [2, 1]);
  // Nós: o 2.º amarelo é uma expulsão (1 amarelo + 1 vermelho), como na ficha.
  assert.deepEqual([linha(l, 'amarelos').US, linha(l, 'vermelhos').US], [1, 1]);
  assert.deepEqual([linha(l, 'amarelos').THEM, linha(l, 'vermelhos').THEM], [1, 1]);
  // Os duelos ganhos deles são os nossos perdidos (os dois registos de duelo contam).
  assert.deepEqual([linha(l, 'duelosGanhos').US, linha(l, 'duelosGanhos').THEM], [2, 1]);
});

test('espelho: sem registos só ficam golos, faltas e cartões; com o registo ligado, zero', () => {
  const { state } = jogo({ golos: [golo('US', { id: 'g1' })] });
  assert.deepEqual(espelhoDoJogo(state).map((x) => x.id), ['golos', 'faltas', 'amarelos', 'vermelhos']);
  const ligados = new Set(['oportunidade_criada', 'remate', 'duelo']);
  const l = espelhoDoJogo(state, { ligados });
  assert.deepEqual([linha(l, 'opCriadas').US, linha(l, 'opCriadas').THEM], [0, 0]);
  assert.equal(linha(l, 'remates').US, 1, 'o golo sem remate conta');
  assert.equal(linha(l, 'remates').THEM, null, 'remates deles não ligados: sem dados');
  assert.deepEqual([linha(l, 'duelosGanhos').US, linha(l, 'duelosGanhos').THEM], [0, 0]);
});

test('espelho: um escalão que só conta remates (sem resultado) não parte os remates', () => {
  const { state } = jogo({ eventos: [reg('remate', { playerId: 'p1' }), reg('remate', { playerId: 'p1' })] });
  const l = espelhoDoJogo(state);
  assert.equal(linha(l, 'remates').US, 2);
  assert.equal(linha(l, 'aBaliza'), undefined);
});

test('espelho: um 2.º amarelo deles dado a frio também é vermelho', () => {
  const { state } = jogo({
    opponentCards: [{ number: 9, eventId: 'a' }, { number: 9, eventId: 'b', secondYellow: true }],
    expulsosDeles: 0,
    eventos: [{ id: 'b', eventType: 'OPPONENT_YELLOW_CARD', metadata: { number: 9, aPosteriori: true } }],
  });
  const l = espelhoDoJogo(state);
  assert.deepEqual([linha(l, 'amarelos').THEM, linha(l, 'vermelhos').THEM], [0, 1]);
});

test('desempenho individual: G, A, remates (com golos soltos), oportunidades, duelos', () => {
  const { state } = jogo({
    jogadores: {
      p1: emCampo('p1', 'Ana', 1, 30 * MIN),
      p2: emCampo('p2', 'Bia', 2, 10 * MIN),
      p3: emCampo('p3', 'Cris', 3, 0),
    },
    golos: [golo('US', { id: 'g1', scorerId: 'p1', assistId: 'p2' })],
    eventos: [
      reg('remate', { playerId: 'p1', resultado: 'FORA' }),
      reg('oportunidade_criada', { playerId: 'p2' }),
      reg('oportunidade_falhada', { playerId: 'p1' }),
      reg('recuperacao', { playerId: 'p2' }),
      reg('perda_bola', { playerId: 'p1' }),
      reg('duelo', { playerId: 'p1', resultado: 'GANHO' }),
      reg('duelo_def', { playerId: 'p1', resultado: 'PERDIDO' }),
    ],
  });
  const d = desempenhoIndividual(state);
  assert.deepEqual(d.colunas, {
    remates: true, opCriadas: true, recuperacoes: true, perdas: true, duelos: true, opFalhadas: true, defesas: false,
  });
  assert.deepEqual(d.jogadores.map((j) => j.playerId), ['p1', 'p2'], 'quem não jogou nem fez nada fica de fora');
  const ana = d.jogadores[0];
  assert.equal(ana.golos, 1);
  assert.equal(ana.remates, 2, 'o remate fora e o golo sem remate');
  assert.equal(ana.opFalhadas, 1);
  assert.equal(ana.perdas, 1);
  assert.deepEqual([ana.duelosGanhos, ana.duelos], [1, 2]);
  const bia = d.jogadores[1];
  assert.equal(bia.assistencias, 1);
  assert.equal(bia.opCriadas, 1);
  assert.equal(bia.recuperacoes, 1);
});

/* ---------------------------------------------------------- a época */

test('últimos N jogos: só os terminados, os mais recentes pelo dia', () => {
  const a = jogo({ id: 'a', quando: 3 });
  const b = jogo({ id: 'b', quando: 1 });
  const c = jogo({ id: 'c', quando: 2 });
  const emCurso = { ...jogo({ id: 'd', quando: 4 }), state: { ...jogo().state, status: 'IN_PROGRESS' } };
  assert.deepEqual(ultimosJogos([a, b, c, emCurso], 2).map((e) => e.match.id), ['c', 'a']);
  assert.equal(ultimosJogos([a, b], null).length, 2, 'sem N, a época toda');
});

test('indicadores da equipa: eficácia, duelos e recuperações por 40, com o melhor', () => {
  const j1 = jogo({
    id: 'j1',
    quando: 1,
    jogadores: { p1: emCampo('p1', 'Ana', 1, 40 * MIN), p2: emCampo('p2', 'Bia', 2, 20 * MIN) },
    golos: [golo('US', { id: 'g1', scorerId: 'p1' }), golo('US', { id: 'g2', scorerId: 'p1' })],
    eventos: [
      reg('remate', { playerId: 'p1', resultado: 'GOLO', goloEventId: 'g1' }),
      reg('remate', { playerId: 'p1', resultado: 'FORA' }),
      reg('remate', { playerId: 'p2', resultado: 'FORA' }),
      reg('remate', { playerId: 'p2', resultado: 'DEFENDIDO' }),
      reg('remate', { playerId: 'p2', resultado: 'POSTE' }),
      reg('duelo', { playerId: 'p1', resultado: 'GANHO' }),
      reg('duelo', { playerId: 'p1', resultado: 'GANHO' }),
      reg('duelo', { playerId: 'p1', resultado: 'PERDIDO' }),
      reg('duelo', { playerId: 'p2', resultado: 'PERDIDO' }),
      reg('recuperacao', { playerId: 'p1' }),
      reg('recuperacao', { playerId: 'p2' }),
      reg('recuperacao', { playerId: 'p2' }),
    ],
  });
  // Um jogo sem registos não entra nas contas (nem na eficácia, nem nos 40').
  const j2 = jogo({ id: 'j2', quando: 2, jogadores: { p1: emCampo('p1', 'Ana', 1, 40 * MIN) }, golos: [golo('US', { id: 'g9', scorerId: 'p1' })] });
  const ind = indicadoresDaEquipa([j1, j2]);
  assert.equal(ind.finalizacao.jogos, 1);
  assert.deepEqual([ind.finalizacao.golos, ind.finalizacao.remates, ind.finalizacao.pct], [2, 6, 33]);
  assert.equal(ind.finalizacao.melhor.playerId, 'p1', 'Ana: 2/3 (67%)');
  assert.equal(ind.finalizacao.melhor.pct, 67);
  assert.deepEqual([ind.duelos.ganhos, ind.duelos.total, ind.duelos.pct], [2, 4, 50]);
  assert.equal(ind.duelos.melhor.playerId, 'p1', 'só a Ana tem 3 duelos');
  assert.equal(ind.recuperacoes.total, 3);
  assert.equal(ind.recuperacoes.por40, 3, '3 recuperações em 40 minutos de jogo');
  assert.equal(ind.recuperacoes.melhor.playerId, 'p2', 'Bia: 2 em 20 min = 4 por 40');
  assert.equal(ind.recuperacoes.melhor.por40, 4);
});

test('indicadores do atleta: eficácia, conversão, duelos, remates por 40 e GR', () => {
  const j = jogo({
    jogadores: {
      p1: emCampo('p1', 'Ana', 1, 20 * MIN),
      gr: emCampo('gr', 'Rita', 12, 40 * MIN, { preferredPosition: 'GOALKEEPER' }),
    },
    golos: [golo('US', { id: 'g1', scorerId: 'p1' }), golo('THEM', { id: 'g2', goalkeeperId: 'gr' })],
    eventos: [
      reg('remate', { playerId: 'p1', resultado: 'FORA' }),
      reg('remate', { playerId: 'p1', resultado: 'FORA' }),
      reg('remate', { playerId: 'p1', resultado: 'DEFENDIDO' }),
      reg('oportunidade_falhada', { playerId: 'p1' }),
      reg('duelo', { playerId: 'p1', resultado: 'GANHO' }),
      reg('defesa_gr', { playerId: 'gr' }),
      reg('defesa_gr', { playerId: 'gr' }),
      reg('defesa_gr', { playerId: 'gr' }),
    ],
  });
  const a = indicadoresDoAtleta([j], [], 'p1');
  assert.equal(a.guardaRedes, false);
  assert.deepEqual([a.finalizacao.golos, a.finalizacao.remates, a.finalizacao.pct], [1, 4, 25]);
  assert.equal(a.finalizacao.por40, 8, '4 remates em 20 min');
  assert.deepEqual([a.conversao.golos, a.conversao.falhadas, a.conversao.pct], [1, 1, 50]);
  assert.equal(a.duelos.pct, 100);
  const g = indicadoresDoAtleta([j], [], 'gr');
  assert.equal(g.guardaRedes, true);
  assert.equal(g.minutosMs, 40 * MIN);
  assert.equal(g.gr.defesas, 3);
  assert.equal(g.gr.sofridos40, 1);
  assert.equal(g.gr.pctDefesas, 75, '3 defesas em 4 remates à baliza');
});

test('por posição: alas canhotos, minutos, golos por 40 e diferença por 40', () => {
  const plantel = [
    { id: 'a', name: 'Ala Canhota', shirtNumber: 7, preferredPosition: 'RIGHT_WINGER', strongFoot: 'LEFT' },
    { id: 'b', name: 'Ala Destra', shirtNumber: 8, preferredPosition: 'LEFT_WINGER', strongFoot: 'RIGHT' },
    { id: 'c', name: 'Pivot', shirtNumber: 9, preferredPosition: 'PIVOT', strongFoot: 'RIGHT' },
  ];
  const j = jogo({
    jogadores: {
      a: emCampo('a', 'Ala Canhota', 7, 20 * MIN),
      b: emCampo('b', 'Ala Destra', 8, 40 * MIN),
      c: emCampo('c', 'Pivot', 9, 40 * MIN),
    },
    golos: [
      golo('US', { id: 'g1', scorerId: 'a', min: 5, onCourtIds: ['a', 'b', 'c'] }),
      golo('US', { id: 'g2', scorerId: 'c', min: 30, onCourtIds: ['b', 'c'] }),
      golo('THEM', { id: 'g3', min: 35, onCourtIds: ['b', 'c'] }),
    ],
  });
  const canhotos = analisePorPosicao([j], plantel, { posicao: 'ALA', pe: 'LEFT' });
  assert.deepEqual(canhotos.linhas.map((l) => l.playerId), ['a']);
  const a = canhotos.linhas[0];
  assert.equal(a.courtMs, 20 * MIN);
  assert.equal(a.golos, 1);
  assert.equal(a.golos40, 2);
  assert.deepEqual([a.gm, a.gs, a.dif40], [1, 0, 2]);
  const alas = analisePorPosicao([j], plantel, { posicao: 'ALA' });
  assert.deepEqual(alas.linhas.map((l) => l.playerId), ['b', 'a'], 'mais minutos primeiro');
  assert.equal(alas.total.courtMs, 60 * MIN);
  assert.equal(alas.total.golos, 1);
  // GM 1+2 = 3, GS 0+1 = 1 em 60 min: (3−1)/60×40
  assert.ok(Math.abs(alas.total.dif40 - 4 / 3) < 1e-9);
  assert.deepEqual(analisePorPosicao([j], plantel, { posicao: 'PIVOT' }).linhas.map((l) => l.playerId), ['c']);
  assert.equal(analisePorPosicao([j], plantel, { posicao: 'GOALKEEPER' }).linhas.length, 0);
});

test('tempo de jogo: a união dos períodos em campo (respeita o corte do período)', () => {
  const st = {
    elapsedMatchMs: 40 * MIN,
    players: {
      a: { stints: [{ startMatchMs: 0, endMatchMs: 10 * MIN }, { startMatchMs: 25 * MIN, endMatchMs: 30 * MIN }] },
      b: { stints: [{ startMatchMs: 5 * MIN, endMatchMs: 12 * MIN }] },
    },
  };
  assert.equal(tempoDeJogo(st), 17 * MIN);
  assert.equal(por40(3, 30_000), null, 'menos de um minuto não diz nada');
});
