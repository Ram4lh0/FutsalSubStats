// tests/sync.test.js
// A fila de sincronização testada sem rede e sem browser: o IndexedDB cai para
// memória sozinho em Node, e o servidor é um duplo que regista o que recebeu.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as db from '../src/lib/data/local.js';
import { clubs, teams, competitions, players, matches, squad, events, loadMatch } from '../src/lib/data/repository.js';
import {
  flush,
  push,
  pull,
  hasRemoteChanges,
  setRemote,
  saveNow,
  stop,
  esquecerMarca,
  SYNC,
} from '../src/lib/data/sync.js';
import { restore, dump } from '../src/lib/data/repository.js';
import * as A from '../src/domain/actions.js';
import { EVENT, LOCATION } from '../src/domain/constants.js';

const UTILIZADOR = '11111111-1111-4111-8111-111111111111';
const LEGACY_GOAL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STABLE_GOAL_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEGACY_ASSIST_EVENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STABLE_ASSIST_EVENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LEGACY_FOUL_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const STABLE_FOUL_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const LEGACY_FOUL_ATTRIBUTION_ID = '99999999-aaaa-4aaa-8aaa-999999999999';
const STABLE_FOUL_ATTRIBUTION_ID = '88888888-bbbb-4bbb-8bbb-888888888888';

/** Servidor de mentira: guarda o que recebe e conta as chamadas. */
function servidorFalso({ falhaEm, semUpdatedAtEventos = false } = {}) {
  const tabelas = {
    profiles: [], clubs: [], teams: [], competitions: [],
    players: [], matches: [], match_squad: [], match_events: [],
    // A descarga passou a fazer duas perguntas novas: a licença da conta e os
    // acessos por escalão.
    team_access: [],
  };
  const chamadas = { upserts: 0, rpc: 0, selects: 0 };

  const query = (nome) => ({
    upsert(rows) {
      if (falhaEm === nome) return Promise.resolve({ error: new Error('sem rede') });
      chamadas.upserts += 1;
      // O Supabase aceita uma linha ou uma lista; o duplo faz o mesmo.
      for (const bruta of Array.isArray(rows) ? rows : [rows]) {
        // No servidor a coluna tem `default now()` e um gatilho a actualizá-la.
        // Sem isto aqui, a descarga incremental não teria por onde se guiar e os
        // testes passariam a medir outra coisa.
        const r = { updated_at: new Date().toISOString(), ...bruta };
        const i = tabelas[nome].findIndex((x) => x.id === r.id);
        if (i >= 0) tabelas[nome][i] = r;
        else tabelas[nome].push(r);
      }
      return Promise.resolve({ error: null });
    },
    select() {
      // O `gt` é filtrado a sério, e não ignorado como os outros: é ele que a
      // descarga incremental usa, e um duplo que o ignorasse deixava passar
      // exactamente o erro que estes testes existem para apanhar.
      let desde = null;
      let coluna = null;
      let de = null;
      let ate = null;
      let erro = null;
      const linhas = () => {
        chamadas.selects += 1;
        let out = tabelas[nome] || [];
        if (desde) out = out.filter((r) => (r.updated_at || r.created_at || '') > desde);
        if (coluna) {
          out = [...out].sort((a, b) => String(a[coluna]).localeCompare(String(b[coluna])));
        }
        // O `range` corta a sério, como o PostgREST: é o que faz a paginação ser
        // mesmo posta à prova em vez de fingida.
        if (de != null) out = out.slice(de, ate + 1);
        return out;
      };
      const res = {
        get data() {
          return linhas();
        },
        error: null,
        eq: () => res,
        in: () => res,
        order: (col) => {
          coluna = col;
          return res;
        },
        range: (a, b) => {
          de = a;
          ate = b;
          return res;
        },
        gt: (_col, valor) => {
          if (nome === 'match_events' && semUpdatedAtEventos && _col === 'updated_at') {
            erro = Object.assign(new Error('column match_events.updated_at does not exist'), {
              code: '42703',
            });
          }
          desde = valor;
          return res;
        },
        // O `trazerLicenca` pede uma linha só. Sem isto, o duplo não tinha
        // resposta e o `catch` engolia a falha — o teste passaria sem testar.
        maybeSingle: () => Promise.resolve({ data: (tabelas[nome] || [])[0] ?? null, error: null }),
        then: (fn) => Promise.resolve(erro ? { data: null, error: erro } : { data: linhas(), error: null }).then(fn),
      };
      const orderOriginal = res.order;
      res.order = (col) => {
        if (nome === 'match_events' && semUpdatedAtEventos && col === 'updated_at') {
          erro = Object.assign(new Error('column match_events.updated_at does not exist'), {
            code: '42703',
          });
        }
        return orderOriginal(col);
      };
      return res;
    },
    update() {
      return { eq: () => Promise.resolve({ error: null }) };
    },
  });

  return {
    tabelas,
    chamadas,
    from: query,
    async rpc(fn, { payload } = {}) {
      chamadas.rpc += 1;
      if (fn === 'sync_watermarks') {
        const maior = (nome) =>
          (tabelas[nome] || []).reduce((m, r) => {
            const d = r.updated_at || r.created_at || null;
            return d && (!m || d > m) ? d : m;
          }, null);
        return {
          data: [
            { tabela: 'profiles', marca: maior('profiles') },
            { tabela: 'clubs', marca: maior('clubs') },
            { tabela: 'teams', marca: maior('teams') },
            { tabela: 'competitions', marca: maior('competitions') },
            { tabela: 'players', marca: maior('players') },
            { tabela: 'matches', marca: maior('matches') },
            { tabela: 'match_squad', marca: maior('match_squad') },
            { tabela: 'match_events', marca: maior('match_events') },
          ],
          error: null,
        };
      }
      if (fn === 'claim_match_start') {
        return { data: { allowed: true, freeGamesRemaining: 3 }, error: null };
      }
      // Como no servidor: o mesmo client_event_id não entra duas vezes.
      const existente = tabelas.match_events.find((e) => e.client_event_id === payload.client_event_id);
      if (existente) {
        if (existente.match_id === payload.match_id && existente.event_type === payload.event_type) {
          existente.metadata = { ...(existente.metadata || {}), ...(payload.metadata || {}) };
          existente.updated_at = new Date().toISOString();
        }
        return { error: null };
      }
      tabelas.match_events.push({
        ...payload,
        seq: tabelas.match_events.length + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return { error: null };
    },
  };
}

async function limpar() {
  await db.clearAll();
  // A marca de água anda com a base: uma base vazia e uma marca antiga fariam a
  // descarga seguinte dizer "não mudou nada" a um aparelho que não tem nada. É
  // o que o `resetLocal` faz a sério, e é preciso aqui pela mesma razão.
  esquecerMarca();
}

async function cenario() {
  const clube = await clubs.create({ name: 'Patameiras', shortName: 'PAT' });
  const escalao = await teams.create(clube.id, { name: 'Séniores', timing: 'UNTIMED' });
  const prova = (await competitions.listByTeam(escalao.id)).find((c) => c.name === 'Campeonato');
  const jogador = await players.create(escalao.id, { name: 'Zef', shirtNumber: 7 });
  const jogo = await matches.create(escalao.id, {
    opponentName: 'Adversário',
    opponentShortName: 'ADV',
    competitionId: prova.id,
  });
  await squad.replace(jogo.id, [
    {
      playerId: jogador.id,
      playerNameSnapshot: jogador.name,
      shirtNumberSnapshot: jogador.shirtNumber,
      initialLocation: LOCATION.BENCH,
    },
  ]);
  await events.append(A.matchCreated({ matchId: jogo.id }));
  return { clube, escalao, prova, jogador, jogo };
}

test('a fila envia tudo por ordem e limpa a marca de pendente', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { clube, jogo } = await cenario();

  const { pushed } = await push(UTILIZADOR, 'treinador@exemplo.pt');
  assert.ok(pushed >= 7, 'clube, escalão, competição, jogador, jogo, convocatória e evento');

  // O perfil tem de existir antes do clube: é para lá que aponta o dono.
  assert.equal(servidor.tabelas.profiles.length, 1, 'o perfil é garantido antes do clube');
  assert.equal(servidor.tabelas.profiles[0].id, UTILIZADOR);

  assert.equal(servidor.tabelas.clubs.length, 1);
  assert.equal(servidor.tabelas.clubs[0].owner_id, UTILIZADOR, 'o clube fica com dono');
  assert.equal(servidor.tabelas.clubs[0].short_name, 'PAT', 'o apelido viaja');
  assert.equal(servidor.tabelas.teams.length, 1, 'o escalão subiu');
  assert.equal(servidor.tabelas.teams[0].club_id, clube.id);
  assert.equal(servidor.tabelas.competitions.length, 3, 'as competições subiram');
  assert.equal(servidor.tabelas.players[0].club_id, clube.id);
  assert.ok(servidor.tabelas.players[0].team_id, 'o jogador pertence a um escalão');
  assert.ok(servidor.tabelas.matches[0].team_id, 'o jogo pertence a um escalão');
  assert.ok(servidor.tabelas.matches[0].competition_id, 'o jogo pertence a uma competição');
  assert.equal(servidor.tabelas.matches[0].opponent_short_name, 'ADV');
  assert.equal(servidor.tabelas.match_squad[0].match_id, jogo.id);
  assert.equal(servidor.tabelas.match_events.length, 1);

  // Nada fica por enviar depois de o servidor confirmar.
  const porEnviar = (await db.all(db.STORES.clubs)).filter((c) => c.dirty);
  assert.equal(porEnviar.length, 0);
});

test('reenviar a fila não duplica nada', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { jogo } = await cenario();
  await push(UTILIZADOR);

  // Simula uma confirmação perdida: as linhas voltam a ficar por enviar.
  for (const store of [db.STORES.clubs, db.STORES.players, db.STORES.matches, db.STORES.matchSquad]) {
    const rows = (await db.all(store)).map((r) => ({ ...r, dirty: true }));
    await db.putMany(store, rows);
  }
  const evs = (await db.all(db.STORES.matchEvents)).map((e) => ({ ...e, syncedAt: null }));
  await db.putMany(db.STORES.matchEvents, evs);

  await push(UTILIZADOR);

  assert.equal(servidor.tabelas.clubs.length, 1, 'o clube não duplicou');
  assert.equal(servidor.tabelas.match_events.length, 1, 'o evento não duplicou');
  assert.equal(servidor.tabelas.match_squad.filter((s) => s.match_id === jogo.id).length, 1);
});

test('uma falha a meio deixa o resto na fila para a próxima tentativa', async () => {
  await limpar();
  const servidor = servidorFalso({ falhaEm: 'matches' });
  setRemote(servidor);
  await cenario();

  await assert.rejects(() => push(UTILIZADOR));

  assert.equal(servidor.tabelas.clubs.length, 1, 'o que passou antes da falha ficou lá');
  assert.equal(servidor.tabelas.matches.length, 0);
  const jogosPorEnviar = (await db.all(db.STORES.matches)).filter((m) => m.dirty);
  assert.equal(jogosPorEnviar.length, 1, 'o jogo continua à espera');
});

test('descarregar do servidor não pisa o que ainda não foi enviado', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { clube } = await cenario();
  await push(UTILIZADOR);

  // Alguém mudou o nome no servidor; aqui mudou-se para outra coisa, ainda por enviar.
  servidor.tabelas.clubs[0] = { ...servidor.tabelas.clubs[0], name: 'Nome do servidor' };
  await clubs.update(clube.id, { name: 'Nome local por enviar' });

  await pull(UTILIZADOR);

  const local = await clubs.get(clube.id);
  assert.equal(local.name, 'Nome local por enviar', 'a alteração local sobrevive');
  assert.equal(local.dirty, true, 'e continua na fila');
});

test('num dispositivo novo, descarregar traz tudo', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { clube, jogo } = await cenario();
  await push(UTILIZADOR);

  // Dispositivo novo: mesma conta, nada guardado.
  await limpar();
  assert.equal((await clubs.list()).length, 0);

  await pull(UTILIZADOR);

  const lista = await clubs.list();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, clube.id);
  assert.equal(lista[0].dirty, false, 'o que vem do servidor não volta a ser enviado');
  assert.equal((await teams.listByClub(clube.id)).length, 1, 'o escalão desceu');
  assert.equal((await players.listByClub(clube.id)).length, 1);
  assert.equal((await matches.listByClub(clube.id)).length, 1);
  assert.equal((await events.listByMatch(jogo.id)).length, 1);
});

test('assistencias sobrevivem ao envio e descarga com eventos antigos', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { escalao, jogador, jogo } = await cenario();
  const assistente = await players.create(escalao.id, { name: 'Assistente', shirtNumber: 10 });
  await squad.replace(jogo.id, [
    {
      playerId: jogador.id,
      playerNameSnapshot: jogador.name,
      shirtNumberSnapshot: jogador.shirtNumber,
      initialLocation: LOCATION.BENCH,
    },
    {
      playerId: assistente.id,
      playerNameSnapshot: assistente.name,
      shirtNumberSnapshot: assistente.shirtNumber,
      initialLocation: LOCATION.BENCH,
    },
  ]);

  const inicial = await loadMatch(jogo.id);
  await events.append(A.startFirstHalf(inicial.state, Date.now()));
  const comInicio = await loadMatch(jogo.id);
  await events.append({
    ...A.teamGoalBy(comInicio.state, jogador.id, Date.now()),
    id: LEGACY_GOAL_ID,
    clientEventId: STABLE_GOAL_ID,
  });
  const comGolo = await loadMatch(jogo.id);
  await events.append({
    ...A.attributeGoal(comGolo.state, {
      targetEventId: LEGACY_GOAL_ID,
      assistId: assistente.id,
    }),
    id: LEGACY_ASSIST_EVENT_ID,
    clientEventId: STABLE_ASSIST_EVENT_ID,
  });

  assert.equal((await loadMatch(jogo.id)).state.goals[0].assistId, assistente.id);
  await push(UTILIZADOR, 'treinador@exemplo.pt');

  const atribuido = servidor.tabelas.match_events.find((e) => e.client_event_id === STABLE_ASSIST_EVENT_ID);
  assert.equal(atribuido.metadata.targetEventId, STABLE_GOAL_ID);

  await limpar();
  setRemote(servidor);
  await pull(UTILIZADOR);

  const novoDispositivo = await loadMatch(jogo.id);
  assert.equal(novoDispositivo.state.goals[0].eventId, STABLE_GOAL_ID);
  assert.equal(novoDispositivo.state.goals[0].assistId, assistente.id);
});

test('faltas atribuidas sobrevivem ao envio e descarga com eventos antigos', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { jogador, jogo } = await cenario();

  const inicial = await loadMatch(jogo.id);
  await events.append(A.startFirstHalf(inicial.state, Date.now()));
  const comInicio = await loadMatch(jogo.id);
  await events.append({
    ...A.foul(comInicio.state, EVENT.TEAM_FOUL_ADDED, Date.now()),
    id: LEGACY_FOUL_ID,
    clientEventId: STABLE_FOUL_ID,
  });
  const comFalta = await loadMatch(jogo.id);
  await events.append({
    ...A.attributeFoul(comFalta.state, {
      targetEventId: LEGACY_FOUL_ID,
      playerId: jogador.id,
    }),
    id: LEGACY_FOUL_ATTRIBUTION_ID,
    clientEventId: STABLE_FOUL_ATTRIBUTION_ID,
  });

  assert.equal((await loadMatch(jogo.id)).state.fouls[0].playerId, jogador.id);
  await push(UTILIZADOR, 'treinador@exemplo.pt');

  const atribuido = servidor.tabelas.match_events.find((e) => e.client_event_id === STABLE_FOUL_ATTRIBUTION_ID);
  assert.equal(atribuido.metadata.targetEventId, STABLE_FOUL_ID);

  await limpar();
  setRemote(servidor);
  await pull(UTILIZADOR);

  const novoDispositivo = await loadMatch(jogo.id);
  assert.equal(novoDispositivo.state.fouls[0].eventId, STABLE_FOUL_ID);
  assert.equal(novoDispositivo.state.fouls[0].playerId, jogador.id);
});

test('reenviar evento ja existente corrige metadata no servidor', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { escalao, jogador, jogo } = await cenario();
  const assistente = await players.create(escalao.id, { name: 'Assistente', shirtNumber: 10 });

  const inicial = await loadMatch(jogo.id);
  await events.append(A.startFirstHalf(inicial.state, Date.now()));
  const comInicio = await loadMatch(jogo.id);
  await events.append({
    ...A.teamGoalBy(comInicio.state, jogador.id, Date.now()),
    id: LEGACY_GOAL_ID,
    clientEventId: STABLE_GOAL_ID,
  });
  const comGolo = await loadMatch(jogo.id);
  await events.append({
    ...A.attributeGoal(comGolo.state, {
      targetEventId: LEGACY_GOAL_ID,
      assistId: assistente.id,
    }),
    id: LEGACY_ASSIST_EVENT_ID,
    clientEventId: STABLE_ASSIST_EVENT_ID,
  });

  servidor.tabelas.match_events.push({
    id: STABLE_ASSIST_EVENT_ID,
    match_id: jogo.id,
    seq: 20,
    event_type: EVENT.GOAL_ATTRIBUTED,
    period: 1,
    match_elapsed_ms: 0,
    period_elapsed_ms: 0,
    metadata: { targetEventId: LEGACY_GOAL_ID, assistId: assistente.id },
    client_event_id: STABLE_ASSIST_EVENT_ID,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await push(UTILIZADOR, 'treinador@exemplo.pt');

  const corrigido = servidor.tabelas.match_events.find((e) => e.client_event_id === STABLE_ASSIST_EVENT_ID);
  assert.equal(corrigido.metadata.targetEventId, STABLE_GOAL_ID);
});

test('desfazer sobrevive ao envio e descarga com eventos antigos', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { jogo } = await cenario();

  const inicial = await loadMatch(jogo.id);
  await events.append(A.startFirstHalf(inicial.state, Date.now()));
  const comInicio = await loadMatch(jogo.id);
  const golo = {
    ...A.goal(comInicio.state, EVENT.TEAM_GOAL_ADDED, Date.now()),
    id: LEGACY_GOAL_ID,
    clientEventId: STABLE_GOAL_ID,
  };
  await events.append(golo);
  const comGolo = await loadMatch(jogo.id);
  assert.equal(comGolo.state.teamScore, 1);
  await events.append({
    ...A.undoEvent(comGolo.state, golo, Date.now()),
    id: LEGACY_ASSIST_EVENT_ID,
    clientEventId: STABLE_ASSIST_EVENT_ID,
  });

  assert.equal((await loadMatch(jogo.id)).state.teamScore, 0);
  await push(UTILIZADOR, 'treinador@exemplo.pt');

  const undo = servidor.tabelas.match_events.find((e) => e.client_event_id === STABLE_ASSIST_EVENT_ID);
  assert.equal(undo.metadata.targetEventId, STABLE_GOAL_ID);

  await limpar();
  setRemote(servidor);
  await pull(UTILIZADOR);

  const novoDispositivo = await loadMatch(jogo.id);
  assert.equal(novoDispositivo.state.teamScore, 0);
  assert.equal(novoDispositivo.state.goals.length, 0);
});

test('um backup restaurado sobe inteiro, com clube e tudo', async () => {
  // Foi assim que rebentou na vida real: as linhas restauradas não estavam
  // marcadas como pendentes, e o jogo novo chegava ao servidor sem clube.
  await limpar();
  setRemote(servidorFalso());
  const { clube, jogo } = await cenario();
  const backup = await dump();

  await limpar();
  await restore(backup);

  const servidor = servidorFalso();
  setRemote(servidor);
  await push(UTILIZADOR, 'treinador@exemplo.pt');

  assert.equal(servidor.tabelas.clubs.length, 1, 'o clube restaurado subiu');
  assert.equal(servidor.tabelas.clubs[0].id, clube.id);
  assert.equal(servidor.tabelas.matches.length, 1);
  assert.equal(servidor.tabelas.match_events.length, 1);
  assert.equal(servidor.tabelas.matches[0].id, jogo.id);
});

test('um jogo novo arrasta o clube, mesmo que o clube já se julgue enviado', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { clube } = await cenario();

  // O clube foi dado como enviado sem nunca ter chegado lá (falha antiga).
  const clubes = (await db.all(db.STORES.clubs)).map((c) => ({ ...c, dirty: false }));
  await db.putMany(db.STORES.clubs, clubes);

  await push(UTILIZADOR, 'treinador@exemplo.pt');

  assert.equal(servidor.tabelas.clubs.length, 1, 'o clube foi junto com o jogo');
  assert.equal(servidor.tabelas.clubs[0].id, clube.id);
  assert.equal(servidor.tabelas.matches.length, 1);
});

test('um clube apagado fica arquivado no servidor e nao volta no outro dispositivo', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { clube } = await cenario();
  await push(UTILIZADOR);

  await clubs.archive(clube.id);
  await push(UTILIZADOR);

  assert.ok(servidor.tabelas.clubs[0].archived_at, 'o apagado sobe como arquivo');

  await limpar();
  await pull(UTILIZADOR);

  assert.equal((await clubs.list()).length, 0, 'clubes arquivados ficam escondidos');
  assert.equal((await db.get(db.STORES.clubs, clube.id)).archivedAt > 0, true);
});

test('pedir sincronizacao enquanto outra corre faz uma segunda passagem', async () => {
  await limpar();

  let soltarClubes;
  let jaBloqueou = false;
  const servidor = servidorFalso();
  const fromOriginal = servidor.from;
  servidor.from = (nome) => {
    const q = fromOriginal(nome);
    if (nome !== 'clubs') return q;
    return {
      ...q,
      async upsert(rows) {
        if (!jaBloqueou) {
          jaBloqueou = true;
          await new Promise((resolve) => {
            soltarClubes = resolve;
          });
        }
        return q.upsert(rows);
      },
    };
  };

  setRemote(servidor);
  const primeiro = await clubs.create({ name: 'Primeiro' });
  const emCurso = flush(UTILIZADOR, 'treinador@exemplo.pt');

  while (!soltarClubes) await new Promise((resolve) => setTimeout(resolve, 0));

  // Com id explícito porque o `clubs.create` passou a recusar um segundo clube
  // na mesma conta. A regra é do produto e vive lá em cima; aqui em baixo, a
  // fila tem de saber levar duas linhas da mesma tabela em duas passagens — o
  // que acontece de verdade quando se restaura uma cópia antiga ou se recebe do
  // servidor. É isso que este teste mede, e não quantos clubes se podem criar.
  const segundo = await clubs.create({ id: 'c0000000-0000-4000-8000-000000000002', name: 'Segundo' });
  const segundaPassagem = flush(UTILIZADOR, 'treinador@exemplo.pt');
  soltarClubes();
  await emCurso;
  await segundaPassagem;

  const ids = servidor.tabelas.clubs.map((c) => c.id).sort();
  assert.deepEqual(ids, [primeiro.id, segundo.id].sort());
});

test('o escalão sobe antes do jogador e do jogo que dependem dele', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { escalao } = await cenario();

  // O escalão dá-se por enviado sem nunca lá ter chegado: o jogo tem de o levar.
  const escaloes = (await db.all(db.STORES.teams)).map((t) => ({ ...t, dirty: false }));
  await db.putMany(db.STORES.teams, escaloes);

  await push(UTILIZADOR, 'treinador@exemplo.pt');

  assert.equal(servidor.tabelas.teams.length, 1, 'o escalão foi junto com o jogo');
  assert.equal(servidor.tabelas.teams[0].id, escalao.id);
});

test('um jogador do modelo antigo é adotado pelo escalão do clube', async () => {
  // O caso real: a base do servidor foi migrada para escalões, a do browser não.
  // Ficou lá um jogador sem escalão nenhum, e o servidor recusava-o — parando
  // tudo o que vinha atrás na fila.
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { escalao, jogador } = await cenario();

  // Volta ao estado de antes da migração: sem escalão e por enviar.
  await db.put(db.STORES.players, {
    ...(await db.get(db.STORES.players, jogador.id)),
    teamId: undefined,
    dirty: true,
  });

  const { pushed } = await push(UTILIZADOR, 'treinador@exemplo.pt');
  assert.ok(pushed > 0, 'o envio não encrava');
  assert.equal(servidor.tabelas.players.length, 1);
  assert.equal(
    servidor.tabelas.players[0].team_id,
    escalao.id,
    'adotado pelo único escalão do clube'
  );
});

test('sem escalão onde encaixar, a linha antiga sai da fila em vez de a bloquear', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const clube = await clubs.create({ name: 'Sem escalões' });
  const orfao = {
    id: '99999999-9999-4999-8999-999999999999',
    clubId: clube.id,
    name: 'Jogador de antigamente',
    shirtNumber: 3,
    isActive: true,
    dirty: true,
  };
  await db.put(db.STORES.players, orfao);

  await push(UTILIZADOR, 'treinador@exemplo.pt');
  assert.equal(servidor.tabelas.players.length, 0, 'não sobe uma linha que o servidor recusa');
  assert.equal(servidor.tabelas.clubs.length, 1, 'e o resto da fila passa à mesma');

  const guardado = await db.get(db.STORES.players, orfao.id);
  assert.equal(guardado.dirty, false, 'deixa de contar como pendente');
  assert.equal(guardado.name, 'Jogador de antigamente', 'mas continua guardado no dispositivo');
});

/* --------------------------------------------- o jogo de experiência */

test('a demonstração monta uma equipa jogável e apaga-se só a si própria', async () => {
  await limpar();
  const { iniciarDemo, limparDemo, DEMO } = await import('../src/lib/demo.js');

  // Dados reais de alguém que usou a app e saiu da conta: não podem ser tocados.
  const meuClube = await clubs.create({ name: 'O meu clube a sério' });

  const { matchId } = await iniciarDemo();
  assert.equal(matchId, DEMO.jogo);

  const jogo = await matches.get(matchId);
  assert.ok(jogo, 'o jogo existe');
  const convocados = await squad.listByMatch(matchId);
  assert.equal(convocados.length, 10, 'plantel completo');
  assert.equal(
    convocados.filter((c) => c.initialLocation === LOCATION.COURT).length,
    5,
    'cinco em campo, prontos a começar'
  );

  // E o estado do jogo reconstrói-se como qualquer outro.
  const { state } = await loadMatch(matchId);
  assert.equal(Object.keys(state.players).length, 10);

  await limparDemo();
  assert.equal((await matches.get(matchId)) ?? null, null, 'o jogo desaparece');
  assert.equal((await clubs.get(DEMO.clube)) ?? null, null, 'o clube fictício desaparece');
  assert.ok(await clubs.get(meuClube.id), 'o clube a sério fica onde estava');
});

test('a demonstração não sobe para o servidor', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { iniciarDemo } = await import('../src/lib/demo.js');
  await iniciarDemo();

  // Sem sessão iniciada não há para onde enviar — e é isso que a protege.
  const { pushed } = await push(null, null);
  assert.equal(pushed, 0);
  assert.equal(servidor.tabelas.clubs.length, 0);
  assert.equal(servidor.tabelas.match_events.length, 0);
});

test('um jogador antigo e já sincronizado não trava o envio ao ser arrastado como pai', async () => {
  // O caso que voltou a aparecer no telemóvel: o jogador não estava pendente
  // (já tinha subido, há meses, antes dos escalões existirem), mas foi enviado
  // à mesma por ser pai de uma convocatória pendente. Como não estava pendente,
  // a limpeza de sobras não lhe tocava — e o servidor recusava-o.
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { escalao, jogador, jogo } = await cenario();

  // Estado de antes: jogador sem escalão E já sincronizado.
  await db.put(db.STORES.players, {
    ...(await db.get(db.STORES.players, jogador.id)),
    teamId: undefined,
    dirty: false,
  });
  // A convocatória, essa, está por enviar.
  const convocado = (await squad.listByMatch(jogo.id))[0];
  await db.put(db.STORES.matchSquad, { ...convocado, dirty: true });

  const { pushed } = await push(UTILIZADOR, 'treinador@exemplo.pt');
  assert.ok(pushed > 0, 'o envio não encrava');
  assert.equal(servidor.tabelas.players.length, 1);
  assert.equal(
    servidor.tabelas.players[0].team_id,
    escalao.id,
    'adotado pelo escalão do clube antes de subir'
  );
  assert.equal(servidor.tabelas.match_squad.length, 1, 'e a convocatória sobe com ele');
});

test('sem escalão onde encaixar, o jogo inteiro fica para trás em vez de subir partido', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const clube = await clubs.create({ name: 'Clube sem escalões' });

  // Um jogador e um jogo do modelo antigo, num clube que não tem escalão nenhum.
  const orfao = { id: '11111111-2222-4333-8444-555555555555', clubId: clube.id, name: 'Antigo', shirtNumber: 3, isActive: true, dirty: false };
  const jogoOrfao = { id: '11111111-2222-4333-8444-666666666666', clubId: clube.id, opponentName: 'X', status: 'DRAFT', dirty: false };
  await db.put(db.STORES.players, orfao);
  await db.put(db.STORES.matches, jogoOrfao);
  await db.put(db.STORES.matchSquad, {
    id: '11111111-2222-4333-8444-777777777777',
    matchId: jogoOrfao.id,
    playerId: orfao.id,
    playerNameSnapshot: 'Antigo',
    shirtNumberSnapshot: 3,
    dirty: true,
  });

  await push(UTILIZADOR, 'treinador@exemplo.pt');
  assert.equal(servidor.tabelas.players.length, 0, 'o jogador sem escalão não sobe');
  assert.equal(servidor.tabelas.matches.length, 0, 'nem o jogo dele');
  assert.equal(
    servidor.tabelas.match_squad.length,
    0,
    'nem a convocatória, que ficaria a apontar para o vazio'
  );
  assert.equal(servidor.tabelas.clubs.length, 1, 'mas o resto da fila passa');
});

test('sair da conta não faz o envio escrever com uma sessão que já não existe', async () => {
  // O erro que aparecia sempre ao carregar em Sair: a fila corre de poucos em
  // poucos segundos, e uma dessas passagens apanhava o utilizador a sair. Quando
  // chegava ao servidor a sessão já não existia, e a segurança por linha recusava
  // a primeira escrita — o perfil.
  await limpar();
  const servidor = servidorFalso();
  // Um servidor que sabe de quem é a sessão, como o Supabase a sério.
  servidor.auth = { getSession: async () => ({ data: { session: null } }) };
  setRemote(servidor);
  await cenario();

  const { pushed } = await push(UTILIZADOR, 'treinador@exemplo.pt');
  assert.equal(pushed, 0, 'sem sessão, não se escreve nada');
  assert.equal(servidor.tabelas.profiles.length, 0, 'nem sequer o perfil');
});

test('com a sessão certa, o envio segue como sempre', async () => {
  await limpar();
  const servidor = servidorFalso();
  servidor.auth = {
    getSession: async () => ({ data: { session: { user: { id: UTILIZADOR } } } }),
  };
  setRemote(servidor);
  await cenario();

  const { pushed } = await push(UTILIZADOR, 'treinador@exemplo.pt');
  assert.ok(pushed > 0);
  assert.equal(servidor.tabelas.profiles.length, 1);
});

test('a base deste aparelho é de uma conta de cada vez', async () => {
  // O erro: a base do browser sobrevive ao logout. Quem saísse da conta e
  // abrisse a demonstração via a sua equipa misturada com a fictícia.
  await limpar();
  const { garantirDono, DONO_DEMO, donoAtual } = await import('../src/lib/data/owner.js');

  // Conta A cria um clube neste aparelho.
  await garantirDono('conta-A');
  const meu = await clubs.create({ name: 'O meu clube' });
  assert.equal(donoAtual(), 'conta-A');

  // A demonstração é outro dono: a base é limpa antes de começar.
  const r = await garantirDono(DONO_DEMO);
  assert.equal(r.trocou, true);
  assert.equal((await clubs.get(meu.id)) ?? null, null, 'o clube da conta A saiu daqui');
  assert.equal(donoAtual(), DONO_DEMO);

  // E voltar a entrar na conta A limpa outra vez o que a demonstração deixou.
  await clubs.create({ id: '00000000-dem0-4000-8000-000000000001', name: 'FC Demonstração' });
  const r2 = await garantirDono('conta-A');
  assert.equal(r2.trocou, true);
  assert.equal((await clubs.list()).length, 0, 'a base fica vazia à espera do servidor');
});

test('o mesmo dono a voltar não perde nada', async () => {
  await limpar();
  const { garantirDono } = await import('../src/lib/data/owner.js');
  await garantirDono('conta-A');
  const meu = await clubs.create({ name: 'O meu clube' });

  const r = await garantirDono('conta-A');
  assert.equal(r.trocou, false);
  assert.ok(await clubs.get(meu.id), 'continua tudo onde estava');
});

/* ------------------------------------------------- uma conta, um clube */

// A app assume isto em todo o lado: o painel abre no clube, os escalões
// pertencem-lhe, a época é dele. Nada o impedia, e quem criasse o segundo ficava
// com uma app sem resposta para "qual mostro?".
//
// Aqui protege-se a camada do meio. O botão desapareceu do painel e há um índice
// único na base de dados; isto é o que apanha quem escreva `/clubs/new` à mão
// numa versão da app que já não tem botão nenhum.

test('o segundo clube é recusado', async () => {
  await limpar();
  await clubs.create({ name: 'CD Ribeira Alta' });

  await assert.rejects(
    () => clubs.create({ name: 'Outro qualquer' }),
    (erro) => erro.chave === 'clube.jaExiste',
    'deixou criar um segundo clube'
  );

  assert.equal((await clubs.list()).length, 1);
});

test('depois de arquivar o clube, pode criar-se outro', async () => {
  // Apagar um clube na app é arquivá-lo — os jogos e o histórico ficam. Se o
  // arquivado continuasse a ocupar o lugar, um treinador que quisesse recomeçar
  // nunca mais criava nenhum, e sem nada no ecrã que explicasse a recusa.
  await limpar();
  const primeiro = await clubs.create({ name: 'O antigo' });
  await clubs.archive(primeiro.id);

  const segundo = await clubs.create({ name: 'O novo' });
  assert.ok(segundo.id);
  assert.deepEqual((await clubs.list()).map((c) => c.name), ['O novo']);
});

test('o jogo de experiência continua a poder montar-se', async () => {
  // Ele traz identificadores fixos, para depois se conseguir apagar a si
  // próprio. É essa a exceção — e corre sempre num aparelho acabado de limpar.
  await limpar();
  const demo = await clubs.create({
    id: '00000000-dem0-4000-8000-000000000001',
    name: 'FC Demonstração',
  });
  assert.equal(demo.id, '00000000-dem0-4000-8000-000000000001');
});

/* -------------------------------------------- licenças e acesso partilhado */

// A app decide sem rede se pode criar mais um escalão, e mostra-se em modo de
// leitura a quem só tem `ver`. As duas respostas vêm do servidor e têm de estar
// guardadas no aparelho antes de fazerem falta.

test('a licença desce com a descarga e fica guardada', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  await cenario();
  await push(UTILIZADOR, 'treinador@exemplo.pt');

  // No servidor, esta conta é de um clube.
  servidor.tabelas.profiles[0] = { ...servidor.tabelas.profiles[0], licenca: 'clube' };
  await pull(UTILIZADOR);

  const perfil = (await db.all(db.STORES.profile))[0];
  assert.equal(perfil.licenca, 'clube', 'a licença não chegou ao aparelho');
});

test('com licença de treinador, o segundo escalão é recusado', async () => {
  await limpar();
  const clube = await clubs.create({ name: 'Só um' });
  await teams.create(clube.id, { name: 'Séniores' });

  // Sem licença descarregada vale a mais restrita: recusar de mais explica-se,
  // permitir de mais deixa criar coisas que o servidor mata mais tarde.
  await assert.rejects(
    () => teams.create(clube.id, { name: 'Sub-19' }),
    (e) => e.chave === 'escalao.limiteDaLicenca',
    'deixou criar um segundo escalão'
  );
});

test('um escalão novo nasce com as competições base', async () => {
  await limpar();
  const clube = await clubs.create({ name: 'Com provas base' });
  const escalao = await teams.create(clube.id, { name: 'Séniores' });

  assert.deepEqual(
    (await competitions.listByTeam(escalao.id)).map((c) => c.name),
    ['Campeonato', 'Jogos de Treino', 'Taça']
  );
});

test('com licença de clube, criam-se os escalões todos', async () => {
  await limpar();
  const clube = await clubs.create({ name: 'Com licença' });
  const perfil = (await db.all(db.STORES.profile))[0];
  await db.put(db.STORES.profile, { ...perfil, licenca: 'clube', licenseStatus: 'active' });

  await teams.create(clube.id, { name: 'Séniores' });
  await teams.create(clube.id, { name: 'Sub-19' });
  await teams.create(clube.id, { name: 'Sub-15' });

  assert.equal((await teams.listByClub(clube.id)).length, 3);
});

test('licença de clube expirada não deixa criar mais escalões', async () => {
  await limpar();
  const clube = await clubs.create({ name: 'Expirada' });
  const perfil = (await db.all(db.STORES.profile))[0];
  await db.put(db.STORES.profile, {
    ...perfil,
    licenca: 'clube',
    licenseStatus: 'expired',
    licenseExpiresAt: Date.now() - 1000,
  });

  await teams.create(clube.id, { name: 'Séniores' });
  await assert.rejects(
    () => teams.create(clube.id, { name: 'Sub-19' }),
    (e) => e.chave === 'escalao.limiteDaLicenca',
    'licença de clube expirada deixou criar um segundo escalão'
  );
});

test('o nível de acesso desce em cada descarga', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { escalao } = await cenario();
  await push(UTILIZADOR, 'treinador@exemplo.pt');

  // O clube passa a ser de outra pessoa: aqui somos um treinador associado.
  servidor.tabelas.clubs[0] = { ...servidor.tabelas.clubs[0], owner_id: 'outro-qualquer' };

  servidor.tabelas.team_access = [{ team_id: escalao.id, user_id: UTILIZADOR, nivel: 'editar' }];
  await pull(UTILIZADOR);
  assert.equal(await teams.nivel(escalao.id), 'editar');

  servidor.tabelas.team_access = [{ team_id: escalao.id, user_id: UTILIZADOR, nivel: 'ver' }];
  await pull(UTILIZADOR);
  assert.equal(await teams.nivel(escalao.id), 'ver', 'a descida de nível não chegou');
});

test('o nível desce mesmo num escalão com alterações por enviar', async () => {
  // Este é o caso que obriga o `marcarNiveis` a existir, e a primeira versão do
  // teste acima não chegava lá: o `merge` reescreve a linha inteira e apaga o
  // `nivel` de caminho, por isso qualquer implementação parecia funcionar.
  //
  // O `merge` salta as linhas por enviar, para não pisar trabalho do treinador —
  // e é aí que o `nivel` antigo sobrevive. Um treinador a quem o gerente acabou
  // de tirar a edição, e que tenha uma alteração por sincronizar, continuaria a
  // poder escrever.
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { escalao } = await cenario();
  await push(UTILIZADOR, 'treinador@exemplo.pt');
  servidor.tabelas.clubs[0] = { ...servidor.tabelas.clubs[0], owner_id: 'outro-qualquer' };

  servidor.tabelas.team_access = [{ team_id: escalao.id, user_id: UTILIZADOR, nivel: 'editar' }];
  await pull(UTILIZADOR);
  assert.equal(await teams.nivel(escalao.id), 'editar');

  // Mexer no escalão deixa-o por enviar — e é isso que faz o `merge` saltá-lo.
  await teams.update(escalao.id, { name: 'Séniores A' });
  assert.equal((await db.get(db.STORES.teams, escalao.id)).dirty, true, 'devia ficar por enviar');

  servidor.tabelas.team_access = [{ team_id: escalao.id, user_id: UTILIZADOR, nivel: 'ver' }];
  await pull(UTILIZADOR);

  assert.equal(
    await teams.nivel(escalao.id),
    'ver',
    'continuou a poder editar um escalão que já não lhe pertence'
  );
  assert.equal((await db.get(db.STORES.teams, escalao.id)).name, 'Séniores A', 'e não perdeu o que tinha escrito');
});

test('ser dono do clube ganha ao que estiver na tabela de acessos', async () => {
  // Um gerente que se desse `ver` a si próprio por engano ficava sem poder mexer
  // no seu próprio clube.
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { escalao } = await cenario();
  await push(UTILIZADOR, 'treinador@exemplo.pt');

  servidor.tabelas.team_access = [{ team_id: escalao.id, user_id: UTILIZADOR, nivel: 'ver' }];
  await pull(UTILIZADOR);

  assert.equal(await teams.nivel(escalao.id), 'dono');
});

test('um escalão criado sem rede é de quem o criou', async () => {
  // Sem nível anotado — ninguém sincronizou ainda — a resposta tem de ser `dono`,
  // senão quem cria um escalão num pavilhão fica a olhar para ele sem poder mexer.
  await limpar();
  const clube = await clubs.create({ name: 'Sem rede' });
  const escalao = await teams.create(clube.id, { name: 'Séniores' });
  assert.equal(await teams.nivel(escalao.id), 'dono');
});

/* ------------------------------------------------- o modo de só leitura */

test('quem tem `ver` não escreve, quem tem `editar` escreve', async () => {
  // O hook que trava a interface pergunta isto. Aqui prova-se a resposta, que é
  // a parte que se pode testar sem browser.
  await limpar();
  const clube = await clubs.create({ name: 'Do gerente' });
  const escalao = await teams.create(clube.id, { name: 'Sub-15' });

  // Como criador, é dele.
  assert.equal(await teams.nivel(escalao.id), 'dono');

  // Como o servidor diria de um treinador só com leitura.
  const local = await db.get(db.STORES.teams, escalao.id);
  await db.put(db.STORES.teams, { ...local, nivel: 'ver' });
  assert.equal(await teams.nivel(escalao.id), 'ver');

  await db.put(db.STORES.teams, { ...local, nivel: 'editar' });
  assert.equal(await teams.nivel(escalao.id), 'editar');
});

test('um escalão que não existe não dá acesso a nada', async () => {
  await limpar();
  // `dono` por omissão é para escalões criados aqui e ainda não sincronizados —
  // não pode ser a resposta para um id inventado que chegue pela barra de
  // endereço. O que trava esse caso é o servidor, mas convém saber-se.
  assert.equal(await teams.nivel('nao-existe'), 'dono');
});

/* ---------------------------------------- o clube de outra pessoa na base */

// Três defeitos que só apareceram ao pôr duas contas a sério em cima disto, e
// todos com a mesma origem: a base local passou a poder conter um clube que não
// é desta conta.

const { garantirDono, esquecerDono, DONO_DEMO } = await import('../src/lib/data/owner.js');

test('a fila não reenvia o clube de outra pessoa', async () => {
  // Era o pior dos três. O `comPais` arrasta os pais de que uma linha depende, e
  // o pai de um escalão é o clube. Um treinador associado tem na base o clube do
  // gerente, e a fila reenviava-o carimbado com o `owner_id` de quem estava a
  // enviar — o servidor recusava com "new row violates row-level security policy
  // for table clubs", a falar do clube quando a pessoa tinha criado um escalão.
  await limpar();
  esquecerDono();
  const servidor = servidorFalso();
  setRemote(servidor);

  // Um clube que veio do servidor e é de outra pessoa.
  await db.put(db.STORES.clubs, {
    id: 'clube-do-gerente', ownerId: 'o-gerente', name: 'Do gerente',
    createdAt: 1, updatedAt: 1, dirty: false,
  });
  await db.put(db.STORES.teams, {
    id: 'escalao-partilhado', clubId: 'clube-do-gerente', name: 'Sub-15',
    timing: 'UNTIMED', nivel: 'editar', createdAt: 1, updatedAt: 1, dirty: true,
  });

  await push(UTILIZADOR, 'treinador@exemplo.pt');

  assert.equal(servidor.tabelas.clubs.length, 0, 'reenviou um clube que não é desta conta');
});

test('o clube nasce sem dono e é o envio que o carimba', async () => {
  // Carimbar o dono na criação parecia mais directo e é frágil: logo a seguir ao
  // jogo de experiência, "quem está a usar o aparelho" ainda é `demo`, e um clube
  // criado nessa janela nascia com um dono que não existe e nunca mais subia.
  //
  // Quem carimba é o envio, que sabe de quem é a sessão com que está a falar. E
  // o `null` é o que distingue "criado aqui" de "veio do servidor" — a
  // distinção em que a fila se apoia para não reenviar clubes alheios.
  await limpar();
  await garantirDono(DONO_DEMO);
  const clube = await clubs.create({ name: 'Meu' });
  assert.equal(clube.ownerId, null, 'nasceu já com dono, e o dono podia estar errado');

  const servidor = servidorFalso();
  setRemote(servidor);
  await push(UTILIZADOR, 'treinador@exemplo.pt');
  assert.equal(servidor.tabelas.clubs[0].owner_id, UTILIZADOR, 'o envio não o carimbou');
  esquecerDono();
});

test('"já tens um clube" só conta os clubes desta conta', async () => {
  // Um treinador associado tem na base o clube do gerente. Sem esta distinção, a
  // app dizia-lhe que já tinha um clube — a falar do clube de outra pessoa.
  await limpar();
  await garantirDono(UTILIZADOR);
  await db.put(db.STORES.clubs, {
    id: 'clube-do-gerente', ownerId: 'o-gerente', name: 'Do gerente',
    createdAt: 1, updatedAt: 1, dirty: false,
  });

  const meu = await clubs.create({ name: 'O meu' });
  assert.ok(meu.id, 'não deixou criar o primeiro clube desta conta');
  esquecerDono();
});

test('um treinador associado não cria escalões no clube do gerente', async () => {
  // O servidor já o impedia, mas só quando a fila lá chegasse — e nessa altura o
  // treinador já tinha escrito o nome e carregado em Guardar.
  await limpar();
  await garantirDono(UTILIZADOR);
  await db.put(db.STORES.clubs, {
    id: 'clube-do-gerente', ownerId: 'o-gerente', name: 'Do gerente',
    createdAt: 1, updatedAt: 1, dirty: false,
  });

  await assert.rejects(
    () => teams.create('clube-do-gerente', { name: 'Sub-15' }),
    (e) => e.chave === 'escalao.soODono'
  );
  esquecerDono();
});

/* ----------------------------------------------- quem vê botões de edição */

// A regra que estes protegem: um botão que existe e falha ao ser carregado é
// pior do que um botão que não existe. A pessoa escreve o nome, escolhe as
// cores, carrega em Guardar, e leva um erro de sincronização que não tem nada
// que ver com o que fez.
//
// A pergunta vive no `useSouDono.js` e é a mesma nos três sítios: o lápis do
// cartão do clube, o "editar clube"/"criar escalão" da página do clube, e o
// lápis do cartão do escalão.

const { souDonoDe } = await import('../src/lib/useSouDono.js');

test('o clube do gerente não mostra botões a um treinador associado', async () => {
  await limpar();
  await garantirDono(UTILIZADOR);
  assert.equal(souDonoDe({ id: 'x', ownerId: 'o-gerente' }), false);
  esquecerDono();
});

test('o meu clube mostra', async () => {
  await limpar();
  await garantirDono(UTILIZADOR);
  assert.equal(souDonoDe({ id: 'x', ownerId: UTILIZADOR }), true);
  esquecerDono();
});

test('um clube criado aqui e ainda por sincronizar é meu', async () => {
  // Nasce sem dono — quem carimba é o envio. Tratá-lo como alheio deixava quem
  // cria um clube sem rede a olhar para ele sem poder mexer.
  await limpar();
  await garantirDono(UTILIZADOR);
  assert.equal(souDonoDe({ id: 'x', ownerId: null }), true);
  esquecerDono();
});

test('sem clube nenhum não há dono', () => {
  assert.equal(souDonoDe(null), false);
  assert.equal(souDonoDe(undefined), false);
});

/* ---------------------------------------------- voltar ao sítio de onde se veio */

// O "atrás" de um formulário de edição não pode apontar sempre para o mesmo
// sítio. Quem edita um escalão a partir da lista de escalões do clube quer voltar
// à lista; quem edita o clube a partir do painel quer voltar ao painel. Antes,
// ambos eram despejados **para dentro** do que tinham acabado de editar.

const { comOrigem: origem, rotas: R } = await import('../src/lib/routes.js');

test('a origem viaja no endereço e não pisa os ids', () => {
  const destino = origem(R.escalaoEditar('c1', 't1'), { atras: R.clube('c1') });
  assert.ok(destino.startsWith('/team/edit?'), destino);
  assert.match(destino, /c=c1/);
  assert.match(destino, /t=t1/);
  assert.match(destino, /back=/);
});

test('a origem é codificada, para os seus próprios parâmetros não se perderem', () => {
  // `/club?c=abc` tem um `?` e um `=` lá dentro. Sem codificação, o `c=abc`
  // colava-se aos parâmetros do endereço de fora e o "atrás" ficava truncado.
  const destino = origem(R.escalaoEditar('c1', 't1'), { atras: R.clube('c1') });
  const back = new URLSearchParams(destino.split('?')[1]).get('back');
  assert.equal(back, '/club?c=c1', 'a origem chegou partida do outro lado');
});

test('sem origem, o endereço fica como estava', () => {
  assert.equal(origem(R.clubeEditar('c1'), {}), R.clubeEditar('c1'));
  assert.equal(origem(R.clubeEditar('c1')), R.clubeEditar('c1'));
});

/* ------------------------------------------ "já tens um clube" sem adivinhar */

test('uma linha antiga sem dono não impede o primeiro clube', async () => {
  // O falso positivo que apareceu a testar: a contagem tratava um clube sem dono
  // como sendo desta conta, por precaução. Bastava uma linha esquecida na base
  // local — de outra conta, de um teste — para a app recusar o primeiro clube a
  // quem não tinha nenhum. E o botão de criar chegava a aparecer, porque a
  // página só olhava para a lista.
  await limpar();
  await garantirDono(UTILIZADOR);
  await db.put(db.STORES.clubs, {
    id: 'sobra-sem-dono', ownerId: null, name: 'Sobra', dirty: false,
    createdAt: 1, updatedAt: 1,
  });

  const meu = await clubs.create({ name: 'O meu primeiro' });
  assert.ok(meu.id, 'a sobra impediu o primeiro clube desta conta');
  esquecerDono();
});

test('mas o segundo clube da mesma sessão continua recusado', async () => {
  // Um clube acabado de criar ainda não tem dono — está por enviar, e é isso que
  // o identifica como sendo desta sessão.
  await limpar();
  await garantirDono(UTILIZADOR);
  await clubs.create({ name: 'O primeiro' });
  await assert.rejects(
    () => clubs.create({ name: 'O segundo' }),
    (e) => e.chave === 'clube.jaExiste'
  );
  esquecerDono();
});

test('depois de enviado, o clube fica com o dono na linha local', async () => {
  // Sem isto, a linha local ficava sem dono até uma descarga a reescrever — e
  // nesse intervalo a app não sabia de quem era o seu próprio clube. É o que
  // fazia o segundo clube voltar a passar assim que o primeiro sincronizasse.
  await limpar();
  await garantirDono(UTILIZADOR);
  const servidor = servidorFalso();
  setRemote(servidor);

  const clube = await clubs.create({ name: 'Meu' });
  assert.equal(clube.ownerId, null, 'nasce sem dono, de propósito');

  await push(UTILIZADOR, 'treinador@exemplo.pt');
  assert.equal((await clubs.get(clube.id)).ownerId, UTILIZADOR, 'o envio não escreveu o dono de volta');

  await assert.rejects(
    () => clubs.create({ name: 'O segundo' }),
    (e) => e.chave === 'clube.jaExiste',
    'deixou criar um segundo depois de o primeiro sincronizar'
  );
  esquecerDono();
});

/* ------------------------------------------------- apagar é arquivar */

// Apagar um escalão passava pelo `teams.remove`, que apaga a linha **deste
// aparelho** e mais nada. No ecrã parecia feito; a descarga seguinte trazia o
// escalão de volta, porque no servidor ele nunca tinha saído — e o servidor não
// tem como distinguir "foi apagado" de "este aparelho ainda não o conhece".

test('apagar um escalão sobe ao servidor e não volta na descarga', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);

  const clube = await clubs.create({ name: 'Com escalão' });
  const escalao = await teams.create(clube.id, { name: 'Séniores' });
  await push(UTILIZADOR, 'treinador@exemplo.pt');

  await teams.archive(escalao.id);
  assert.equal((await teams.listByClub(clube.id)).length, 0, 'devia sair da lista logo');

  await push(UTILIZADOR, 'treinador@exemplo.pt');
  assert.ok(
    servidor.tabelas.teams.find((t) => t.id === escalao.id)?.archived_at,
    'o servidor não ficou a saber que o escalão foi apagado'
  );

  await pull(UTILIZADOR);
  assert.equal((await teams.listByClub(clube.id)).length, 0, 'o escalão voltou na descarga');
});

test('e o lugar fica livre para outro', async () => {
  // A licença de Treinador dá direito a um escalão. Quem apaga o seu para
  // recomeçar não pode ficar preso — é a mesma regra que já valia para o clube,
  // e é por isso que as listas contam só os que não estão arquivados.
  await limpar();
  const clube = await clubs.create({ name: 'Recomeçar' });
  const antigo = await teams.create(clube.id, { name: 'Séniores' });
  await teams.archive(antigo.id);

  const novo = await teams.create(clube.id, { name: 'Sub-19' });
  assert.ok(novo.id);
  assert.deepEqual((await teams.listByClub(clube.id)).map((t) => t.name), ['Sub-19']);
});

test('apagar um jogo sobe ao servidor e não volta na descarga', async () => {
  // Igual ao escalão, e o último sítio onde faltava: a tabela `matches` nem
  // sequer tinha coluna para isto até à migração 0016.
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);

  const clube = await clubs.create({ name: 'Com jogos' });
  const escalao = await teams.create(clube.id, { name: 'Séniores' });
  const jogo = await matches.create(escalao.id, { opponentName: 'Adversário' });
  await push(UTILIZADOR, 'treinador@exemplo.pt');

  await matches.archive(jogo.id);
  assert.equal((await matches.listByTeam(escalao.id)).length, 0, 'devia sair da lista logo');

  await push(UTILIZADOR, 'treinador@exemplo.pt');
  assert.ok(
    servidor.tabelas.matches.find((m) => m.id === jogo.id)?.archived_at,
    'o servidor não ficou a saber que o jogo foi apagado'
  );

  await pull(UTILIZADOR);
  assert.equal((await matches.listByTeam(escalao.id)).length, 0, 'o jogo voltou na descarga');
});

test('um jogo apagado a meio deixa de ser o "jogo em curso"', async () => {
  // O `findLiveMatch` vai à base directamente, sem passar pelas listas. Sem o
  // filtro, o painel ficava com a faixa "jogo em curso" a apontar para um jogo
  // que a pessoa tinha acabado de apagar.
  await limpar();
  const { findLiveMatch } = await import('../src/lib/data/repository.js');

  const clube = await clubs.create({ name: 'A jogar' });
  const escalao = await teams.create(clube.id, { name: 'Séniores' });
  const jogo = await matches.create(escalao.id, { opponentName: 'Adversário' });
  await events.append({
    ...A.matchCreated({ matchId: jogo.id }),
    eventType: EVENT.FIRST_HALF_STARTED,
    clientEventId: 'ev-inicio',
  });

  assert.equal((await findLiveMatch())?.id, jogo.id, 'devia estar em curso');
  await matches.archive(jogo.id);
  assert.equal(await findLiveMatch(), null, 'continuou a dar-se como em curso');
});

test('a competição apagada sai da lista e sobe arquivada', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);

  const clube = await clubs.create({ name: 'Com provas' });
  const escalao = await teams.create(clube.id, { name: 'Séniores' });
  const prova = (await competitions.listByTeam(escalao.id)).find((c) => c.name === 'Campeonato');
  await push(UTILIZADOR, 'treinador@exemplo.pt');

  await competitions.archive(prova.id);
  assert.equal((await competitions.listByTeam(escalao.id)).length, 2);

  await push(UTILIZADOR, 'treinador@exemplo.pt');
  assert.ok(
    servidor.tabelas.competitions.find((c) => c.id === prova.id)?.archived_at,
    'o servidor não ficou a saber'
  );
});

test('e os jogos dessa competição ficam sem prova, não apagados', async () => {
  // Era assim antes e continua a ser: apagar a prova não apaga o que se jogou
  // nela. Só deixa de haver prova associada.
  await limpar();
  const clube = await clubs.create({ name: 'Com provas' });
  const escalao = await teams.create(clube.id, { name: 'Séniores' });
  const prova = (await competitions.listByTeam(escalao.id)).find((c) => c.name === 'Taça');
  const jogo = await matches.create(escalao.id, {
    opponentName: 'Adversário',
    competitionId: prova.id,
  });

  await competitions.archive(prova.id);
  assert.equal((await matches.get(jogo.id)).competitionId, null);
  assert.equal((await matches.listByTeam(escalao.id)).length, 1, 'o jogo desapareceu');
});

/* ===================================================================
   Guardar sem rede
   ===================================================================

   O `saveNow` lançava quando não havia ligação, e quem o chamava fazia
   `await` antes de continuar — por isso a excepção levava com ela o resto
   do caminho, incluindo o `router.push` que abria o jogo. Não se conseguia
   começar um jogo num pavilhão sem rede, que é o único sítio onde esta app
   tem mesmo de funcionar.

   Estes testes prendem a regra nova: gravar é local, enviar é uma
   consequência, e a consequência nunca pode travar a gravação. */

test('sem servidor nenhum, guardar não atira e diz que não subiu', async () => {
  await limpar();
  setRemote(null);
  await cenario();

  const r = await saveNow(UTILIZADOR, 'treinador@exemplo.pt');
  assert.equal(r.guardado, false, 'não chegou ao servidor');
  assert.equal(r.status, SYNC.LOCAL);
  stop();
});

test('com o servidor a recusar, guardar também não atira', async () => {
  await limpar();
  setRemote(servidorFalso({ falhaEm: 'clubs' }));
  await cenario();

  const r = await saveNow(UTILIZADOR, 'treinador@exemplo.pt');
  assert.equal(r.guardado, false);
  assert.ok(r.pendentes > 0, 'e conta o que ficou por enviar');
  stop();
});

test('sem rede declarada pelo aparelho, o estado é offline e não é erro', async () => {
  await limpar();
  // Em Node o `navigator` existe e só tem leitura, por isso troca-se a
  // propriedade e repõe-se no fim — mexer no global de um teste que corre ao
  // lado dos outros é sempre emprestado, nunca dado.
  const antes = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: false },
    configurable: true,
  });
  try {
    setRemote(servidorFalso());
    await cenario();
    const r = await saveNow(UTILIZADOR, 'treinador@exemplo.pt');
    assert.equal(r.guardado, false);
    assert.equal(r.status, SYNC.OFFLINE);
  } finally {
    if (antes) Object.defineProperty(globalThis, 'navigator', antes);
    else delete globalThis.navigator;
    stop();
  }
});

test('com servidor a responder, guardar confirma e esvazia a fila', async () => {
  await limpar();
  setRemote(servidorFalso());
  await cenario();

  const r = await saveNow(UTILIZADOR, 'treinador@exemplo.pt');
  assert.equal(r.guardado, true);
  assert.equal(r.pendentes, 0);
});

test('um jogo começado sem rede sobe inteiro quando a rede volta', async () => {
  await limpar();
  setRemote(null);
  const { jogo } = await cenario();

  // O que a página do jogo faz ao carregar em "Começar": grava o evento e
  // pede para guardar. Sem rede, a segunda parte não pode estragar a primeira.
  const antesDoStart = await loadMatch(jogo.id);
  await events.append(A.startFirstHalf(antesDoStart.state, Date.now()));
  const semRede = await saveNow(UTILIZADOR, 'treinador@exemplo.pt');
  assert.equal(semRede.guardado, false);

  // O jogo arrancou à mesma, aqui no aparelho.
  const local = await loadMatch(jogo.id);
  assert.equal(local.state.currentPeriod, 1, 'a primeira parte começou sem rede');

  // Chega a rede: sobe tudo, incluindo o evento de arranque.
  const servidor = servidorFalso();
  setRemote(servidor);
  const comRede = await saveNow(UTILIZADOR, 'treinador@exemplo.pt');
  assert.equal(comRede.guardado, true);
  assert.equal(comRede.pendentes, 0);

  const tipos = servidor.tabelas.match_events.map((e) => e.event_type);
  assert.ok(tipos.includes(EVENT.FIRST_HALF_STARTED), 'o arranque chegou ao servidor');
});

/* ===================================================================
   Descarga incremental
   ===================================================================

   A descarga trazia tudo, sempre — sete `select *` sem filtro nenhum — e havia
   um temporizador a mandá-la fazer isso de três em três segundos. Numa época de
   vinte jogos são gigabytes de tráfego por tarde, para responder quase sempre
   "não mudou nada".

   Estes testes prendem as duas metades da correcção: a segunda descarga tem de
   vir vazia, e o que mudar entretanto tem de vir na mesma. */

/** Data ISO daqui a `n` segundos, para carimbar linhas do servidor à mão. */
const daqui = (n) => new Date(Date.now() + n * 1000).toISOString();

test('a segunda descarga não traz nada, se nada mudou', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  await cenario();
  await push(UTILIZADOR);

  // Da primeira vez, um dispositivo novo traz tudo.
  await limpar();
  const primeira = await pull(UTILIZADOR);
  assert.ok(primeira.pulled > 0, 'a primeira descarga traz o que lá está');

  // Da segunda, o servidor não tem nada de novo para dizer.
  const segunda = await pull(UTILIZADOR);
  assert.equal(segunda.pulled, 0, 'a segunda não devia trazer linha nenhuma');
});

test('a pergunta leve evita selects quando nada mudou', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { clube } = await cenario();
  await push(UTILIZADOR);

  await limpar();
  await pull(UTILIZADOR);

  const selectsAntes = servidor.chamadas.selects;
  assert.equal(await hasRemoteChanges(UTILIZADOR), false, 'as marcas iguais não pedem descarga');
  assert.equal(servidor.chamadas.selects, selectsAntes, 'não devia tocar nas tabelas grandes');

  const i = servidor.tabelas.clubs.findIndex((c) => c.id === clube.id);
  servidor.tabelas.clubs[i] = { ...servidor.tabelas.clubs[i], updated_at: daqui(60) };

  assert.equal(await hasRemoteChanges(UTILIZADOR), true, 'uma marca maior pede descarga');
});

test('mas traz o que mudou depois da última vez', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { clube } = await cenario();
  await push(UTILIZADOR);

  await limpar();
  await pull(UTILIZADOR);
  assert.equal((await pull(UTILIZADOR)).pulled, 0, 'e antes de mexer, nada');

  // Alguém mudou o nome noutro dispositivo, e o servidor carimbou a linha.
  const i = servidor.tabelas.clubs.findIndex((c) => c.id === clube.id);
  servidor.tabelas.clubs[i] = {
    ...servidor.tabelas.clubs[i],
    name: 'Nome novo',
    updated_at: daqui(60),
  };

  const r = await pull(UTILIZADOR);
  assert.equal(r.pulled, 1, 'só a linha que mudou');
  assert.equal((await clubs.get(clube.id)).name, 'Nome novo');
});

test('esquecer a marca faz voltar a trazer tudo', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  await cenario();
  await push(UTILIZADOR);

  await limpar();
  await pull(UTILIZADOR);
  assert.equal((await pull(UTILIZADOR)).pulled, 0);

  // É o que o "limpar dispositivo" faz: sem isto, a base ficava vazia e a
  // descarga a seguir não trazia nada, por já ter dado o histórico por visto.
  await limpar();
  assert.ok((await pull(UTILIZADOR)).pulled > 0, 'depois de esquecer, traz tudo');
});

test('sem clubes por mudar, os jogos novos chegam à mesma', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);
  const { escalao, clube } = await cenario();
  await push(UTILIZADOR);

  await limpar();
  await pull(UTILIZADOR);

  // Um jogo novo, sem tocar no clube. Antes, os ids dos clubes saíam da própria
  // descarga: com o clube a não mudar, a lista vinha vazia e a app nem chegava a
  // perguntar pelos jogos.
  servidor.tabelas.matches.push({
    id: '99999999-9999-4999-8999-999999999999',
    club_id: clube.id,
    team_id: escalao.id,
    opponent_name: 'Jogo de outro aparelho',
    status: 'DRAFT',
    updated_at: daqui(60),
  });

  const r = await pull(UTILIZADOR);
  assert.equal(r.pulled, 1, 'o jogo novo tinha de vir, e só ele');
});

test('servidor antigo sem updated_at nos eventos ainda descarrega o resultado', async () => {
  await limpar();
  const servidor = servidorFalso({ semUpdatedAtEventos: true });
  setRemote(servidor);
  const { jogo } = await cenario();

  const antes = await loadMatch(jogo.id);
  await events.append(A.startFirstHalf(antes.state, Date.now()));
  const aMeio = await loadMatch(jogo.id);
  await events.append(A.goal(aMeio.state, EVENT.TEAM_GOAL_ADDED));
  const comGolo = await loadMatch(jogo.id);
  await events.append(A.finishFirstHalf(comGolo.state));
  const aoIntervalo = await loadMatch(jogo.id);
  await events.append(A.setSecondHalfLineup(aoIntervalo.state, {}, Date.now()));
  const comCincoDaSegunda = await loadMatch(jogo.id);
  await events.append(A.startSecondHalf(comCincoDaSegunda.state, Date.now()));
  const segundaParte = await loadMatch(jogo.id);
  await events.append(A.finishMatch(segundaParte.state));
  await push(UTILIZADOR);

  await limpar();
  setRemote(servidor);
  await pull(UTILIZADOR);

  assert.equal((await db.all(db.STORES.matchEvents)).length, servidor.tabelas.match_events.length);
  const local = await loadMatch(jogo.id);
  assert.equal(local.state.status, 'FINISHED');
  assert.equal(local.state.teamScore, 1);
});

test('uma época com mais de mil eventos chega inteira', async () => {
  await limpar();
  const servidor = servidorFalso();
  setRemote(servidor);

  const { clube, escalao, jogo } = await cenario();
  await push(UTILIZADOR);

  // O PostgREST corta nas mil linhas e devolve 200 na mesma. Sem paginação, uma
  // época a sério chegava truncada — e, com a marca de água, o que ficasse de
  // fora nunca mais seria pedido.
  for (let i = 0; i < 2500; i++) {
    servidor.tabelas.match_events.push({
      id: `ev-${i}`,
      match_id: jogo.id,
      seq: 1000 + i,
      event_type: 'TEAM_FOUL_ADDED',
      period: 1,
      match_elapsed_ms: i * 10,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
    });
  }

  await limpar();
  await pull(UTILIZADOR);

  const cá = (await db.all(db.STORES.matchEvents)).length;
  assert.ok(cá >= 2500, `só chegaram ${cá} eventos dos 2500`);
});

test('e a segunda descarga continua a não trazer nada', async () => {
  // O par do teste anterior: paginar não pode estragar a marca de água.
  const servidor = servidorFalso();
  await limpar();
  setRemote(servidor);
  await cenario();
  await push(UTILIZADOR);
  for (let i = 0; i < 1500; i++) {
    servidor.tabelas.match_events.push({
      id: `x-${i}`,
      match_id: servidor.tabelas.matches[0].id,
      seq: 5000 + i,
      event_type: 'TEAM_FOUL_ADDED',
      updated_at: new Date(Date.UTC(2026, 0, 2, 0, 0, i)).toISOString(),
    });
  }
  await limpar();
  await pull(UTILIZADOR);
  assert.equal((await pull(UTILIZADOR)).pulled, 0, 'a segunda passagem devia vir vazia');
});
