// tests/demo.test.js — a 1.ª parte já jogada do jogo de experiência.

import test from 'node:test';
import assert from 'node:assert/strict';

import { eventosPrimeiraParte, DURACAO_PRIMEIRA_DEMO_MS } from '../src/domain/demoJogo.js';
import { buildMatchState } from '../src/domain/reducer.js';
import { playerMatchStats } from '../src/domain/stats.js';
import { MATCH_STATUS, LOCATION, MATCH_TIMING } from '../src/domain/constants.js';

const MIN = 60_000;
const POS = ['GOALKEEPER', 'FIXO', 'LEFT_WINGER', 'RIGHT_WINGER', 'PIVOT'];
const match = { id: 'demo', clubId: 'c', timing: MATCH_TIMING.TIMED, periodDurationMs: 20 * MIN };
const jogadores = Array.from({ length: 10 }, (_, i) => `p${i}`);
const squad = jogadores.map((playerId, i) => ({
  id: `s${i}`,
  matchId: 'demo',
  playerId,
  playerNameSnapshot: `Jogador ${i}`,
  shirtNumberSnapshot: i + 1,
  initialPosition: POS[i] || null,
  initialLocation: i < 5 ? LOCATION.COURT : LOCATION.BENCH,
}));

function estadoNoIntervalo() {
  const inicio = Date.now() - 30 * MIN;
  const novos = eventosPrimeiraParte({ match, squad, jogadores, inicio });
  return buildMatchState(match, squad, novos.map((e, i) => ({ ...e, seq: i + 1 })));
}

test('a demonstração chega ao intervalo com 2-1 e a 1.ª parte de 20 minutos', () => {
  const st = estadoNoIntervalo();
  assert.equal(st.status, MATCH_STATUS.HALFTIME);
  assert.equal(st.teamScore, 2);
  assert.equal(st.opponentScore, 1);
  assert.equal(st.firstHalfMs, DURACAO_PRIMEIRA_DEMO_MS);
});

test('os minutos em campo somam 5 × 20 e ninguém fica com tempo negativo', () => {
  const st = estadoNoIntervalo();
  const stats = Object.values(st.players).map((p) => playerMatchStats(p, st.elapsedMatchMs));
  const total = stats.reduce((soma, s) => soma + s.courtMs, 0);
  assert.equal(total, 5 * DURACAO_PRIMEIRA_DEMO_MS);
  for (const s of stats) assert.ok(s.courtMs >= 0 && s.benchMs >= 0, s.playerId);
  // Há tempos variados: pelo menos 8 jogadores passaram pelo campo.
  assert.ok(stats.filter((s) => s.courtMs > 0).length >= 8);
});

test('com a demonstração a correr, a sincronização não envia nem descarrega nada', async () => {
  // A demo corre com sessão iniciada (depois do login): o FC Demonstração não
  // pode subir para a conta. A marca vive no sessionStorage.
  const guardado = new Map();
  globalThis.window = globalThis.window || {};
  globalThis.window.sessionStorage = {
    getItem: (k) => guardado.get(k) ?? null,
    setItem: (k, v) => guardado.set(k, String(v)),
    removeItem: (k) => guardado.delete(k),
  };
  const sync = await import('../src/lib/data/sync.js');
  const { marcarDemo, emDemo } = await import('../src/lib/demoEstado.js');
  let pedidos = 0;
  const contar = () => {
    pedidos += 1;
    throw new Error('não devia ter chamado o servidor');
  };
  sync.setRemote({ from: contar, rpc: contar, auth: { getSession: contar } });

  marcarDemo(true);
  assert.equal(emDemo(), true);
  assert.deepEqual(await sync.push('u1', 'a@b.pt'), { pushed: 0 });
  assert.deepEqual(await sync.pull('u1'), { pulled: 0 });
  assert.equal(await sync.hasRemoteChanges('u1'), false);
  await sync.flush('u1', 'a@b.pt');
  assert.equal(sync.estadoAtual().status, sync.SYNC.LOCAL);
  assert.equal(pedidos, 0);

  marcarDemo(false);
  assert.equal(emDemo(), false);
  sync.setRemote(null);
});
