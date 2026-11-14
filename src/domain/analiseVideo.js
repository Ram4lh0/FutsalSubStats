// domain/analiseVideo.js — a lógica pura da Análise de vídeo (add-on
// 'analise-video'): ler o link do YouTube, reconhecer um ficheiro do
// computador, criar e acertar clipes, filtrar, ordenar sessões e contar as
// conversas por ter com cada jogador.
//
// O vídeo nunca é nosso: guarda-se só de onde vem (`provider` + a referência:
// o id do YouTube, ou o nome, o tamanho e a data de um ficheiro que fica no
// aparelho) e os tempos dos clipes em milissegundos. Nada aqui sabe o que é um
// leitor nem um servidor — é por isso que se testa sem browser.
//
// Regra de ouro, como nos registos e nos add-ons: um id de categoria ou de
// subtipo nunca muda de significado. Para tirar um da app, marca-se
// `retirado: true`; os clipes antigos continuam a saber o que eram.

import { uuidDe } from './treino.js';

/* ------------------------------------------------------------- a fonte */

/**
 * De onde vem o vídeo: um link do YouTube ou um ficheiro do computador, que
 * nunca sai do aparelho. O resto da app pergunta por aqui.
 */
export const FONTE = { YOUTUBE: 'youtube', LOCAL: 'local' };

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

/* ------------------------------------------------ ficheiro do computador */

// Um vídeo local nunca é guardado nem enviado: fica no disco do treinador e a
// app só o lê, aos bocados, enquanto toca. O que se guarda (e sincroniza) é o
// bastante para o reconhecer quando ele o voltar a escolher: nome, tamanho,
// data de modificação, tipo e, quando se sabe, a duração.

const LIMITE_NOME_FICHEIRO = 255;
const numeroOuNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/**
 * Os metadados de um ficheiro, na forma em que se guardam. Aceita um `File`
 * do browser ou o que veio da base de dados; devolve null quando não há nome.
 * Só copia campos simples: nunca o `File`, nunca um `Blob`, nunca um endereço
 * `blob:`.
 *
 * @returns {{name: string, size: number|null, type: string, lastModified: number|null, durationMs: number|null} | null}
 */
export function metadadosDoFicheiro(ficheiro, { durationMs } = {}) {
  if (!ficheiro || typeof ficheiro !== 'object') return null;
  const name = String(ficheiro.name ?? '').trim().slice(0, LIMITE_NOME_FICHEIRO);
  if (!name) return null;
  const duracao = durationMs !== undefined ? durationMs : ficheiro.durationMs;
  return {
    name,
    size: numeroOuNull(ficheiro.size),
    type: String(ficheiro.type ?? '').slice(0, 100),
    lastModified: numeroOuNull(ficheiro.lastModified),
    durationMs: numeroOuNull(duracao) || null,
  };
}

/**
 * O que distingue o ficheiro escolhido do que está guardado: 'name', 'size',
 * 'lastModified'. Vazio quer dizer que é o mesmo. Um campo que falte de um dos
 * lados não conta — uma análise que não o tenha guardado não fica presa.
 * O tipo fica de fora de propósito: o mesmo ficheiro aparece como
 * `video/mp4` num browser e sem tipo noutro.
 *
 * @returns {string[]}
 */
export function diferencasDoFicheiro(guardado, escolhido) {
  const a = metadadosDoFicheiro(guardado);
  const b = metadadosDoFicheiro(escolhido);
  if (!a || !b) return [];
  const saida = [];
  if (a.name !== b.name) saida.push('name');
  if (a.size != null && b.size != null && a.size !== b.size) saida.push('size');
  if (a.lastModified != null && b.lastModified != null && a.lastModified !== b.lastModified) {
    saida.push('lastModified');
  }
  return saida;
}

/** O ficheiro escolhido é o que a análise guardou? */
export function mesmoFicheiro(guardado, escolhido) {
  return (
    Boolean(metadadosDoFicheiro(guardado) && metadadosDoFicheiro(escolhido)) &&
    diferencasDoFicheiro(guardado, escolhido).length === 0
  );
}

/** "Jogo_com_o_Sporting.mp4" → "Jogo com o Sporting": o título que se sugere. */
export function tituloDoFicheiro(nome) {
  const semPasta = String(nome ?? '').split(/[\\/]/).pop() || '';
  const semExtensao = semPasta.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return (semExtensao || semPasta).replace(/_+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** 5 795 000 000 → "5,4 GB". Sem tamanho, texto vazio. */
export function tamanhoLegivel(bytes, separador = ',') {
  const n = numeroOuNull(bytes);
  if (n == null) return '';
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  let valor = n;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i += 1;
  }
  const texto = i === 0 || valor >= 100 ? String(Math.round(valor)) : valor.toFixed(1);
  return `${texto.replace('.', separador)} ${unidades[i]}`;
}

/* --------------------------------------------------- a fonte da análise */

/** A origem de uma análise. As gravadas antes de haver o campo são do YouTube. */
export function origemDaAnalise(analise) {
  return analise?.provider || FONTE.YOUTUBE;
}

/**
 * A fonte de uma análise, na forma que o leitor recebe. É o único sítio que
 * sabe em que campos ela está guardada: os clipes e as sessões só guardam
 * tempos, e por isso não mudam com a fonte.
 *
 *   YouTube → { tipo: 'youtube', id: <id do vídeo> }
 *   local   → { tipo: 'local', id: <id da análise>, ficheiro: <metadados> }
 *
 * Num vídeo local o `id` é o da análise: é com ele que se procura o ficheiro
 * que o treinador ligou neste aparelho (lib/videoLocal.js).
 *
 * @returns {{tipo: string, id: string, ficheiro?: object|null} | null}
 */
export function fonteDaAnalise(analise) {
  if (!analise) return null;
  const tipo = origemDaAnalise(analise);
  if (tipo === FONTE.YOUTUBE) return analise.youtubeId ? { tipo, id: analise.youtubeId } : null;
  if (tipo === FONTE.LOCAL) {
    return analise.id ? { tipo, id: analise.id, ficheiro: metadadosDoFicheiro(analise.localFile) } : null;
  }
  return null;
}

/** Duas fontes são o mesmo vídeo? (o mesmo tipo e a mesma referência) */
export function mesmaFonte(a, b) {
  return Boolean(a && b) && a.tipo === b.tipo && a.id === b.id;
}

/**
 * Como o leitor passa do vídeo que tem (`atual`) para o que lhe pedem
 * (`alvo`). É a regra que evita tocar o vídeo anterior ou ficar preso a meio
 * de uma troca:
 *
 *   'ir'      → é o mesmo vídeo e o leitor está livre: basta saltar para lá;
 *   'dentro'  → outro vídeo do YouTube com o leitor do YouTube livre: o
 *               próprio leitor troca de vídeo, sem ser montado de novo;
 *   'trocar'  → tudo o resto (outra origem, outro ficheiro, ou um leitor que
 *               ainda está a abrir): monta-se o leitor certo e o pedido fica
 *               guardado até ele dizer que está pronto.
 *
 * @param {object|null} atual a fonte que está no leitor
 * @param {object|null} alvo a fonte pedida
 * @param {boolean} livre o leitor está pronto e sem pedidos por cumprir
 * @returns {'ir' | 'dentro' | 'trocar' | null} null se não há para onde ir
 */
export function passoDeAbertura(atual, alvo, livre) {
  if (!alvo) return null;
  if (!livre) return 'trocar';
  if (mesmaFonte(alvo, atual)) return 'ir';
  if (alvo.tipo === FONTE.YOUTUBE && atual?.tipo === FONTE.YOUTUBE) return 'dentro';
  return 'trocar';
}

/**
 * As análises com vídeo local de onde vêm estes clipes, sem repetir e pela
 * ordem em que aparecem. É o que decide se uma sessão se pode partilhar por
 * link (só com YouTube) e que ficheiros é preciso ter ligados para a ver.
 *
 * @param {object[]} clipes
 * @param {Map<string, object>} analisesPorId
 * @returns {object[]}
 */
export function analisesLocaisDosClipes(clipes, analisesPorId) {
  const vistas = new Set();
  const saida = [];
  for (const c of clipes || []) {
    const analise = analisesPorId?.get(c.analysisId);
    if (!analise || vistas.has(analise.id) || origemDaAnalise(analise) !== FONTE.LOCAL) continue;
    vistas.add(analise.id);
    saida.push(analise);
  }
  return saida;
}

/* ------------------------------------------------- a área real da imagem */

// A preparação para os desenhos por cima do vídeo: o leitor ocupa uma caixa,
// mas a imagem só enche a caixa toda quando as proporções coincidem. Senão há
// barras pretas (em cima e em baixo, ou dos lados), e um desenho tem de ficar
// agarrado à imagem, não à caixa. Guardar pontos em fração da imagem (0–1)
// faz com que sirvam em qualquer tamanho de ecrã, na análise e a apresentar.

export const PROPORCAO_OMISSAO = 16 / 9;

/**
 * Onde fica a imagem dentro da caixa do leitor (como `object-fit: contain`).
 *
 * @param {{largura: number, altura: number}} caixa em píxeis
 * @param {number} proporcao largura / altura do vídeo
 * @returns {{x: number, y: number, largura: number, altura: number}}
 */
export function areaDaImagem(caixa, proporcao = PROPORCAO_OMISSAO) {
  const largura = Math.max(0, Number(caixa?.largura) || 0);
  const altura = Math.max(0, Number(caixa?.altura) || 0);
  const p = Number.isFinite(Number(proporcao)) && Number(proporcao) > 0 ? Number(proporcao) : PROPORCAO_OMISSAO;
  if (!largura || !altura) return { x: 0, y: 0, largura: 0, altura: 0 };
  if (largura / altura > p) {
    // Caixa mais larga do que o vídeo: barras dos lados.
    const l = altura * p;
    return { x: (largura - l) / 2, y: 0, largura: l, altura };
  }
  // Caixa mais alta do que o vídeo: barras em cima e em baixo.
  const a = largura / p;
  return { x: 0, y: (altura - a) / 2, largura, altura: a };
}

/**
 * Um ponto da caixa (píxeis) em fração da imagem: (0,0) é o canto de cima à
 * esquerda da imagem, (1,1) o de baixo à direita. `dentro` diz se o ponto
 * caiu mesmo na imagem e não numa barra preta.
 */
export function pontoNaImagem(area, px, py) {
  if (!area?.largura || !area?.altura) return { x: 0, y: 0, dentro: false };
  const x = (Number(px) - area.x) / area.largura;
  const y = (Number(py) - area.y) / area.altura;
  return { x, y, dentro: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
}

/** O inverso: um ponto em fração da imagem → píxeis da caixa. */
export function pontoNaCaixa(area, x, y) {
  return {
    x: (area?.x || 0) + Number(x) * (area?.largura || 0),
    y: (area?.y || 0) + Number(y) * (area?.altura || 0),
  };
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
