// tests/treino.test.js — o calendário de treinos e as contas das presenças.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRESENCA,
  estatisticasPresencas,
  fimDaEpoca,
  grelhaDoMes,
  idPresenca,
  idTreinoDaRotina,
  inicioDaEpoca,
  planearTreinos,
  somarDias,
  treinosDaRotina,
  uuidDe,
} from '../src/domain/treino.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('a época vai de 1 de julho a 30 de junho', () => {
  assert.equal(fimDaEpoca('2026-10-11'), '2027-06-30');
  assert.equal(fimDaEpoca('2027-03-01'), '2027-06-30');
  assert.equal(fimDaEpoca('2027-07-01'), '2028-06-30');
  assert.equal(inicioDaEpoca('2026-10-11'), '2026-07-01');
  assert.equal(inicioDaEpoca('2027-06-30'), '2026-07-01');
});

test('somar dias atravessa meses e a mudança de hora sem saltar', () => {
  assert.equal(somarDias('2026-10-24', 2), '2026-10-26');
  assert.equal(somarDias('2026-03-28', 2), '2026-03-30');
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
});

test('os ids derivados são uuids estáveis e diferentes entre si', () => {
  assert.match(uuidDe('x'), UUID);
  assert.equal(idTreinoDaRotina('r1', '2026-10-13'), idTreinoDaRotina('r1', '2026-10-13'));
  assert.notEqual(idTreinoDaRotina('r1', '2026-10-13'), idTreinoDaRotina('r1', '2026-10-15'));
  assert.notEqual(idPresenca('s1', 'p1'), idPresenca('s1', 'p2'));
  assert.match(idPresenca('s1', 'p1'), UUID);
});

const terca = { id: 'r-ter', weekday: 2, startTime: '19:30', durationMin: 90, location: 'Pavilhão' };
const quinta = { id: 'r-qui', weekday: 4, startTime: '19:30', durationMin: 90, location: 'Pavilhão' };

test('a rotina gera um treino por dia da semana pedido', () => {
  // 12 a 18 de outubro de 2026: segunda a domingo.
  const t = treinosDaRotina([terca, quinta], '2026-10-12', '2026-10-18');
  assert.deepEqual(
    t.map((x) => x.date),
    ['2026-10-13', '2026-10-15']
  );
  assert.equal(t[0].startTime, '19:30');
});

test('planear: cria até ao fim da época, e só do dia de hoje para a frente', () => {
  const { criar, atualizar, apagar } = planearTreinos({
    rotinas: [terca],
    treinos: [],
    hoje: '2026-10-14',
    ate: '2026-10-31',
  });
  assert.deepEqual(
    criar.map((x) => x.date),
    ['2026-10-20', '2026-10-27']
  );
  assert.equal(atualizar.length, 0);
  assert.equal(apagar.length, 0);
});

test('planear: mudar a hora da rotina muda os futuros, mas não os editados à mão', () => {
  const id20 = idTreinoDaRotina(terca.id, '2026-10-20');
  const id27 = idTreinoDaRotina(terca.id, '2026-10-27');
  const treinos = [
    { id: id20, routineId: terca.id, date: '2026-10-20', startTime: '19:30', durationMin: 90, location: 'Pavilhão' },
    { id: id27, routineId: terca.id, date: '2026-10-27', startTime: '18:00', durationMin: 90, location: 'Pavilhão', edited: true },
  ];
  const { criar, atualizar } = planearTreinos({
    rotinas: [{ ...terca, startTime: '20:00' }],
    treinos,
    hoje: '2026-10-14',
    ate: '2026-10-31',
  });
  assert.equal(criar.length, 0);
  assert.deepEqual(
    atualizar.map((x) => [x.date, x.startTime]),
    [['2026-10-20', '20:00']]
  );
});

test('planear: tirar um dia da rotina retira os futuros, menos os que já têm presenças', () => {
  const id20 = idTreinoDaRotina(terca.id, '2026-10-20');
  const id27 = idTreinoDaRotina(terca.id, '2026-10-27');
  const passado = idTreinoDaRotina(terca.id, '2026-10-06');
  const treinos = [
    { id: passado, routineId: terca.id, date: '2026-10-06', startTime: '19:30', durationMin: 90 },
    { id: id20, routineId: terca.id, date: '2026-10-20', startTime: '19:30', durationMin: 90 },
    { id: id27, routineId: terca.id, date: '2026-10-27', startTime: '19:30', durationMin: 90 },
  ];
  const { apagar } = planearTreinos({
    rotinas: [{ ...terca, deletedAt: 1 }],
    treinos,
    comPresencas: new Set([id27]),
    hoje: '2026-10-14',
    ate: '2026-10-31',
  });
  assert.deepEqual(
    apagar.map((x) => x.date),
    ['2026-10-20']
  );
});

test('presenças: só contam treinos passados, não cancelados e marcados', () => {
  const treinos = [
    { id: 'a', date: '2026-10-01', status: 'AGENDADO' },
    { id: 'b', date: '2026-10-08', status: 'AGENDADO' },
    { id: 'c', date: '2026-10-09', status: 'CANCELADO' },
    { id: 'd', date: '2026-10-10', status: 'AGENDADO' }, // sem presenças
    { id: 'e', date: '2026-10-20', status: 'AGENDADO' }, // futuro
  ];
  const p = (sessionId, playerId, status) => ({ sessionId, playerId, status });
  const presencas = [
    p('a', 'j1', PRESENCA.PRESENTE),
    p('a', 'j2', PRESENCA.FALTA_INJUSTIFICADA),
    p('b', 'j1', PRESENCA.PRESENTE),
    p('b', 'j2', PRESENCA.LESAO),
    p('c', 'j1', PRESENCA.PRESENTE),
    p('e', 'j1', PRESENCA.PRESENTE),
  ];
  const r = estatisticasPresencas({ treinos, presencas, ate: '2026-10-11' });
  assert.equal(r.treinos, 2);
  assert.equal(r.equipa.total, 4);
  assert.equal(r.assiduidade, 50);
  assert.equal(r.porJogador.get('j1').assiduidade, 100);
  assert.equal(r.porJogador.get('j2').assiduidade, 0);
  assert.equal(r.porJogador.get('j2')[PRESENCA.FALTA_INJUSTIFICADA], 1);
  assert.equal(r.porJogador.get('j2')[PRESENCA.LESAO], 1);

  const semana = estatisticasPresencas({ treinos, presencas, de: '2026-10-05', ate: '2026-10-11' });
  assert.equal(semana.treinos, 1);
});

test('a grelha do mês começa à segunda e tem semanas inteiras', () => {
  const g = grelhaDoMes(2026, 9); // outubro de 2026 começa a uma quinta
  assert.equal(g[0][0], '2026-09-28');
  assert.equal(g[0][3], '2026-10-01');
  assert.ok(g.every((s) => s.length === 7));
  assert.equal(g[g.length - 1][6], '2026-11-01');
});

test('detalhe de um período: quem faltou, por tipo e com datas, e quem foi a todos', async () => {
  const { detalhePresencas } = await import('../src/domain/treino.js');
  const treinos = [
    { id: 'a', date: '2026-10-01', status: 'AGENDADO' },
    { id: 'b', date: '2026-10-08', status: 'AGENDADO' },
  ];
  const p = (sessionId, playerId, status) => ({ sessionId, playerId, status });
  const d = detalhePresencas({
    treinos,
    presencas: [
      p('a', 'j1', PRESENCA.PRESENTE),
      p('b', 'j1', PRESENCA.PRESENTE),
      p('a', 'j2', PRESENCA.FALTA_INJUSTIFICADA),
      p('b', 'j2', PRESENCA.FALTA_INJUSTIFICADA),
      p('a', 'j3', PRESENCA.LESAO),
      p('b', 'j3', PRESENCA.PRESENTE),
    ],
    ate: '2026-10-11',
  });
  assert.equal(d.treinos, 2);
  assert.deepEqual(d.faltas[PRESENCA.FALTA_INJUSTIFICADA], [{ playerId: 'j2', datas: ['2026-10-08', '2026-10-01'] }]);
  assert.deepEqual(d.faltas[PRESENCA.LESAO], [{ playerId: 'j3', datas: ['2026-10-01'] }]);
  assert.deepEqual(d.sempre, ['j1']);
});
