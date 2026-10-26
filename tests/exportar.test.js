// tests/exportar.test.js — os ficheiros que a app gera no aparelho: os PDF
// (painel, jogo, presenças) e o Excel das presenças.
//
// Não se compara o desenho — isso vê-se a olhar para o PDF. O que aqui se
// prende é o que parte sem ninguém reparar: um carácter que a Helvetica não
// tem a estragar a frase toda, a grelha das presenças a não bater com as
// contas do ecrã, um .xlsx que o Excel recusa abrir.

import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';

import { limpar } from '../src/lib/pdf/base.js';
import { nomeLimpo } from '../src/lib/ficheiros.js';
import { gerarXlsx, letraColuna } from '../src/lib/xlsx.js';
import { gerarPdfPainel, nomePdfPainel } from '../src/lib/pdf/relatorioPainel.js';
import { gerarPdfJogo } from '../src/lib/pdf/relatorioJogo.js';
import { gerarPdfPresencas, gerarXlsxPresencas } from '../src/lib/presencasExport.js';
import { PRESENCA, estatisticasPresencas, linhasDePresenca, treinosContados } from '../src/domain/treino.js';

const MIN = 60_000;

test('o texto do PDF fica na tabela da Helvetica, com os acentos todos', () => {
  assert.equal(limpar('Ação, Peña, ¿Qué? 1.ª parte – 5€…'), 'Ação, Peña, ¿Qué? 1.ª parte – 5€…');
  assert.equal(limpar("15′ ≥ 3"), "15' >= 3");
  assert.equal(limpar('Łukasz'), 'Lukasz');
  assert.equal(limpar(null), '');
});

test('os nomes de ficheiro saem sem acentos nem espaços', () => {
  assert.equal(nomeLimpo('Sub-15 Iniciados Ação'), 'sub-15-iniciados-acao');
  assert.equal(nomeLimpo(''), 'ficheiro');
  assert.match(nomePdfPainel({ name: 'Júniores A' }, 'João Simões'), /^painel-juniores-a-joao-simoes-\d{4}-\d{2}-\d{2}\.pdf$/);
});

test('as colunas do Excel vão de A a Z e depois AA', () => {
  assert.equal(letraColuna(0), 'A');
  assert.equal(letraColuna(25), 'Z');
  assert.equal(letraColuna(26), 'AA');
  assert.equal(letraColuna(27), 'AB');
});

/* ------------------------------------------------------------ presenças */

const jogadores = [
  { id: 'a', name: 'Ana', shirtNumber: 7 },
  { id: 'b', name: 'Bruno', shirtNumber: 3 },
  { id: 'c', name: 'Carla', shirtNumber: 9, isActive: false },
];
const treinos = [
  { id: 't1', date: '2026-10-01', startTime: '19:00' },
  { id: 't2', date: '2026-10-08', startTime: '19:00' },
  { id: 't3', date: '2026-10-08', startTime: '10:00' },
  { id: 't4', date: '2026-10-15', startTime: '19:00', status: 'CANCELADO' },
  { id: 't5', date: '2026-10-30', startTime: '19:00' },
  { id: 't6', date: '2026-10-20', startTime: '19:00' },
];
const presencas = [
  { sessionId: 't1', playerId: 'a', status: PRESENCA.PRESENTE },
  { sessionId: 't1', playerId: 'b', status: PRESENCA.FALTA_INJUSTIFICADA },
  { sessionId: 't2', playerId: 'a', status: PRESENCA.PRESENTE },
  { sessionId: 't2', playerId: 'b', status: PRESENCA.PRESENTE },
  { sessionId: 't3', playerId: 'a', status: PRESENCA.LESAO },
  { sessionId: 't4', playerId: 'a', status: PRESENCA.PRESENTE },
  { sessionId: 't5', playerId: 'a', status: PRESENCA.PRESENTE },
];
const hoje = '2026-10-26';

test('a grelha exportada tem os mesmos treinos que as contas do ecrã', () => {
  const colunas = treinosContados({ treinos, presencas, de: '2026-07-01', ate: hoje });
  // Fora: o cancelado (t4), o futuro (t5) e o que não tem presenças (t6).
  assert.deepEqual(colunas.map((c) => c.treino.id), ['t1', 't3', 't2']);
  assert.equal(colunas[0].presencas.get('b'), PRESENCA.FALTA_INJUSTIFICADA);
  const contas = estatisticasPresencas({ treinos, presencas, de: '2026-07-01', ate: hoje });
  assert.equal(contas.treinos, colunas.length);
});

test('as linhas saem pela ordem escolhida, sem os inativos que não têm registos', () => {
  const { porJogador } = estatisticasPresencas({ treinos, presencas, de: '2026-07-01', ate: hoje });
  assert.deepEqual(linhasDePresenca(jogadores, porJogador, 'numero').map((l) => l.jogador.id), ['b', 'a']);
  assert.deepEqual(linhasDePresenca(jogadores, porJogador, 'faltas').map((l) => l.jogador.id), ['b', 'a']);
  assert.deepEqual(linhasDePresenca(jogadores, porJogador, 'assiduidade').map((l) => l.jogador.id), ['b', 'a']);
});

test('o Excel das presenças é um .xlsx com as duas folhas, cores e painel congelado', async () => {
  const blob = await gerarXlsxPresencas({ club: { name: 'Clube' }, team: { name: 'Sub-15' }, treinos, presencas, jogadores, hoje });
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  for (const f of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'])
    assert.ok(zip[f], f);
  const livro = strFromU8(zip['xl/workbook.xml']);
  assert.match(livro, /name="Presenças"/);
  assert.match(livro, /name="Estatísticas"/);
  const folha = strFromU8(zip['xl/worksheets/sheet1.xml']);
  assert.match(folha, /state="frozen"/);
  assert.match(folha, /<cols>/);
  // O verde dos presentes e o vermelho das injustificadas.
  const estilos = strFromU8(zip['xl/styles.xml']);
  assert.match(estilos, /FF22C55E/);
  assert.match(estilos, /FFEF4444/);
  // Dois treinos no mesmo dia levam a hora.
  assert.match(strFromU8(zip['xl/sharedStrings.xml']), /08\/10\/2026 10:00/);
});

test('o gerador de Excel escapa o que partia o XML', async () => {
  const blob = await gerarXlsx([{ nome: 'A/B: [x]', linhas: [['<&>"', 1.5, null, { v: 'ok', estilo: { negrito: true } }]] }]);
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.match(strFromU8(zip['xl/sharedStrings.xml']), /&lt;&amp;&gt;&quot;/);
  assert.match(strFromU8(zip['xl/workbook.xml']), /name="A B   x"/);
  assert.match(strFromU8(zip['xl/worksheets/sheet1.xml']), /<c r="B1"><v>1.5<\/v><\/c>/);
});

/* ------------------------------------------------------------------ PDF */

function jogo(id, nossos, deles) {
  const players = {
    p1: { playerId: 'p1', name: 'João Simões', number: 1, status: 'ON_BENCH', stints: [{ startMatchMs: 0, endMatchMs: 40 * MIN }] },
    p2: { playerId: 'p2', name: 'Íñigo Peña', number: 7, status: 'ON_BENCH', stints: [{ startMatchMs: 0, endMatchMs: 12 * MIN }] },
  };
  const goals = [
    ...Array.from({ length: nossos }, (_, i) => ({ team: 'US', period: 1, matchElapsedMs: (3 + i) * MIN, scorerId: 'p2', howScored: 'TRANSICAO' })),
    ...Array.from({ length: deles }, (_, i) => ({ team: 'THEM', period: 2, matchElapsedMs: (25 + i) * MIN, goalkeeperId: 'p1' })),
  ];
  return {
    match: { id, scheduledAt: Date.UTC(2026, 9, 1), opponentName: 'Leões', homeOrAway: 'HOME', periodDurationMs: 20 * MIN },
    state: {
      status: 'FINISHED',
      teamScore: nossos,
      opponentScore: deles,
      firstHalfMs: 20 * MIN,
      elapsedMatchMs: 40 * MIN,
      goals,
      fouls: [{ team: 'US', period: 1, playerId: 'p2' }],
      cards: [],
      players,
    },
  };
}

const ePdf = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return new TextDecoder('latin1').decode(bytes.slice(0, 5)) === '%PDF-';
};

test('os relatórios em PDF geram-se sem browser (painel, atleta, jogo, presenças)', async () => {
  const entries = [jogo('m1', 3, 1), jogo('m2', 0, 2)];
  const roster = [{ id: 'p1', name: 'João Simões', number: 1 }, { id: 'p2', name: 'Íñigo Peña', number: 7 }];
  const base = { club: { name: 'Clube' }, team: { name: 'Sub-15' }, entries, roster, parteMs: 20 * MIN };
  assert.ok(await ePdf(await gerarPdfPainel(base)));
  assert.ok(await ePdf(await gerarPdfPainel({ ...base, atletaId: 'p2' })));
  assert.ok(await ePdf(await gerarPdfPainel({ ...base, entries: [] })));
  assert.ok(await ePdf(await gerarPdfJogo({ club: { name: 'Clube' }, match: entries[0].match, state: entries[0].state })));
  assert.ok(await ePdf(await gerarPdfPresencas({ club: null, team: { name: 'Sub-15' }, treinos, presencas, jogadores, hoje })));
});
