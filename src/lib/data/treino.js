// lib/data/treino.js — a aba Treino no aparelho: rotina, treinos, presenças e
// jogadas do quadro tático.
//
// Segue as mesmas regras do `repository.js`: escreve-se aqui primeiro, sempre,
// com `dirty: true`, e a fila do `sync.js` leva ao servidor quando houver rede.
// Apagar é marcar `deletedAt` — uma linha que desaparece do aparelho sem avisar
// o servidor voltava na descarga seguinte.

import * as db from './local.js';
import { notifyLocalChange } from './sync.js';
import { donoAtual } from './owner.js';
import { uid } from '../../domain/actions.js';
import {
  ESTADO_TREINO,
  idPresenca,
  isoDia,
  planearTreinos,
} from '../../domain/treino.js';
import { normalizar } from '../../domain/jogada.js';

const now = () => Date.now();
const stamp = (o) => ({ ...o, createdAt: o.createdAt ?? now(), updatedAt: now(), dirty: true });
const vivos = (rows) => rows.filter((r) => !r.deletedAt);

/** Quanto tempo vale um link público de uma jogada. */
export const VALIDADE_LINK_MS = 30 * 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------- rotina */

export const rotinas = {
  async listByTeam(teamId) {
    const rows = vivos(await db.byIndex(db.STORES.trainingRoutines, 'by_team', teamId));
    return rows.sort(
      (a, b) =>
        ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.startTime.localeCompare(b.startTime)
    );
  },

  /**
   * Grava a rotina inteira de uma vez (é assim que o formulário a edita) e
   * acerta os treinos do calendário a partir de hoje.
   *
   * @param {string} teamId
   * @param {Array<{id?, weekday, startTime, durationMin, location}>} linhas
   */
  async guardar(teamId, linhas) {
    const atuais = await db.byIndex(db.STORES.trainingRoutines, 'by_team', teamId);
    const porId = new Map(atuais.map((r) => [r.id, r]));
    const ficam = new Set();
    const gravar = [];

    for (const l of linhas) {
      const id = l.id || uid();
      ficam.add(id);
      const antes = porId.get(id);
      const nova = {
        id,
        teamId,
        weekday: Number(l.weekday),
        startTime: l.startTime,
        durationMin: Number(l.durationMin) || 90,
        location: (l.location || '').trim() || null,
        deletedAt: null,
      };
      if (
        !antes ||
        antes.deletedAt ||
        antes.weekday !== nova.weekday ||
        antes.startTime !== nova.startTime ||
        Number(antes.durationMin) !== nova.durationMin ||
        (antes.location || null) !== nova.location
      ) {
        gravar.push(stamp({ ...antes, ...nova }));
      }
    }
    for (const r of atuais) {
      if (!ficam.has(r.id) && !r.deletedAt) gravar.push(stamp({ ...r, deletedAt: now() }));
    }
    if (gravar.length) await db.putMany(db.STORES.trainingRoutines, gravar);
    await treinos.acertarComRotina(teamId);
    notifyLocalChange();
  },
};

/* ------------------------------------------------------------ treinos */

export const treinos = {
  async listByTeam(teamId) {
    const rows = vivos(await db.byIndex(db.STORES.trainingSessions, 'by_team', teamId));
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  },

  get: (id) => db.get(db.STORES.trainingSessions, id),

  /** Gera, muda ou retira os treinos futuros conforme a rotina atual. */
  async acertarComRotina(teamId) {
    const hoje = isoDia(new Date());
    const [todasRotinas, todosTreinos] = await Promise.all([
      db.byIndex(db.STORES.trainingRoutines, 'by_team', teamId),
      db.byIndex(db.STORES.trainingSessions, 'by_team', teamId),
    ]);
    const futuros = todosTreinos.filter((t) => t.date >= hoje).map((t) => t.id);
    const comPresencas = new Set();
    for (const id of futuros) {
      if ((await db.byIndex(db.STORES.trainingAttendance, 'by_session', id)).length) comPresencas.add(id);
    }
    const { criar, atualizar, apagar } = planearTreinos({
      rotinas: todasRotinas,
      treinos: todosTreinos,
      comPresencas,
      hoje,
    });
    const linhas = [
      ...criar.map((t) => stamp({ ...t, teamId })),
      ...atualizar.map((t) => stamp(t)),
      ...apagar.map((t) => stamp({ ...t, deletedAt: now() })),
    ];
    if (linhas.length) {
      await db.putMany(db.STORES.trainingSessions, linhas);
      notifyLocalChange();
    }
    return { criados: criar.length, mudados: atualizar.length, retirados: apagar.length };
  },

  /** Um treino fora da rotina. */
  async criar(teamId, dados) {
    const row = stamp({
      id: uid(),
      teamId,
      routineId: null,
      date: dados.date,
      startTime: dados.startTime,
      durationMin: Number(dados.durationMin) || 90,
      location: (dados.location || '').trim() || null,
      status: ESTADO_TREINO.AGENDADO,
      edited: true,
      notes: null,
      deletedAt: null,
    });
    await db.put(db.STORES.trainingSessions, row);
    notifyLocalChange();
    return row;
  },

  /**
   * Mudar só este treino. A partir daqui a rotina deixa-o em paz — é o
   * "este treino passou para sexta" sem mexer nas outras semanas.
   */
  async editar(id, patch, { marcarEditado = true } = {}) {
    const atual = await db.get(db.STORES.trainingSessions, id);
    if (!atual) return null;
    const row = stamp({ ...atual, ...patch, edited: marcarEditado ? true : atual.edited });
    await db.put(db.STORES.trainingSessions, row);
    notifyLocalChange();
    return row;
  },

  cancelar: (id) => treinos.editar(id, { status: ESTADO_TREINO.CANCELADO }),
  repor: (id) => treinos.editar(id, { status: ESTADO_TREINO.AGENDADO }),
  notas: (id, notes) => treinos.editar(id, { notes: notes || null }, { marcarEditado: false }),

  async apagar(id) {
    const atual = await db.get(db.STORES.trainingSessions, id);
    if (!atual) return;
    await db.put(db.STORES.trainingSessions, stamp({ ...atual, deletedAt: now(), edited: true }));
    notifyLocalChange();
  },
};

/* ---------------------------------------------------------- presenças */

export const presencas = {
  listBySession: (sessionId) => db.byIndex(db.STORES.trainingAttendance, 'by_session', sessionId),

  /** Todas as presenças dos treinos de um escalão. */
  async listByTeam(teamId) {
    const ids = new Set(
      (await db.byIndex(db.STORES.trainingSessions, 'by_team', teamId)).map((t) => t.id)
    );
    return (await db.all(db.STORES.trainingAttendance)).filter((p) => ids.has(p.sessionId));
  },

  /**
   * Marca (ou muda) a presença de um jogador. Não há "desmarcar": uma vez
   * marcado, troca-se de estado — o servidor não tem "por marcar".
   */
  async marcar(sessionId, playerId, status, note) {
    const id = idPresenca(sessionId, playerId);
    const atual = await db.get(db.STORES.trainingAttendance, id);
    if (!status && !atual) return null;
    const row = stamp({
      ...atual,
      id,
      sessionId,
      playerId,
      status: status || atual.status,
      note: note === undefined ? atual?.note || null : note || null,
    });
    await db.put(db.STORES.trainingAttendance, row);
    notifyLocalChange();
    return row;
  },

  /** Marca vários de uma vez (ex.: "todos presentes"). */
  async marcarVarios(sessionId, playerIds, status) {
    const linhas = [];
    for (const playerId of playerIds) {
      const id = idPresenca(sessionId, playerId);
      const atual = await db.get(db.STORES.trainingAttendance, id);
      linhas.push(stamp({ ...atual, id, sessionId, playerId, status, note: atual?.note || null }));
    }
    if (linhas.length) await db.putMany(db.STORES.trainingAttendance, linhas);
    notifyLocalChange();
  },
};

/* ------------------------------------------------------------ jogadas */

export const jogadas = {
  async listByTeam(teamId) {
    const rows = vivos(await db.byIndex(db.STORES.plays, 'by_team', teamId));
    return rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  async get(id) {
    const row = await db.get(db.STORES.plays, id);
    return row && !row.deletedAt ? { ...row, data: normalizar(row.data) } : null;
  },

  async guardar(teamId, dados) {
    const atual = dados.id ? await db.get(db.STORES.plays, dados.id) : null;
    const team = await db.get(db.STORES.teams, teamId);
    const row = stamp({
      ...atual,
      id: dados.id || uid(),
      teamId,
      clubId: team?.clubId || atual?.clubId || null,
      // Quem a criou — é por aqui que se contam as 3 jogadas grátis.
      createdBy: atual?.createdBy || donoAtual() || null,
      sharedWithClub: dados.sharedWithClub ?? atual?.sharedWithClub ?? false,
      title: (dados.title || '').trim() || '—',
      category: dados.category || 'MOVIMENTACAO',
      description: (dados.description || '').trim() || null,
      data: normalizar(dados.data),
      shareToken: atual?.shareToken || null,
      shareExpiresAt: atual?.shareExpiresAt || null,
      deletedAt: null,
    });
    await db.put(db.STORES.plays, row);
    notifyLocalChange();
    return row;
  },

  async apagar(id) {
    const atual = await db.get(db.STORES.plays, id);
    if (!atual) return;
    await db.put(
      db.STORES.plays,
      stamp({ ...atual, deletedAt: now(), shareToken: null, shareExpiresAt: null, sharedWithClub: false })
    );
    notifyLocalChange();
  },

  /**
   * A biblioteca do clube: as jogadas que os escalões do clube partilharam.
   * Chegam pela sincronização mesmo de escalões a que não se tem acesso — quem
   * decide se se vêem é o servidor (licença Clube e ser do clube).
   */
  async biblioteca(clubId) {
    const rows = await db.all(db.STORES.plays);
    return rows
      .filter((p) => p.clubId === clubId && p.sharedWithClub && !p.deletedAt)
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  },

  /** Uma cópia independente noutro escalão: mexer numa não mexe na outra. */
  async copiar(id, teamIdDestino) {
    const origem = await db.get(db.STORES.plays, id);
    if (!origem) return null;
    return jogadas.guardar(teamIdDestino, {
      title: origem.title,
      category: origem.category,
      description: origem.description,
      data: origem.data,
      sharedWithClub: false,
    });
  },

  /**
   * Quantas jogadas esta conta já criou neste aparelho, contando as apagadas
   * (apagar é só marcar, por isso continuam cá). O servidor tem a conta certa
   * entre aparelhos; esta serve quando não há rede.
   */
  async criadasPorMim() {
    const eu = donoAtual();
    if (!eu) return 0;
    return (await db.all(db.STORES.plays)).filter((p) => p.createdBy === eu).length;
  },

  /**
   * Um link novo, válido 30 dias. O anterior deixa de funcionar no momento em
   * que este chegar ao servidor — o token é outro.
   */
  async novoLink(id) {
    const atual = await db.get(db.STORES.plays, id);
    if (!atual) return null;
    const row = stamp({ ...atual, shareToken: uid(), shareExpiresAt: now() + VALIDADE_LINK_MS });
    await db.put(db.STORES.plays, row);
    notifyLocalChange();
    return row;
  },

  async desligarLink(id) {
    const atual = await db.get(db.STORES.plays, id);
    if (!atual) return null;
    const row = stamp({ ...atual, shareToken: null, shareExpiresAt: null });
    await db.put(db.STORES.plays, row);
    notifyLocalChange();
    return row;
  },
};
