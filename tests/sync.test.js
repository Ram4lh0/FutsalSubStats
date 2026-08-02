// tests/sync.test.js
// A fila de sincronização testada sem rede e sem browser: o IndexedDB cai para
// memória sozinho em Node, e o servidor é um duplo que regista o que recebeu.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as db from '../src/lib/data/local.js';
import { clubs, teams, competitions, players, matches, squad, events } from '../src/lib/data/repository.js';
import { flush, push, pull, setRemote } from '../src/lib/data/sync.js';
import { restore, dump } from '../src/lib/data/repository.js';
import * as A from '../src/domain/actions.js';
import { EVENT, LOCATION } from '../src/domain/constants.js';

const UTILIZADOR = '11111111-1111-4111-8111-111111111111';

/** Servidor de mentira: guarda o que recebe e conta as chamadas. */
function servidorFalso({ falhaEm } = {}) {
  const tabelas = {
    profiles: [], clubs: [], teams: [], competitions: [],
    players: [], matches: [], match_squad: [], match_events: [],
  };
  const chamadas = { upserts: 0, rpc: 0 };

  const query = (nome) => ({
    upsert(rows) {
      if (falhaEm === nome) return Promise.resolve({ error: new Error('sem rede') });
      chamadas.upserts += 1;
      // O Supabase aceita uma linha ou uma lista; o duplo faz o mesmo.
      for (const r of Array.isArray(rows) ? rows : [rows]) {
        const i = tabelas[nome].findIndex((x) => x.id === r.id);
        if (i >= 0) tabelas[nome][i] = r;
        else tabelas[nome].push(r);
      }
      return Promise.resolve({ error: null });
    },
    select() {
      const res = {
        data: tabelas[nome],
        error: null,
        eq: () => res,
        in: () => res,
        order: () => res,
        then: (fn) => Promise.resolve({ data: tabelas[nome], error: null }).then(fn),
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
    async rpc(_fn, { payload }) {
      chamadas.rpc += 1;
      // Como no servidor: o mesmo client_event_id não entra duas vezes.
      if (tabelas.match_events.some((e) => e.client_event_id === payload.client_event_id)) {
        return { error: null };
      }
      tabelas.match_events.push({ ...payload, seq: tabelas.match_events.length + 1 });
      return { error: null };
    },
  };
}

async function limpar() {
  await db.clearAll();
}

async function cenario() {
  const clube = await clubs.create({ name: 'Patameiras', shortName: 'PAT' });
  const escalao = await teams.create(clube.id, { name: 'Séniores', timing: 'UNTIMED' });
  const prova = await competitions.create(escalao.id, { name: 'Campeonato' });
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
  assert.equal(servidor.tabelas.competitions.length, 1, 'a competição subiu');
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

  const segundo = await clubs.create({ name: 'Segundo' });
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
