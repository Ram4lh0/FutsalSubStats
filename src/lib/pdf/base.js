// lib/pdf/base.js — o papel timbrado dos relatórios em PDF.
//
// O PDF é desenhado no aparelho, com o jsPDF, a partir dos números — e não
// fotografando o ecrã. Uma captura (html2canvas) saía desfocada, cortava os
// blocos a meio entre páginas e na WebView do Android falhava com os SVG.
// Desenhado à mão, cada barra é um vetor: imprime-se nítido em qualquer
// tamanho e o ficheiro fica com dezenas de kilobytes.
//
// Aqui fica o que todos os relatórios partilham: o cabeçalho com a marca, o
// rodapé com "página X/Y", as cores, os cartões de números, os gráficos e as
// tabelas que continuam na página seguinte. Cada relatório (painel, jogo,
// presenças) só diz o que vai em cada secção.
//
// ## Os acentos
//
// As fontes base do PDF (Helvetica) vêm com a tabela Windows-1252: cobre o
// português e o espanhol todos (ã, ç, ñ, ¿, €, –, …). Um só carácter fora dela
// (um ′ ou um ≥) e o jsPDF passa a frase inteira para outra codificação que a
// Helvetica não tem, e sai tudo espaçado e ilegível. Por isso todo o texto
// passa por `limpar` antes de ir para o papel.

import { t, localeAtual } from '../i18n/index.js';

/* ------------------------------------------------------------- cores */

// As da app (src/app/estilos/), acertadas para papel branco: o fundo
// azul-escuro só no cabeçalho e no topo das tabelas, o resto em tinta escura
// para se ler impresso.
export const COR = {
  azul: [11, 18, 32], // --bg
  azul2: [22, 35, 59], // --card
  azul3: [42, 61, 95], // --line
  verde: [34, 197, 94], // --primary
  verdeTinta: [21, 128, 61], // o verde, escurecido para texto em papel branco
  vermelho: [239, 68, 68], // --danger
  laranja: [245, 158, 11], // --warn
  info: [56, 189, 248], // --info
  roxo: [139, 92, 246], // lesão (treino)
  texto: [15, 23, 42],
  muted: [100, 116, 139],
  linha: [226, 232, 240],
  fundo: [244, 247, 251],
  branco: [255, 255, 255],
  cinzento: [148, 163, 184],
};

/** Uma cor por tipo de golo, as mesmas do donut da app. */
export const COR_TIPO_GOLO = {
  FORA: [167, 139, 250],
  CANTO: [244, 114, 182],
  LIVRE: [250, 204, 21],
  PENALTI: [251, 146, 60],
  TRANSICAO: COR.info,
  ORGANIZACAO: COR.verde,
  INDIVIDUAL: COR.vermelho,
  ERRO_INDIVIDUAL: COR.vermelho,
  CINCO_V_QUATRO: [45, 212, 191],
  BOLA_PARADA: [250, 204, 21],
  OUTRO: COR.cinzento,
};

/* ------------------------------------------------------------- texto */

// Os 27 caracteres que o Windows-1252 tem para lá do Latin-1 (–, —, …, €, “…).
const CP1252_EXTRA = new Set(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split('')
);
const TROCAS = {
  '′': "'",
  '″': '"',
  '≥': '>=',
  '≤': '<=',
  '→': '->',
  '←': '<-',
  '−': '-',
  '✓': 'v',
  '\u00a0': ' ',
  '\u202f': ' ',
  '\u2009': ' ',
  // Letras que não se desfazem em letra + acento (o NFD não lhes toca).
  'Ł': 'L',
  'ł': 'l',
  'Đ': 'D',
  'đ': 'd',
};

/** O texto pronto para a Helvetica do PDF (ver o topo do ficheiro). */
export function limpar(valor) {
  const s = valor == null ? '' : String(valor);
  let saida = '';
  for (const c of s) {
    if (TROCAS[c] != null) {
      saida += TROCAS[c];
      continue;
    }
    const cod = c.codePointAt(0);
    if (cod < 256 || CP1252_EXTRA.has(c)) {
      saida += c;
      continue;
    }
    // Uma letra com um acento que a tabela não tem (ő, ł…): fica a letra.
    const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    saida += base && base.codePointAt(0) < 256 ? base : '?';
  }
  return saida;
}

/** A data e hora de agora, no idioma da app, para o cabeçalho e o rodapé. */
export function agoraTexto(d = new Date()) {
  return d.toLocaleString(localeAtual(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ------------------------------------------------------------ documento */

const MARGEM = 14;
const RODAPE = 12;
const CAB_GRANDE = 34;
const CAB_PEQUENO = 13;

/**
 * Um relatório novo. O jsPDF só é carregado aqui — e só quando alguém carrega
 * em "Exportar": são umas centenas de kilobytes que o arranque da app não
 * precisa de ler.
 *
 * @param {object} p
 * @param {string} p.titulo        a linha grande do cabeçalho
 * @param {string} [p.subtitulo]   clube · escalão
 * @param {string[]} [p.info]      linhas pequenas (filtros, período…)
 * @param {'portrait'|'landscape'} [p.orientacao]
 */
export async function novoRelatorio({ titulo, subtitulo = '', info = [], orientacao = 'portrait' }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: orientacao, compress: true });
  return new Relatorio(doc, { titulo, subtitulo, info });
}

export class Relatorio {
  constructor(doc, { titulo, subtitulo, info }) {
    this.doc = doc;
    this.titulo = titulo;
    this.subtitulo = subtitulo;
    this.info = info.filter(Boolean);
    this.W = doc.internal.pageSize.getWidth();
    this.H = doc.internal.pageSize.getHeight();
    this.M = MARGEM;
    this.largura = this.W - 2 * MARGEM;
    this.gerado = agoraTexto();
    doc.setProperties({ title: limpar(titulo), creator: 'Futsal SubStats' });
    this.cabecalho(true);
  }

  /* ----------------------------------------------- primitivas de texto */

  cor(c) {
    this.doc.setTextColor(...c);
    return this;
  }

  fonte(tamanho, negrito = false) {
    this.doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    this.doc.setFontSize(tamanho);
    return this;
  }

  /** Texto já limpo; `maximo` corta com reticências em vez de transbordar. */
  texto(valor, x, y, { alinhar = 'left', maximo = null } = {}) {
    let s = limpar(valor);
    if (maximo != null) s = this.cortar(s, maximo);
    this.doc.text(s, x, y, { align: alinhar, baseline: 'alphabetic' });
  }

  largTexto(s) {
    return this.doc.getTextWidth(limpar(s));
  }

  /** Corta um texto com "…" até caber em `maximo` mm (na fonte atual). */
  cortar(s, maximo) {
    s = limpar(s);
    if (this.doc.getTextWidth(s) <= maximo) return s;
    while (s.length > 1 && this.doc.getTextWidth(`${s}…`) > maximo) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
  }

  /* ------------------------------------------------------- paginação */

  get fundoUtil() {
    return this.H - RODAPE - 4;
  }

  /** Cabeçalho: grande na primeira página, uma faixa fina nas outras. */
  cabecalho(primeira) {
    const { doc, W, M } = this;
    if (primeira) {
      doc.setFillColor(...COR.azul);
      doc.rect(0, 0, W, CAB_GRANDE, 'F');
      doc.setFillColor(...COR.verde);
      doc.rect(0, CAB_GRANDE, W, 1.2, 'F');
      this.fonte(8, true).cor(COR.verde);
      this.texto('FUTSAL SUBSTATS', M, 9);
      this.fonte(7.5).cor(COR.cinzento);
      this.texto(this.gerado, W - M, 9, { alinhar: 'right' });
      this.fonte(17, true).cor(COR.branco);
      this.texto(this.titulo, M, 18, { maximo: this.largura });
      this.fonte(10).cor([234, 241, 255]);
      if (this.subtitulo) this.texto(this.subtitulo, M, 24.5, { maximo: this.largura });
      this.fonte(7.5).cor(COR.cinzento);
      // As linhas de informação (filtros, período) cabem duas no cabeçalho;
      // as que sobram vão logo por baixo, no corpo.
      const noCab = this.info.slice(0, 1);
      noCab.forEach((l, i) => this.texto(l, M, 30 + i * 4, { maximo: this.largura }));
      this.y = CAB_GRANDE + 7;
      const resto = this.info.slice(1);
      if (resto.length) {
        this.fonte(8).cor(COR.muted);
        for (const l of resto) {
          for (const parte of doc.splitTextToSize(limpar(l), this.largura)) {
            this.texto(parte, M, this.y);
            this.y += 4;
          }
        }
        this.y += 3;
      }
    } else {
      doc.setFillColor(...COR.azul);
      doc.rect(0, 0, W, CAB_PEQUENO - 3, 'F');
      doc.setFillColor(...COR.verde);
      doc.rect(0, CAB_PEQUENO - 3, W, 0.8, 'F');
      this.fonte(7.5, true).cor(COR.verde);
      this.texto('FUTSAL SUBSTATS', M, 6.5);
      this.fonte(8, true).cor(COR.branco);
      const dir = [this.titulo, this.subtitulo].filter(Boolean).join(' · ');
      this.texto(dir, W - M, 6.5, { alinhar: 'right', maximo: this.largura - 40 });
      this.y = CAB_PEQUENO + 5;
    }
  }

  novaPagina() {
    this.doc.addPage();
    this.cabecalho(false);
  }

  /** Garante `h` mm livres na página; senão passa à seguinte. */
  garantir(h) {
    if (this.y + h > this.fundoUtil) this.novaPagina();
  }

  /** O rodapé de todas as páginas, no fim (só então se sabe o total). */
  rodapes() {
    const { doc, W, H, M } = this;
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(...COR.linha);
      doc.setLineWidth(0.3);
      doc.line(M, H - RODAPE, W - M, H - RODAPE);
      this.fonte(7).cor(COR.muted);
      this.texto(t('pdf.rodape', { data: this.gerado }), M, H - RODAPE + 5);
      this.texto(t('pdf.pagina', { n: i, total }), W - M, H - RODAPE + 5, { alinhar: 'right' });
    }
  }

  /** Acaba o documento e devolve o `Blob`. */
  terminar() {
    this.rodapes();
    return this.doc.output('blob');
  }

  /* ------------------------------------------------------------ blocos */

  /**
   * O título de uma secção, com o traço verde da app. `minimo` é quanto da
   * secção tem de caber por baixo do título: um título sozinho no fundo de
   * uma página, com o conteúdo na seguinte, é o erro mais feio de um relatório.
   */
  secao(titulo, minimo = 30) {
    this.garantir(12 + minimo);
    // Um pouco de ar antes de cada secção, menos logo a seguir ao cabeçalho.
    if (this.y > CAB_PEQUENO + 6) this.y += 4;
    const { doc, M } = this;
    doc.setFillColor(...COR.verde);
    doc.rect(M, this.y - 4, 1.4, 5.4, 'F');
    this.fonte(12, true).cor(COR.texto);
    this.texto(titulo, M + 4, this.y, { maximo: this.largura - 4 });
    this.y += 6;
  }

  /** Um subtítulo pequeno dentro de uma secção. */
  sub(titulo, x = this.M, y = this.y, largura = this.largura) {
    this.fonte(9, true).cor(COR.muted);
    this.texto(titulo, x, y, { maximo: largura });
  }

  /** Um parágrafo, partido em linhas e com quebra de página. */
  paragrafo(valor, { tamanho = 8.5, cor = COR.muted, negrito = false } = {}) {
    if (!valor) return;
    this.fonte(tamanho, negrito).cor(cor);
    const linha = tamanho * 0.45;
    for (const parte of this.doc.splitTextToSize(limpar(valor), this.largura)) {
      this.garantir(linha);
      this.texto(parte, this.M, this.y);
      this.y += linha;
    }
    this.y += 2;
  }

  /**
   * Cartões de números, como os `StatCard` da app: rótulo, valor, detalhe.
   *
   * @param {{rotulo: string, valor: any, detalhe?: string, tom?: 'win'|'loss'|'draw'}[]} lista
   */
  cartoes(lista, { porLinha = 4 } = {}) {
    const itens = lista.filter(Boolean);
    if (!itens.length) return;
    const n = Math.min(porLinha, itens.length);
    const gap = 3;
    const w = (this.largura - gap * (n - 1)) / n;
    const h = 17;
    const tons = { win: COR.verdeTinta, loss: COR.vermelho, draw: [180, 120, 0] };
    for (let i = 0; i < itens.length; i += n) {
      this.garantir(h + gap);
      itens.slice(i, i + n).forEach((c, j) => {
        const x = this.M + j * (w + gap);
        const { doc } = this;
        doc.setFillColor(...COR.fundo);
        doc.setDrawColor(...COR.linha);
        doc.setLineWidth(0.25);
        doc.roundedRect(x, this.y, w, h, 1.6, 1.6, 'FD');
        this.fonte(6.8, true).cor(COR.muted);
        this.texto(String(c.rotulo).toUpperCase(), x + 3, this.y + 4.6, { maximo: w - 6 });
        this.fonte(14, true).cor(tons[c.tom] || COR.texto);
        this.texto(c.valor, x + 3, this.y + 11, { maximo: w - 6 });
        if (c.detalhe) {
          this.fonte(6.8).cor(COR.muted);
          this.texto(c.detalhe, x + 3, this.y + 15, { maximo: w - 6 });
        }
      });
      this.y += h + gap;
    }
    this.y += 1;
  }

  /** Uma legenda de cores em linha: `[{cor, texto}]`. */
  legenda(itens, { x = this.M, y = null } = {}) {
    const linhaY = y ?? this.y;
    if (y == null) this.garantir(5);
    let cx = x;
    this.fonte(7.5).cor(COR.muted);
    for (const it of itens) {
      this.doc.setFillColor(...it.cor);
      this.doc.roundedRect(cx, linhaY - 2.6, 3, 3, 0.6, 0.6, 'F');
      this.texto(it.texto, cx + 4.2, linhaY);
      cx += 4.2 + this.largTexto(it.texto) + 5;
    }
    if (y == null) this.y += 5;
  }

  /* ---------------------------------------------------------- gráficos */

  /**
   * Barras horizontais com nome, carril e valor — a `BarrasH` da app. Com
   * `referencia`, uma linha tracejada (a média) por cima de todas.
   *
   * @param {{rotulo: string, valor: number, texto: string, alerta?: boolean, cor?: number[]}[]} linhas
   */
  barrasH(linhas, { referencia = 0, rotuloReferencia = '', cor = COR.verde } = {}) {
    if (!linhas.length) return;
    const { doc, M } = this;
    const alt = 5.6;
    const nomeW = Math.min(55, this.largura * 0.32);
    const valorW = 30;
    const carrilX = M + nomeW + 2;
    const carrilW = this.largura - nomeW - valorW - 4;
    const maximo = Math.max(referencia, ...linhas.map((l) => l.valor || 0), 1);
    const px = (v) => (v / maximo) * carrilW;
    let topo = this.y;

    const desenharReferencia = (de, ate) => {
      if (!(referencia > 0)) return;
      const rx = carrilX + px(referencia);
      doc.setDrawColor(...COR.texto);
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.line(rx, de - 1, rx, ate - 1);
      doc.setLineDashPattern([], 0);
    };

    for (const l of linhas) {
      if (this.y + alt > this.fundoUtil) {
        desenharReferencia(topo, this.y);
        this.novaPagina();
        topo = this.y;
      }
      const meio = this.y + alt / 2;
      this.fonte(8).cor(COR.texto);
      this.texto(l.rotulo, M, meio + 1.1, { maximo: nomeW });
      doc.setFillColor(...COR.linha);
      doc.roundedRect(carrilX, meio - 1.6, carrilW, 3.2, 0.8, 0.8, 'F');
      if (l.valor > 0) {
        doc.setFillColor(...(l.alerta ? COR.vermelho : l.cor || cor));
        doc.roundedRect(carrilX, meio - 1.6, Math.max(0.8, px(l.valor)), 3.2, 0.8, 0.8, 'F');
      }
      this.fonte(8, true).cor(l.alerta ? COR.vermelho : COR.texto);
      this.texto(l.texto, M + this.largura, meio + 1.1, { alinhar: 'right', maximo: valorW });
      this.y += alt;
    }
    desenharReferencia(topo, this.y);
    if (referencia > 0 && rotuloReferencia) {
      this.garantir(5);
      doc.setDrawColor(...COR.texto);
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.line(carrilX, this.y + 1.5, carrilX + 6, this.y + 1.5);
      doc.setLineDashPattern([], 0);
      this.fonte(7.5).cor(COR.muted);
      this.texto(rotuloReferencia, carrilX + 8, this.y + 2.6);
      this.y += 5;
    }
    this.y += 2;
  }

  /** Altura que as `colunasEspelhadas` vão ocupar. */
  static alturaColunas(comBaixo = true) {
    return comBaixo ? 46 : 30;
  }

  /**
   * Colunas por faixa de tempo, uma série para cima e outra para baixo do eixo
   * (marcados e sofridos) — a `ColunasEspelhadas` da app. Desenha numa caixa
   * e não mexe no cursor: os relatórios põem duas lado a lado (1.ª e 2.ª
   * parte). O número de cada coluna vai escrito: no papel não há o dedo por
   * cima a mostrar o valor.
   */
  colunasEspelhadas(faixas, etiquetas, { x, y, w, chaveA = 'marcados', chaveB = 'sofridos', corA = COR.verde, corB = COR.vermelho }) {
    const { doc } = this;
    const comBaixo = Boolean(chaveB);
    const meta = comBaixo ? 17 : 20;
    const eixo = y + meta + 2;
    const passo = w / Math.max(1, faixas.length);
    const larg = Math.max(2, passo * 0.62);
    const maximo = Math.max(1, ...faixas.map((f) => Math.max(f[chaveA] || 0, comBaixo ? f[chaveB] || 0 : 0)));
    const h = (v) => (v / maximo) * (meta - 4);

    doc.setDrawColor(...COR.cinzento);
    doc.setLineWidth(0.3);
    doc.line(x, eixo, x + w, eixo);
    this.fonte(6.5, true);
    faixas.forEach((f, i) => {
      const cx = x + i * passo + passo / 2;
      const a = f[chaveA] || 0;
      if (a > 0) {
        doc.setFillColor(...corA);
        doc.rect(cx - larg / 2, eixo - h(a), larg, h(a), 'F');
        this.cor(COR.texto);
        this.texto(a, cx, eixo - h(a) - 0.8, { alinhar: 'center' });
      }
      if (comBaixo) {
        const b = f[chaveB] || 0;
        if (b > 0) {
          doc.setFillColor(...corB);
          doc.rect(cx - larg / 2, eixo, larg, h(b), 'F');
          this.cor(COR.texto);
          this.texto(b, cx, eixo + h(b) + 2.6, { alinhar: 'center' });
        }
      }
    });
    const base = comBaixo ? eixo + meta + 3 : eixo + 4;
    this.fonte(6.5).cor(COR.muted);
    etiquetas.forEach((e, i) => this.texto(e, x + i * passo + passo / 2, base + 1.5, { alinhar: 'center' }));
  }

  /** Altura que um `donut` com estas fatias vai ocupar. */
  static alturaDonut(fatias) {
    const n = fatias.filter((f) => f.valor > 0).length;
    return Math.max(30, n * 4.6 + 4);
  }

  /**
   * Donut com a repartição (tipos de golo) e a legenda à direita, com o
   * número e a percentagem de cada fatia. Desenha numa caixa, como as colunas.
   *
   * @param {{rotulo: string, valor: number, cor: number[]}[]} fatias
   */
  donut(fatias, { x, y, w, vazio = '' }) {
    const { doc } = this;
    const cheias = fatias.filter((f) => f.valor > 0);
    const total = cheias.reduce((s, f) => s + f.valor, 0);
    if (!total) {
      this.fonte(8).cor(COR.muted);
      this.texto(vazio, x, y + 5, { maximo: w });
      return;
    }
    const r = 13;
    const ri = 8;
    const cx = x + r + 1;
    const cy = y + r + 1;
    let ang = -Math.PI / 2;
    for (const f of cheias) {
      const fim = ang + (f.valor / total) * Math.PI * 2;
      this.anel(cx, cy, ri, r, ang, fim, f.cor);
      ang = fim;
    }
    this.fonte(13, true).cor(COR.texto);
    this.texto(total, cx, cy + 1.6, { alinhar: 'center' });

    const lx = x + 2 * r + 7;
    let ly = y + 4;
    for (const f of cheias) {
      doc.setFillColor(...f.cor);
      doc.roundedRect(lx, ly - 2.6, 3, 3, 0.6, 0.6, 'F');
      this.fonte(8).cor(COR.texto);
      const pct = `${Math.round((f.valor / total) * 100)}%`;
      this.texto(f.rotulo, lx + 4.5, ly, { maximo: w - (lx - x) - 22 });
      this.fonte(8, true);
      this.texto(`${f.valor}  ·  ${pct}`, x + w, ly, { alinhar: 'right' });
      ly += 4.6;
    }
  }

  /** Um pedaço de anel (fatia de donut) como polígono fechado. */
  anel(cx, cy, ri, re, de, ate, cor) {
    const passos = Math.max(2, Math.ceil(((ate - de) / (Math.PI * 2)) * 72));
    const pts = [];
    for (let i = 0; i <= passos; i++) {
      const a = de + ((ate - de) * i) / passos;
      pts.push([cx + re * Math.cos(a), cy + re * Math.sin(a)]);
    }
    for (let i = passos; i >= 0; i--) {
      const a = de + ((ate - de) * i) / passos;
      pts.push([cx + ri * Math.cos(a), cy + ri * Math.sin(a)]);
    }
    this.poligono(pts, cor);
  }

  poligono(pts, cor) {
    const [x0, y0] = pts[0];
    const deltas = [];
    for (let i = 1; i < pts.length; i++) deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
    this.doc.setFillColor(...cor);
    // Contorno da mesma cor, fino: sem ele ficavam fios brancos entre fatias.
    this.doc.setDrawColor(...cor);
    this.doc.setLineWidth(0.15);
    this.doc.lines(deltas, x0, y0, [1, 1], 'FD', true);
  }

  /**
   * A fita da forma: um quadrado por jogo (V/E/D), o resultado e o
   * adversário por baixo, do mais antigo para o mais recente.
   */
  fitaForma(jogos) {
    if (!jogos.length) return;
    const { doc, M } = this;
    const n = jogos.length;
    const passo = Math.min(22, this.largura / n);
    const lado = Math.min(9, passo - 3);
    this.garantir(lado + 14);
    const letra = { W: t('painelv.v'), D: t('painelv.e'), L: t('painelv.d') };
    const cores = { W: COR.verde, D: COR.cinzento, L: COR.vermelho };
    jogos.forEach((j, i) => {
      const cx = M + i * passo + passo / 2;
      doc.setFillColor(...(cores[j.resultado] || COR.cinzento));
      doc.roundedRect(cx - lado / 2, this.y, lado, lado, 1.2, 1.2, 'F');
      this.fonte(9, true).cor(COR.branco);
      this.texto(letra[j.resultado] || '', cx, this.y + lado / 2 + 1.5, { alinhar: 'center' });
      this.fonte(7.5, true).cor(COR.texto);
      this.texto(`${j.nossos}–${j.deles}`, cx, this.y + lado + 3.8, { alinhar: 'center' });
      // O adversário, com a bolinha da casa (cheia em casa, vazia fora), como
      // na fita da app.
      this.fonte(6.3).cor(COR.muted);
      const nome = this.cortar(j.adversario, passo - 4);
      const ln = this.largTexto(nome);
      const ny = this.y + lado + 7.4;
      doc.setDrawColor(...COR.verde);
      doc.setFillColor(...(j.casa ? COR.verde : COR.branco));
      doc.setLineWidth(0.3);
      doc.circle(cx - ln / 2 - 1.3, ny - 0.9, 0.75, 'FD');
      this.texto(nome, cx + 0.9, ny, { alinhar: 'center' });
    });
    this.y += lado + 11;
  }

  /** A escada da forma: sobe com vitória, desce com derrota. */
  escadaForma(pontos) {
    if (pontos.length < 2) return;
    const { doc, M } = this;
    const alt = 26;
    this.garantir(alt + 3);
    const niveis = pontos.map((p) => p.nivel).concat(0);
    const cima = Math.max(...niveis);
    const baixo = Math.min(...niveis);
    const amp = Math.max(2, cima - baixo);
    const n = pontos.length;
    const passo = Math.min(22, this.largura / n);
    const px = (i) => M + passo * i + passo / 2;
    const py = (v) => this.y + 3 + ((cima - v) / amp) * (alt - 6);
    doc.setDrawColor(...COR.linha);
    doc.setLineWidth(0.3);
    doc.line(M, py(0), M + passo * n, py(0));
    doc.setDrawColor(...COR.cinzento);
    doc.setLineWidth(0.6);
    for (let i = 1; i < n; i++) doc.line(px(i - 1), py(pontos[i - 1].nivel), px(i), py(pontos[i].nivel));
    pontos.forEach((p, i) => {
      const c = p.resultado === 'W' ? COR.verde : p.resultado === 'L' ? COR.vermelho : COR.cinzento;
      doc.setFillColor(...COR.branco);
      doc.setDrawColor(...c);
      doc.setLineWidth(0.8);
      doc.circle(px(i), py(p.nivel), 1.3, 'FD');
    });
    this.y += alt + 2;
  }

  /* ------------------------------------------------------------ tabelas */

  /**
   * Uma tabela que continua na página seguinte, com o cabeçalho repetido.
   *
   * @param {object} p
   * @param {{titulo: string, peso?: number, largura?: number, alinhar?: 'left'|'right'|'center'}[]} p.colunas
   *        `largura` em mm fixa a coluna; as outras repartem o resto pelo `peso`.
   * @param {Array<Array<any|{texto: any, cor?: number[], fundo?: number[], negrito?: boolean}>>} p.linhas
   * @param {Set<number>} [p.destaque] índices das linhas a negrito (totais)
   */
  tabela({ colunas, linhas, destaque = new Set(), tamanho = 7.8, x = this.M, largura = this.largura }) {
    if (!linhas.length) return;
    const { doc } = this;
    const fixas = colunas.reduce((s, c) => s + (c.largura || 0), 0);
    const pesos = colunas.reduce((s, c) => s + (c.largura ? 0 : c.peso || 1), 0);
    const ws = colunas.map((c) => c.largura || ((largura - fixas) * (c.peso || 1)) / Math.max(1, pesos));
    const altCab = 6.5;
    const alt = 5.6;
    const pad = 1.6;

    const cabecalho = () => {
      doc.setFillColor(...COR.azul2);
      doc.rect(x, this.y, largura, altCab, 'F');
      this.fonte(tamanho - 0.6, true).cor(COR.branco);
      let cx = x;
      colunas.forEach((c, i) => {
        const al = c.alinhar || 'left';
        const tx = al === 'right' ? cx + ws[i] - pad : al === 'center' ? cx + ws[i] / 2 : cx + pad;
        this.texto(c.titulo, tx, this.y + altCab / 2 + 1.2, { alinhar: al, maximo: ws[i] - 2 * pad });
        cx += ws[i];
      });
      this.y += altCab;
    };

    this.garantir(altCab + alt * Math.min(3, linhas.length));
    cabecalho();
    linhas.forEach((linha, li) => {
      if (this.y + alt > this.fundoUtil) {
        this.novaPagina();
        cabecalho();
      }
      if (li % 2 === 1) {
        doc.setFillColor(...COR.fundo);
        doc.rect(x, this.y, largura, alt, 'F');
      }
      let cx = x;
      linha.forEach((celula, i) => {
        const c = celula != null && typeof celula === 'object' && !Array.isArray(celula) ? celula : { texto: celula };
        if (c.fundo) {
          doc.setFillColor(...c.fundo);
          doc.rect(cx + 0.3, this.y + 0.3, ws[i] - 0.6, alt - 0.6, 'F');
        }
        const al = colunas[i]?.alinhar || 'left';
        const tx = al === 'right' ? cx + ws[i] - pad : al === 'center' ? cx + ws[i] / 2 : cx + pad;
        this.fonte(tamanho, c.negrito || destaque.has(li)).cor(c.cor || COR.texto);
        this.texto(c.texto ?? '', tx, this.y + alt / 2 + 1.1, { alinhar: al, maximo: ws[i] - 2 * pad });
        cx += ws[i];
      });
      this.y += alt;
    });
    doc.setDrawColor(...COR.linha);
    doc.setLineWidth(0.3);
    doc.line(x, this.y, x + largura, this.y);
    this.y += 4;
  }
}

/** Uma linha de filtros "Competição: A, B · Tipo de jogo: Corrido". */
export function linhaDeFiltros(pares) {
  return pares
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('  ·  ');
}
