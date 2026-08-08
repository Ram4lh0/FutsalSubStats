// lib/data/sync.js
// Sincronização com o Supabase, num sentido de cada vez.
//
// A app escreve sempre primeiro no dispositivo. Este ficheiro trata do resto:
// empurra o que ficou por enviar quando há rede, e traz o que existe no servidor
// quando se entra noutro dispositivo. Nunca bloqueia a interface — se falhar,
// tenta outra vez mais tarde e o treinador nem dá por isso.

import * as db from './local.js';
import {
  clubMapper,
  teamMapper,
  competitionMapper,
  playerMapper,
  matchMapper,
  squadMapper,
  eventMapper,
} from './mappers.js';

export const SYNC = {
  SYNCED: 'SINCRONIZADO',
  PENDING: 'POR SINCRONIZAR',
  OFFLINE: 'SEM LIGAÇÃO — DADOS GUARDADOS NO DISPOSITIVO',
  ERROR: 'ERRO DE SINCRONIZAÇÃO',
  LOCAL: 'SÓ NESTE DISPOSITIVO',
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

export function subscribe(fn) {
  listeners.add(fn);
  fn(estado);
  return () => listeners.delete(fn);
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
  const jogadoresSujos = await dirtyRows(db.STORES.players);
  const jogosSujos = await dirtyRows(db.STORES.matches);
  const eventos = (await db.all(db.STORES.matchEvents))
    .filter((e) => !e.syncedAt)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  // Uma convocatória que aponte para um jogador que não pode subir também não
  // sobe: chegaria ao servidor sem o jogador a que se refere. O jogo fica para
  // trás inteiro, em vez de ir pela metade.
  const convocadosSujos = (await dirtyRows(db.STORES.matchSquad)).filter(
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
    await dirtyRows(db.STORES.competitions),
    competicoesNecessarias
  );

  const escaloesNecessarios = new Set([
    ...jogadores.map((p) => p.teamId),
    ...jogos.map((m) => m.teamId),
    ...competicoes.map((c) => c.teamId),
  ]);
  const escaloes = await comPais(db.STORES.teams, await dirtyRows(db.STORES.teams), escaloesNecessarios);

  const clubesNecessarios = new Set([
    ...jogadores.map((p) => p.clubId),
    ...jogos.map((m) => m.clubId),
    ...escaloes.map((t) => t.clubId),
  ]);
  const clubes = await comPais(db.STORES.clubs, await dirtyRows(db.STORES.clubs), clubesNecessarios);

  if (clubes.length) {
    const { error } = await sb
      .from('clubs')
      .upsert(clubes.map((c) => clubMapper.toRow(c, userId)));
    if (error) throw etiqueta(error, 'clubs');
    await clean(db.STORES.clubs, clubes);
    total += clubes.length;
  }

  for (const [store, mapper, linhas] of [
    [db.STORES.teams, teamMapper, escaloes],
    [db.STORES.competitions, competitionMapper, competicoes],
    [db.STORES.players, playerMapper, jogadores],
    [db.STORES.matches, matchMapper, jogos],
    [db.STORES.matchSquad, squadMapper, convocadosSujos],
  ]) {
    if (!linhas.length) continue;
    const { error } = await sb.from(mapper.table).upsert(linhas.map((r) => mapper.toRow(r)));
    if (error) throw etiqueta(error, mapper.table);
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
export async function pull(userId) {
  const sb = supabase();
  if (!sb || !userId) return { pulled: 0 };
  let total = 0;

  const { data: clubes, error: e1 } = await sb.from('clubs').select('*').eq('owner_id', userId);
  if (e1) throw e1;
  total += await merge(db.STORES.clubs, (clubes || []).map(clubMapper.fromRow));

  const ids = (clubes || []).map((c) => c.id);
  if (!ids.length) return { pulled: total };

  const { data: escaloes, error: e1b } = await sb.from('teams').select('*').in('club_id', ids);
  if (e1b) throw e1b;
  total += await merge(db.STORES.teams, (escaloes || []).map(teamMapper.fromRow));

  const escalaoIds = (escaloes || []).map((t) => t.id);
  if (escalaoIds.length) {
    const { data: comps, error: e1c } = await sb
      .from('competitions')
      .select('*')
      .in('team_id', escalaoIds);
    if (e1c) throw e1c;
    total += await merge(db.STORES.competitions, (comps || []).map(competitionMapper.fromRow));
  }

  const { data: jogadores, error: e2 } = await sb.from('players').select('*').in('club_id', ids);
  if (e2) throw e2;
  total += await merge(db.STORES.players, (jogadores || []).map(playerMapper.fromRow));

  const { data: jogos, error: e3 } = await sb.from('matches').select('*').in('club_id', ids);
  if (e3) throw e3;
  total += await merge(db.STORES.matches, (jogos || []).map(matchMapper.fromRow));

  const jogoIds = (jogos || []).map((m) => m.id);
  if (!jogoIds.length) return { pulled: total };

  const { data: convocados, error: e4 } = await sb
    .from('match_squad')
    .select('*')
    .in('match_id', jogoIds);
  if (e4) throw e4;
  total += await merge(db.STORES.matchSquad, (convocados || []).map(squadMapper.fromRow));

  const { data: eventos, error: e5 } = await sb
    .from('match_events')
    .select('*')
    .in('match_id', jogoIds)
    .order('seq', { ascending: true });
  if (e5) throw e5;
  total += await merge(db.STORES.matchEvents, (eventos || []).map(eventMapper.fromRow));

  if (total) notifyDataUpdated();
  return { pulled: total };
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
    setTimeout(() => flush(userId, email), retryMs);
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
  const r = await pull(userId);
  await pendingCount();
  notifyLocalChange();
  set({ status: SYNC.SYNCED, error: null, lastSyncAt: Date.now() });
  return r;
}

export async function pendingCount() {
  const stores = [db.STORES.clubs, db.STORES.players, db.STORES.matches, db.STORES.matchSquad];
  let n = 0;
  for (const s of stores) n += (await dirtyRows(s)).length;
  n += (await db.all(db.STORES.matchEvents)).filter((e) => !e.syncedAt).length;
  set({ pending: n, status: n ? SYNC.PENDING : estado.status });
  return n;
}

export async function saveNow(userId, email) {
  await pendingCount();
  const result = await flush(userId, email);
  if (estado.status === SYNC.ERROR || estado.status === SYNC.OFFLINE) {
    throw new Error(estado.error?.message || estado.status);
  }
  if (estado.status === SYNC.LOCAL && userId) {
    throw new Error('A app não está ligada ao servidor.');
  }
  return result;
}
