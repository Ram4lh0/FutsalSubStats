// tests/aoVivo.test.js — "Assistir ao vivo" (add-on 'ao-vivo').
//
// O teste que importa é o dos dois aparelhos: quem regista envia durante o
// jogo, o servidor guarda, e quem acompanha chega ao MESMO estado — primeiro
// pelo jogo inteiro (`trazerJogo`) e depois linha a linha (`guardarDoRealtime`,
// que é o que o Realtime entrega). A base local em Node é uma só, por isso
// "o outro aparelho" é a mesma base limpa e com outro dono.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as db from '../src/lib/data/local.js';
import {
  clubs,
  teams,
  competitions,
  players,
  matches,
  squad,
  events,
  loadMatch,
  findLiveMatch,
} from '../src/lib/data/repository.js';
import { push, setRemote, esquecerMarca, trazerJogo, guardarDoRealtime } from '../src/lib/data/sync.js';
import { garantirDono } from '../src/lib/data/owner.js';
import { matchMapper, eventMapper } from '../src/lib/data/mappers.js';
import { deveAssistir, jogosAoVivo } from '../src/lib/aoVivo.js';
import * as A from '../src/domain/actions.js';
import { EVENT, LOCATION, MATCH_STATUS } from '../src/domain/constants.js';
import { foulsTotal } from '../src/domain/reducer.js';
import { ADDONS, addonsAtivos, problemasDoCatalogo } from '../src/domain/addons.js';
import {
  ADDON_AO_VIVO,
  AO_VIVO_VALIDADE_MS,
  estaAoVivo,
  fotografiaAoVivo,
  fotografiaMudou,
  quemComecou,
  registadoPorOutro,
} from '../src/domain/aoVivo.js';

const QUEM_REGISTA = '11111111-1111-4111-8111-111111111111';
const QUEM_ACOMPANHA = '22222222-2222-4222-8222-222222222222';

/* ------------------------------------------------------------ domínio */

test('o add-on existe no catálogo, no grupo do jogo, e vem desligado', () => {
  assert.ok(ADDONS[ADDON_AO_VIVO]);
  assert.equal(ADDONS[ADDON_AO_VIVO].grupo, 'jogo');
  assert.deepEqual(problemasDoCatalogo(), []);
  assert.equal(addonsAtivos(null).has(ADDON_AO_VIVO), false);
  assert.equal(addonsAtivos({ addons: ['visao-geral-clube'] }).has(ADDON_AO_VIVO), false);
  assert.equal(addonsAtivos({ addons: ['visao-geral-clube', 'ao-vivo'] }).has(ADDON_AO_VIVO), true);
});

test('ao vivo: interruptor ligado e status entre o início e o fim', () => {
  const agora = Date.now();
  const base = { liveEnabled: true, status: MATCH_STATUS.FIRST_HALF_RUNNING, updatedAt: agora };
  assert.equal(estaAoVivo(base, agora), true);
  for (const status of ['FIRST_HALF_PAUSED', 'HALFTIME', 'SECOND_HALF_RUNNING', 'SECOND_HALF_PAUSED']) {
    assert.equal(estaAoVivo({ ...base, status }, agora), true, status);
  }
  assert.equal(estaAoVivo({ ...base, status: MATCH_STATUS.FINISHED }, agora), false, 'acabou');
  assert.equal(estaAoVivo({ ...base, status: MATCH_STATUS.DRAFT }, agora), false, 'por começar');
  assert.equal(estaAoVivo({ ...base, liveEnabled: false }, agora), false, 'interruptor desligado');
  assert.equal(estaAoVivo({ ...base, archivedAt: agora }, agora), false, 'apagado');
  assert.equal(
    estaAoVivo({ ...base, updatedAt: agora - AO_VIVO_VALIDADE_MS - 1 }, agora),
    false,
    'largado a meio há horas'
  );
});

test('quem começou o jogo decide se é para registar ou acompanhar', () => {
  const inicio = { eventType: EVENT.FIRST_HALF_STARTED, createdBy: QUEM_REGISTA };
  assert.equal(quemComecou([inicio]), QUEM_REGISTA);
  assert.equal(registadoPorOutro([inicio], QUEM_ACOMPANHA), true);
  assert.equal(registadoPorOutro([inicio], QUEM_REGISTA), false);
  // Feito neste aparelho e ainda sem volta do servidor: é meu.
  assert.equal(registadoPorOutro([{ eventType: EVENT.FIRST_HALF_STARTED }], QUEM_ACOMPANHA), false);
  // Um arranque desfeito não conta.
  assert.equal(quemComecou([{ ...inicio, undoneAt: 1 }]), null);
  assert.equal(registadoPorOutro([inicio], null), false);
});

test('a fotografia só se grava quando muda', () => {
  const foto = { status: 'HALFTIME', teamScore: 1, halftimeTeamScore: null };
  assert.equal(fotografiaMudou({ status: 'HALFTIME', teamScore: 1 }, foto), false);
  assert.equal(fotografiaMudou({ status: 'HALFTIME', teamScore: 0 }, foto), true);
  assert.equal(fotografiaMudou({}, foto), true);
});

/* ------------------------------------------------------------ mappers */

test('live_enabled viaja sempre como verdadeiro ou falso', () => {
  assert.equal(matchMapper.toRow({ id: 'x' }).live_enabled, false);
  assert.equal(matchMapper.toRow({ id: 'x', liveEnabled: true }).live_enabled, true);
  assert.equal(matchMapper.fromRow({ id: 'x', live_enabled: true }).liveEnabled, true);
  assert.equal(matchMapper.fromRow({ id: 'x' }).liveEnabled, false);
});

test('as datas em texto do Postgres lêem-se (o Safari não as percebia)', () => {
  const iso = eventMapper.fromRow({ id: 'a', undone_at: '2026-10-23T13:33:16.123+00:00' });
  const texto = eventMapper.fromRow({ id: 'a', undone_at: '2026-10-23 13:33:16.123456+00' });
  assert.equal(texto.undoneAt, iso.undoneAt);
  assert.ok(texto.undoneAt > 0);
  assert.equal(eventMapper.fromRow({ id: 'a', created_by: QUEM_REGISTA }).createdBy, QUEM_REGISTA);
  assert.equal(eventMapper.fromRow({ id: 'a' }).createdBy, null);
});

/* --------------------------------------------- dois aparelhos, um jogo */

/** Um servidor de mentira com o que o envio e o `trazerJogo` usam. */
function servidorFalso(quemEnvia) {
  const tabelas = { profiles: [], clubs: [], teams: [], competitions: [], players: [], matches: [], match_squad: [], match_events: [] };
  const agoraIso = () => new Date().toISOString();
  const consulta = (nome) => {
    const filtros = [];
    let ordem = null;
    let de = null;
    let ate = null;
    const linhas = () => {
      let out = (tabelas[nome] || []).filter((r) => filtros.every(([c, v]) => r[c] === v));
      if (ordem) out = [...out].sort((a, b) => (a[ordem] > b[ordem] ? 1 : -1));
      if (de != null) out = out.slice(de, ate + 1);
      return out;
    };
    const q = {
      eq: (c, v) => (filtros.push([c, v]), q),
      in: () => q,
      is: () => q,
      gt: () => q,
      order: (c) => ((ordem = c), q),
      range: (a, b) => ((de = a), (ate = b), q),
      maybeSingle: () => Promise.resolve({ data: linhas()[0] ?? null, error: null }),
      then: (fn) => Promise.resolve({ data: linhas(), error: null }).then(fn),
    };
    return q;
  };
  return {
    tabelas,
    from: (nome) => ({
      upsert(rows) {
        for (const bruta of Array.isArray(rows) ? rows : [rows]) {
          const r = { ...bruta, updated_at: agoraIso() };
          const i = tabelas[nome].findIndex((x) => x.id === r.id);
          if (i >= 0) tabelas[nome][i] = { ...tabelas[nome][i], ...r };
          else tabelas[nome].push(r);
        }
        return Promise.resolve({ error: null });
      },
      select: () => consulta(nome),
      update(patch) {
        return {
          eq: (c, v) => {
            for (const r of tabelas[nome]) if (r[c] === v) Object.assign(r, patch, { updated_at: agoraIso() });
            return Promise.resolve({ error: null });
          },
        };
      },
    }),
    async rpc(fn, { payload } = {}) {
      if (fn === 'claim_match_start') return { data: { allowed: true }, error: null };
      const existente = tabelas.match_events.find((e) => e.client_event_id === payload.client_event_id);
      if (existente) return { error: null };
      tabelas.match_events.push({
        ...payload,
        id: payload.client_event_id,
        seq: tabelas.match_events.filter((e) => e.match_id === payload.match_id).length + 1,
        created_by: quemEnvia,
        created_at: agoraIso(),
        updated_at: agoraIso(),
        undone_at: null,
      });
      return { error: null };
    },
  };
}

async function limpar() {
  await db.clearAll();
  esquecerMarca();
}

async function prepararJogo() {
  const clube = await clubs.create({ name: 'AMSAC', shortName: 'AMS' });
  const escalao = await teams.create(clube.id, { name: 'Seniores', timing: 'UNTIMED' });
  const prova = (await competitions.listByTeam(escalao.id)).find((c) => c.name === 'Campeonato');
  const plantel = [];
  for (const [i, nome] of ['GR', 'Fixo', 'Ala E', 'Ala D', 'Pivô', 'Suplente'].entries()) {
    plantel.push(await players.create(escalao.id, { name: nome, shirtNumber: i + 1 }));
  }
  const jogo = await matches.create(escalao.id, { opponentName: 'Adversário', competitionId: prova.id });
  const posicoes = ['GOALKEEPER', 'FIXO', 'LEFT_WINGER', 'RIGHT_WINGER', 'PIVOT'];
  await squad.replace(
    jogo.id,
    plantel.map((p, i) => ({
      playerId: p.id,
      playerNameSnapshot: p.name,
      shirtNumberSnapshot: p.shirtNumber,
      initialPosition: posicoes[i] || null,
      initialLocation: posicoes[i] ? LOCATION.COURT : LOCATION.BENCH,
    }))
  );
  await db.put(db.STORES.teamStatConfig, { id: escalao.id, teamId: escalao.id, registos: [], addons: [ADDON_AO_VIVO] });
  return { clube, escalao, plantel, jogo };
}

/**
 * O que o ecrã do jogo faz depois de cada toque, com o interruptor ligado
 * (lib/useEnviarAoVivo.js): fotografia na linha do jogo, se mudou, e envio.
 */
async function registar(jogoId, criar) {
  const antes = await loadMatch(jogoId);
  await events.append(criar(antes.state), { sync: 'defer' });
  const depois = await loadMatch(jogoId);
  const foto = fotografiaAoVivo(depois.state);
  if (fotografiaMudou(depois.match, foto)) await matches.gravarCampos(jogoId, foto, { sync: 'defer' });
  await push(QUEM_REGISTA, 'regista@exemplo.pt');
  return loadMatch(jogoId);
}

test('dois aparelhos: quem acompanha chega ao mesmo estado de quem regista', async () => {
  await limpar();
  await garantirDono(QUEM_REGISTA);
  const servidor = servidorFalso(QUEM_REGISTA);
  setRemote(servidor);
  const { jogo, plantel } = await prepararJogo();
  const [gr, fixo, , , pivo, suplente] = plantel;

  // A preparação: o interruptor e a convocatória sobem antes do apito.
  await matches.gravarCampos(jogo.id, { liveEnabled: true });
  await push(QUEM_REGISTA, 'regista@exemplo.pt');
  assert.equal(servidor.tabelas.matches[0].live_enabled, true);
  assert.equal(servidor.tabelas.matches[0].status, 'DRAFT', 'ainda não começou');

  // 1.ª parte: arranque e um golo nosso.
  const t0 = Date.now() - 10 * 60_000;
  await registar(jogo.id, (s) => A.startFirstHalf(s, t0));
  assert.equal(servidor.tabelas.matches[0].status, MATCH_STATUS.FIRST_HALF_RUNNING, 'o servidor sabe que está ao vivo');
  await registar(jogo.id, (s) => A.teamGoalBy(s, pivo.id, t0 + 60_000));

  // O que existia no servidor nesta altura é o que quem acompanha encontra ao abrir.
  const fotografiaDoServidor = JSON.parse(JSON.stringify(servidor.tabelas));

  // Daqui para a frente chega pelo Realtime.
  await registar(jogo.id, (s) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, t0 + 120_000));
  await registar(jogo.id, (s) => A.foul(s, EVENT.TEAM_FOUL_ADDED, t0 + 130_000));
  await registar(jogo.id, (s) => A.foul(s, EVENT.OPPONENT_FOUL_ADDED, t0 + 140_000));
  await registar(jogo.id, (s) =>
    A.substitute(s, { playerOutId: fixo.id, playerInId: suplente.id, position: 'FIXO' }, t0 + 150_000)
  );
  await registar(jogo.id, (s) => A.yellowCard(s, { playerId: gr.id }, t0 + 160_000));
  // Um golo dado por engano, e desfeito: a marca na linha e o EVENT_UNDONE.
  const comEngano = await registar(jogo.id, (s) => A.goal(s, EVENT.TEAM_GOAL_ADDED, t0 + 170_000));
  const engano = comEngano.events[comEngano.events.length - 1];
  await events.markUndone(engano.id, null, { sync: 'defer' });
  await registar(jogo.id, (s) => A.undoEvent(s, engano, t0 + 175_000));
  const noIntervalo = await registar(jogo.id, (s) => A.finishFirstHalf(s, t0 + 200_000));
  assert.equal(noIntervalo.state.status, MATCH_STATUS.HALFTIME);
  assert.equal(servidor.tabelas.matches[0].status, MATCH_STATUS.HALFTIME);
  assert.equal(noIntervalo.state.teamScore, 1, 'o golo desfeito não conta');
  const desfeitoNoServidor = servidor.tabelas.match_events.find((e) => e.client_event_id === engano.clientEventId);
  assert.ok(desfeitoNoServidor.undone_at, 'a marca de desfeito chegou ao servidor');
  // A mesma conta noutro telemóvel (contas partilhadas no clube) também o vê.
  assert.deepEqual((await jogosAoVivo()).map((j) => j.match.id), [jogo.id], 'a própria conta vê o jogo na lista');

  // ---- o outro aparelho: outra conta, base vazia.
  await limpar();
  await garantirDono(QUEM_ACOMPANHA);
  await db.put(db.STORES.teamStatConfig, { id: noIntervalo.match.teamId, teamId: noIntervalo.match.teamId, registos: [], addons: [ADDON_AO_VIVO] });
  const parcial = servidorFalso(QUEM_REGISTA);
  Object.assign(parcial.tabelas, fotografiaDoServidor);
  setRemote(parcial);

  // Ao abrir: o jogo inteiro, como estava.
  const { existe } = await trazerJogo(jogo.id);
  assert.equal(existe, true);
  const aoAbrir = await loadMatch(jogo.id);
  assert.equal(aoAbrir.state.status, MATCH_STATUS.FIRST_HALF_RUNNING);
  assert.equal(aoAbrir.state.teamScore, 1);
  assert.equal(Object.keys(aoAbrir.state.players).length, 6, 'a convocatória veio com o jogo');
  assert.equal(await deveAssistir(aoAbrir, QUEM_ACOMPANHA), true, 'acompanha-se, não se regista');
  assert.equal(await deveAssistir(aoAbrir, QUEM_REGISTA), false);
  assert.equal(await findLiveMatch(), null, 'não é o "meu jogo em curso"');
  // O escalão e o clube já estavam neste aparelho (a descarga de sempre traz
  // os escalões a que se tem acesso, aqui com `ver`).
  await db.put(db.STORES.clubs, { id: aoAbrir.match.clubId, name: 'AMSAC', ownerId: QUEM_REGISTA });
  await db.put(db.STORES.teams, { id: aoAbrir.match.teamId, clubId: aoAbrir.match.clubId, name: 'Seniores', nivel: 'ver' });
  const lista = await jogosAoVivo();
  assert.deepEqual(lista.map((j) => j.match.id), [jogo.id], 'aparece em "Jogos ao vivo"');

  // Depois: linha a linha, como o Realtime as entrega (INSERT dos eventos
  // novos, UPDATE da linha desfeita e da linha do jogo).
  const vistos = new Set(fotografiaDoServidor.match_events.map((e) => e.id));
  for (const linha of servidor.tabelas.match_events) {
    if (!vistos.has(linha.id)) await guardarDoRealtime('match_events', linha);
  }
  // O Realtime pode mandar as datas no formato de texto do Postgres.
  const comMarca = { ...desfeitoNoServidor, undone_at: desfeitoNoServidor.undone_at.replace('T', ' ').replace('Z', '+00') };
  await guardarDoRealtime('match_events', comMarca);
  await guardarDoRealtime('matches', servidor.tabelas.matches[0]);

  const seguido = await loadMatch(jogo.id);
  const s = seguido.state;
  const r = noIntervalo.state;
  assert.equal(s.status, r.status, 'intervalo');
  assert.equal(s.teamScore, r.teamScore);
  assert.equal(s.opponentScore, r.opponentScore);
  assert.equal(foulsTotal(s, 'US'), foulsTotal(r, 'US'));
  assert.equal(foulsTotal(s, 'THEM'), foulsTotal(r, 'THEM'));
  assert.deepEqual(s.court, r.court, 'quem está em campo (com a substituição)');
  assert.equal(s.goals.length, r.goals.length);
  assert.equal((s.cards || []).length, (r.cards || []).length, 'o amarelo');
  assert.equal(seguido.match.status, MATCH_STATUS.HALFTIME);
  assert.equal(seguido.match.liveEnabled, true);

  // Fim do jogo: deixa de estar ao vivo sozinho.
  await guardarDoRealtime('matches', { ...servidor.tabelas.matches[0], status: MATCH_STATUS.FINISHED });
  assert.equal(estaAoVivo((await loadMatch(jogo.id)).match), false);
  assert.deepEqual(await jogosAoVivo(), [], 'sai da lista');
});

test('sem o interruptor, o jogo de outra conta continua a ser "o jogo em curso"', async () => {
  await limpar();
  await garantirDono(QUEM_ACOMPANHA);
  const servidor = servidorFalso(QUEM_REGISTA);
  setRemote(servidor);
  const { jogo } = await prepararJogo();
  const inicial = await loadMatch(jogo.id);
  const arranque = { ...A.startFirstHalf(inicial.state, Date.now()), createdBy: QUEM_REGISTA };
  await events.append(arranque);
  assert.equal((await findLiveMatch())?.id, jogo.id, 'como sempre foi');
  assert.equal(await deveAssistir(await loadMatch(jogo.id), QUEM_ACOMPANHA), false);

  await matches.gravarCampos(jogo.id, { liveEnabled: true });
  assert.equal(await findLiveMatch(), null);
});

test('um escalão sem o add-on não abre o ecrã de acompanhar nem lista nada', async () => {
  await limpar();
  await garantirDono(QUEM_ACOMPANHA);
  setRemote(null);
  const { jogo, escalao } = await prepararJogo();
  await db.put(db.STORES.teamStatConfig, { id: escalao.id, teamId: escalao.id, registos: [], addons: [] });
  const inicial = await loadMatch(jogo.id);
  await events.append({ ...A.startFirstHalf(inicial.state, Date.now()), createdBy: QUEM_REGISTA });
  await matches.gravarCampos(jogo.id, {
    liveEnabled: true,
    status: MATCH_STATUS.FIRST_HALF_RUNNING,
  });
  assert.equal(await deveAssistir(await loadMatch(jogo.id), QUEM_ACOMPANHA), false);
  assert.deepEqual(await jogosAoVivo(), []);
});
