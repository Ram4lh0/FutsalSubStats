// tests/pdfRegistos.test.js — os registos extra (add-ons) no PDF: o mapa dos
// remates e os campos dos outros registos têm de sair, com a legenda certa.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMatchState } from '../src/domain/reducer.js';
import * as A from '../src/domain/actions.js';
import { LOCATION } from '../src/domain/constants.js';
import { REGISTO, marcadores, registar } from '../src/domain/registos.js';
import { itensDaLegenda } from '../src/lib/pdf/registos.js';
import { gerarPdfJogo } from '../src/lib/pdf/relatorioJogo.js';
import { gerarPdfPainel, gerarPdfAtleta, nomePdfAtleta } from '../src/lib/pdf/relatorioPainel.js';

const MIN = 60_000;
const T0 = 1_700_000_000_000;
const START = { p1: 'GOALKEEPER', p2: 'FIXO', p3: 'LEFT_WINGER', p4: 'RIGHT_WINGER', p5: 'PIVOT' };
const match = { id: 'm1', clubId: 'c1', periodDurationMs: 20 * MIN, opponentName: 'Rival', scheduledAt: new Date(T0).toISOString() };

function jogoComPontos({ lancamentos = false, novos = false, lps = false } = {}) {
  const squad = ['Ana', 'Bruno', 'Carlos', 'Diogo', 'Eduardo', 'Filipe'].map((name, i) => {
    const id = `p${i + 1}`;
    return {
      id: `s${i}`,
      matchId: 'm1',
      playerId: id,
      playerNameSnapshot: name,
      shirtNumberSnapshot: i + 1,
      initialPosition: START[id] || null,
      initialLocation: START[id] ? LOCATION.COURT : LOCATION.BENCH,
    };
  });
  const events = [];
  const gravar = (f, now) => {
    const ev = f(buildMatchState(match, squad, events), now);
    ev.seq = events.length + 1;
    events.push(ev);
    return ev;
  };
  const reg = (d, t) => gravar((s) => registar(s, d, t), t);
  gravar((s) => A.startFirstHalf(s, T0), T0);
  reg({ registo: 'remate', playerId: 'p5', resultado: 'DEFENDIDO', x: 0.8, y: 0.4 }, T0 + MIN);
  reg({ registo: 'remate', playerId: 'p4', resultado: 'FORA', x: 0.7, y: 0.2 }, T0 + 2 * MIN);
  reg({ registo: 'remate_adv', resultado: 'BLOQUEADO', x: 0.2, y: 0.5 }, T0 + 3 * MIN);
  reg({ registo: 'recuperacao', playerId: 'p2', x: 0.4, y: 0.6 }, T0 + 4 * MIN);
  reg({ registo: 'defesa_gr', playerId: 'p1', x: 0.05, y: 0.5 }, T0 + 5 * MIN);
  reg({ registo: 'fora', equipa: 'THEM', x: 0.5, y: 0 }, T0 + 6 * MIN);
  if (lancamentos) {
    reg({ registo: 'lancamento_gr', playerId: 'p1', x: 0.6, y: 0.2 }, T0 + 7 * MIN);
    reg({ registo: 'lancamento_gr', playerId: 'p1', x: 0.35, y: 0.85 }, T0 + 8 * MIN);
  }
  if (lps) {
    reg({ registo: 'duelo', playerId: 'p3', resultado: 'GANHO' }, T0 + 9 * MIN);
    reg({ registo: 'duelo', playerId: 'p3', resultado: 'PERDIDO' }, T0 + 9 * MIN + 1000);
    reg({ registo: 'oportunidade_criada', equipa: 'US', playerId: 'p4' }, T0 + 10 * MIN);
    reg({ registo: 'oportunidade_criada', equipa: 'THEM' }, T0 + 10 * MIN + 1000);
    reg({ registo: 'oportunidade_falhada', equipa: 'US', playerId: 'p5' }, T0 + 11 * MIN);
    reg({ registo: 'perda_bola', playerId: 'p2' }, T0 + 12 * MIN);
  }
  if (novos) {
    reg({ registo: 'duelo_def', playerId: 'p2', resultado: 'GANHO' }, T0 + 9 * MIN);
    reg({ registo: 'duelo_def', playerId: 'p2', resultado: 'PERDIDO' }, T0 + 10 * MIN);
    reg({ registo: 'pressao_alta', resultado: 'RECUPERADA' }, T0 + 11 * MIN);
    reg({ registo: 'bola_parada', tipo: 'CANTO', resultado: 'FINALIZACAO' }, T0 + 12 * MIN);
  }
  gravar((s) => A.finishMatch(s, T0 + 20 * MIN), T0 + 20 * MIN);
  return buildMatchState(match, squad, events);
}

test('a legenda do mapa no PDF conta cada categoria', () => {
  const state = jogoComPontos();
  const nossos = itensDaLegenda(REGISTO.REMATE, marcadores(state, { registos: [REGISTO.REMATE] }));
  const n = Object.fromEntries(nossos.map((i) => [i.texto, i.n]));
  assert.equal(nossos.reduce((s, i) => s + i.n, 0), 2);
  assert.ok(Object.values(n).includes(1));
  const deles = itensDaLegenda(REGISTO.REMATE_ADV, marcadores(state, { registos: [REGISTO.REMATE_ADV] }));
  assert.ok(deles.some((i) => i.forma === 'anel' && i.n === 1));
  const foras = itensDaLegenda(REGISTO.FORA, marcadores(state, { registos: [REGISTO.FORA] }));
  assert.deepEqual(foras.map((i) => i.n), [0, 1]);
});

test('lançamentos do GR: legenda com contagem e mais conteúdo nos três PDF', async () => {
  const sem = jogoComPontos();
  const com = jogoComPontos({ lancamentos: true });
  const itens = itensDaLegenda(REGISTO.LANCAMENTO_GR, marcadores(com, { registos: [REGISTO.LANCAMENTO_GR] }));
  assert.deepEqual(itens.map((i) => i.n), [2]);
  const club = { name: 'Clube' };
  const team = { name: 'Sub-15' };
  const tamanho = async (state) => {
    const entries = [{ match: { ...match, status: 'FINISHED' }, state }];
    const roster = [{ id: 'p1', name: 'Ana', number: 1, shirtNumber: 1, preferredPosition: 'GOALKEEPER' }];
    return {
      jogo: (await gerarPdfJogo({ club, match, state, team })).size,
      painel: (await gerarPdfPainel({ club, team, entries, roster, parteMs: 20 * MIN })).size,
      atleta: (await gerarPdfAtleta({ club, team, entries, roster, player: roster[0] })).size,
    };
  };
  const a = await tamanho(sem);
  const b = await tamanho(com);
  assert.ok(b.jogo > a.jogo, 'PDF do jogo');
  assert.ok(b.painel > a.painel, 'PDF do painel');
  assert.ok(b.atleta > a.atleta, 'PDF do atleta');
});

test('relatório pós-jogo e análise (add-ons de 19/11/2026) acrescentam conteúdo aos PDF', async () => {
  const state = jogoComPontos({ lps: true });
  const club = { name: 'Clube' };
  const team = { name: 'Juniores' };
  const sem = await gerarPdfJogo({ club, match, state, team });
  const com = await gerarPdfJogo({ club, match, state, team, relatorio: { ligados: new Set(['remate', 'duelo']) } });
  assert.ok(com.size > sem.size, 'PDF do jogo com o relatório');
  const entries = [{ match: { ...match, status: 'FINISHED' }, state }];
  const roster = [
    { id: 'p1', name: 'Ana', number: 1, preferredPosition: 'GOALKEEPER', strongFoot: 'RIGHT' },
    { id: 'p3', name: 'Carlos', number: 3, preferredPosition: 'LEFT_WINGER', strongFoot: 'RIGHT' },
    { id: 'p4', name: 'Diogo', number: 4, preferredPosition: 'RIGHT_WINGER', strongFoot: 'LEFT' },
  ];
  const base = { club, team, entries, roster, parteMs: 20 * MIN };
  const p0 = await gerarPdfPainel(base);
  const p1 = await gerarPdfPainel({ ...base, analise: { indicadores: true, posicoes: true, ultimos: 5 } });
  assert.ok(p1.size > p0.size, 'PDF do painel com a análise');
  const a0 = await gerarPdfPainel({ ...base, atletaId: 'p1' });
  const a1 = await gerarPdfPainel({ ...base, atletaId: 'p1', analise: { indicadores: true } });
  assert.ok(a1.size > a0.size, 'PDF do GR com os indicadores');
});

test('os PDF do jogo e do painel saem com os campos dos registos', async () => {
  const state = jogoComPontos();
  const club = { name: 'Clube' };
  const jogo = await gerarPdfJogo({ club, match, state, team: { name: 'Sub-15' } });
  assert.ok(jogo.size > 5000);
  const entries = [{ match: { ...match, status: 'FINISHED' }, state }];
  const roster = [{ id: 'p5', name: 'Eduardo', number: 5 }];
  const painel = await gerarPdfPainel({ club, team: { name: 'Sub-15' }, entries, roster, parteMs: 20 * MIN });
  assert.ok(painel.size > 5000);
  const atleta = await gerarPdfPainel({ club, team: { name: 'Sub-15' }, entries, roster, parteMs: 20 * MIN, atletaId: 'p5' });
  assert.ok(atleta.size > 3000);
});

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('o PDF da ficha do jogador traz os registos que ele tem, e a foto', async () => {
  const state = jogoComPontos();
  const entries = [{ match: { ...match, status: 'FINISHED' }, state }];
  const roster = ['Ana', 'Bruno', 'Carlos', 'Diogo', 'Eduardo', 'Filipe'].map((name, i) => ({
    id: `p${i + 1}`,
    name,
    shirtNumber: i + 1,
    preferredPosition: i === 0 ? 'GOALKEEPER' : 'UNIVERSAL',
  }));
  const base = { club: { name: 'Clube' }, team: { name: 'Sub-15' }, entries, roster };

  // O pivot rematou: o PDF dele leva a tabela dos registos e o mapa.
  const comRegistos = await gerarPdfAtleta({ ...base, player: roster[4] });
  // O ala esquerdo jogou mas não tem registos: sai sem esses blocos.
  const semRegistos = await gerarPdfAtleta({ ...base, player: roster[2] });
  assert.ok(semRegistos.size > 3000);
  assert.ok(comRegistos.size > semRegistos.size, 'os registos e o mapa acrescentam ao PDF');

  // O guarda-redes, com a foto no cabeçalho.
  const gr = await gerarPdfAtleta({ ...base, player: roster[0], foto: PNG_1PX });
  assert.ok(gr.size > 3000);
  // Uma foto ilegível não deita o PDF abaixo.
  const fotoMa = await gerarPdfAtleta({ ...base, player: roster[0], foto: 'data:image/png;base64,xxxx' });
  assert.ok(fotoMa.size > 3000);

  assert.match(nomePdfAtleta(roster[4]), /^atleta-eduardo-\d{4}-\d{2}-\d{2}\.pdf$/);
});

test('o PDF da ficha de quem nunca foi convocado sai na mesma', async () => {
  const state = jogoComPontos();
  const entries = [{ match: { ...match, status: 'FINISHED' }, state }];
  const novo = { id: 'p99', name: 'Novo', shirtNumber: 99 };
  const pdf = await gerarPdfAtleta({ club: { name: 'Clube' }, team: { name: 'Sub-15' }, entries, roster: [novo], player: novo });
  assert.ok(pdf.size > 1500);
});

test('duelos 1x1, pressão alta e bolas paradas ofensivas: mais conteúdo nos três PDF', async () => {
  const sem = jogoComPontos();
  const com = jogoComPontos({ novos: true });
  const club = { name: 'Clube' };
  const team = { name: 'Sub-15' };
  const roster = [{ id: 'p2', name: 'Bruno', number: 2, shirtNumber: 2, preferredPosition: 'FIXO' }];
  const tamanho = async (state) => {
    const entries = [{ match: { ...match, status: 'FINISHED' }, state }];
    return {
      jogo: (await gerarPdfJogo({ club, match, state, team })).size,
      painel: (await gerarPdfPainel({ club, team, entries, roster, parteMs: 20 * MIN })).size,
      atleta: (await gerarPdfAtleta({ club, team, entries, roster, player: roster[0] })).size,
    };
  };
  const a = await tamanho(sem);
  const b = await tamanho(com);
  assert.ok(b.jogo > a.jogo, 'PDF do jogo');
  assert.ok(b.painel > a.painel, 'PDF do painel');
  assert.ok(b.atleta > a.atleta, 'PDF do atleta');
});
