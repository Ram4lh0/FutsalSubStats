// tests/utEntreAparelhos.test.js
// A UT de um treino entre dois aparelhos. O servidor de mentira faz o que o
// supabase-js + PostgREST fazem num upsert em lote: as colunas são a união das
// chaves de todas as linhas e a linha que não traz uma delas grava-a a NULL.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as db from '../src/lib/data/local.js';
import { push, pull, setRemote, esquecerMarca } from '../src/lib/data/sync.js';
import { treinos } from '../src/lib/data/treino.js';
import { trainingSessionMapper } from '../src/lib/data/mappers.js';

const UTILIZADOR = '11111111-1111-4111-8111-111111111111';
const ESCALAO = 'e1';

function servidorComoSupabase() {
  const tabelas = {};
  const lotes = [];
  let relogio = Date.parse('2026-11-08T10:00:00Z');
  const agora = () => new Date((relogio += 1000)).toISOString();
  let antesDoUpsert = null;

  const from = (nome) => {
    tabelas[nome] ||= [];
    return {
      async upsert(rows) {
        rows = Array.isArray(rows) ? rows : [rows];
        lotes.push({ nome, rows });
        if (antesDoUpsert) await antesDoUpsert(nome, rows);
        const colunas = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        for (const r of rows) {
          const cheia = Object.fromEntries(colunas.map((c) => [c, r[c] ?? null]));
          const i = tabelas[nome].findIndex((x) => x.id === r.id);
          if (i >= 0) tabelas[nome][i] = { ...tabelas[nome][i], ...cheia, updated_at: agora() };
          else tabelas[nome].push({ ...cheia, created_at: agora(), updated_at: agora() });
        }
        return { error: null };
      },
      select() {
        let desde = null;
        const res = {
          eq: () => res,
          in: () => res,
          order: () => res,
          range: () => res,
          gt: (_c, v) => ((desde = v), res),
          maybeSingle: async () => ({ data: null, error: null }),
          then: (fn) =>
            Promise.resolve({
              data: tabelas[nome].filter((r) => !desde || r.updated_at > desde),
              error: null,
            }).then(fn),
        };
        return res;
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    };
  };
  return {
    tabelas,
    lotes,
    from,
    rpc: async () => ({ data: null, error: null }),
    set antesDoUpsert(fn) {
      antesDoUpsert = fn;
    },
  };
}

const UT_A = { tema: 'Saída de pressão', objetivos: '', material: '', exercicios: [{ id: 'x1', parte: 'PRINCIPAL', nome: '4x4', duracao: 15, descricao: '', jogadas: [] }] };

function linhaDoServidor(id, extra = {}) {
  return {
    id,
    team_id: ESCALAO,
    routine_id: null,
    date: '2026-11-10',
    start_time: '19:30',
    duration_min: 90,
    location: null,
    status: 'AGENDADO',
    edited: false,
    notes: null,
    plan: null,
    deleted_at: null,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    ...extra,
  };
}

async function limpar() {
  await db.clearAll();
  esquecerMarca();
}

test('enviar notas de um treino com a UT velha não apaga a UT escrita no outro aparelho', async () => {
  await limpar();
  const servidor = servidorComoSupabase();
  setRemote(servidor);
  // O aparelho B descarregou o treino quando ainda não tinha UT.
  await db.put(db.STORES.trainingSessions, trainingSessionMapper.fromRow(linhaDoServidor('t1')));
  // Entretanto o aparelho A escreveu a UT no servidor.
  servidor.tabelas.training_sessions = [linhaDoServidor('t1', { plan: UT_A, updated_at: '2026-11-08T09:00:00.000Z' })];

  // B escreve notas sem ter descarregado.
  await treinos.notas('t1', 'Trazer coletes');
  await push(UTILIZADOR, 'b@exemplo.pt');

  const noServidor = servidor.tabelas.training_sessions[0];
  assert.equal(noServidor.notes, 'Trazer coletes');
  assert.deepEqual(noServidor.plan, UT_A, 'a UT do outro aparelho ficou');
});

test('num lote com e sem UT, a linha sem UT não leva NULL para o servidor', async () => {
  await limpar();
  const servidor = servidorComoSupabase();
  setRemote(servidor);
  await db.putMany(db.STORES.trainingSessions, [
    trainingSessionMapper.fromRow(linhaDoServidor('t1')),
    trainingSessionMapper.fromRow(linhaDoServidor('t2')),
  ]);
  servidor.tabelas.training_sessions = [
    linhaDoServidor('t1'),
    linhaDoServidor('t2', { plan: UT_A, updated_at: '2026-11-08T09:00:00.000Z' }),
  ];

  await treinos.plano('t1', { ...UT_A, tema: 'Outro treino' });
  await treinos.notas('t2', 'Nota');
  await push(UTILIZADOR, 'b@exemplo.pt');

  const porId = Object.fromEntries(servidor.tabelas.training_sessions.map((r) => [r.id, r]));
  assert.equal(porId.t1.plan.tema, 'Outro treino');
  assert.deepEqual(porId.t2.plan, UT_A, 't2 manteve a UT');
  for (const lote of servidor.lotes.filter((l) => l.nome === 'training_sessions')) {
    const chaves = new Set(lote.rows.map((r) => Object.keys(r).sort().join(',')));
    assert.equal(chaves.size, 1, 'cada upsert tem as mesmas colunas em todas as linhas');
  }
});

test('a UT que muda enquanto o envio está no ar fica por enviar e sobe a seguir', async () => {
  await limpar();
  const servidor = servidorComoSupabase();
  setRemote(servidor);
  await db.put(db.STORES.trainingSessions, trainingSessionMapper.fromRow(linhaDoServidor('t1')));
  servidor.tabelas.training_sessions = [linhaDoServidor('t1')];

  await treinos.plano('t1', { ...UT_A, tema: 'v1' });
  let uma = true;
  servidor.antesDoUpsert = async (nome) => {
    if (nome !== 'training_sessions' || !uma) return;
    uma = false;
    // O treinador continua a escrever: a v2 grava enquanto a v1 vai a caminho.
    await new Promise((r) => setTimeout(r, 2));
    await treinos.plano('t1', { ...UT_A, tema: 'v2' });
  };
  await push(UTILIZADOR, 'b@exemplo.pt');

  const local = await treinos.get('t1');
  assert.equal(local.plan.tema, 'v2', 'a v2 não foi pisada pela cópia da v1');
  assert.equal(local.dirty, true, 'e continua por enviar');

  await push(UTILIZADOR, 'b@exemplo.pt');
  assert.equal(servidor.tabelas.training_sessions[0].plan.tema, 'v2');
  assert.equal((await treinos.get('t1')).dirty, false);
});

test('um treino por enviar por causa das notas recebe a UT do outro aparelho na descarga', async () => {
  await limpar();
  const servidor = servidorComoSupabase();
  setRemote(servidor);
  await db.put(db.STORES.teams, { id: ESCALAO, clubId: 'c1', name: 'Iniciados' });
  await db.put(db.STORES.clubs, { id: 'c1', name: 'Clube' });
  await db.put(db.STORES.trainingSessions, trainingSessionMapper.fromRow(linhaDoServidor('t1')));
  await treinos.notas('t1', 'Nota por enviar');
  servidor.tabelas.training_sessions = [linhaDoServidor('t1', { plan: UT_A, updated_at: '2026-11-08T09:00:00.000Z' })];

  await pull(UTILIZADOR);
  const local = await treinos.get('t1');
  assert.deepEqual(local.plan, UT_A, 'a UT chegou');
  assert.equal(local.notes, 'Nota por enviar', 'as notas daqui ficaram');
  assert.equal(local.dirty, true, 'e continuam por enviar');
});

test('a UT mudada aqui não é pisada pela do servidor enquanto não sobe', async () => {
  await limpar();
  const servidor = servidorComoSupabase();
  setRemote(servidor);
  await db.put(db.STORES.teams, { id: ESCALAO, clubId: 'c1', name: 'Iniciados' });
  await db.put(db.STORES.clubs, { id: 'c1', name: 'Clube' });
  await db.put(db.STORES.trainingSessions, trainingSessionMapper.fromRow(linhaDoServidor('t1')));
  await treinos.plano('t1', { ...UT_A, tema: 'Daqui' });
  servidor.tabelas.training_sessions = [linhaDoServidor('t1', { plan: UT_A, updated_at: '2026-11-08T09:00:00.000Z' })];

  await pull(UTILIZADOR);
  assert.equal((await treinos.get('t1')).plan.tema, 'Daqui');
});
