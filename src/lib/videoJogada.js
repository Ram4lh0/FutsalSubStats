'use client';

// lib/videoJogada.js — transformar uma jogada num ficheiro de vídeo.
//
// Tudo acontece no aparelho: a jogada é desenhada num <canvas> fotograma a
// fotograma (com a mesma animação suave do leitor) e o `MediaRecorder` grava
// o canvas. Nada vai para o servidor — um vídeo de 20 s são 1 a 3 MB, e
// guardá-los no Supabase esgotava o armazenamento depressa.
//
// O formato é MP4 (H.264) sempre que o browser o saiba gravar: Safari (iPhone,
// iPad) e Chrome recentes sabem, e é o que o WhatsApp aceita. Onde só houver
// WebM (Firefox), grava-se WebM — serve para ver no computador.
//
// A gravação é em tempo real: um vídeo de 6 s demora 6 s a criar. É o preço de
// não precisar de nenhuma biblioteca de vídeo nem de plugins nativos.

import { K, R, area, caixa, CORES } from '../components/tatica/geometria.js';
import { TIPO, duracaoTotal, posicoesNoInstante, resolverPosicoes } from '../domain/jogada.js';

const FORMATOS = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/** O primeiro formato que este browser sabe gravar, ou `null`. */
export function formatoVideo() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported(f)) || null;
}

/**
 * Os plugins nativos, pelo registo global e não por `import` (ver
 * lib/atualizacoes.js): assim o pacote web fica igual e um pacote OTA que
 * chegue a uma casca antiga, ainda sem os plugins, não parte nada.
 */
function nativo() {
  const cap = globalThis?.Capacitor;
  if (!cap) return null;
  const dentro =
    typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : cap.getPlatform?.() !== 'web';
  if (!dentro) return null;
  return { Filesystem: cap.Plugins?.Filesystem, Share: cap.Plugins?.Share };
}

export function podeGravarVideo() {
  const gravar =
    typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    Boolean(formatoVideo());
  if (!gravar) return false;
  // Dentro da app (Android/iOS) é preciso ter onde pôr o ficheiro: sem os
  // plugins Filesystem e Share — casca instalada antes desta versão — o
  // vídeo seria criado e depois não havia como o guardar.
  const n = nativo();
  return !n || Boolean(n.Filesystem && n.Share);
}

function emBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Pausa no início e no fim, para o vídeo não arrancar nem acabar de repente. */
const PAUSA_INICIO = 700;
const PAUSA_FIM = 1200;
const LARGURA_VIDEO = 1280;
const FAIXA = 64;

function desenharPeca(ctx, peca, x, y) {
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  if (peca.tipo === TIPO.BOLA) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = CORES.bola;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    return;
  }
  if (peca.tipo === TIPO.CONE) {
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x + 6, y + 5);
    ctx.lineTo(x - 6, y + 5);
    ctx.closePath();
    ctx.fillStyle = CORES.cone;
    ctx.fill();
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = CORES[`${peca.tipo}_${peca.lado}`] || CORES.jogador_nos;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = peca.tipo === TIPO.GR && peca.lado === 'nos' ? '#1a1a1a' : '#fff';
  ctx.font = '800 9px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(peca.num ?? ''), x, y + 0.5);
  if (peca.nome) {
    ctx.font = '700 6px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    const primeiro = String(peca.nome).split(' ')[0];
    ctx.strokeText(primeiro, x, y + R + 6);
    ctx.fillStyle = '#fff';
    ctx.fillText(primeiro, x, y + R + 6);
  }
}

/** Desenha o campo e as peças num instante. `vb` é a moldura [x, y, w, h]. */
function desenhar(ctx, data, posicoes, vb, escala, rodape) {
  const [vx, vy, vw, vh] = vb;
  ctx.setTransform(escala, 0, 0, escala, -vx * escala, -vy * escala);
  ctx.fillStyle = CORES.campo;
  ctx.fillRect(vx, vy, vw, vh);

  // Linhas do campo — as mesmas do SVG.
  const W = 400;
  const H = 200;
  ctx.strokeStyle = CORES.linhas;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(0, 0, W, H);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.stroke(new Path2D(area('esq')));
  ctx.stroke(new Path2D(area('dir')));
  ctx.strokeRect(-8, H / 2 - 15, 8, 30);
  ctx.strokeRect(W, H / 2 - 15, 8, 30);
  ctx.fillStyle = CORES.linhas;
  for (const x of [W / 2, 60, 100, W - 60, W - 100]) {
    ctx.beginPath();
    ctx.arc(x, H / 2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const ordem = { [TIPO.CONE]: 0, [TIPO.GR]: 1, [TIPO.JOGADOR]: 1, [TIPO.BOLA]: 2 };
  const pecas = [...data.pecas].sort((a, b) => (ordem[a.tipo] ?? 1) - (ordem[b.tipo] ?? 1));
  for (const p of pecas) {
    const pos = posicoes[p.id];
    if (pos) desenharPeca(ctx, p, pos[0] * K, pos[1] * K);
  }

  // Rodapé: nome da jogada e a marca, para quem recebe o vídeo saber o que é.
  if (rodape) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const largura = ctx.canvas.width;
    const y0 = ctx.canvas.height - FAIXA;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, y0, largura, FAIXA);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#eaf1ff';
    ctx.font = '700 26px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(rodape.titulo, 24, y0 + FAIXA / 2, largura * 0.62);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#22c55e';
    ctx.font = '800 20px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(`Futsal SubStats · ${rodape.velocidade}×`, largura - 24, y0 + FAIXA / 2);
  }
}

/**
 * Grava a jogada em vídeo.
 *
 * @param {object} data jogada normalizada
 * @param {{velocidade?: number, titulo?: string, onProgresso?: (p: number) => void}} [opcoes]
 * @returns {Promise<{blob: Blob, ext: string, mime: string}>}
 */
export async function gravarVideo(data, { velocidade = 1, titulo = '', onProgresso } = {}) {
  const formato = formatoVideo();
  if (!formato) throw new Error('sem-formato');

  const vb = caixa(data.campo).split(' ').map(Number);
  const escala = LARGURA_VIDEO / vb[2];
  // H.264 exige dimensões pares.
  const altCampo = Math.round((vb[3] * escala) / 2) * 2;
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA_VIDEO;
  canvas.height = altCampo + FAIXA;
  const ctx = canvas.getContext('2d');

  const resolvidas = resolverPosicoes(data);
  const total = duracaoTotal(data);
  const duracaoReal = PAUSA_INICIO + total / velocidade + PAUSA_FIM;
  const rodape = { titulo: titulo || '', velocidade };
  const quadro = (tJogada) =>
    desenhar(ctx, data, posicoesNoInstante(data, tJogada, resolvidas), vb, escala, rodape);

  quadro(0);
  const stream = canvas.captureStream(30);
  const gravador = new MediaRecorder(stream, { mimeType: formato, videoBitsPerSecond: 4_000_000 });
  const partes = [];
  gravador.ondataavailable = (e) => {
    if (e.data && e.data.size) partes.push(e.data);
  };
  const parado = new Promise((resolve) => {
    gravador.onstop = resolve;
  });
  gravador.start(250);

  // Um temporizador a 30 fps e não o `requestAnimationFrame`: este pára de
  // vez quando a página fica escondida (trocar de app a meio), e a gravação
  // ficava pendurada para sempre. O tempo da jogada sai do relógio, não da
  // contagem de fotogramas — se o browser abrandar, o vídeo não fica lento.
  const t0 = performance.now();
  await new Promise((resolve) => {
    const passo = () => {
      const dt = performance.now() - t0;
      const tJogada = Math.max(0, Math.min(total, (dt - PAUSA_INICIO) * velocidade));
      quadro(tJogada);
      onProgresso?.(Math.min(1, dt / duracaoReal));
      if (dt >= duracaoReal) return resolve();
      setTimeout(passo, 1000 / 30);
    };
    passo();
  });

  gravador.stop();
  await parado;
  stream.getTracks().forEach((t) => t.stop());
  const mime = formato.split(';')[0];
  return { blob: new Blob(partes, { type: mime }), ext: mime === 'video/mp4' ? 'mp4' : 'webm', mime };
}

/** Um nome de ficheiro limpo a partir do título da jogada. */
export function nomeDoFicheiro(titulo, ext) {
  const base = String(titulo || 'jogada')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'jogada'}.${ext}`;
}

/**
 * Entregar o vídeo: no telemóvel e no iPad, a folha de partilha do sistema
 * (guardar nas Fotos, mandar para o WhatsApp…); no computador, descarregar.
 *
 * @returns {Promise<'partilhado'|'descarregado'|'cancelado'>}
 */
export async function entregarVideo({ blob, ext, mime }, titulo) {
  const nome = nomeDoFicheiro(titulo, ext);

  // App nativa: grava o ficheiro na cache da app e abre a folha de partilha do
  // sistema (Guardar vídeo, WhatsApp…). A WebView do Android não tem a
  // partilha de ficheiros do browser, por isso é preciso o plugin.
  const n = nativo();
  if (n?.Filesystem && n?.Share) {
    const escrito = await n.Filesystem.writeFile({
      path: nome,
      data: await emBase64(blob),
      directory: 'CACHE',
    });
    try {
      await n.Share.share({ title: titulo || nome, files: [escrito.uri] });
      return 'partilhado';
    } catch (e) {
      if (/cancel/i.test(String(e?.message || e))) return 'cancelado';
      throw e;
    }
  }

  const ficheiro = typeof File !== 'undefined' ? new File([blob], nome, { type: mime }) : null;
  const tatil = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (tatil && ficheiro && navigator.canShare?.({ files: [ficheiro] })) {
    try {
      await navigator.share({ files: [ficheiro], title: titulo || nome });
      return 'partilhado';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado';
      // Outro erro: cai para o descarregamento.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'descarregado';
}
