// lib/videoLocal.js — os vídeos do computador ligados a análises, enquanto a
// app está aberta.
//
// Um vídeo local nunca é enviado nem copiado: o browser lê-o do disco aos
// bocados, à medida que toca, a partir de um endereço temporário (`blob:`)
// feito com `URL.createObjectURL(file)`. Um ficheiro de 5 GB não entra na
// memória, não passa a Base64 e não vai para servidor nenhum.
//
// Duas coisas vivem aqui, e nenhuma delas se guarda:
//
//   · Os ficheiros ligados — um `File` por análise, só em memória. O `File` é
//     uma referência ao ficheiro no disco, não o conteúdo dele. Fica ligado
//     enquanto a app estiver aberta (da análise para a sessão, e a apresentar),
//     e perde-se ao recarregar a página: é aí que aparece "Voltar a ligar o
//     vídeo". Na base de dados ficam só os metadados (ver `metadadosDoFicheiro`).
//
//   · Os endereços temporários — cada leitor cria o seu ao abrir um ficheiro e
//     liberta-o quando troca de ficheiro ou sai do ecrã. Um endereço por
//     libertar prende o ficheiro; por isso passam todos por aqui, e conta-se
//     quantos estão vivos (os testes confirmam que volta a zero).
//
// Sem React de propósito: testa-se em Node.

/* ------------------------------------------------- ficheiros ligados */

/** @type {Map<string, File>} id da análise → o ficheiro escolhido neste aparelho */
const ligados = new Map();
const ouvintes = new Set();
let versao = 0;

function avisar() {
  versao += 1;
  for (const fn of [...ouvintes]) {
    try {
      fn();
    } catch {
      /* um ouvinte avariado não impede os outros */
    }
  }
}

/** O ficheiro ligado a esta análise, ou null (nunca ligado, ou página recarregada). */
export function ficheiroLigado(analiseId) {
  return (analiseId && ligados.get(analiseId)) || null;
}

/** Liga (ou troca) o ficheiro de uma análise. Quem o estiver a mostrar é avisado. */
export function ligarFicheiro(analiseId, ficheiro) {
  if (!analiseId || !ficheiro) return;
  if (ligados.get(analiseId) === ficheiro) return;
  ligados.set(analiseId, ficheiro);
  avisar();
}

/** Larga o ficheiro de uma análise (a análise foi apagada, por exemplo). */
export function desligarFicheiro(analiseId) {
  if (ligados.delete(analiseId)) avisar();
}

/** Larga todos (a conta saiu). Os leitores abertos libertam os seus endereços. */
export function desligarTodos() {
  if (!ligados.size) return;
  ligados.clear();
  avisar();
}

/** Muda sempre que um ficheiro se liga ou larga (para quem mostra vários). */
export function versaoDosFicheiros() {
  return versao;
}

/** Para o `useSyncExternalStore`: chama `fn` sempre que um ficheiro se liga ou larga. */
export function subscreverFicheiros(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/* --------------------------------------------- endereços temporários */

const vivos = new Set();

/**
 * Um endereço `blob:` para o leitor abrir o ficheiro. Não lê o ficheiro: é só
 * uma porta para o browser o ir buscar ao disco, bocado a bocado.
 */
export function criarUrlTemporaria(ficheiro) {
  const url = URL.createObjectURL(ficheiro);
  vivos.add(url);
  return url;
}

/** Liberta um endereço criado aqui. Chamar duas vezes não faz mal. */
export function libertarUrlTemporaria(url) {
  if (!url || !vivos.delete(url)) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* já tinha sido libertado pelo browser */
  }
}

/** Quantos endereços estão por libertar (para os testes e para diagnóstico). */
export function urlsTemporariasVivas() {
  return vivos.size;
}

/* ------------------------------------------------- abrir e reconhecer */

/** O que o seletor de ficheiros aceita. O MP4 (H.264) é o que toca em todo o lado. */
export const ACEITA_VIDEO = 'video/mp4,video/*,.mp4,.m4v,.mov,.webm';

/**
 * O erro de um `<video>` nos nossos códigos: o ecrã tem uma frase para cada um.
 *
 *   'formato'  → o browser não toca este formato ou codec;
 *   'ficheiro' → o ficheiro já não se consegue ler (movido, apagado, alterado);
 *   'outro'    → o resto.
 *
 * @param {number|undefined} codigo `MediaError.code`
 */
export function erroDoVideoLocal(codigo) {
  const n = Number(codigo);
  if (n === 3 || n === 4) return 'formato'; // MEDIA_ERR_DECODE, MEDIA_ERR_SRC_NOT_SUPPORTED
  if (n === 2) return 'ficheiro'; // MEDIA_ERR_NETWORK: num `blob:`, é o disco
  return 'outro';
}

/**
 * O ficheiro ainda se lê? Pede UM byte (não o ficheiro): se foi movido,
 * apagado ou alterado depois de escolhido, o browser recusa.
 */
export async function ficheiroLegivel(ficheiro) {
  try {
    await ficheiro.slice(0, 1).arrayBuffer();
    return true;
  } catch {
    return false;
  }
}

/**
 * Quando um `<video>` falha com "formato não suportado", pode ser mesmo o
 * formato — ou o ficheiro ter deixado de existir, que o browser reporta da
 * mesma maneira. Um byte tira a dúvida.
 */
export async function motivoDaFalha(ficheiro, codigo) {
  const erro = erroDoVideoLocal(codigo);
  if (erro === 'ficheiro') return erro;
  return (await ficheiroLegivel(ficheiro)) ? erro : 'ficheiro';
}

/**
 * O browser consegue abrir este vídeo? Carrega só os metadados (duração e
 * tamanho da imagem) num `<video>` que nunca chega ao ecrã.
 *
 * Resolve com `{ durationMs, largura, altura }`; rejeita com um `Error` cujo
 * `codigo` é 'formato' ou 'ficheiro'. Um vídeo sem imagem (o áudio toca mas o
 * codec do vídeo não é suportado — acontece com HEVC/H.265 em alguns
 * browsers) conta como 'formato'. O endereço temporário é sempre libertado.
 *
 * @param {File} ficheiro
 * @param {{criarVideo?: () => HTMLVideoElement}} [opcoes] só para os testes
 */
export function sondarVideo(ficheiro, { criarVideo } = {}) {
  return new Promise((resolve, reject) => {
    const falha = (codigo) => Object.assign(new Error(`video-local:${codigo}`), { codigo });
    let video;
    let url = null;
    try {
      video = criarVideo ? criarVideo() : document.createElement('video');
      url = criarUrlTemporaria(ficheiro);
    } catch {
      libertarUrlTemporaria(url);
      reject(falha('formato'));
      return;
    }
    let acabou = false;
    const fechar = () => {
      acabou = true;
      video.onloadedmetadata = null;
      video.onerror = null;
      try {
        video.removeAttribute('src');
        video.load();
      } catch {
        /* o elemento já não existe */
      }
      libertarUrlTemporaria(url);
    };
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      if (acabou) return;
      const largura = video.videoWidth || 0;
      const altura = video.videoHeight || 0;
      const duracao = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
      fechar();
      if (!largura || !altura) reject(falha('formato'));
      else resolve({ durationMs: duracao || null, largura, altura });
    };
    video.onerror = () => {
      if (acabou) return;
      const codigo = video.error?.code;
      fechar();
      motivoDaFalha(ficheiro, codigo).then((motivo) => reject(falha(motivo === 'outro' ? 'formato' : motivo)));
    };
    video.src = url;
  });
}
