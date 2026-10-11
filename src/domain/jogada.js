// domain/jogada.js — uma jogada do quadro tático, e como se anima.
//
// ## A forma dos dados
//
//   {
//     v: 1,
//     campo: 'inteiro' | 'meio',
//     pecas: [{ id, tipo, lado, num, nome }],
//     frames: [{ dur, pos: { [idPeca]: [x, y] } }]
//   }
//
// As posições vão de 0 a 1000 no comprimento do campo (40 m) e de 0 a 500 na
// largura (20 m) — inteiros, para o JSON ficar curto e não depender do tamanho
// do ecrã. O meio-campo é só outra moldura sobre o mesmo campo: a metade do
// ataque, x de 500 a 1000.
//
// Um frame só escreve as peças que mexeram; as outras herdam a posição do
// frame anterior. `dur` é quanto tempo demora a chegar a este frame, vindo do
// anterior (o primeiro frame é a posição de partida e o seu `dur` não conta).
//
// ## Porque é que as peças não saltam
//
// Entre dois frames cada peça desliza por uma curva Catmull-Rom que passa por
// todas as suas posições — por isso quem corre por três frames seguidos faz
// uma curva em vez de três retas com esquinas. A velocidade ao longo do troço
// segue uma curva de Hermite: parte do zero quando a peça estava parada antes,
// trava até ao zero quando vai ficar parada depois, e mantém o ritmo quando o
// movimento continua. É o que faz um corte parecer um corte e não um robô.

export const VERSAO = 1;
export const COMPRIMENTO = 1000;
export const LARGURA = 500;

export const VELOCIDADES = [0.5, 0.75, 1, 1.25, 1.5];
export const DURACOES = [500, 750, 1000, 1500, 2000, 3000];
export const DURACAO_PADRAO = 1000;

export const TIPO = {
  JOGADOR: 'jogador',
  GR: 'gr',
  BOLA: 'bola',
  CONE: 'cone',
};

export const LADO = { NOS: 'nos', ELES: 'eles' };

export const CATEGORIAS = [
  'CANTO',
  'LIVRE',
  'PONTAPE_LINHA_LATERAL',
  'SAIDA_DE_BOLA',
  'MOVIMENTACAO',
  'ATAQUE',
  'DEFESA',
  'OUTRA',
];

/**
 * Uma jogada vazia. No campo inteiro, os cinco em 3-1 com o GR na baliza; no
 * meio-campo (o do ataque), só os quatro de campo — o GR ficava perdido a meio
 * do campo e confundia mais do que ajudava. Acrescenta-se pela paleta se fizer
 * falta (ex.: 5x4).
 */
export function jogadaNova(campo = 'meio') {
  const campoTodo = campo !== 'meio';
  const pecas = [
    ...(campoTodo ? [{ id: 'gr', tipo: TIPO.GR, lado: LADO.NOS, num: 1 }] : []),
    { id: 'n2', tipo: TIPO.JOGADOR, lado: LADO.NOS, num: 2 },
    { id: 'n3', tipo: TIPO.JOGADOR, lado: LADO.NOS, num: 3 },
    { id: 'n4', tipo: TIPO.JOGADOR, lado: LADO.NOS, num: 4 },
    { id: 'n5', tipo: TIPO.JOGADOR, lado: LADO.NOS, num: 5 },
    { id: 'bola', tipo: TIPO.BOLA },
  ];
  const pos = campoTodo
    ? { gr: [40, 250], n2: [250, 250], n3: [380, 110], n4: [380, 390], n5: [480, 250], bola: [265, 262] }
    : { n2: [600, 250], n3: [730, 110], n4: [730, 390], n5: [860, 250], bola: [615, 262] };
  return { v: VERSAO, campo, pecas, frames: [{ dur: DURACAO_PADRAO, pos }] };
}

/** Garante a forma esperada, venha a jogada de onde vier (servidor, link). */
export function normalizar(data) {
  const d = data && typeof data === 'object' ? data : {};
  const pecas = Array.isArray(d.pecas) ? d.pecas.filter((p) => p && p.id) : [];
  let frames = Array.isArray(d.frames) ? d.frames : [];
  frames = frames.map((f) => ({
    dur: Number(f?.dur) > 0 ? Number(f.dur) : DURACAO_PADRAO,
    pos: f?.pos && typeof f.pos === 'object' ? f.pos : {},
  }));
  if (!frames.length) frames = [{ dur: DURACAO_PADRAO, pos: {} }];
  return { v: VERSAO, campo: d.campo === 'inteiro' ? 'inteiro' : 'meio', pecas, frames };
}

const limitar = (v, max) => Math.max(0, Math.min(max, Math.round(v)));

export function limitarPonto([x, y]) {
  return [limitar(x, COMPRIMENTO), limitar(y, LARGURA)];
}

/**
 * As posições de todas as peças em todos os frames, já com a herança
 * resolvida. `resolvidas[f][id] = [x, y]`.
 *
 * Uma peça que ainda não tem posição nenhuma (acrescentada a meio) fica na
 * primeira posição que lhe for dada — aparece logo no início, já no sítio.
 */
export function resolverPosicoes(data) {
  const { pecas, frames } = data;
  const primeira = {};
  for (const p of pecas) {
    for (const f of frames) {
      if (f.pos[p.id]) {
        primeira[p.id] = f.pos[p.id];
        break;
      }
    }
    if (!primeira[p.id]) primeira[p.id] = [COMPRIMENTO / 2, LARGURA / 2];
  }
  const saida = [];
  let atual = { ...primeira };
  for (const f of frames) {
    atual = { ...atual, ...f.pos };
    saida.push(atual);
  }
  return saida;
}

/** Instante (ms, à velocidade 1×) em que se chega a cada frame. */
export function instantesDosFrames(data) {
  const t = [0];
  for (let i = 1; i < data.frames.length; i++) t.push(t[i - 1] + data.frames[i].dur);
  return t;
}

export function duracaoTotal(data) {
  const t = instantesDosFrames(data);
  return t[t.length - 1];
}

const iguais = (a, b) => a[0] === b[0] && a[1] === b[1];

/** Hermite com tangentes m0, m1 em [0,1] → [0,1]. */
function tempo(u, m0, m1) {
  const u2 = u * u;
  const u3 = u2 * u;
  return -2 * u3 + 3 * u2 + m0 * (u3 - 2 * u2 + u) + m1 * (u3 - u2);
}

/** Catmull-Rom uniforme entre p1 e p2. */
function catmull(p0, p1, p2, p3, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  const c = (a, b, c2, d) =>
    0.5 * (2 * b + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d) * u2 + (-a + 3 * b - 3 * c2 + d) * u3);
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
}

/**
 * Onde está cada peça no instante `t` (ms, à velocidade 1×).
 *
 * @param {object} data jogada normalizada
 * @param {number} t
 * @param {Array} [resolvidas] o resultado de `resolverPosicoes`, para não o
 *   recalcular a cada fotograma da animação
 * @returns {Object<string, [number, number]>}
 */
export function posicoesNoInstante(data, t, resolvidas = resolverPosicoes(data)) {
  const n = data.frames.length;
  if (n === 1 || t <= 0) return resolvidas[0];
  const instantes = instantesDosFrames(data);
  const fim = instantes[n - 1];
  if (t >= fim) return resolvidas[n - 1];

  let i = 1;
  while (i < n - 1 && instantes[i] <= t) i++;
  // Troço do frame i-1 para o frame i.
  const u = (t - instantes[i - 1]) / (instantes[i] - instantes[i - 1] || 1);

  const saida = {};
  for (const p of data.pecas) {
    const id = p.id;
    const a = resolvidas[i - 1][id];
    const b = resolvidas[i][id];
    if (iguais(a, b)) {
      saida[id] = a;
      continue;
    }
    // Vizinhos para a curva. Quando a peça esteve (ou vai ficar) parada, o
    // vizinho é o próprio ponto: a curva sai/entra a direito, sem inventar
    // uma volta que ninguém desenhou.
    const antes = i >= 2 ? resolvidas[i - 2][id] : a;
    const depois = i + 1 < n ? resolvidas[i + 1][id] : b;
    const paradoAntes = iguais(antes, a);
    const paradoDepois = iguais(depois, b);
    const s = tempo(u, paradoAntes ? 0 : 1, paradoDepois ? 0 : 1);
    saida[id] = catmull(antes, a, b, depois, s);
  }
  return saida;
}

/** O frame a que pertence o instante `t` (o último por onde já se passou). */
export function frameNoInstante(data, t) {
  const instantes = instantesDosFrames(data);
  let f = 0;
  for (let i = 0; i < instantes.length; i++) if (instantes[i] <= t + 0.5) f = i;
  return f;
}

/* ------------------------------------------------------------- edição */

/** Acrescenta um frame depois de `indice`, igual a ele (sem nada escrito). */
export function acrescentarFrame(data, indice) {
  const frames = [...data.frames];
  frames.splice(indice + 1, 0, { dur: DURACAO_PADRAO, pos: {} });
  return { ...data, frames };
}

/**
 * Apaga um frame. O que esse frame tinha escrito passa para o seguinte, para
 * que as peças não mudem de sítio nos frames que ficam.
 */
export function apagarFrame(data, indice) {
  if (data.frames.length <= 1) return data;
  const resolvidas = resolverPosicoes(data);
  const frames = data.frames.filter((_, i) => i !== indice);
  if (indice === 0) {
    frames[0] = { ...frames[0], pos: { ...resolvidas[1] } };
  } else if (indice < data.frames.length - 1) {
    const seguinte = frames[indice];
    const explicitas = { ...data.frames[indice].pos, ...seguinte.pos };
    frames[indice] = { ...seguinte, pos: explicitas };
  }
  return { ...data, frames };
}

/** Põe uma peça num sítio, no frame `indice`. */
export function moverPeca(data, indice, id, ponto) {
  const frames = data.frames.map((f, i) =>
    i === indice ? { ...f, pos: { ...f.pos, [id]: limitarPonto(ponto) } } : f
  );
  return { ...data, frames };
}

export function mudarDuracao(data, indice, dur) {
  const frames = data.frames.map((f, i) => (i === indice ? { ...f, dur } : f));
  return { ...data, frames };
}

/** Uma peça nova entra no frame 0, para existir desde o início. */
export function acrescentarPeca(data, peca, ponto) {
  const frames = data.frames.map((f, i) =>
    i === 0 ? { ...f, pos: { ...f.pos, [peca.id]: limitarPonto(ponto) } } : f
  );
  return { ...data, pecas: [...data.pecas, peca], frames };
}

export function tirarPeca(data, id) {
  return {
    ...data,
    pecas: data.pecas.filter((p) => p.id !== id),
    frames: data.frames.map((f) => {
      const { [id]: _fora, ...resto } = f.pos;
      return { ...f, pos: resto };
    }),
  };
}

export function mudarPeca(data, id, patch) {
  return { ...data, pecas: data.pecas.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

/** Um id curto para uma peça nova, que não colida com os que já existem. */
export function idPecaNova(data, prefixo) {
  const usados = new Set(data.pecas.map((p) => p.id));
  for (let i = 1; ; i++) {
    const id = `${prefixo}${i}`;
    if (!usados.has(id)) return id;
  }
}

/** O próximo número livre de um lado. */
export function numeroLivre(data, lado) {
  const usados = new Set(data.pecas.filter((p) => p.lado === lado).map((p) => Number(p.num)));
  for (let n = 1; n < 100; n++) if (!usados.has(n)) return n;
  return 99;
}
