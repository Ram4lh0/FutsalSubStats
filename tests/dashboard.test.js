// tests/dashboard.test.js — os números que o painel visual desenha.
//
// Os estados são montados à mão em vez de reconstruídos a partir de eventos.
// É de propósito: o que aqui está em causa é a **leitura** de um jogo já
// fechado, e um jogo simulado evento a evento traria consigo tudo o que o
// reducer decide — que já tem testes seus. Assim cada teste falha por uma razão
// só.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  minutosPorJogador,
  golosPorFaixa,
  formaRecente,
  casaEFora,
  curvaDeForma,
  tiposDeJogo,
  filtrar,
  parteDosJogos,
  disciplina,
  painelDoAtleta,
} from '../src/domain/dashboard.js';

const MIN = 60_000;

/** Um jogo terminado, com o que lhe quisermos pôr dentro. */
function jogo({
  id = 'j1',
  quando = 1,
  adversario = 'ADV',
  casa = true,
  nossos = 0,
  deles = 0,
  golos = [],
  faltas = [],
  cartoes = [],
  jogadores = {},
  primeiraMs = 20 * MIN,
  status = 'FINISHED',
} = {}) {
  return {
    match: {
      id,
      scheduledAt: quando,
      opponentName: adversario,
      opponentShortName: adversario,
      homeOrAway: casa ? 'HOME' : 'AWAY',
    },
    state: {
      status,
      teamScore: nossos,
      opponentScore: deles,
      firstHalfMs: primeiraMs,
      elapsedMatchMs: 40 * MIN,
      goals: golos,
      fouls: faltas,
      cards: cartoes,
      players: jogadores,
    },
  };
}

/** Um jogador dentro de um jogo, com os períodos em campo já resolvidos. */
function emCampo(playerId, name, number, ms) {
  return {
    playerId,
    name,
    number,
    status: 'ON_BENCH',
    stints: [{ startMatchMs: 0, endMatchMs: ms }],
  };
}

/* ------------------------------------------------------------- minutos */

test('os minutos somam-se pela época e a média é a da equipa', () => {
  const r = minutosPorJogador([
    jogo({
      id: 'a',
      jogadores: {
        p1: emCampo('p1', 'Zini', 4, 20 * MIN),
        p2: emCampo('p2', 'Titi', 3, 10 * MIN),
      },
    }),
    jogo({
      id: 'b',
      quando: 2,
      jogadores: {
        p1: emCampo('p1', 'Zini', 4, 20 * MIN),
        p2: emCampo('p2', 'Titi', 3, 10 * MIN),
      },
    }),
  ]);

  assert.equal(r.linhas.length, 2);
  assert.equal(r.linhas[0].name, 'Zini', 'quem joga mais vem primeiro');
  assert.equal(r.linhas[0].ms, 40 * MIN);
  assert.equal(r.linhas[1].ms, 20 * MIN);
  assert.equal(r.media, 30 * MIN, 'a média dos dois');
});

test('quem fica muito abaixo da média é assinalado, e os outros não', () => {
  const r = minutosPorJogador([
    jogo({
      jogadores: {
        p1: emCampo('p1', 'Zini', 4, 40 * MIN),
        p2: emCampo('p2', 'Titi', 3, 36 * MIN),
        // A média destes três é 26 minutos; 60% disso são 15,6.
        p3: emCampo('p3', 'Zef', 13, 2 * MIN),
      },
    }),
  ]);
  const por = Object.fromEntries(r.linhas.map((l) => [l.name, l]));
  assert.equal(por.Zef.abaixo, true);
  assert.equal(por.Zini.abaixo, false);
  assert.equal(por.Titi.abaixo, false);
});

test('um plantel repartido por igual não acusa ninguém', () => {
  const r = minutosPorJogador([
    jogo({
      jogadores: {
        p1: emCampo('p1', 'A', 1, 20 * MIN),
        p2: emCampo('p2', 'B', 2, 19 * MIN),
        p3: emCampo('p3', 'C', 3, 21 * MIN),
      },
    }),
  ]);
  assert.equal(
    r.linhas.some((l) => l.abaixo),
    false
  );
});

test('o painel do atleta resume minutos, utilizacao, impacto e ultimos jogos', () => {
  const r = painelDoAtleta(
    [
      jogo({
        id: 'a',
        quando: 1,
        nossos: 2,
        deles: 1,
        jogadores: {
          p1: emCampo('p1', 'Rams', 0, 40 * MIN),
          p2: emCampo('p2', 'Titi', 3, 20 * MIN),
        },
        golos: [
          { team: 'US', period: 1, matchElapsedMs: 3 * MIN, scorerId: 'p1' },
          { team: 'US', period: 2, matchElapsedMs: 22 * MIN, assistId: 'p1' },
          { team: 'THEM', period: 1, matchElapsedMs: 8 * MIN },
        ],
        faltas: [
          { team: 'US', period: 1, playerId: 'p1' },
          { team: 'THEM', period: 2, playerId: 'p1' },
        ],
        cartoes: [{ playerId: 'p1', type: 'YELLOW' }],
      }),
      jogo({
        id: 'b',
        quando: 2,
        nossos: 0,
        deles: 0,
        jogadores: { p2: emCampo('p2', 'Titi', 3, 20 * MIN) },
      }),
    ],
    [],
    'p1',
    { parteMs: 20 * MIN }
  );

  assert.equal(r.jogador.name, 'Rams');
  assert.equal(r.minutos.totalMs, 40 * MIN);
  assert.equal(r.utilizacao.jogos, 2);
  assert.equal(r.utilizacao.convocado, 1);
  assert.equal(r.utilizacao.utilizado, 1);
  assert.equal(r.utilizacao.titular, 1);
  assert.equal(r.impacto.golos, 1);
  assert.equal(r.impacto.assistencias, 1);
  assert.equal(r.impacto.golosEquipa, 2);
  assert.equal(r.impacto.sofridosEquipa, 1);
  assert.equal(r.periodos.primeira[0].golos, 1);
  assert.equal(r.periodos.segunda[0].assistencias, 1);
  assert.equal(r.disciplina.faltas, 1);
  assert.equal(r.disciplina.sofridas, 1);
  assert.equal(r.disciplina.amarelos, 1);
  assert.equal(r.ultimos[0].convocado, false);
});

test('o painel do guarda-redes separa golos sofridos por periodo', () => {
  const guardaRedes = {
    ...emCampo('gk', 'Diogo', 12, 40 * MIN),
    preferredPosition: 'GOALKEEPER',
    stints: [{ startMatchMs: 0, endMatchMs: 40 * MIN, startingPosition: 'GOALKEEPER' }],
  };

  const r = painelDoAtleta(
    [
      jogo({
        jogadores: { gk: guardaRedes },
        golos: [
          { team: 'THEM', period: 1, matchElapsedMs: 4 * MIN, goalkeeperId: 'gk' },
          { team: 'US', period: 1, matchElapsedMs: 7 * MIN, scorerId: 'p1' },
        ],
      }),
    ],
    [],
    'gk',
    { parteMs: 20 * MIN }
  );

  assert.equal(r.guardaRedes, true);
  assert.equal(r.impacto.sofridosBaliza, 1);
  assert.equal(r.periodos.primeira[0].sofridosBaliza, 1);
  assert.equal(r.periodos.primeira[0].mediaSofridosBaliza, 1);
  assert.equal(r.periodos.primeira[1].golos, 0);
});

test('um jogador de campo que foi à baliza não vira guarda-redes no dashboard', () => {
  const campo = {
    ...emCampo('p6', 'Rams', 6, 40 * MIN),
    preferredPosition: 'FIXO',
    stints: [{ startMatchMs: 0, endMatchMs: 40 * MIN, startingPosition: 'GOALKEEPER' }],
  };

  const r = painelDoAtleta(
    [
      jogo({
        jogadores: { p6: campo },
        golos: [
          { team: 'THEM', period: 1, matchElapsedMs: 4 * MIN, goalkeeperId: 'p6' },
        ],
      }),
    ],
    [{ id: 'p6', name: 'Rams', shirtNumber: 6, preferredPosition: 'FIXO' }],
    'p6',
    { parteMs: 20 * MIN }
  );

  assert.equal(r.guardaRedes, false);
  assert.equal(r.impacto.sofridosBaliza, 1);
  assert.equal(r.periodos.comDados, false);
});

/* -------------------------------------------------------------- faixas */

test('os golos caem na faixa certa, e a segunda parte conta do seu início', () => {
  const r = golosPorFaixa([
    jogo({
      golos: [
        // 3 minutos da primeira parte → faixa 0–5.
        { team: 'US', period: 1, matchElapsedMs: 3 * MIN },
        // 18 minutos da primeira → faixa 15–20.
        { team: 'THEM', period: 1, matchElapsedMs: 18 * MIN },
        // 22 do jogo, com a primeira parte a valer 20 → 2 minutos da segunda.
        { team: 'US', period: 2, matchElapsedMs: 22 * MIN },
      ],
    }),
  ]);

  assert.equal(r.primeira[0].marcados, 1);
  assert.equal(r.primeira[3].sofridos, 1, 'a faixa dos 15 aos 20');
  assert.equal(r.segunda[0].marcados, 1, 'e não a faixa dos 20 do jogo');
  assert.equal(r.comDados, true);
});

test('um golo nos descontos entra na última faixa em vez de se perder', () => {
  const r = golosPorFaixa([
    jogo({ golos: [{ team: 'US', period: 1, matchElapsedMs: 23 * MIN }] }),
  ]);
  assert.equal(r.primeira[r.primeira.length - 1].marcados, 1);
});

test('um jogo por terminar não entra nas contas', () => {
  const r = golosPorFaixa([
    jogo({
      status: 'FIRST_HALF_RUNNING',
      golos: [{ team: 'US', period: 1, matchElapsedMs: 2 * MIN }],
    }),
  ]);
  assert.equal(r.comDados, false);
});

/* --------------------------------------------------------------- forma */

test('a forma vem do mais antigo para o mais recente', () => {
  const r = formaRecente([
    jogo({ id: 'b', quando: 200, nossos: 1, deles: 3 }),
    jogo({ id: 'a', quando: 100, nossos: 2, deles: 0 }),
  ]);
  assert.deepEqual(
    r.map((j) => j.matchId),
    ['a', 'b']
  );
  assert.equal(r[0].resultado, 'W');
  assert.equal(r[1].resultado, 'L');
});

test('a fita mostra só os últimos, mas os últimos certos', () => {
  const muitos = Array.from({ length: 12 }, (_, i) =>
    jogo({ id: `j${i}`, quando: i, nossos: i, deles: 0 })
  );
  const r = formaRecente(muitos, { quantos: 3 });
  assert.deepEqual(
    r.map((j) => j.matchId),
    ['j9', 'j10', 'j11']
  );
});

test('casa e fora separam-se, com os golos de cada lado', () => {
  const r = casaEFora([
    jogo({ id: 'a', casa: true, nossos: 3, deles: 1 }),
    jogo({ id: 'b', casa: false, nossos: 0, deles: 2 }),
    jogo({ id: 'c', casa: false, nossos: 1, deles: 1 }),
  ]);
  assert.deepEqual(
    { jogos: r.casa.jogos, v: r.casa.v, golosA: r.casa.golosA },
    { jogos: 1, v: 1, golosA: 3 }
  );
  assert.deepEqual({ jogos: r.fora.jogos, e: r.fora.e, d: r.fora.d }, { jogos: 2, e: 1, d: 1 });
});

test('a forma sobe com uma vitória, desce com uma derrota e não mexe com um empate', () => {
  const r = curvaDeForma([
    jogo({ id: 'a', quando: 1, nossos: 3, deles: 1 }),
    jogo({ id: 'b', quando: 2, nossos: 0, deles: 4 }),
    jogo({ id: 'c', quando: 3, nossos: 1, deles: 1 }),
    jogo({ id: 'd', quando: 4, nossos: 2, deles: 0 }),
  ]);
  assert.deepEqual(
    r.pontos.map((p) => p.nivel),
    [1, 0, 0, 1]
  );
});

test('uma goleada vale o mesmo que um 1–0 — é a diferença para o saldo', () => {
  const r = curvaDeForma([
    jogo({ id: 'a', quando: 1, nossos: 9, deles: 0 }),
    jogo({ id: 'b', quando: 2, nossos: 1, deles: 0 }),
  ]);
  assert.deepEqual(
    r.pontos.map((p) => p.nivel),
    [1, 2]
  );
});

test('a escada olha só para os últimos jogos', () => {
  const muitos = Array.from({ length: 12 }, (_, i) =>
    jogo({ id: `j${i}`, quando: i, nossos: 1, deles: 0 })
  );
  const r = curvaDeForma(muitos, { quantos: 8 });
  assert.equal(r.jogos, 8);
  assert.equal(r.pontos[r.pontos.length - 1].nivel, 8);
});

/* ---------------------------------------------------------- disciplina */

test('as faltas contam-se por jogo, e o limite das cinco continua a ser por parte', () => {
  const r = disciplina([
    jogo({
      faltas: [
        ...Array.from({ length: 5 }, () => ({ team: 'US', period: 1, playerId: 'p1' })),
        { team: 'US', period: 2, playerId: 'p1' },
        // As do adversário não são nossas.
        { team: 'THEM', period: 1, playerId: null },
      ],
      jogadores: { p1: emCampo('p1', 'Zef', 13, 10 * MIN) },
    }),
  ]);

  assert.equal(r.jogos, 1);
  assert.equal(r.partes, 2);
  assert.equal(r.totalNossas, 6);
  assert.equal(r.mediaPorJogo, 6, 'seis faltas num jogo');
  assert.equal(r.noLimite, 1, 'só a primeira parte chegou às cinco');
  assert.equal(r.percentagemNoLimite, 50);
  assert.equal(r.jogadores[0].faltas, 6);
  assert.equal(r.comAutor, true);
});

test('as faltas sofridas contam-se à parte, e são as do adversário', () => {
  const r = disciplina([
    jogo({
      faltas: [
        { team: 'US', period: 1, playerId: 'p1' },
        { team: 'THEM', period: 1, playerId: 'p2' },
        { team: 'THEM', period: 2, playerId: 'p2' },
      ],
      jogadores: {
        p1: emCampo('p1', 'Zef', 13, 10 * MIN),
        p2: emCampo('p2', 'Titi', 3, 10 * MIN),
      },
    }),
  ]);
  assert.equal(r.totalNossas, 1);
  assert.equal(r.totalSofridas, 2);
  assert.equal(r.mediaSofridasPorJogo, 2);
  const titi = r.jogadores.find((j) => j.name === 'Titi');
  assert.equal(titi.sofridas, 2);
  assert.equal(titi.faltas, 0);
  assert.equal(r.comSofridas, true);
});

test('faltas sem dono não fingem um gráfico por jogador', () => {
  const r = disciplina([
    jogo({
      faltas: [{ team: 'US', period: 1, playerId: null }],
      jogadores: { p1: emCampo('p1', 'Zef', 13, 10 * MIN) },
    }),
  ]);
  assert.equal(r.totalNossas, 1, 'a falta da equipa conta');
  assert.equal(r.comAutor, false, 'mas não há a quem a atribuir');
});

test('os cartões somam-se por jogador e o vermelho ordena à frente', () => {
  const r = disciplina([
    jogo({
      cartoes: [
        { playerId: 'p1', type: 'YELLOW' },
        { playerId: 'p1', type: 'YELLOW' },
        { playerId: 'p2', type: 'RED' },
      ],
      jogadores: {
        p1: emCampo('p1', 'Titi', 3, 10 * MIN),
        p2: emCampo('p2', 'Zini', 4, 10 * MIN),
      },
    }),
  ]);
  assert.equal(r.jogadores[0].name, 'Zini');
  assert.equal(r.jogadores[0].vermelhos, 1);
  assert.equal(r.jogadores[1].amarelos, 2);
});

test('uma primeira parte por terminar não conta como parte sem faltas', () => {
  const r = disciplina([jogo({ primeiraMs: null, faltas: [{ team: 'US', period: 1 }] })]);
  assert.equal(r.partes, 1, 'a segunda parte nunca começou');
});

/* ------------------------------------------------------------- filtros */

test('o tipo de jogo do escalão é o dos jogos que ele tem', () => {
  const cron = jogo({ id: 'a' });
  cron.match.timing = 'TIMED';
  const corr = jogo({ id: 'b', quando: 2 });
  corr.match.timing = 'UNTIMED';
  assert.deepEqual(tiposDeJogo([cron]).sort(), ['TIMED']);
  assert.deepEqual(tiposDeJogo([cron, corr]).sort(), ['TIMED', 'UNTIMED']);
});

test('o filtro do tipo separa os cronometrados dos corridos', () => {
  const cron = jogo({ id: 'a' });
  cron.match.timing = 'TIMED';
  const corr = jogo({ id: 'b', quando: 2 });
  corr.match.timing = 'UNTIMED';
  assert.deepEqual(
    filtrar([cron, corr], { tipo: 'TIMED' }).map((e) => e.match.id),
    ['a']
  );
});

test('sem provas escolhidas ficam todas, e não nenhuma', () => {
  const a = jogo({ id: 'a' });
  a.match.competitionId = 'c1';
  const b = jogo({ id: 'b', quando: 2 });
  b.match.competitionId = 'c2';
  assert.equal(filtrar([a, b], { provas: [] }).length, 2);
  assert.deepEqual(
    filtrar([a, b], { provas: ['c2'] }).map((e) => e.match.id),
    ['b']
  );
});

test('a parte dura 20 minutos no cronometrado e 30 no corrido', () => {
  assert.equal(parteDosJogos([], 'TIMED'), 20 * MIN);
  assert.equal(parteDosJogos([], 'UNTIMED'), 30 * MIN);
});

test('com os dois tipos à mistura manda o mais longo, para nenhum golo ficar de fora', () => {
  const cron = jogo({ id: 'a' });
  cron.match.timing = 'TIMED';
  const corr = jogo({ id: 'b', quando: 2 });
  corr.match.timing = 'UNTIMED';
  assert.equal(parteDosJogos([cron, corr]), 30 * MIN);
});

/* ------------------------------------------------- médias por faixa */

test('cada faixa traz a média por jogo, e não só o total', () => {
  const g = (ms, team) => ({ team, period: 1, matchElapsedMs: ms });
  const r = golosPorFaixa([
    jogo({ id: 'a', quando: 1, golos: [g(2 * MIN, 'US'), g(3 * MIN, 'US')] }),
    jogo({ id: 'b', quando: 2, golos: [g(1 * MIN, 'THEM')] }),
  ]);
  assert.equal(r.jogos, 2);
  assert.equal(r.primeira[0].marcados, 2);
  assert.equal(r.primeira[0].mediaMarcados, 1, 'dois golos em dois jogos');
  assert.equal(r.primeira[0].mediaSofridos, 0.5);
});
