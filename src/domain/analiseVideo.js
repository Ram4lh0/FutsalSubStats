// domain/analiseVideo.js — a lógica pura da Análise de vídeo (add-on
// 'analise-video'): ler o link do YouTube, criar e acertar clipes, filtrar,
// ordenar sessões e contar as conversas por ter com cada jogador.
//
// O vídeo nunca é nosso: guarda-se só de onde vem (`provider` + a referência,
// hoje o id do YouTube) e os tempos dos clipes em milissegundos. Nada aqui
// sabe o que é um leitor nem um servidor — é por isso que se testa sem browser.
//
// Regra de ouro, como nos registos e nos add-ons: um id de categoria ou de
// subtipo nunca muda de significado. Para tirar um da app, marca-se
// `retirado: true`; os clipes antigos continuam a saber o que eram.

import { uuidDe } from './treino.js';

/* ------------------------------------------------------------- a fonte */

/** De onde vem o vídeo. Hoje só o YouTube; o resto da app pergunta por aqui. */
export const FONTE = { YOUTUBE: 'youtube' };

const ID_YT = /^[A-Za-z0-9_-]{11}$/;
const HOSTS_YT = /^(www\.|m\.|music\.)?(youtube\.com|youtube-nocookie\.com)$/i;

/**
 * "1h2m3s", "90", "1m30s", "75s" → segundos. Devolve 0 quando não percebe.
 */
export function lerTempoDoLink(texto) {
  if (texto == null) return 0;
  const s = String(texto).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.floor(Number(s));
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

/**
 * O id de um vídeo do YouTube a partir do que o treinador colou.
 *
 * Aceita `youtu.be/ID`, `watch?v=ID`, `shorts/ID`, `live/ID`, `embed/ID`, com
 * ou sem `www.`/`m.`, com ou sem `&t=` (ou `?start=`), com ou sem `https://`, e
 * o id sozinho.
 *
 * @returns {{id: string, inicioSeg: number} | null}
 */
export function lerLinkYouTube(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto) return null;
  if (ID_YT.test(bruto)) return { id: bruto, inicioSeg: 0 };

  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(bruto) ? bruto : `https://${bruto}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const partes = url.pathname.split('/').filter(Boolean);
  let id = null;

  if (host === 'youtu.be') {
    id = partes[0] || null;
  } else if (HOSTS_YT.test(host)) {
    if (partes[0] === 'watch' || partes.length === 0) id = url.searchParams.get('v');
    else if (['shorts', 'live', 'embed', 'v'].includes(partes[0])) id = partes[1] || null;
  }
  if (!id || !ID_YT.test(id)) return null;

  const inicioSeg = lerTempoDoLink(url.searchParams.get('t') || url.searchParams.get('start'));
  return { id, inicioSeg };
}

/** A miniatura do YouTube (320×180), sem pedir nada à API. */
export function miniaturaYouTube(id) {
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

/** O plano B: abrir o vídeo no YouTube já no segundo certo. */
export function linkYouTubeNoSegundo(id, seg = 0) {
  const t = Math.max(0, Math.floor(Number(seg) || 0));
  return `https://www.youtube.com/watch?v=${id}${t ? `&t=${t}s` : ''}`;
}

/**
 * A fonte de uma análise, na forma que o leitor recebe. É o único sítio que
 * sabe em que campos ela está guardada: no dia em que houver outra fonte, os
 * clipes e as sessões não mudam.
 *
 * @returns {{tipo: string, id: string} | null}
 */
export function fonteDaAnalise(analise) {
  if (!analise) return null;
  const tipo = analise.provider || FONTE.YOUTUBE;
  if (tipo === FONTE.YOUTUBE) return analise.youtubeId ? { tipo, id: analise.youtubeId } : null;
  return null;
}

export function miniaturaDaAnalise(analise) {
  const fonte = fonteDaAnalise(analise);
  return fonte?.tipo === FONTE.YOUTUBE ? miniaturaYouTube(fonte.id) : null;
}

/* --------------------------------------------------------- o catálogo */

export const VALENCIA = { BOM: 'bom', CORRIGIR: 'corrigir', NEUTRO: 'neutro' };
export const VALENCIAS = [VALENCIA.BOM, VALENCIA.CORRIGIR, VALENCIA.NEUTRO];

/**
 * As categorias, pela ordem em que aparecem no painel de marcação (as mais
 * usadas primeiro). Os nomes vivem nos dicionários: `video.cat.<id>` e
 * `video.sub.<id>`; os subtipos com `registo: true` usam o nome que o registo
 * já tem na app (`registos.nome.<id>`), para o vocabulário ser o mesmo.
 */
export const CATEGORIAS_VIDEO = [
  {
    id: 'ataque',
    cor: '#22c55e',
    icone: 'ataque',
    subtipos: ['saida_pressao', 'rotacoes_4x0', 'rotacoes_3x1', 'rotacoes_2x2', 'paralelas', 'diagonais', 'bloqueios', 'finalizacao'],
  },
  {
    id: 'defesa',
    cor: '#38bdf8',
    icone: 'defesa',
    subtipos: ['pressao_alta', 'pressao_media', 'pressao_baixa', 'coberturas', 'trocas', 'bloqueios_defensivos'],
  },
  {
    id: 'transicao_of',
    cor: '#a3e635',
    icone: 'transicao_of',
    subtipos: ['recuperacao_saida', 'contra_ataque'],
  },
  {
    id: 'transicao_def',
    cor: '#f59e0b',
    icone: 'transicao_def',
    subtipos: ['reacao_perda', 'falta_tatica', 'recuperacao_defensiva'],
  },
  {
    id: 'bp_ofensiva',
    cor: '#c084fc',
    icone: 'bola_parada',
    subtipos: ['bp_canto', 'bp_livre', 'bp_lateral', 'bp_livre_10m', 'bp_penalti', 'bp_saida_bola'],
  },
  {
    id: 'bp_defensiva',
    cor: '#818cf8',
    icone: 'bola_parada',
    subtipos: ['bp_canto', 'bp_livre', 'bp_lateral', 'bp_livre_10m', 'bp_penalti', 'bp_saida_bola'],
  },
  {
    id: 'guarda_redes',
    cor: '#fbbf24',
    icone: 'guarda_redes',
    subtipos: ['gr_defesa', 'gr_saida', 'gr_reposicao', 'gr_jogo_pes', 'gr_5x4_atacar', 'gr_5x4_defender'],
  },
  {
    id: 'momento',
    cor: '#f43f5e',
    icone: 'momento',
    subtipos: [
      'golo_marcado',
      'golo_sofrido',
      'remate',
      'recuperacao',
      'perda_bola',
      'falta',
      'cartao',
      'erro_individual',
      // Os registos que a app já tem (domain/registos.js), com os mesmos ids.
      'remate_adv',
      'defesa_gr',
      'passe_falhado',
      'canto',
      'fora',
      'penalti',
      'penalti_adv',
      'lancamento_baliza',
      'lancamento_gr',
    ],
  },
];

/** Os subtipos que são registos da app: o nome vem de `registos.nome.<id>`. */
export const SUBTIPOS_DE_REGISTO = new Set([
  'remate',
  'recuperacao',
  'perda_bola',
  'remate_adv',
  'defesa_gr',
  'passe_falhado',
  'canto',
  'fora',
  'penalti',
  'penalti_adv',
  'lancamento_baliza',
  'lancamento_gr',
]);

const POR_ID = new Map(CATEGORIAS_VIDEO.map((c) => [c.id, c]));

/** Uma categoria que já não se conhece (ou nenhuma) pinta-se a cinzento. */
const SEM_CATEGORIA = { id: null, cor: '#91a4c4', icone: 'momento', subtipos: [] };

export function categoriaVideo(id) {
  return POR_ID.get(id) || SEM_CATEGORIA;
}

export function corDaCategoria(id) {
  return categoriaVideo(id).cor;
}

/** A chave do dicionário de um subtipo. */
export function chaveDoSubtipo(id) {
  return SUBTIPOS_DE_REGISTO.has(id) ? `registos.nome.${id}` : `video.sub.${id}`;
}

/** Problemas do catálogo que os testes não deixam passar. */
export function problemasDoCatalogoVideo(catalogo = CATEGORIAS_VIDEO) {
  const problemas = [];
  const vistos = new Set();
  for (const c of catalogo) {
    if (!c.id) problemas.push('categoria sem id');
    if (vistos.has(c.id)) problemas.push(`${c.id}: categoria repetida`);
    vistos.add(c.id);
    if (!/^#[0-9a-f]{6}$/i.test(c.cor || '')) problemas.push(`${c.id}: cor inválida`);
    if (!c.icone) problemas.push(`${c.id}: falta o ícone`);
    if (new Set(c.subtipos).size !== c.subtipos.length) problemas.push(`${c.id}: subtipo repetido`);
  }
  return problemas;
}

/* -------------------------------------------------------------- clipes */

/** O que um toque numa categoria corta: 6 s para trás e 4 s para a frente. */
export const OMISSAO_CLIPE = { antesMs: 6000, depoisMs: 4000 };
/** Um clipe nunca fica com menos de meio segundo. */
export const CLIPE_MINIMO_MS = 500;
const LIMITE_MARGEM_MS = 60000;

const inteiro = (v) => Math.max(0, Math.round(Number(v) || 0));

/** Acerta as margens que o treinador escolheu: inteiras, entre 0 e 60 s. */
export function normalizarMargens(m) {
  const lim = (v, omissao) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(LIMITE_MARGEM_MS, Math.max(0, Math.round(n))) : omissao;
  };
  const antesMs = lim(m?.antesMs, OMISSAO_CLIPE.antesMs);
  let depoisMs = lim(m?.depoisMs, OMISSAO_CLIPE.depoisMs);
  if (antesMs + depoisMs < CLIPE_MINIMO_MS) depoisMs = CLIPE_MINIMO_MS - antesMs;
  return { antesMs, depoisMs };
}

/**
 * Prende um intervalo ao vídeo: começa em 0 ou depois, acaba na duração ou
 * antes (quando se sabe), e tem pelo menos `CLIPE_MINIMO_MS`.
 */
export function prenderIntervalo(startMs, endMs, duracaoMs = null) {
  const teto = duracaoMs && duracaoMs > 0 ? inteiro(duracaoMs) : null;
  let a = inteiro(startMs);
  let b = inteiro(endMs);
  if (b < a) [a, b] = [b, a];
  if (teto != null) {
    b = Math.min(b, teto);
    a = Math.min(a, Math.max(0, teto - CLIPE_MINIMO_MS));
  }
  if (b - a < CLIPE_MINIMO_MS) b = a + CLIPE_MINIMO_MS;
  if (teto != null && b > teto) {
    b = teto;
    a = Math.max(0, b - CLIPE_MINIMO_MS);
  }
  return { startMs: a, endMs: b };
}

/**
 * O clipe de um toque: [t − antes, t + depois], preso ao vídeo.
 *
 * @param {number} tMs onde o vídeo estava no toque
 */
export function intervaloDoToque(tMs, margens = OMISSAO_CLIPE, duracaoMs = null) {
  const { antesMs, depoisMs } = normalizarMargens(margens);
  const t = inteiro(tMs);
  return prenderIntervalo(t - Math.min(antesMs, t), t + depoisMs, duracaoMs);
}

/** O clipe manual: "marcar início" e "marcar fim", por qualquer ordem. */
export function intervaloManual(inicioMs, fimMs, duracaoMs = null) {
  return prenderIntervalo(inicioMs, fimMs, duracaoMs);
}

/**
 * Acerta o início ou o fim de um clipe (±1 s, ou "usar tempo atual"). O lado
 * que se mexe nunca atravessa o outro: pára a `CLIPE_MINIMO_MS` dele.
 *
 * @param {{startMs:number,endMs:number}} clipe
 * @param {{startMs?:number,endMs?:number}} novo valores absolutos
 */
export function acertarIntervalo(clipe, novo, duracaoMs = null) {
  let a = clipe.startMs;
  let b = clipe.endMs;
  if (novo.startMs != null) a = Math.min(inteiro(novo.startMs), b - CLIPE_MINIMO_MS);
  if (novo.endMs != null) b = Math.max(inteiro(novo.endMs), a + CLIPE_MINIMO_MS);
  return prenderIntervalo(Math.max(0, a), b, duracaoMs);
}

/** Tira repetidos e vazios de uma lista de ids, mantendo a ordem. */
export function semRepetidos(ids) {
  const vistos = new Set();
  const saida = [];
  for (const id of ids || []) {
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    saida.push(id);
  }
  return saida;
}

/** Pela ordem do vídeo: início, depois fim, depois quando foi criado. */
export function ordenarClipes(clipes) {
  return [...clipes].sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs || (a.createdAt || 0) - (b.createdAt || 0)
  );
}

/* -------------------------------------------------------------- filtros */

export const FILTRO_VAZIO = { categorias: [], subtipos: [], jogadores: [], valencias: [] };

export function filtroAtivo(f) {
  return Boolean(
    f && (f.categorias?.length || f.subtipos?.length || f.jogadores?.length || f.valencias?.length)
  );
}

/**
 * Dentro de cada grupo é "um destes"; entre grupos é "todos": categoria
 * Ataque OU Defesa, E jogador João, E valência a corrigir. Um clipe sem
 * valência conta como neutro.
 */
export function filtrarClipes(clipes, filtro = FILTRO_VAZIO) {
  const cats = new Set(filtro.categorias || []);
  const subs = new Set(filtro.subtipos || []);
  const jogs = new Set(filtro.jogadores || []);
  const vals = new Set(filtro.valencias || []);
  return clipes.filter((c) => {
    if (cats.size && !cats.has(c.category)) return false;
    if (subs.size && !subs.has(c.subtype)) return false;
    if (vals.size && !vals.has(c.valence || VALENCIA.NEUTRO)) return false;
    if (jogs.size && !(c.playerIds || []).some((p) => jogs.has(p))) return false;
    return true;
  });
}

/** Liga ou desliga um valor num dos grupos do filtro (os chips). */
export function alternarFiltro(filtro, grupo, valor) {
  const atual = filtro[grupo] || [];
  const novo = atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor];
  const saida = { ...FILTRO_VAZIO, ...filtro, [grupo]: novo };
  // Um subtipo só faz sentido dentro das categorias escolhidas.
  if (grupo === 'categorias' && saida.subtipos.length) {
    const validos = new Set(saida.categorias.flatMap((c) => categoriaVideo(c).subtipos));
    saida.subtipos = saida.categorias.length ? saida.subtipos.filter((s) => validos.has(s)) : [];
  }
  return saida;
}

/** O que há para filtrar nestes clipes: só aparecem chips do que existe. */
export function opcoesDeFiltro(clipes) {
  const categorias = new Set();
  const subtipos = new Set();
  const jogadores = new Set();
  const valencias = new Set();
  for (const c of clipes) {
    if (c.category) categorias.add(c.category);
    if (c.subtype) subtipos.add(c.subtype);
    valencias.add(c.valence || VALENCIA.NEUTRO);
    for (const p of c.playerIds || []) jogadores.add(p);
  }
  return {
    categorias: CATEGORIAS_VIDEO.map((c) => c.id).filter((id) => categorias.has(id)),
    subtipos: [...subtipos],
    jogadores: [...jogadores],
    valencias: VALENCIAS.filter((v) => valencias.has(v)),
  };
}

/* ---------------------------------------------------- playlist e leitor */

/**
 * "Ver filtrados seguidos": o clipe a seguir a este na fila, ou null no fim.
 * Sem `atualId`, o primeiro.
 */
export function seguinteNaFila(fila, atualId) {
  if (!fila.length) return null;
  if (!atualId) return fila[0];
  const i = fila.findIndex((c) => c.id === atualId);
  return i === -1 ? fila[0] : fila[i + 1] || null;
}

export function anteriorNaFila(fila, atualId) {
  const i = fila.findIndex((c) => c.id === atualId);
  return i > 0 ? fila[i - 1] : null;
}

/** O clipe acabou? Com meio "tique" de folga, que o leitor só avisa a ~4 Hz. */
export function clipeAcabou(clipe, tMs) {
  return Boolean(clipe) && tMs >= clipe.endMs - 60;
}

/** "1:05", "12:40", "1:02:03". Com `decimas`, "1:05.3" (o avanço fino). */
export function tempoVideo(ms, { decimas = false } = {}) {
  const total = Math.max(0, Number(ms) || 0);
  const s = Math.floor(total / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = String(s % 60).padStart(2, '0');
  const base = h ? `${h}:${String(m).padStart(2, '0')}:${seg}` : `${m}:${seg}`;
  return decimas ? `${base}.${Math.floor((total % 1000) / 100)}` : base;
}

/* -------------------------------------------------------------- sessões */

/** Muda um clipe de sítio na sessão (o arraste). */
export function moverNaLista(ids, de, para) {
  const lista = [...ids];
  if (de < 0 || de >= lista.length) return lista;
  const destino = Math.min(lista.length - 1, Math.max(0, para));
  const [item] = lista.splice(de, 1);
  lista.splice(destino, 0, item);
  return lista;
}

/** Acrescenta clipes ao fim da sessão, sem repetir os que já lá estão. */
export function juntarASessao(ids, novos) {
  return semRepetidos([...(ids || []), ...(novos || [])]);
}

export function tirarDaSessao(ids, clipId) {
  return (ids || []).filter((id) => id !== clipId);
}

/**
 * Os clipes de uma sessão, pela ordem dela. Um clipe apagado (ou que ainda
 * não chegou a este aparelho) fica de fora, sem partir a ordem dos outros.
 *
 * @param {{clipIds: string[]}} sessao
 * @param {Map<string, object>} porId os clipes vivos, por id
 */
export function clipesDaSessao(sessao, porId) {
  return semRepetidos(sessao?.clipIds)
    .map((id) => porId.get(id))
    .filter((c) => c && !c.deletedAt);
}

/* ----------------------------------------------------------- conversas */

/**
 * A conversa sobre um clipe com um jogador tem id derivado do par, como as
 * presenças: dois aparelhos a marcar "já falámos" não criam duas linhas.
 */
export const idConversa = (clipId, playerId) => uuidDe(`conversa-video:${clipId}:${playerId}`);

/** Map "clipId:playerId" → quando se falou (ms). Só as que têm data. */
export function indiceDeConversas(conversas) {
  const indice = new Map();
  for (const c of conversas || []) {
    if (c.talkedAt) indice.set(`${c.clipId}:${c.playerId}`, c.talkedAt);
  }
  return indice;
}

/**
 * Por jogador: quantos clipes tem e quantos ainda estão por mostrar.
 *
 * @returns {Map<string, {total: number, pendentes: number}>}
 */
export function contarPorJogador(clipes, conversas) {
  const faladas = indiceDeConversas(conversas);
  const contas = new Map();
  for (const c of clipes) {
    if (c.deletedAt) continue;
    for (const p of semRepetidos(c.playerIds)) {
      const conta = contas.get(p) || { total: 0, pendentes: 0 };
      conta.total += 1;
      if (!faladas.has(`${c.id}:${p}`)) conta.pendentes += 1;
      contas.set(p, conta);
    }
  }
  return contas;
}

/**
 * A ficha de um jogador: os clipes dele agrupados por categoria (pela ordem
 * do catálogo) e, dentro de cada uma, por valência. Cada clipe leva
 * `faladoEm` (ms) ou null.
 *
 * @returns {Array<{categoria: string|null, grupos: Array<{valencia: string, clipes: object[]}>}>}
 */
export function fichaDoJogador(clipes, playerId, conversas) {
  const faladas = indiceDeConversas(conversas);
  const meus = ordenarClipes(
    clipes.filter((c) => !c.deletedAt && (c.playerIds || []).includes(playerId))
  ).map((c) => ({ ...c, faladoEm: faladas.get(`${c.id}:${playerId}`) || null }));

  const ordem = [...CATEGORIAS_VIDEO.map((c) => c.id), null];
  const saida = [];
  for (const cat of ordem) {
    const daCategoria = meus.filter((c) => (POR_ID.has(c.category) ? c.category : null) === cat);
    if (!daCategoria.length) continue;
    const grupos = VALENCIAS.map((valencia) => ({
      valencia,
      clipes: daCategoria.filter((c) => (c.valence || VALENCIA.NEUTRO) === valencia),
    })).filter((g) => g.clipes.length);
    saida.push({ categoria: cat, grupos });
  }
  return saida;
}

/** A fila de conversas por ter com um jogador: os clipes dele por mostrar. */
export function pendentesDoJogador(clipes, playerId, conversas) {
  const faladas = indiceDeConversas(conversas);
  return ordenarClipes(
    clipes.filter(
      (c) => !c.deletedAt && (c.playerIds || []).includes(playerId) && !faladas.has(`${c.id}:${playerId}`)
    )
  );
}

/* -------------------------------------------------------- cartões da lista */

/** O que o cartão de uma análise mostra: nº de clipes e de jogadores marcados. */
export function resumoDaAnalise(clipes) {
  const vivos = clipes.filter((c) => !c.deletedAt);
  const jogadores = new Set(vivos.flatMap((c) => c.playerIds || []));
  return { clipes: vivos.length, jogadores: jogadores.size };
}
