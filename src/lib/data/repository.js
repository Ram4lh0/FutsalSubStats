// data/repository.js
//
// PORTA DE REPOSITÓRIO (contrato). Toda a aplicação fala apenas com este objecto —
// nenhuma vista importa IndexedDB directamente. Para migrar para Supabase basta criar
// um `supabaseRepository.js` com os mesmos métodos (as assinaturas foram escolhidas
// para mapear 1:1 em `supabase.from('clubs').select()` etc.) e trocar a importação
// em src/app.js.
//
//   clubs.list()                 -> select * from clubs where owner_id = auth.uid()
//   players.listByClub(clubId)   -> select * from players where club_id = $1
//   events.append(event)         -> insert into match_events ... on conflict (client_event_id) do nothing
//
// Os nomes dos campos estão em camelCase; a conversão para snake_case do PostgreSQL
// fica isolada em `toRow`/`fromRow` do futuro adaptador.

import * as db from './local.js';
import { donoAtual } from './owner.js';
import { notifyLocalChange } from './sync.js';
import { uid } from '../../domain/actions.js';
import { buildMatchState } from '../../domain/reducer.js';
import { LOCATION, EVENT, MATCH_TIMING, timingOf, timingConfig } from '../../domain/constants.js';
import { t } from '../i18n/index.js';

const now = () => Date.now();
// Tudo o que se escreve nasce por enviar. O `dirty` só cai quando o servidor
// confirmar — se a app fechar a meio, a linha continua na fila.
const stamp = (o) => ({ ...o, createdAt: o.createdAt ?? now(), updatedAt: now(), dirty: true });

/* ---------------------------------------------------------------- perfil */

export const profile = {
  async get() {
    const rows = await db.all(db.STORES.profile);
    return rows[0] || null;
  },
  async save(data) {
    const existing = await profile.get();
    const row = stamp({ id: existing?.id || uid(), ...existing, ...data });
    await db.put(db.STORES.profile, row);
    return row;
  },
};

/* ---------------------------------------------------------------- clubes */

export const clubs = {
  async list() {
    const rows = await db.all(db.STORES.clubs);
    return rows.filter((c) => !c.archivedAt).sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  },
  get: (id) => db.get(db.STORES.clubs, id),
  async create(data) {
    // Uma conta, um clube.
    //
    // A app é para o treinador de um clube, e tudo o que está por cima assume
    // isso: o painel abre no clube, os escalões pertencem-lhe, a época é dele.
    // Dois clubes na mesma conta não estavam proibidos em lado nenhum, e quem
    // criasse o segundo ficava com uma app que não sabia qual mostrar.
    //
    // Esconder o botão não chega — quem escrever `/clubs/new` na barra de
    // endereço chega ao formulário à mesma. É aqui que se trava, e no índice
    // único da base de dados, que é o que trava mesmo.
    //
    // A exceção do `data.id` é o jogo de experiência: ele traz identificadores
    // fixos para depois se conseguir apagar a si próprio, e corre sempre num
    // aparelho acabado de limpar.
    // Contam-se só os clubes **desta conta**. Um treinador associado tem na base
    // o clube do gerente, e sem esta distinção a app dizia-lhe "esta conta já tem
    // um clube" — a falar do clube de outra pessoa.
    const eu = donoAtual();
    const meus = (await clubs.list()).filter((c) => !eu || !c.ownerId || c.ownerId === eu);
    if (!data.id && meus.length) {
      const erro = new Error('Já existe um clube nesta conta.');
      erro.chave = 'clube.jaExiste';
      throw erro;
    }

    const row = stamp({
      // Um id vindo de fora só acontece no jogo de experiência, que precisa de
      // identificadores fixos para depois se apagar a si próprio.
      id: data.id || uid(),
      // Sem dono, de propósito.
      //
      // A tentação é carimbar aqui quem está a usar o aparelho, mas isso é
      // frágil: logo a seguir ao jogo de experiência, "quem está a usar" ainda é
      // `demo`, e um clube criado nessa janela nascia com um dono que não existe
      // e nunca mais subia. Quem carimba é o envio, que sabe de quem é a sessão
      // com que está a falar — e a descarga seguinte traz o valor de volta.
      //
      // O `null` também é o que distingue "criado aqui" de "veio do servidor", e
      // é nessa distinção que o `sync.js` se apoia para não reenviar o clube de
      // outra pessoa.
      ownerId: null,
      name: data.name.trim(),
      // Apelido curto para o marcador e para os resumos. Opcional: sem ele
      // mostra-se o nome completo.
      shortName: (data.shortName || '').trim() || null,
      logoUrl: data.logoUrl || null,
      primaryColor: data.primaryColor || '#22c55e',
      secondaryColor: data.secondaryColor || '#0f172a',
      // A época é do clube: todos os escalões jogam a mesma.
      currentSeason: data.currentSeason || null,
      archivedAt: null,
    });
    await db.put(db.STORES.clubs, row);
    notifyLocalChange();
    return row;
  },
  async update(id, patch) {
    const cur = await db.get(db.STORES.clubs, id);
    const row = stamp({ ...cur, ...patch });
    await db.put(db.STORES.clubs, row);
    notifyLocalChange();
    return row;
  },
  async archive(id) {
    return clubs.update(id, { archivedAt: now() });
  },
  async remove(id) {
    for (const t of await teams.listByClub(id)) await teams.remove(t.id);
    await db.del(db.STORES.clubs, id);
    notifyLocalChange();
  },
};

/* -------------------------------------------------------------- escalões */

/**
 * O escalão é a unidade de trabalho: tem plantel, jogos, competições e
 * estatísticas próprias. O clube é só o guarda-chuva que lhes dá nome e época.
 */
export const teams = {
  async listByClub(clubId) {
    const rows = await db.byIndex(db.STORES.teams, 'by_club', clubId);
    return rows
      .filter((t) => !t.archivedAt)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  },
  get: (id) => db.get(db.STORES.teams, id),

  /**
   * O que esta conta pode fazer neste escalão: `dono`, `editar` ou `ver`.
   *
   * Escrito na descarga pelo `sync.js`. Um escalão criado aqui e ainda não
   * sincronizado não tem nível nenhum — e é `dono`, porque foi esta conta que o
   * criou. Sem essa omissão, quem criasse um escalão sem rede ficava a olhar
   * para ele em modo de leitura até haver ligação.
   */
  async nivel(teamId) {
    const t = await db.get(db.STORES.teams, teamId);
    return t?.nivel || 'dono';
  },

  async create(clubId, data) {
    // A licença de Treinador dá direito a um escalão.
    //
    // A mesma receita do clube: aqui é a cortesia, o gatilho no servidor é a
    // fechadura. Sem esta, o treinador escrevia o plantel todo num escalão que
    // o servidor ia recusar — e só descobria quando a sincronização falhasse,
    // longe do sítio onde se enganou.
    //
    // Na dúvida, restringe: uma conta que ainda não descarregou a licença conta
    // como `treinador`. Recusar de mais explica-se com uma frase; permitir de
    // mais deixa criar coisas que morrem mais tarde.
    // Criar escalões é do dono do clube. Um treinador associado trabalha
    // **dentro** de um escalão que lhe deram; não abre escalões nos outros.
    //
    // O servidor já o impedia — a política `teams_criar` — mas só quando a fila
    // chegasse lá, e nessa altura o treinador já tinha escrito o nome, escolhido
    // o tipo de tempo e carregado em Guardar. Falhar aqui é falhar no sítio onde
    // se percebe porquê.
    if (!data.id) {
      const eu = donoAtual();
      const clube = await clubs.get(clubId);
      if (eu && clube?.ownerId && clube.ownerId !== eu) {
        const erro = new Error('Só o dono do clube cria escalões.');
        erro.chave = 'escalao.soODono';
        throw erro;
      }
    }

    if (!data.id) {
      const licenca = (await profile.get())?.licenca || 'treinador';
      if (licenca !== 'clube' && (await teams.listByClub(clubId)).length) {
        const erro = new Error('A licença de treinador permite um escalão.');
        erro.chave = 'escalao.limiteDaLicenca';
        throw erro;
      }
    }

    const row = stamp({
      // Um id vindo de fora só acontece no jogo de experiência, que precisa de
      // identificadores fixos para depois se apagar a si próprio.
      id: data.id || uid(),
      clubId,
      name: (data.name || '').trim(),
      shortName: (data.shortName || '').trim() || null,
      logoUrl: data.logoUrl || null,
      // O tipo de tempo é do escalão: os mais novos jogam corrido, os séniores
      // cronometrado, e o mesmo clube tem os dois.
      timing: data.timing === MATCH_TIMING.TIMED ? MATCH_TIMING.TIMED : MATCH_TIMING.UNTIMED,
      archivedAt: null,
    });
    await db.put(db.STORES.teams, row);
    notifyLocalChange();
    return row;
  },
  async update(id, patch) {
    const cur = await db.get(db.STORES.teams, id);
    const row = stamp({ ...cur, ...patch });
    await db.put(db.STORES.teams, row);
    notifyLocalChange();
    return row;
  },
  async remove(id) {
    for (const m of await matches.listByTeam(id)) await matches.remove(m.id);
    for (const p of await players.listByTeam(id)) await db.del(db.STORES.players, p.id);
    for (const c of await competitions.listByTeam(id)) await db.del(db.STORES.competitions, c.id);
    await db.del(db.STORES.teams, id);
    notifyLocalChange();
  },
};

/* ----------------------------------------------------------- competições */

export const competitions = {
  async listByTeam(teamId) {
    const rows = await db.byIndex(db.STORES.competitions, 'by_team', teamId);
    return rows
      .filter((c) => !c.archivedAt)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  },
  get: (id) => db.get(db.STORES.competitions, id),
  async create(teamId, data) {
    const row = stamp({
      // Um id vindo de fora só acontece no jogo de experiência, que precisa de
      // identificadores fixos para depois se apagar a si próprio.
      id: data.id || uid(),
      teamId,
      name: (data.name || '').trim(),
      shortName: (data.shortName || '').trim() || null,
      archivedAt: null,
    });
    await db.put(db.STORES.competitions, row);
    notifyLocalChange();
    return row;
  },
  async update(id, patch) {
    const cur = await db.get(db.STORES.competitions, id);
    const row = stamp({ ...cur, ...patch });
    await db.put(db.STORES.competitions, row);
    notifyLocalChange();
    return row;
  },
  /** Apagar uma competição não apaga os jogos: eles ficam sem prova associada. */
  async remove(id) {
    const comp = await competitions.get(id);
    if (comp) {
      for (const m of await matches.listByTeam(comp.teamId)) {
        if (m.competitionId === id) await matches.update(m.id, { competitionId: null });
      }
    }
    await db.del(db.STORES.competitions, id);
    notifyLocalChange();
  },
};

/* ------------------------------------------------------------- jogadores */

export const players = {
  async listByTeam(teamId) {
    const rows = await db.byIndex(db.STORES.players, 'by_team', teamId);
    return rows.sort((a, b) => a.shirtNumber - b.shirtNumber);
  },
  /** Ainda usado pelo backup e por ecrãs que só sabem o clube. */
  async listByClub(clubId) {
    const rows = await db.byIndex(db.STORES.players, 'by_club', clubId);
    return rows.sort((a, b) => a.shirtNumber - b.shirtNumber);
  },
  get: (id) => db.get(db.STORES.players, id),
  async create(teamId, data) {
    const team = await teams.get(teamId);
    const row = stamp({
      id: uid(),
      teamId,
      clubId: team?.clubId || null,
      name: data.name.trim(),
      shirtNumber: Number(data.shirtNumber),
      preferredPosition: data.preferredPosition || 'UNIVERSAL',
      strongFoot: data.strongFoot || 'UNKNOWN',
      photoUrl: data.photoUrl || null,
      isActive: true,
    });
    await db.put(db.STORES.players, row);
    notifyLocalChange();
    return row;
  },
  async update(id, patch) {
    const cur = await db.get(db.STORES.players, id);
    const row = stamp({
      ...cur,
      ...patch,
      ...(patch.shirtNumber != null ? { shirtNumber: Number(patch.shirtNumber) } : {}),
    });
    await db.put(db.STORES.players, row);
    notifyLocalChange();
    return row;
  },
  setActive: (id, isActive) => players.update(id, { isActive }),
  /** Só permitido a jogadores sem histórico (regra 3.1). */
  async remove(id) {
    const used = (await db.all(db.STORES.matchSquad)).some((s) => s.playerId === id);
    if (used) throw new Error(t('plantelCsv.temHistorico'));
    await db.del(db.STORES.players, id);
  },

  /**
   * Põe o plantel do escalão igual ao que veio no ficheiro.
   *
   * "Substituir" é o que se pede, mas não pode ser um apagar e voltar a criar:
   * um jogador que já foi convocado tem jogos ligados a si, e apagá-lo
   * reescreveria a ficha desses jogos — a base de dados recusa-o, e ainda bem.
   *
   * Por isso a substituição faz-se em três movimentos, com o número de camisola
   * a servir de identidade:
   *
   *   · está no ficheiro e já cá estava  → é atualizado, e mantém o histórico
   *   · está no ficheiro e é novo        → é criado
   *   · não está no ficheiro             → sai do plantel: apagado se nunca foi
   *                                        convocado, desativado se já foi
   *
   * O terceiro caso é o que interessa explicar a quem usa: o jogador desaparece
   * das listas e das convocatórias, mas os jogos em que participou continuam
   * certos. Um plantel não é uma folha em branco — tem passado.
   *
   * @returns {{ criados:number, atualizados:number, apagados:number, desativados:number }}
   */
  async replaceRoster(teamId, jogadores) {
    const atuais = await players.listByTeam(teamId);
    const convocados = new Set((await db.all(db.STORES.matchSquad)).map((s) => s.playerId));
    const porNumero = new Map(atuais.map((p) => [Number(p.shirtNumber), p]));
    const numerosDoFicheiro = new Set(jogadores.map((j) => Number(j.shirtNumber)));

    let criados = 0;
    let atualizados = 0;
    let apagados = 0;
    let desativados = 0;

    for (const j of jogadores) {
      const existente = porNumero.get(Number(j.shirtNumber));
      if (existente) {
        await players.update(existente.id, {
          name: j.name,
          preferredPosition: j.preferredPosition,
          strongFoot: j.strongFoot,
          isActive: j.isActive,
        });
        atualizados += 1;
      } else {
        const novo = await players.create(teamId, j);
        // `create` força `isActive: true`; o ficheiro pode trazer um inativo.
        if (!j.isActive) await players.update(novo.id, { isActive: false });
        criados += 1;
      }
    }

    for (const p of atuais) {
      if (numerosDoFicheiro.has(Number(p.shirtNumber))) continue;
      if (convocados.has(p.id)) {
        if (p.isActive) {
          await players.update(p.id, { isActive: false });
          desativados += 1;
        }
      } else {
        await db.del(db.STORES.players, p.id);
        apagados += 1;
      }
    }

    notifyLocalChange();
    return { criados, atualizados, apagados, desativados };
  },
};

/* ------------------------------------------------------------------ jogos */

export const matches = {
  async listByTeam(teamId) {
    const rows = await db.byIndex(db.STORES.matches, 'by_team', teamId);
    return rows.sort((a, b) => (b.scheduledAt || b.createdAt) - (a.scheduledAt || a.createdAt));
  },
  async listByClub(clubId) {
    const rows = await db.byIndex(db.STORES.matches, 'by_club', clubId);
    return rows.sort((a, b) => (b.scheduledAt || b.createdAt) - (a.scheduledAt || a.createdAt));
  },
  get: (id) => db.get(db.STORES.matches, id),
  async create(teamId, data) {
    // O tipo de tempo vem do escalão mas pode ser mudado neste jogo — e o que
    // fica guardado é uma cópia: mexer no escalão não reescreve jogos passados.
    const team = await teams.get(teamId);
    const timing = data.timing === MATCH_TIMING.TIMED || data.timing === MATCH_TIMING.UNTIMED
      ? data.timing
      : timingOf(team);
    const row = stamp({
      // Um id vindo de fora só acontece no jogo de experiência, que precisa de
      // identificadores fixos para depois se apagar a si próprio.
      id: data.id || uid(),
      teamId,
      clubId: team?.clubId || null,
      timing,
      opponentName: data.opponentName.trim(),
      opponentShortName: (data.opponentShortName || '').trim() || null,
      competitionId: data.competitionId || null,
      homeOrAway: data.homeOrAway || 'HOME',
      scheduledAt: data.scheduledAt || now(),
      season: data.season || null,
      periodDurationMs: timingConfig({ timing }).periodDurationMs,
      notes: data.notes || null,
    });
    await db.put(db.STORES.matches, row);
    notifyLocalChange();
    return row;
  },
  async update(id, patch, { sync: syncMode = 'immediate' } = {}) {
    const cur = await db.get(db.STORES.matches, id);
    const row = stamp({ ...cur, ...patch });
    await db.put(db.STORES.matches, row);
    if (syncMode !== 'defer') notifyLocalChange();
    return row;
  },
  async remove(id) {
    for (const s of await db.byIndex(db.STORES.matchSquad, 'by_match', id))
      await db.del(db.STORES.matchSquad, s.id);
    for (const e of await db.byIndex(db.STORES.matchEvents, 'by_match', id))
      await db.del(db.STORES.matchEvents, e.id);
    await db.del(db.STORES.matches, id);
  },
};

/* ------------------------------------------------------------ convocados */

export const squad = {
  listByMatch: (matchId) => db.byIndex(db.STORES.matchSquad, 'by_match', matchId),
  /** Substitui a convocatória inteira preservando as linhas já existentes. */
  async replace(matchId, entries) {
    const existing = await squad.listByMatch(matchId);
    const byPlayer = new Map(existing.map((r) => [r.playerId, r]));
    const keep = new Set();
    const rows = [];
    for (const e of entries) {
      const prev = byPlayer.get(e.playerId);
      const row = stamp({
        id: prev?.id || uid(),
        matchId,
        playerId: e.playerId,
        playerNameSnapshot: e.playerNameSnapshot,
        shirtNumberSnapshot: e.shirtNumberSnapshot,
        preferredPosition: e.preferredPosition || null,
        initialPosition: e.initialPosition || null,
        initialLocation: e.initialLocation || LOCATION.BENCH,
        createdAt: prev?.createdAt,
      });
      rows.push(row);
      keep.add(row.id);
    }
    for (const r of existing) if (!keep.has(r.id)) await db.del(db.STORES.matchSquad, r.id);
    await db.putMany(db.STORES.matchSquad, rows);
    notifyLocalChange();
    return rows;
  },
};

/* ----------------------------------------------------------------- eventos */

export const events = {
  async listByMatch(matchId) {
    const rows = await db.byIndex(db.STORES.matchEvents, 'by_match', matchId);
    return rows.sort((a, b) => a.seq - b.seq);
  },
  /**
   * Escrita idempotente: o clientEventId único impede que a mesma acção
   * seja gravada duas vezes quando a ligação regressa (secção 10).
   */
  async append(event, { sync: syncMode = 'immediate' } = {}) {
    const existing = await events.listByMatch(event.matchId);
    if (existing.some((e) => e.clientEventId === event.clientEventId)) return null;
    const seq = existing.reduce((m, e) => Math.max(m, e.seq || 0), 0) + 1;
    const row = { ...event, seq, syncedAt: null };
    await db.put(db.STORES.matchEvents, row);
    if (syncMode !== 'defer') notifyLocalChange();
    return row;
  },
  async markUndone(eventId, by = null, { sync: syncMode = 'immediate' } = {}) {
    const ev = await db.get(db.STORES.matchEvents, eventId);
    if (!ev) return null;
    const row = { ...ev, undoneAt: now(), undoneBy: by, syncedAt: null };
    await db.put(db.STORES.matchEvents, row);
    if (syncMode !== 'defer') notifyLocalChange();
    return row;
  },
  async markSynced(ids) {
    const rows = [];
    for (const id of ids) {
      const ev = await db.get(db.STORES.matchEvents, id);
      if (ev) rows.push({ ...ev, syncedAt: now() });
    }
    if (rows.length) await db.putMany(db.STORES.matchEvents, rows);
    return rows;
  },
  async pending() {
    return (await db.all(db.STORES.matchEvents)).filter((e) => !e.syncedAt);
  },
};

/* -------------------------------------------------------- carregar um jogo */

export async function loadMatch(matchId) {
  const match = await matches.get(matchId);
  if (!match) return null;
  const [sq, evs] = await Promise.all([squad.listByMatch(matchId), events.listByMatch(matchId)]);
  return { match, squad: sq, events: evs, state: buildMatchState(match, sq, evs) };
}

export async function loadTeamMatchStates(teamId) {
  return loadStatesOf(await matches.listByTeam(teamId));
}

export async function loadClubMatchStates(clubId) {
  return loadStatesOf(await matches.listByClub(clubId));
}

async function loadStatesOf(list) {
  const out = [];
  for (const m of list) {
    const sq = await squad.listByMatch(m.id);
    const evs = await events.listByMatch(m.id);
    out.push({ match: m, state: buildMatchState(m, sq, evs) });
  }
  return out;
}

/** Jogo em curso (para o atalho "retomar jogo"). */
export async function findLiveMatch() {
  const all = await db.all(db.STORES.matches);
  for (const m of all) {
    const evs = await events.listByMatch(m.id);
    if (!evs.length) continue;
    const started = evs.some((e) => e.eventType === EVENT.FIRST_HALF_STARTED && !e.undoneAt);
    const finished = evs.some((e) => e.eventType === EVENT.MATCH_FINISHED && !e.undoneAt);
    if (started && !finished) return m;
  }
  return null;
}

/* ------------------------------------------------------- backup completo */

export async function dump() {
  const out = { version: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const [key, store] of Object.entries(db.STORES)) {
    out.data[key] = await db.all(store);
  }
  return out;
}

export async function restore(payload, { replace = true } = {}) {
  if (!payload || !payload.data) throw new Error(t('auth.backupInvalido'));
  if (replace) await db.clearAll();
  for (const [key, store] of Object.entries(db.STORES)) {
    const rows = payload.data[key] || [];
    if (!rows.length) continue;
    // Tudo o que entra por aqui é novo para o servidor: um backup restaurado
    // tem de subir inteiro, senão os jogos novos ficam sem clube onde assentar.
    await db.putMany(
      store,
      rows.map((r) =>
        store === db.STORES.matchEvents ? { ...r, syncedAt: null } : { ...r, dirty: true }
      )
    );
  }
  notifyLocalChange();
}

/** Marca tudo como pendente, para forçar um envio completo. */
export async function markAllPending() {
  for (const [key, store] of Object.entries(db.STORES)) {
    if (key === 'profile') continue;
    const rows = await db.all(store);
    if (!rows.length) continue;
    await db.putMany(
      store,
      rows.map((r) =>
        store === db.STORES.matchEvents ? { ...r, syncedAt: null } : { ...r, dirty: true }
      )
    );
  }
}

export const raw = db;
