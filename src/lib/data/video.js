// lib/data/video.js — a Análise de vídeo no aparelho: análises, clipes,
// sessões e as conversas com os jogadores.
//
// As mesmas regras do `treino.js`: escreve-se aqui primeiro, sempre, com
// `dirty: true`, e a fila do `sync.js` leva ao servidor quando houver rede.
// Apagar é marcar `deletedAt`. O vídeo em si nunca passa por aqui — só o link
// (o id do YouTube) ou os metadados do ficheiro do computador (nome, tamanho,
// data), e os tempos dos clipes.

import * as db from './local.js';
import { notifyLocalChange } from './sync.js';
import { donoAtual } from './owner.js';
import { uid } from '../../domain/actions.js';
import {
  FONTE,
  acertarIntervalo,
  idConversa,
  juntarASessao,
  mesmoFicheiro,
  metadadosDoFicheiro,
  ordenarClipes,
  prenderIntervalo,
  semRepetidos,
  tirarDaSessao,
} from '../../domain/analiseVideo.js';

const now = () => Date.now();
const stamp = (o) => ({ ...o, createdAt: o.createdAt ?? now(), updatedAt: now(), dirty: true });
const vivos = (rows) => rows.filter((r) => !r.deletedAt);
const texto = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

/**
 * As mudanças a uma linha fazem-se uma de cada vez.
 *
 * Cada uma lê a linha, muda um campo e grava. Na folha do clipe tocam-se três
 * botões em meio segundo (subtipo, valência, um jogador): sem fila, a segunda
 * lia a linha antes de a primeira a gravar, e gravava por cima sem o campo que
 * a primeira tinha mudado.
 */
let fila = Promise.resolve();
function emFila(fn) {
  const resultado = fila.then(fn, fn);
  fila = resultado.catch(() => {});
  return resultado;
}

/** Quanto tempo vale o link público de uma sessão: 30 dias, como as jogadas. */
export const VALIDADE_LINK_VIDEO_MS = 30 * 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------ análises */

export const analises = {
  async listByTeam(teamId) {
    const rows = vivos(await db.byIndex(db.STORES.videoAnalyses, 'by_team', teamId));
    return rows.sort(
      (a, b) =>
        (b.recordedOn || '').localeCompare(a.recordedOn || '') || (b.createdAt || 0) - (a.createdAt || 0)
    );
  },

  async get(id) {
    const row = await db.get(db.STORES.videoAnalyses, id);
    return row && !row.deletedAt ? row : null;
  },

  /**
   * Cria ou muda uma análise. A origem do vídeo só se escolhe ao criar — um
   * link do YouTube (`youtubeId`) ou um ficheiro do computador (`localFile`,
   * só os metadados): trocar o vídeo deixava os clipes a apontar para tempos
   * de outro jogo. Num vídeo local, o ficheiro volta a ligar-se com
   * `ligarFicheiro`, que pede confirmação a quem a chama quando ele é outro.
   */
  async guardar(teamId, dados) {
    const atual = dados.id ? await db.get(db.STORES.videoAnalyses, dados.id) : null;
    const provider = atual
      ? atual.provider || FONTE.YOUTUBE
      : dados.provider === FONTE.LOCAL || (!dados.youtubeId && dados.localFile)
        ? FONTE.LOCAL
        : FONTE.YOUTUBE;
    const row = stamp({
      ...atual,
      id: dados.id || uid(),
      teamId,
      title: texto(dados.title, 200) || '—',
      provider,
      youtubeId: provider === FONTE.YOUTUBE ? atual?.youtubeId || dados.youtubeId : null,
      // Só os metadados (nome, tamanho, data, tipo, duração). O ficheiro em si
      // nunca entra na base de dados nem sai do aparelho.
      localFile:
        provider === FONTE.LOCAL ? metadadosDoFicheiro(atual ? atual.localFile : dados.localFile) : null,
      matchId: dados.matchId === undefined ? atual?.matchId || null : dados.matchId || null,
      recordedOn: dados.recordedOn === undefined ? atual?.recordedOn || null : dados.recordedOn || null,
      createdBy: atual?.createdBy || donoAtual() || null,
      deletedAt: null,
    });
    await db.put(db.STORES.videoAnalyses, row);
    notifyLocalChange();
    return row;
  },

  /**
   * Guarda os metadados do ficheiro que passou a estar ligado a uma análise
   * local: quando o treinador confirmou outro ficheiro, ou quando ficou a
   * saber-se a duração. Os clipes e as sessões não são tocados. Devolve a
   * linha, ou null se a análise não existe ou não é de um ficheiro local.
   */
  ligarFicheiro: (id, ficheiro, opcoes) =>
    emFila(async () => {
      const atual = await db.get(db.STORES.videoAnalyses, id);
      if (!atual || atual.deletedAt || atual.provider !== FONTE.LOCAL) return null;
      const novo = metadadosDoFicheiro(ficheiro, opcoes);
      if (!novo) return null;
      // A duração que já se sabia fica, se o ficheiro for o mesmo.
      if (!novo.durationMs && mesmoFicheiro(atual.localFile, novo)) {
        novo.durationMs = atual.localFile?.durationMs || null;
      }
      if (JSON.stringify(metadadosDoFicheiro(atual.localFile)) === JSON.stringify(novo)) return atual;
      const row = stamp({ ...atual, localFile: novo });
      await db.put(db.STORES.videoAnalyses, row);
      notifyLocalChange();
      return row;
    }),

  /** Apaga a análise e os clipes dela (as sessões ficam, sem esses clipes). */
  async apagar(id) {
    const atual = await db.get(db.STORES.videoAnalyses, id);
    if (!atual) return;
    const dela = vivos(await db.byIndex(db.STORES.videoClips, 'by_analysis', id));
    if (dela.length) {
      await db.putMany(
        db.STORES.videoClips,
        dela.map((c) => stamp({ ...c, deletedAt: now() }))
      );
    }
    await db.put(db.STORES.videoAnalyses, stamp({ ...atual, deletedAt: now() }));
    notifyLocalChange();
  },
};

/* -------------------------------------------------------------- clipes */

export const clipes = {
  async listByAnalysis(analysisId) {
    return ordenarClipes(vivos(await db.byIndex(db.STORES.videoClips, 'by_analysis', analysisId)));
  },

  async listByTeam(teamId) {
    return ordenarClipes(vivos(await db.byIndex(db.STORES.videoClips, 'by_team', teamId)));
  },

  async get(id) {
    const row = await db.get(db.STORES.videoClips, id);
    return row && !row.deletedAt ? row : null;
  },

  /**
   * Um clipe novo. Só os tempos são obrigatórios: o treinador pode marcar
   * tudo de seguida e etiquetar no fim.
   */
  async criar(analise, dados) {
    const { startMs, endMs } = prenderIntervalo(dados.startMs, dados.endMs, dados.duracaoMs);
    const row = stamp({
      id: uid(),
      analysisId: analise.id,
      teamId: analise.teamId,
      startMs,
      endMs,
      category: dados.category || null,
      subtype: dados.subtype || null,
      valence: dados.valence || null,
      playerIds: semRepetidos(dados.playerIds),
      note: texto(dados.note, 2000),
      createdBy: donoAtual() || null,
      deletedAt: null,
    });
    await db.put(db.STORES.videoClips, row);
    notifyLocalChange();
    return row;
  },

  /** Muda etiquetas (categoria, subtipo, valência, jogadores, nota). */
  editar: (id, patch) => emFila(() => clipes.editarJa(id, patch)),

  async editarJa(id, patch) {
    const atual = await db.get(db.STORES.videoClips, id);
    if (!atual || atual.deletedAt) return null;
    const novo = { ...atual };
    for (const campo of ['category', 'subtype', 'valence']) {
      if (patch[campo] !== undefined) novo[campo] = patch[campo] || null;
    }
    // Mudar de categoria leva o subtipo, que era da outra.
    if (patch.category !== undefined && patch.category !== atual.category && patch.subtype === undefined) {
      novo.subtype = null;
    }
    if (patch.playerIds !== undefined) novo.playerIds = semRepetidos(patch.playerIds);
    if (patch.note !== undefined) novo.note = texto(patch.note, 2000);
    const row = stamp(novo);
    await db.put(db.STORES.videoClips, row);
    notifyLocalChange();
    return row;
  },

  /** Marca ou desmarca um jogador no clipe (a multi-seleção da folha). */
  alternarJogador: (id, playerId) =>
    emFila(async () => {
      const atual = await db.get(db.STORES.videoClips, id);
      if (!atual || atual.deletedAt) return null;
      const lista = atual.playerIds || [];
      return clipes.editarJa(id, {
        playerIds: lista.includes(playerId) ? lista.filter((x) => x !== playerId) : [...lista, playerId],
      });
    }),

  /**
   * Acerta o início e/ou o fim. `novo` leva valores absolutos (`startMs`,
   * `endMs`: "usar tempo atual") ou saltos (`deltaStartMs`, `deltaEndMs`: ±1 s)
   * — os saltos somam-se ao que estiver gravado, para dois toques seguidos
   * darem 2 s e não 1.
   */
  acertar: (id, novo, duracaoMs = null) =>
    emFila(async () => {
      const atual = await db.get(db.STORES.videoClips, id);
      if (!atual || atual.deletedAt) return null;
      const alvo = {};
      if (novo.startMs != null) alvo.startMs = novo.startMs;
      if (novo.endMs != null) alvo.endMs = novo.endMs;
      if (novo.deltaStartMs) alvo.startMs = atual.startMs + novo.deltaStartMs;
      if (novo.deltaEndMs) alvo.endMs = atual.endMs + novo.deltaEndMs;
      const row = stamp({ ...atual, ...acertarIntervalo(atual, alvo, duracaoMs) });
      await db.put(db.STORES.videoClips, row);
      notifyLocalChange();
      return row;
    }),

  /** Uma cópia com as mesmas etiquetas: o mesmo lance visto por outro ângulo. */
  async duplicar(id) {
    const atual = await db.get(db.STORES.videoClips, id);
    if (!atual || atual.deletedAt) return null;
    const row = stamp({
      ...atual,
      id: uid(),
      createdBy: donoAtual() || null,
      createdAt: undefined,
      deletedAt: null,
    });
    await db.put(db.STORES.videoClips, row);
    notifyLocalChange();
    return row;
  },

  async apagar(id) {
    const atual = await db.get(db.STORES.videoClips, id);
    if (!atual) return;
    await db.put(db.STORES.videoClips, stamp({ ...atual, deletedAt: now() }));
    notifyLocalChange();
  },
};

/* ------------------------------------------------------------- sessões */

export const sessoes = {
  /** As sessões do escalão. As partilhas com jogadores (`playerId`) vêm também. */
  async listByTeam(teamId) {
    const rows = vivos(await db.byIndex(db.STORES.videoSessions, 'by_team', teamId));
    return rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  async get(id) {
    const row = await db.get(db.STORES.videoSessions, id);
    return row && !row.deletedAt ? row : null;
  },

  async criar(teamId, { title, clipIds = [], playerId = null }) {
    const row = stamp({
      id: uid(),
      teamId,
      title: texto(title, 200) || '—',
      clipIds: semRepetidos(clipIds),
      playerId,
      shareToken: null,
      shareExpiresAt: null,
      createdBy: donoAtual() || null,
      deletedAt: null,
    });
    await db.put(db.STORES.videoSessions, row);
    notifyLocalChange();
    return row;
  },

  mudar: (id, fazer) =>
    emFila(async () => {
      const atual = await db.get(db.STORES.videoSessions, id);
      if (!atual || atual.deletedAt) return null;
      const row = stamp({ ...atual, ...fazer(atual) });
      await db.put(db.STORES.videoSessions, row);
      notifyLocalChange();
      return row;
    }),

  renomear: (id, title) => sessoes.mudar(id, () => ({ title: texto(title, 200) || '—' })),
  ordenar: (id, clipIds) => sessoes.mudar(id, () => ({ clipIds: semRepetidos(clipIds) })),
  juntar: (id, novos) => sessoes.mudar(id, (s) => ({ clipIds: juntarASessao(s.clipIds, novos) })),
  tirar: (id, clipId) => sessoes.mudar(id, (s) => ({ clipIds: tirarDaSessao(s.clipIds, clipId) })),

  async apagar(id) {
    const atual = await db.get(db.STORES.videoSessions, id);
    if (!atual) return;
    await db.put(
      db.STORES.videoSessions,
      stamp({ ...atual, deletedAt: now(), shareToken: null, shareExpiresAt: null })
    );
    notifyLocalChange();
  },

  /** Um link novo, válido 30 dias. O anterior deixa de abrir. */
  novoLink: (id) =>
    sessoes.mudar(id, () => ({ shareToken: uid(), shareExpiresAt: now() + VALIDADE_LINK_VIDEO_MS })),
  desligarLink: (id) => sessoes.mudar(id, () => ({ shareToken: null, shareExpiresAt: null })),
};

/* ----------------------------------------------------------- conversas */

export const conversas = {
  listByTeam: (teamId) => db.byIndex(db.STORES.videoTalks, 'by_team', teamId),

  /**
   * "Já falámos" (ou desmarcar, com `falado = false`). A linha fica sempre:
   * sem data quer dizer por falar.
   */
  marcar: (clipe, playerId, falado = true) => emFila(() => conversas.marcarJa(clipe, playerId, falado)),

  async marcarJa(clipe, playerId, falado = true) {
    const id = idConversa(clipe.id, playerId);
    const atual = await db.get(db.STORES.videoTalks, id);
    if (!falado && !atual) return null;
    const row = stamp({
      ...atual,
      id,
      clipId: clipe.id,
      playerId,
      teamId: clipe.teamId,
      talkedAt: falado ? atual?.talkedAt || now() : null,
      note: atual?.note || null,
    });
    await db.put(db.STORES.videoTalks, row);
    notifyLocalChange();
    return row;
  },

  /** Marca vários de uma vez (no fim de uma conversa com o jogador). */
  async marcarVarios(lista, playerId) {
    const linhas = [];
    for (const clipe of lista) {
      const id = idConversa(clipe.id, playerId);
      const atual = await db.get(db.STORES.videoTalks, id);
      if (atual?.talkedAt) continue;
      linhas.push(
        stamp({ ...atual, id, clipId: clipe.id, playerId, teamId: clipe.teamId, talkedAt: now(), note: atual?.note || null })
      );
    }
    if (linhas.length) await db.putMany(db.STORES.videoTalks, linhas);
    notifyLocalChange();
  },
};
