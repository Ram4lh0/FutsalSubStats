// tests/partilhadoBase.test.js — jogo com registo partilhado, de ponta a ponta
// na base local (lib/partilhado.js): criar os dois jogos, juntar, desfazer e
// voltar a juntar. Sem servidor: o IndexedDB cai para memória em Node.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as db from '../src/lib/data/local.js';
import { events, loadMatch, matches, squad } from '../src/lib/data/repository.js';
import * as A from '../src/domain/actions.js';
import { EVENT, LOCATION, MATCH_STATUS } from '../src/domain/constants.js';
import { PAPEL, lerPartilha, metadataDeCriacao } from '../src/domain/partilhado.js';
import { REGISTO, registar, registosDoJogo } from '../src/domain/registos.js';
import {
  carregarPartilhado,
  desfazerFusao,
  jogoSincronizado,
  juntar,
  listarParaJuntar,
  oQueTem,
  prepararFusao,
  reabrirRegistos,
  terminarRegistos,
} from '../src/lib/partilhado.js';

const MIN = 60_000;
const T0 = new Date(2026, 10, 14, 15, 0, 0).getTime();
const TEAM = 'team-1';
const POS = ['GOALKEEPER', 'FIXO', 'LEFT_WINGER', 'RIGHT_WINGER', 'PIVOT'];

async function criarJogo(papel, { adversario = 'Sporting CP', quando = T0, comCinco = true } = {}) {
  if (!(await db.get(db.STORES.teams, TEAM))) {
    await db.put(db.STORES.teams, { id: TEAM, clubId: 'club-1', name: 'Seniores', timing: 'TIMED' });
  }
  const jogo = await matches.create(TEAM, { opponentName: adversario, scheduledAt: quando });
  await squad.replace(
    jogo.id,
    ['Ana', 'Bruno', 'Carlos', 'Diogo', 'Eduardo', 'Filipe'].map((name, i) => ({
      playerId: `p${i + 1}`,
      playerNameSnapshot: name,
      shirtNumberSnapshot: i + 1,
      initialPosition: comCinco && i < 5 ? POS[i] : null,
      initialLocation: comCinco && i < 5 ? LOCATION.COURT : LOCATION.BENCH,
    }))
  );
  const criado = A.matchCreated({ matchId: jogo.id, currentPeriod: 0, timerStatus: 'STOPPED', teamScore: 0, opponentScore: 0 }, quando - 30 * MIN);
  if (papel) criado.metadata = metadataDeCriacao(papel);
  await events.append(criado);
  return jogo.id;
}

async function gravar(matchId, fabrica) {
  const { state } = await loadMatch(matchId);
  return events.append(fabrica(state));
}

async function jogarTempos(id) {
  await gravar(id, (s) => A.startFirstHalf(s, T0));
  await gravar(id, (s) => A.finishFirstHalf(s, T0 + 20 * MIN));
  await gravar(id, (s) => A.startSecondHalf(s, T0 + 30 * MIN));
  await gravar(id, (s) => A.finishMatch(s, T0 + 50 * MIN));
}

async function registarTres(id) {
  // O golo aponta-se aqui (por hora real: este jogo dos Registos não usa relógio).
  const golo = await gravar(id, (s) => A.teamGoalBy(s, 'p5', T0 + 6 * MIN));
  await gravar(id, (s) => registar(s, { registo: REGISTO.REMATE, playerId: 'p5', resultado: 'GOLO', x: 0.9, y: 0.5, goloEventId: golo.id }, T0 + 6 * MIN + 4000));
  await gravar(id, (s) => registar(s, { registo: REGISTO.RECUPERACAO, playerId: 'p2', x: 0.3, y: 0.3 }, T0 + 10 * MIN));
  await gravar(id, (s) => registar(s, { registo: REGISTO.PERDA_BOLA, playerId: 'p3' }, T0 + 35 * MIN));
}

test('a hora real só entra nos eventos dos jogos partilhados', async () => {
  const normal = await criarJogo(null, { adversario: 'Normal FC' });
  const inicio = await gravar(normal, (s) => A.startFirstHalf(s, T0));
  assert.equal(inicio.metadata.hora, undefined);

  const tempos = await criarJogo(PAPEL.TEMPOS, { adversario: 'Hora FC' });
  const apito = await gravar(tempos, (s) => A.startFirstHalf(s, T0));
  assert.equal(apito.metadata.hora, T0);
  // O que já lá estava no metadata fica.
  assert.ok(apito.metadata.lineup);
  // Uma substituição não precisa de hora.
  const troca = await gravar(tempos, (s) => A.substitute(s, { playerOutId: 'p5', playerInId: 'p6', position: 'PIVOT' }, T0 + MIN));
  assert.equal(troca.metadata.hora, undefined);

  const reg = await criarJogo(PAPEL.REGISTOS, { adversario: 'Hora FC', comCinco: false });
  const r = await gravar(reg, (s) => registar(s, { registo: REGISTO.PERDA_BOLA, playerId: 'p1' }, T0 + 2 * MIN));
  assert.equal(r.metadata.hora, T0 + 2 * MIN);
  assert.equal(r.metadata.registo, 'perda_bola');
});

test('juntar, desfazer e voltar a juntar', async () => {
  const tempos = await criarJogo(PAPEL.TEMPOS);
  const reg = await criarJogo(PAPEL.REGISTOS, { comCinco: false });
  await jogarTempos(tempos);
  await registarTres(reg);

  // Sem servidor configurado não há para onde sincronizar: conta como feito.
  assert.equal(await jogoSincronizado(tempos), true);

  // Por terminar: aparece na lista, mas com o motivo.
  let { lista } = await listarParaJuntar(tempos);
  assert.deepEqual(lista.map((c) => [c.match.id, c.motivo]), [[reg, 'naoTerminado']]);
  await assert.rejects(() => prepararFusao(tempos, reg), (e) => e.chave === 'partilhado.erro.naoTerminado');

  await terminarRegistos(reg, T0 + 55 * MIN);
  assert.equal((await carregarPartilhado(reg)).partilha.terminadoEm, T0 + 55 * MIN);
  await reabrirRegistos(reg);
  assert.equal((await carregarPartilhado(reg)).partilha.terminadoEm, null);
  await terminarRegistos(reg, T0 + 56 * MIN);

  // Qualquer um dos dois lados vê o outro.
  ({ lista } = await listarParaJuntar(tempos));
  assert.deepEqual(lista.map((c) => [c.match.id, c.motivo]), [[reg, null]]);
  ({ lista } = await listarParaJuntar(reg));
  assert.deepEqual(lista.map((c) => [c.match.id, c.motivo]), [[tempos, null]]);
  const temReg = oQueTem(await carregarPartilhado(reg));
  assert.deepEqual([temReg.papel, temReg.registos, temReg.convocados, temReg.golos], ['REGISTOS', 3, 6, 1]);
  assert.equal(oQueTem(await carregarPartilhado(tempos)).substituicoes, 0);

  // Juntar a partir do lado dos Registos: a base é sempre o jogo dos Tempos.
  const antes = (await loadMatch(tempos)).events.length;
  const feito = await juntar(reg, tempos);
  assert.equal(feito.baseId, tempos);
  assert.equal(feito.outroId, reg);
  assert.equal(feito.plano.total, 3);
  assert.equal(feito.plano.golosLigados, 1);

  let base = await loadMatch(tempos);
  assert.equal(base.events.length, antes + 6); // o golo e a sua atribuição, 3 registos e a marca
  assert.equal((await matches.get(tempos)).teamScore, 1); // o resumo na linha do jogo acompanha
  assert.equal(base.state.status, MATCH_STATUS.FINISHED);
  assert.equal(base.state.teamScore, 1);
  const juntos = registosDoJogo(base.state);
  assert.equal(juntos.length, 3);
  assert.deepEqual(juntos.map((r) => [r.registo, r.period, r.matchElapsedMs]), [
    ['remate', 1, 6 * MIN + 4000],
    ['recuperacao', 1, 10 * MIN],
    ['perda_bola', 2, 25 * MIN],
  ]);
  assert.deepEqual(lerPartilha(base.events).fusao, { com: reg, n: 1, registos: 3 });

  // O jogo dos Registos fica guardado, arquivado e marcado; não foi apagado.
  const guardado = await carregarPartilhado(reg);
  assert.ok(guardado.match.archivedAt);
  assert.deepEqual(guardado.partilha.fundidoEm, { jogo: tempos, n: 1 });
  assert.equal(registosDoJogo(guardado.state).length, 3);
  assert.deepEqual((await matches.listByTeam(TEAM)).filter((m) => m.opponentName === 'Sporting CP').map((m) => m.id), [tempos]);

  // Segunda vez: recusa, e nada muda.
  await assert.rejects(() => juntar(tempos, reg), (e) => e.chave === 'partilhado.erro.jaFundido');
  assert.equal((await loadMatch(tempos)).events.length, antes + 6);
  assert.deepEqual((await listarParaJuntar(tempos)).lista, []);

  // Desfazer: os dois jogos como estavam.
  const desfeito = await desfazerFusao(tempos);
  assert.deepEqual([desfeito.outroId, desfeito.reposto], [reg, true]);
  base = await loadMatch(tempos);
  assert.equal(registosDoJogo(base.state).length, 0);
  assert.equal(base.state.teamScore, 0);
  assert.equal((await matches.get(tempos)).teamScore, 0);
  assert.equal(lerPartilha(base.events).fusao, null);
  // Marcados como desfeitos também, para as versões antigas da app.
  assert.equal(base.events.filter((e) => e.eventType === EVENT.STAT_RECORDED && !e.undoneAt).length, 0);
  assert.equal(base.events.filter((e) => e.eventType === EVENT.STAT_RECORDED).length, 3);
  const reposto = await carregarPartilhado(reg);
  assert.equal(reposto.match.archivedAt, null);
  assert.equal(reposto.partilha.fundidoEm, null);
  assert.equal(registosDoJogo(reposto.state).length, 3);
  await assert.rejects(() => desfazerFusao(tempos), (e) => e.chave === 'partilhado.erro.semFusao');

  // E outra vez: funciona, com registos novos (os da primeira ficam desfeitos).
  const outra = await juntar(tempos, reg);
  assert.equal(outra.n, 2);
  base = await loadMatch(tempos);
  assert.equal(registosDoJogo(base.state).length, 3);
  assert.equal(base.events.filter((e) => e.eventType === EVENT.STAT_RECORDED).length, 6);
});

test('não se juntam dois jogos do mesmo papel, nem de adversários ou dias diferentes', async () => {
  const a = await criarJogo(PAPEL.TEMPOS, { adversario: 'Benfica' });
  const b = await criarJogo(PAPEL.TEMPOS, { adversario: 'Benfica' });
  await jogarTempos(a);
  await jogarTempos(b);
  assert.deepEqual((await listarParaJuntar(a)).lista, []);
  await assert.rejects(() => juntar(a, b), (e) => e.chave === 'partilhado.erro.papeis');

  const outroDia = await criarJogo(PAPEL.REGISTOS, { adversario: 'Benfica', quando: T0 + 24 * 60 * MIN, comCinco: false });
  await terminarRegistos(outroDia);
  assert.deepEqual((await listarParaJuntar(a)).lista, []);
  await assert.rejects(() => juntar(a, outroDia), (e) => e.chave === 'partilhado.erro.diferentes');

  const outroAdv = await criarJogo(PAPEL.REGISTOS, { adversario: 'Braga', comCinco: false });
  await terminarRegistos(outroAdv);
  await assert.rejects(() => juntar(a, outroAdv), (e) => e.chave === 'partilhado.erro.diferentes');
});
