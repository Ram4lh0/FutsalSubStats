// tests/sync.test.js
// A fila de sincronização testada sem rede e sem browser: o IndexedDB cai para
// memória sozinho em Node, e o servidor é um duplo que regista o que recebeu.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as db from '../src/lib/data/local.js';
import { clubs, teams, competitions, players, matches, squad, events, loadMatch } from '../src/lib/data/repository.js';
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
    // A descarga passou a fazer duas perguntas novas: a licença da conta e os
    // acessos por escalão.
    team_access: [],
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
        // O `trazerLicenca` pede uma linha só. Sem isto, o duplo não tinha
        // resposta e o `catch` engolia a falha — o teste passaria sem testar.
        maybeSingle: () => Promise.resolve({ data: (tabelas[nome] || [])[0] ?? null, error: null }),
        then: (fn) => Promise.resolve({ data: tabelas[nome] || [], error: null }).then(fn),
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

test('com licença de clube, criam-se os escalões todos', async () => {
  await limpar();
  const clube = await clubs.create({ name: 'Com licença' });
  const perfil = (await db.all(db.STORES.profile))[0];
  await db.put(db.STORES.profile, { ...perfil, licenca: 'clube' });

  await teams.create(clube.id, { name: 'Séniores' });
  await teams.create(clube.id, { name: 'Sub-19' });
  await teams.create(clube.id, { name: 'Sub-15' });

  assert.equal((await teams.listByClub(clube.id)).length, 3);
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
