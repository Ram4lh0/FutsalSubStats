'use client';

// lib/ficheiros.js — entregar ao utilizador um ficheiro feito no aparelho.
//
// Um PDF do painel, um Excel das presenças, o vídeo de uma jogada: tudo nasce
// em memória, como um `Blob`, e falta o último passo — pô-lo nas mãos de quem
// o pediu. Esse passo é diferente em cada sítio:
//
//   · App nativa (iPhone, Android): grava-se o ficheiro na cache da app e
//     abre-se a folha de partilha do sistema (Guardar em Ficheiros, WhatsApp,
//     Mail…). A WebView do Android não tem a partilha de ficheiros do browser e
//     ignora o `<a download>`, por isso é preciso o plugin.
//   · Telemóvel no browser (Safari, Chrome): `navigator.share` com o ficheiro,
//     quando o browser diz que consegue.
//   · Computador: descarrega, como qualquer outro ficheiro.

/**
 * Os plugins nativos, pelo registo global e não por `import` (ver
 * lib/atualizacoes.js): assim o pacote web fica igual e um pacote OTA que
 * chegue a uma casca antiga, ainda sem os plugins, não parte nada.
 */
export function pluginsNativos() {
  const cap = globalThis?.Capacitor;
  if (!cap) return null;
  const dentro =
    typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : cap.getPlatform?.() !== 'web';
  if (!dentro) return null;
  return { Filesystem: cap.Plugins?.Filesystem, Share: cap.Plugins?.Share };
}

/**
 * Há maneira de entregar um ficheiro? Fora da app há sempre (descarregar);
 * dentro dela só com os plugins Filesystem e Share — uma casca instalada antes
 * deles criava o ficheiro e depois não tinha onde o pôr.
 */
export function podeEntregarFicheiros() {
  const n = pluginsNativos();
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

/**
 * Um pedaço de nome de ficheiro limpo: sem acentos, sem espaços, só letras,
 * números e hífenes. "Sub-15 Iniciados" → "sub-15-iniciados".
 */
export function nomeLimpo(texto, reserva = 'ficheiro') {
  const base = String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base || reserva;
}

/** A data de hoje para o nome do ficheiro: `2026-10-26`. */
export function dataParaNome(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Descarregar, à moda do computador. */
function descarregar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Dez segundos e não dois: no Safari do Mac a descarga de um ficheiro grande
  // ainda está a ler o endereço quando o `revoke` chegava.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Entregar um ficheiro feito no aparelho.
 *
 * @param {Blob} blob
 * @param {string} nome   nome do ficheiro, já limpo (ver `nomeLimpo`)
 * @param {string} mime
 * @param {{titulo?: string}} [opcoes] título da folha de partilha
 * @returns {Promise<'partilhado'|'descarregado'|'cancelado'>}
 */
export async function entregarFicheiro(blob, nome, mime, { titulo } = {}) {
  const n = pluginsNativos();
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

  // Telemóvel ou tablet no browser: a folha de partilha, se o browser a tiver
  // para ficheiros. No computador não — lá a partilha do sistema (a do macOS,
  // por exemplo) esconde o ficheiro em vez de o pôr nas Transferências.
  const ficheiro = typeof File !== 'undefined' ? new File([blob], nome, { type: mime }) : null;
  const tatil = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (tatil && ficheiro && navigator.canShare?.({ files: [ficheiro] })) {
    try {
      await navigator.share({ files: [ficheiro], title: titulo || nome });
      return 'partilhado';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado';
      // Outro erro (o Safari às vezes recusa por já não haver gesto do
      // utilizador, depois de uns segundos a gerar): cai para o descarregamento.
    }
  }

  descarregar(blob, nome);
  return 'descarregado';
}
