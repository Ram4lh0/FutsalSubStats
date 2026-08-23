// lib/data/sync.js
// Sincronização com o Supabase, num sentido de cada vez.
//
// A app escreve sempre primeiro no dispositivo. Este ficheiro trata do resto:
// empurra o que ficou por enviar quando há rede, e traz o que existe no servidor
// quando se entra noutro dispositivo. Nunca bloqueia a interface — se falhar,
// tenta outra vez mais tarde e o treinador nem dá por isso.

import * as db from './local.js';
import { t } from '../i18n/index.js';
import {
  clubMapper,
  teamMapper,
  competitionMapper,
  playerMapper,
  matchMapper,
  squadMapper,
  eventMapper,
} from './mappers.js';

// Códigos, não frases. Antes o valor era o próprio texto em português, o que
// funcionava enquanto houve uma língua só — depois seria o estado da
// sincronização a mudar de valor conforme o idioma do ecrã. Quem mostra isto
// traduz com `syncLabel()`; aqui só interessa distinguir os cinco casos.
export const SYNC = {
  SYNCED: 'SYNCED',
  PENDING: 'PENDING',
  OFFLINE: 'OFFLINE',
  ERROR: 'ERROR',
  LOCAL: 'LOCAL',
};

export const DATA_CHANGED_EVENT = 'futsal:data-changed';
export const DATA_UPDATED_EVENT = 'futsal:data-updated';

/**
 * O servidor entra por aqui, não por importação.
 *
 * Assim este ficheiro não sabe o que é o Supabase: recebe um objecto que sabe
 * falar com ele. É o que permite testar a fila inteira sem rede — e o que
 * permitiria trocar de servidor sem tocar na lógica de sincronização.
 */
let remoto = null;

export function setRemote(client) {
  remoto = client;
  if (!client) set({ status: SYNC.LOCAL });
}

const supabase = () => remoto;

const listeners = new Set();
let estado = { status: SYNC.LOCAL, pending: 0, online: true, lastSyncAt: null, error: null };
let aCorrer = false;
let repetirDepois = null;
let repetirPromise = null;
let resolverRepetir = null;
let retryMs = 2000;
let proximaTentativa = null;

export function subscribe(fn) {
  listeners.add(fn);
  fn(estado);
  return () => listeners.delete(fn);
}

/** O estado agora, para quem precisa de o ler uma vez e não de o seguir. */
export function estadoAtual() {
  return estado;
}

export function notifyLocalChange() {
  pendingCount();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(DATA_UPDATED_EVENT));
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}

function notifyDataUpdated() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_UPDATED_EVENT));
}

function set(patch) {
  estado = { ...estado, ...patch };
  for (const fn of listeners) fn(estado);
}

function online() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/* ------------------------------------------------------------------ envio */

async function dirtyRows(store) {
  return (await db.all(store)).filter((r) => r.dirty);
}

async function clean(store, rows) {
  if (!rows.length) return;
  await db.putMany(
    store,
    rows.map((r) => ({ ...r, dirty: false }))
  );
}

/**
 * Sobras do modelo antigo.
 *
 * Quando o clube passou a ter escalões, a base do servidor foi migrada — mas a
 * base que vive dentro do browser não: ganhou as tabelas novas e ficou com os
 * jogadores e os jogos de antes, sem escalão nenhum. O servidor recusa-os
 * ("team_id não pode ser nulo") e, como o envio pára no primeiro erro, uma
 * linha órfã de há meses bloqueava tudo o que viesse a seguir.
 *
 * Aqui: se o clube tiver um único escalão, a linha é adotada por ele — é o que
 * a migração do servidor fez. Se não houver por onde decidir, a linha deixa de
 * ser dada como pendente: fica guardada no dispositivo, mas para de encravar a
 * fila. Quem quiser mesmo limpar tem o botão "Limpar este dispositivo".
 */
async function sanearOrfaos() {
  const escaloes = await db.all(db.STORES.teams);
  const porClube = new Map();
  for (const t of escaloes) {
    if (!porClube.has(t.clubId)) porClube.set(t.clubId, []);
    porClube.get(t.clubId).push(t);
  }

  let adotados = 0;
  const orfaos = { players: new Set(), matches: new Set() };

  // TODAS as linhas, não só as pendentes. Um jogador antigo pode estar limpo e
  // ser enviado à mesma, por ser pai de uma convocatória que está pendente — e
  // era exactamente por aí que este erro voltava.
  for (const store of [db.STORES.players, db.STORES.matches]) {
    for (const linha of await db.all(store)) {
      if (linha.teamId) continue;
      const candidatos = porClube.get(linha.clubId) || [];
      if (candidatos.length === 1) {
        await db.put(store, { ...linha, teamId: candidatos[0].id, dirty: true });
        adotados += 1;
      } else {
        // Sem escalão onde encaixar: fica guardada no dispositivo, mas não sobe.
        await db.put(store, { ...linha, dirty: false });
        orfaos[store].add(linha.id);
      }
    }
  }
  return { adotados, orfaos };
}

/**
 * Empurra o que está por enviar. A ordem importa: um jogador não pode chegar
 * antes do clube, nem um evento antes do jogo a que pertence — as chaves
 * estrangeiras do Postgres recusariam a linha.
 */
export async function push(userId, email) {
  const sb = supabase();
  if (!sb || !userId) return { pushed: 0 };

  let total = 0;

  const { adotados, orfaos } = await sanearOrfaos();
  if (adotados || orfaos.players.size || orfaos.matches.size) {
    console.warn(
      `sobras do modelo antigo: ${adotados} adotadas por um escalão, ` +
        `${orfaos.players.size + orfaos.matches.size} sem escalão onde encaixar.`
    );
  }

  const clubesSujos = await dirtyRows(db.STORES.clubs);
  const escaloesSujos = await dirtyRows(db.STORES.teams);
  const competicoesSujas = await dirtyRows(db.STORES.competitions);
  const jogadoresSujos = await dirtyRows(db.STORES.players);
  const jogosSujos = await dirtyRows(db.STORES.matches);
  const convocadosSujosBase = await dirtyRows(db.STORES.matchSquad);
  const eventos = (await db.all(db.STORES.matchEvents))
    .filter((e) => !e.syncedAt)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  if (
    !clubesSujos.length &&
    !escaloesSujos.length &&
    !competicoesSujas.length &&
    !jogadoresSujos.length &&
    !jogosSujos.length &&
    !convocadosSujosBase.length &&
    !eventos.length
  ) {
    return { pushed: 0 };
  }

  // A fila corre de poucos em poucos segundos, e uma dessas passagens pode
  // apanhar o utilizador a sair. Quando chegasse ao servidor a sessão já não
  // existia, e a primeira escrita — o perfil — era recusada pela segurança por
  // linha: "new row violates row-level security policy". Nada se perdia, mas o
  // erro aparecia sempre a quem carregava em Sair.
  //
  // Confirmar de quem é a sessão ANTES de escrever resolve-o na origem.
  //
  // ## Porque é que o `getSession` não chega
  //
  // Ele devolve o que está guardado no aparelho, sem perguntar a ninguém. Uma
  // sessão expirada cuja renovação falhou continua lá, com o utilizador certo —
  // e passa nesta verificação. Só que os pedidos que se seguem seguem sem
  // credencial válida: para o servidor são anónimos, o `auth.uid()` é nulo, e
  // todas as políticas de escrita recusam com a mesma frase que uma falta de
  // permissão a sério.
  //
  // O `getUser` pergunta ao servidor. É um pedido a mais de vez em quando, e é o
  // que separa "não tens autorização" de "a tua sessão morreu" — duas coisas com
  // a mesma mensagem e soluções opostas.
  if (typeof sb.auth?.getSession === 'function') {
    const { data } = await sb.auth.getSession();
    if (data?.session?.user?.id !== userId) return { pushed: 0 };

    const expirado = (data.session.expires_at || 0) * 1000 < Date.now();
    if (expirado && typeof sb.auth.getUser === 'function') {
      const { data: quem, error: erroQuem } = await sb.auth.getUser();
      if (erroQuem || quem?.user?.id !== userId) {
        const erro = new Error(t('sinc.sessaoExpirada'));
        erro.chave = 'sinc.sessaoExpirada';
        throw erro;
      }
    }
  }

  // O clube aponta para uma linha em `profiles`. Ela é criada por um gatilho
  // quando a conta nasce, mas contas criadas antes do gatilho existir ficariam
  // sem perfil — e o clube seria recusado por chave estrangeira. Garantir aqui
  // custa um pedido e evita um erro que ninguém saberia explicar.
  {
    const { error } = await sb.from('profiles').upsert({ id: userId, email: email || null });
    if (error) throw etiqueta(error, 'profiles');
  }

  // O que está por enviar, e com ele os pais de que depende.
  //
  // Um jogo só entra se o clube já lá estiver — é isso que a política de
  // segurança do Postgres verifica, e é por aí que rebentava quando se
  // restaurava um backup: as linhas antigas não estavam marcadas como pendentes,
  // e o jogo novo chegava ao servidor sem clube nenhum onde assentar.
  // Uma convocatória que aponte para um jogador que não pode subir também não
  // sobe: chegaria ao servidor sem o jogador a que se refere. O jogo fica para
  // trás inteiro, em vez de ir pela metade.
  const convocadosSujos = convocadosSujosBase.filter(
    (c) => !orfaos.players.has(c.playerId) && !orfaos.matches.has(c.matchId)
  );

  const jogosNecessarios = new Set([
    ...convocadosSujos.map((s) => s.matchId),
    ...eventos.map((e) => e.matchId),
  ]);
  const jogos = (await comPais(db.STORES.matches, jogosSujos, jogosNecessarios)).filter(
    (m) => m.teamId && !orfaos.matches.has(m.id)
  );

  const jogadoresNecessarios = new Set(convocadosSujos.map((s) => s.playerId));
  const jogadores = (await comPais(db.STORES.players, jogadoresSujos, jogadoresNecessarios)).filter(
    (p) => p.teamId && !orfaos.players.has(p.id)
  );

  // A competição é pai do jogo, e o escalão é pai de tudo o resto.
  const competicoesNecessarias = new Set(jogos.map((m) => m.competitionId).filter(Boolean));
  const competicoes = await comPais(
    db.STORES.competitions,
    competicoesSujas,
    competicoesNecessarias
  );

  const escaloesNecessarios = new Set([
    ...jogadores.map((p) => p.teamId),
    ...jogos.map((m) => m.teamId),
    ...competicoes.map((c) => c.teamId),
  ]);
  const escaloes = await comPais(db.STORES.teams, escaloesSujos, escaloesNecessarios);

  const clubesNecessarios = new Set([
    ...jogadores.map((p) => p.clubId),
    ...jogos.map((m) => m.clubId),
    ...escaloes.map((t) => t.clubId),
  ]);
  // Só os clubes que são desta conta.
  //
  // O `comPais` traz os pais de que as linhas dependem, e o pai de um escalão é
  // o clube. Isso era inofensivo enquanto tudo o que estava na base local tinha
  // sido criado aqui. Deixou de ser: um treinador associado tem na base o clube
  // do gerente, e a fila reenviava-o **carimbado como sendo dele** —
  // `toRow(c, userId)` põe sempre o `owner_id` de quem está a enviar.
  //
  // O servidor recusa, e bem: `new row violates row-level security policy for
  // table "clubs"`. Mas a mensagem aponta para o clube quando o que a pessoa
  // fez foi criar um escalão, e não há forma de adivinhar a ligação.
  //
  // Um clube que não é nosso já está no servidor — foi de lá que veio. Não há
  // nada para enviar.
  const clubes = (await comPais(db.STORES.clubs, clubesSujos, clubesNecessarios))
    .filter((c) => !c.ownerId || c.ownerId === userId);

  if (clubes.length) {
    const { error } = await sb
      .from('clubs')
      // `c.ownerId` quando se sabe, senão quem está a enviar: um clube criado
      // sem rede ainda não tem dono gravado, e é de quem o criou.
      .upsert(clubes.map((c) => clubMapper.toRow(c, c.ownerId || userId)));
    if (error) {
      // Antes de acusar as políticas, perguntar ao servidor se ele ainda sabe
      // quem somos. Uma sessão morta dá exactamente este erro — e a verificação
      // proactiva lá em cima só apanha o caso em que a validade já passou, o que
      // não cobre um token revogado nem um relógio desacertado.
      //
      // Aqui é o sítio certo para perguntar: só custa um pedido quando algo já
      // correu mal, e distingue "não tens autorização" de "entra outra vez".
      if (/42501|row-level security/i.test(`${error.code} ${error.message}`)) {
        const { data: quem } = (await sb.auth?.getUser?.()) || {};
        if (quem?.user?.id !== userId) {
          const morta = new Error(t('sinc.sessaoExpirada'));
          morta.chave = 'sinc.sessaoExpirada';
          throw morta;
        }
      }
      // A mensagem do Postgres diz "new row violates row-level security policy
      // for table clubs" e mais nada. Com dois clubes na base local — o meu e o
      // de um clube a que estou associado — isso não chega para saber qual foi
      // recusado, nem com que dono ia carimbado. Sem isto, o diagnóstico é
      // adivinhação.
      const detalhe = clubes
        .map((c) => `${c.name}[${c.id.slice(0, 8)} dono=${c.ownerId || 'null→' + userId}]`)
        .join(', ');
      throw etiqueta(error, `clubs (${detalhe})`);
    }
    // O dono volta para a linha local.
    //
    // O clube nasce sem dono e é aqui que ele é decidido — mas até agora essa
    // decisão só existia do lado do servidor: a linha local ficava com `ownerId`
    // a nulo até uma descarga a reescrever, e podiam passar dias. Nesse
    // intervalo a app não sabia de quem era o seu próprio clube.
    await clean(
      db.STORES.clubs,
      clubes.map((c) => ({ ...c, ownerId: c.ownerId || userId }))
    );
    total += clubes.length;
  }

  // O mesmo detalhe para as tabelas seguintes: qual linha, e a que escalão ou
  // clube pertence. É o que separa "não tenho acesso" de "mandei a linha errada".
  const detalharLinhas = (linhas) =>
    linhas
      .map((r) => `${r.name || r.id}[${String(r.id).slice(0, 8)}]`)
      .slice(0, 5)
      .join(', ');

  for (const [store, mapper, linhas] of [
    [db.STORES.teams, teamMapper, escaloes],
    [db.STORES.competitions, competitionMapper, competicoes],
    [db.STORES.players, playerMapper, jogadores],
    [db.STORES.matches, matchMapper, jogos],
    [db.STORES.matchSquad, squadMapper, convocadosSujos],
  ]) {
    if (!linhas.length) continue;
    const { error } = await sb.from(mapper.table).upsert(linhas.map((r) => mapper.toRow(r)));
    if (error) throw etiqueta(error, `${mapper.table} (${detalharLinhas(linhas)})`);
    await clean(store, linhas);
    total += linhas.length;
  }

  // Eventos: um a um, pela função que ignora repetições. Reenviar a fila inteira
  // depois de uma falha a meio não duplica nada. Os de jogos que ficaram para
  // trás esperam pela sua vez — chegariam a um jogo que o servidor não tem.
  const jogosEnviaveis = new Set(jogos.map((m) => m.id));
  for (const ev of eventos) {
    if (!jogosEnviaveis.has(ev.matchId)) continue;
    const { error } = await sb.rpc('append_match_event', { payload: eventMapper.toPayload(ev) });
    if (error) throw etiqueta(error, 'match_events');
    if (ev.undoneAt) {
      // O "desfazer" viaja como marca na linha original; o EVENT_UNDONE que o
      // acompanha garante o mesmo resultado mesmo que esta marca falhe.
      await sb
        .from('match_events')
        .update({ undone_at: new Date(ev.undoneAt).toISOString() })
        .eq('client_event_id', ev.clientEventId || ev.id);
    }
    await db.put(db.STORES.matchEvents, { ...ev, syncedAt: Date.now() });
    total += 1;
  }

  return { pushed: total };
}

/* ------------------------------------------------------------- descarga */

/**
 * Traz do servidor o que ainda não existe aqui. Linhas locais por enviar nunca
 * são pisadas: o que está no dispositivo é mais recente por definição, porque
 * ainda nem chegou lá acima.
 */
/* --------------------------------------------------- a marca de água */

/**
 * Até onde é que já descarregámos, tabela a tabela.
 *
 * ## Porque é que a marca vem do servidor e não do relógio daqui
 *
 * A tentação é guardar `Date.now()` no fim de cada descarga. Não serve: o
 * relógio do telemóvel e o do servidor não estão acertados, e bastam uns
 * segundos de diferença para uma linha escrita nesse intervalo nunca mais ser
 * pedida. A marca é o maior `updated_at` que **veio nas linhas**, que é um
 * instante medido pelo mesmo relógio que as carimbou.
 *
 * ## Porque é que é uma marca por tabela, e não uma só
 *
 * Uma descarga são sete perguntas seguidas, e o mundo não pára entre elas. Com
 * uma marca única — o maior carimbo de todas as tabelas — uma linha escrita
 * numa tabela **depois** de a pergunta dela já ter passado, mas com um carimbo
 * mais antigo do que o de outra tabela perguntada a seguir, ficava para trás da
 * marca e não voltava a ser pedida. Perdia-se em silêncio.
 *
 * Com uma marca por tabela isso não acontece: cada tabela é comparada consigo
 * própria. Uma linha escrita depois da sua pergunta tem forçosamente um carimbo
 * maior do que o que essa pergunta devolveu, e entra na descarga seguinte.
 */
const CHAVE_MARCA = 'futsal-sync-desde';

// Cópia em memória, para quando não há `localStorage` — um browser em modo
// restrito, ou os testes.
let marcasEmMemoria = {};

function marcasDe(userId) {
  if (!userId) return {};
  try {
    const bruto = window.localStorage.getItem(`${CHAVE_MARCA}:${userId}`);
    if (bruto) return JSON.parse(bruto);
  } catch {
    /* sem localStorage, ou lixo lá dentro: vale o que está em memória */
  }
  return marcasEmMemoria[userId] || {};
}

function guardarMarcas(userId, marcas) {
  if (!userId) return;
  marcasEmMemoria[userId] = marcas;
  try {
    window.localStorage.setItem(`${CHAVE_MARCA}:${userId}`, JSON.stringify(marcas));
  } catch {
    /* fica só em memória */
  }
}

/**
 * Esquecer as marcas: a próxima descarga volta a trazer tudo.
 *
 * Serve o "limpar dispositivo" e o apagar da conta — depois de deitar a base
 * fora, uma descarga incremental não traria nada e o ecrã ficava vazio.
 */
export function esquecerMarca(userId) {
  if (userId) delete marcasEmMemoria[userId];
  else marcasEmMemoria = {};
  try {
    if (userId) window.localStorage.removeItem(`${CHAVE_MARCA}:${userId}`);
  } catch {
    /* não havia nada para tirar */
  }
}

const TABELAS_COM_MARCA = [
  'profiles',
  'clubs',
  'teams',
  'competitions',
  'players',
  'matches',
  'match_squad',
  'match_events',
];

/**
 * Pergunta leve: antes de descarregar sete tabelas, pergunta só as marcas máximas
 * que existem no servidor. A resposta tem poucas linhas e quase não gasta egress.
 */
export async function hasRemoteChanges(userId) {
  const sb = supabase();
  if (!sb || !userId) return false;

  const marcas = marcasDe(userId);
  if (!Object.keys(marcas).length) return true;

  try {
    const { data, error } = await sb.rpc('sync_watermarks');
    if (error) throw error;
    if (!Array.isArray(data)) return true;

    const remotas = new Map(data.map((r) => [r.tabela, r.marca]));
    for (const tabela of TABELAS_COM_MARCA) {
      const remota = remotas.get(tabela);
      if (!remota) continue;
      if (!marcas[tabela] || remota > marcas[tabela]) return true;
    }
    return false;
  } catch {
    // Servidor antigo: volta ao comportamento seguro, que é descarregar.
    return true;
  }
}

/**
 * Quantas linhas o servidor devolve de uma vez, e quantas nós pedimos.
 *
 * O PostgREST tem um tecto configurado no projecto (mil, por omissão) e **corta
 * em silêncio**: devolve as primeiras mil linhas com um `200 OK`, exactamente
 * como devolveria uma lista completa. Não há erro, não há aviso.
 *
 * Enquanto a descarga trazia tudo de cada vez, isto era um bug adormecido: uma
 * época com mais de mil eventos chegava truncada, mas chegava sempre igual.
 * Com a marca de água passaria a ser perda de dados a sério — a marca avançava
 * com o carimbo mais alto das mil que vieram, e as que ficaram de fora nunca
 * mais seriam pedidas.
 *
 * Daí pedir por páginas até vir uma incompleta. Uma época a sério — vinte jogos,
 * quatro mil eventos — são quatro pedidos em vez de um, e chegam os quatro mil.
 */
const PAGINA = 1000;

/**
 * Corre uma consulta até ao fim, página a página.
 *
 * `fazer(de, ate)` tem de devolver a consulta já montada com o intervalo.
 */
async function todas(fazer) {
  const linhas = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await fazer(de, de + PAGINA - 1);
    if (error) throw error;
    const lote = data || [];
    linhas.push(...lote);
    // Uma página incompleta é a última. Uma página cheia pode ser a última
    // também — nesse caso a volta seguinte vem vazia e pára aqui na mesma.
    if (lote.length < PAGINA) return linhas;
  }
}

/** O maior `updated_at` de um lote, comparado como texto ISO (que ordena bem). */
function maiorData(linhas, ateAgora) {
  let maior = ateAgora;
  for (const l of linhas || []) {
    const d = l.updated_at || l.created_at;
    if (d && (!maior || d > maior)) maior = d;
  }
  return maior;
}

export async function pull(userId) {
  const sb = supabase();
  if (!sb || !userId) return { pulled: 0 };
  let total = 0;

  const marcas = marcasDe(userId);
  const novas = { ...marcas };

  /**
   * Pede uma tabela inteira: só o que mudou, e por páginas.
   *
   * `montar()` devolve a consulta de raiz — é chamada uma vez por página, porque
   * o construtor do Supabase guarda estado e não se pode reutilizar.
   */
  const trazer = async (tabela, montar) => {
    const linhas = await todas((de, ate) => {
      const q = montar();
      // Só filtra quando há por onde: sem marca para aquela tabela, a consulta
      // traz tudo — que é o que um aparelho novo precisa.
      return (marcas[tabela] ? q.gt('updated_at', marcas[tabela]) : q).range(de, ate);
    });
    novas[tabela] = maiorData(linhas, marcas[tabela]);
    return linhas;
  };

  // A licença decide quantos escalões se podem criar, e a app tem de a saber sem
  // rede. Vem primeiro porque é a resposta mais barata e a que menos depende do
  // resto: se tudo o que vem a seguir falhar, ao menos isto ficou actualizado.
  const perfil = await trazerLicenca(sb, userId);
  if (perfil) novas.profiles = maiorData([perfil], marcas.profiles);

  // Sem `owner_id`: quem filtra é a segurança por linha do servidor.
  //
  // Enquanto uma conta só via o que tinha criado, filtrar aqui era o mesmo que
  // filtrar lá e poupava trabalho ao servidor. Com clubes partilhados deixou de
  // ser: um treinador associado não é dono de nada, e com este filtro recebia
  // uma lista vazia — a app abria sem clube nenhum e sem nada que explicasse
  // porquê. O servidor já sabe quem pode ver o quê; a pergunta certa é "o que é
  // que eu posso ver", não "o que é que eu criei".
  const clubes = await trazer('clubs', () => sb.from('clubs').select('*'));
  total += await merge(db.STORES.clubs, clubes.map(clubMapper.fromRow));

  // Daqui para baixo os ids são os de casa: a descarga pode ter trazido zero
  // clubes e haver jogos novos à mesma.
  const ids = (await db.all(db.STORES.clubs)).map((c) => c.id);
  if (!ids.length) return { pulled: total };

  const escaloes = await trazer('teams', () =>
    sb.from('teams').select('*').in('club_id', ids)
  );
  total += await merge(db.STORES.teams, escaloes.map(teamMapper.fromRow));

  // Os níveis de acesso são calculados sobre o retrato completo, e não só sobre
  // o que mudou agora: um escalão que não mexeu continua a precisar do seu.
  await marcarNiveis(
    sb,
    userId,
    (await db.all(db.STORES.clubs)).map((c) => ({ id: c.id, owner_id: c.ownerId })),
    (await db.all(db.STORES.teams)).map((t) => ({ id: t.id, club_id: t.clubId }))
  );

  const escalaoIds = (await db.all(db.STORES.teams)).map((t) => t.id);
  if (escalaoIds.length) {
    const comps = await trazer('competitions', () =>
      sb.from('competitions').select('*').in('team_id', escalaoIds)
    );
    total += await merge(db.STORES.competitions, comps.map(competitionMapper.fromRow));
  }

  const jogadores = await trazer('players', () =>
    sb.from('players').select('*').in('club_id', ids)
  );
  total += await merge(db.STORES.players, jogadores.map(playerMapper.fromRow));

  const jogos = await trazer('matches', () =>
    sb.from('matches').select('*').in('club_id', ids)
  );
  total += await merge(db.STORES.matches, jogos.map(matchMapper.fromRow));

  const jogoIds = (await db.all(db.STORES.matches)).map((m) => m.id);
  if (!jogoIds.length) {
    guardarMarcas(userId, novas);
    if (total) notifyDataUpdated();
    return { pulled: total };
  }

  const convocados = await trazer('match_squad', () =>
    sb.from('match_squad').select('*').in('match_id', jogoIds)
  );
  total += await merge(db.STORES.matchSquad, convocados.map(squadMapper.fromRow));

  // Ordenado por `updated_at`: com páginas, a ordem tem de ser a mesma em que
  // se corta, senão a página 2 podia repetir linhas da 1 e saltar outras.
  let eventos;
  try {
    eventos = await trazer('match_events', () =>
      sb
        .from('match_events')
        .select('*')
        .in('match_id', jogoIds)
        .order('updated_at', { ascending: true })
    );
  } catch (err) {
    if (!/updated_at|42703|column .* does not exist/i.test(`${err?.code || ''} ${err?.message || err}`)) {
      throw err;
    }
    eventos = await todas((de, ate) =>
      sb
        .from('match_events')
        .select('*')
        .in('match_id', jogoIds)
        .order('seq', { ascending: true })
        .range(de, ate)
    );
  }
  total += await merge(db.STORES.matchEvents, eventos.map(eventMapper.fromRow));

  guardarMarcas(userId, novas);
  if (total) notifyDataUpdated();
  return { pulled: total };
}

/**
 * Traz a licença da conta e guarda-a no perfil deste aparelho.
 *
 * O perfil sempre subiu e nunca desceu — não havia nada lá em cima que a app
 * precisasse de saber. A licença mudou isso: é definida por nós no painel, do
 * lado do servidor, e a app tem de a conhecer para decidir sem rede se pode
 * criar mais um escalão.
 *
 * Falhar aqui não pode parar a sincronização. Sem resposta, fica o que já
 * estava; e o que já estava, na pior das hipóteses, é `treinador` — o valor mais
 * restrito. Uma app que recuse de mais explica-se; uma que permita de mais deixa
 * criar coisas que o servidor vai recusar mais tarde, longe daqui.
 */
async function trazerLicenca(sb, userId) {
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('licenca, updated_at, created_at')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;

    const atual = (await db.all(db.STORES.profile))[0];
    if (data.licenca && atual?.licenca !== data.licenca) {
      await db.put(db.STORES.profile, { ...(atual || { id: userId }), licenca: data.licenca });
    }
    return data;
  } catch {
    // Servidor antigo, sem a coluna. A app continua com o que tinha.
    return null;
  }
}

/**
 * Anota em cada escalão o que esta conta lá pode fazer: `dono`, `editar` ou `ver`.
 *
 * ## Porque é que isto corre em TODAS as descargas
 *
 * Por duas razões, e ambas obrigam a que seja aqui e não dentro do `merge`.
 *
 * A primeira: o `merge` substitui a linha inteira pela que vem do servidor, e a
 * tabela `teams` do servidor não tem coluna `nivel`. Ou seja, cada descarga
 * **apaga** o que aqui se escreveu. Se isto corresse só de vez em quando, o
 * nível desaparecia e toda a gente ficava em modo de leitura.
 *
 * A segunda é o caso que interessa de verdade. O `merge` salta as linhas que
 * ainda estão por enviar, para não pisar trabalho do treinador. Nessas, o
 * `nivel` antigo sobrevive — e o nível muda **sem o escalão mudar**: o gerente
 * passa alguém de `editar` para `ver` e a linha do escalão fica igual. Sem esta
 * reescrita, esse treinador continuava a poder escrever num escalão em que já
 * não pode, precisamente porque tinha alterações por enviar.
 *
 * ## Porque é que não vai numa tabela própria
 *
 * Seria uma tabela nova no armazenamento do aparelho, e isso obriga a subir a
 * versão da base local — que é a operação com mais maneiras de correr mal em
 * telemóveis que já têm dados lá dentro. O nível pertence à relação entre uma
 * pessoa e um escalão, e esta app só tem uma pessoa de cada vez: escrevê-lo na
 * linha do escalão diz exactamente o mesmo e não custa nada.
 *
 * O `nivel` não sobe para o servidor: o `teamMapper.toRow` só envia os campos
 * que a tabela `teams` tem, e este não é um deles.
 */
async function marcarNiveis(sb, userId, clubes, escaloes) {
  if (!escaloes.length) return;

  const meus = new Set(clubes.filter((c) => c.owner_id === userId).map((c) => c.id));

  let acessos = [];
  try {
    const { data } = await sb.from('team_access').select('team_id, nivel').eq('user_id', userId);
    acessos = data || [];
  } catch {
    // Servidor antigo, sem a tabela: fica tudo pelo dono.
  }
  const porEscalao = new Map(acessos.map((a) => [a.team_id, a.nivel]));

  for (const escalao of escaloes) {
    // Ser dono do clube ganha sempre. Um gerente não precisa de se dar acesso a
    // si próprio escalão a escalão, e se o fizesse por engano com `ver` ficava
    // sem poder mexer no seu próprio clube.
    const nivel = meus.has(escalao.club_id) ? 'dono' : porEscalao.get(escalao.id) || 'ver';
    const local = await db.get(db.STORES.teams, escalao.id);
    if (!local || local.nivel === nivel) continue;
    // Sem `stamp`: isto não é uma alteração do treinador e não pode ir para a
    // fila de envio. O `dirty` fica como estava.
    await db.put(db.STORES.teams, { ...local, nivel });
  }
}

async function merge(store, rows) {
  if (!rows.length) return 0;
  const locais = new Map((await db.all(store)).map((r) => [r.id, r]));
  const guardar = rows.filter((r) => {
    const local = locais.get(r.id);
    if (!local) return true;
    if (local.dirty || (store === db.STORES.matchEvents && !local.syncedAt)) return false;
    return true;
  });
  if (guardar.length) await db.putMany(store, guardar);
  return guardar.length;
}

/* ---------------------------------------------------------------- ciclo */

/**
 * As linhas por enviar mais as que são precisas para elas serem aceites.
 * Reenviar uma linha já sincronizada não custa nada: o upsert é idempotente.
 */
async function comPais(store, sujas, idsNecessarios) {
  if (!idsNecessarios.size) return sujas;
  const jaIncluidas = new Set(sujas.map((r) => r.id));
  const todas = await db.all(store);
  return [...sujas, ...todas.filter((r) => idsNecessarios.has(r.id) && !jaIncluidas.has(r.id))];
}

/** Junta ao erro a tabela onde aconteceu — é o que diz logo o que corrigir. */
function etiqueta(error, tabela) {
  const e = new Error(`${tabela}: ${error.message || error.hint || 'erro desconhecido'}`);
  e.detalhe = error.details || error.hint || null;
  e.codigo = error.code || null;
  e.tabela = tabela;
  return e;
}

export async function flush(userId, email) {
  if (aCorrer) {
    repetirDepois = { userId, email };
    if (!repetirPromise) {
      repetirPromise = new Promise((resolve) => {
        resolverRepetir = resolve;
      });
    }
    return repetirPromise;
  }
  if (!supabase()) return set({ status: SYNC.LOCAL });
  if (!userId) return set({ status: SYNC.LOCAL });
  if (!online()) return set({ status: SYNC.OFFLINE, online: false });

  aCorrer = true;
  try {
    const { pushed } = await push(userId, email);
    set({ status: SYNC.SYNCED, pending: 0, online: true, lastSyncAt: Date.now(), error: null });
    retryMs = 2000;
    return pushed;
  } catch (err) {
    console.warn('sincronização adiada:', err?.message || err, err?.detalhe || '');
    set({
      status: online() ? SYNC.ERROR : SYNC.OFFLINE,
      online: online(),
      error: {
        message: err?.message || String(err),
        detalhe: err?.detalhe || null,
        codigo: err?.codigo || null,
      },
    });
    // Recuo progressivo até 1 minuto: sem rede, tentar de meio em meio segundo
    // só gastava bateria a meio de um jogo.
    retryMs = Math.min(retryMs * 2, 60000);
    proximaTentativa = setTimeout(() => flush(userId, email), retryMs);
  } finally {
    aCorrer = false;
    if (repetirDepois) {
      const next = repetirDepois;
      const resolve = resolverRepetir;
      repetirDepois = null;
      repetirPromise = null;
      resolverRepetir = null;
      const result = await flush(next.userId, next.email);
      if (resolve) resolve(result);
    }
  }
}

/**
 * Deitar fora tudo o que está guardado neste dispositivo e voltar a descarregar
 * do servidor.
 *
 * É a cura para sobras de versões antigas da app — linhas com uma forma que o
 * servidor já não aceita. Nada se perde do que já lá está em cima; o que houver
 * por enviar, esse sim, desaparece, e é por isso que quem chama tem de avisar.
 */
export async function resetLocal(userId) {
  await db.clearAll();
  // A marca tem de ir com a base. Sem isto, a descarga a seguir pedia só o que
  // mudou desde ontem — e a app abria vazia, com o histórico todo do lado de lá
  // e nada deste.
  esquecerMarca(userId);
  const r = await pull(userId);
  await pendingCount();
  notifyLocalChange();
  set({ status: SYNC.SYNCED, error: null, lastSyncAt: Date.now() });
  return r;
}

/**
 * Encerrar a fila ao sair da conta.
 *
 * Sem isto ficava um reenvio agendado — e um aviso de erro no ecrã de entrada,
 * de uma tentativa que já não tinha sessão nenhuma para usar.
 */
export function stop() {
  if (proximaTentativa) clearTimeout(proximaTentativa);
  proximaTentativa = null;
  repetirDepois = null;
  retryMs = 2000;
  set({ status: SYNC.LOCAL, pending: 0, error: null });
}

export async function pendingCount() {
  const stores = [
    db.STORES.clubs,
    db.STORES.teams,
    db.STORES.competitions,
    db.STORES.players,
    db.STORES.matches,
    db.STORES.matchSquad,
  ];
  let n = 0;
  for (const s of stores) n += (await dirtyRows(s)).length;
  n += (await db.all(db.STORES.matchEvents)).filter((e) => !e.syncedAt).length;
  set({ pending: n, status: n ? SYNC.PENDING : estado.status });
  return n;
}

/**
 * Tentar enviar agora, sem prender ninguém.
 *
 * ## Porque é que isto deixou de rebentar
 *
 * Esta função lançava uma excepção quando não havia rede. Quem a chamava fazia
 * `await sync.saveNow(...)` antes de continuar, e a excepção levava o resto do
 * caminho com ela — incluindo o `router.push` que abria o jogo. O resultado era
 * o pior que uma app offline-first pode fazer: **não se conseguia começar um
 * jogo dentro de um pavilhão sem rede**, que é exactamente o sítio onde ela
 * tinha de funcionar.
 *
 * O erro de fundo era tratar o servidor como parte do caminho. Não é. Os dados
 * já estão gravados no aparelho quando isto é chamado; o envio é uma
 * consequência, não uma condição. Falta de rede não é uma falha — é o estado
 * normal de metade dos pavilhões deste país.
 *
 * Por isso agora **nunca lança**. Devolve o que aconteceu, para quem quiser
 * decidir alguma coisa com isso (o sair da conta quer), e a fila trata do resto
 * sozinha: o `flush` reagenda-se, e o `providers.jsx` volta a tentar mal haja
 * rede, foco, ou uma mudança nos dados.
 *
 * @returns {Promise<{guardado: boolean, status: string, pendentes: number}>}
 *   `guardado` é verdadeiro só quando chegou mesmo ao servidor.
 */
export async function saveNow(userId, email) {
  // Defensivo até ao fim: a maior parte de quem chama isto já nem espera pelo
  // resultado, e uma promessa recusada sem ninguém a ouvir derruba a app em
  // vez de adiar um envio.
  try {
    await pendingCount();
    await flush(userId, email);
  } catch (err) {
    console.warn('sincronização adiada:', err?.message || err);
  }
  return {
    guardado: estado.status === SYNC.SYNCED,
    status: estado.status,
    pendentes: estado.pending,
  };
}
