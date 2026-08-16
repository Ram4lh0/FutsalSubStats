'use client';

// lib/imagem.js — preparar um emblema a partir de uma foto do telemóvel.
//
// O que entra é o que a câmara dá: 4000×3000, três ou quatro megabytes. O que
// sai é um quadrado de 256 px guardado como texto, dentro da própria linha do
// clube ou do escalão.
//
// ## Porquê guardar a imagem na linha, e não num balde
//
// A alternativa óbvia era o Storage do Supabase: enviar o ficheiro, guardar o
// endereço. Não serve a esta app, e a razão é a de sempre — o pavilhão.
//
// Um endereço só vale com rede. O treinador que abre a app sem ligação veria o
// nome do clube e um quadrado vazio onde devia estar o emblema. E resolver isso
// obrigava a uma segunda cache de imagens, com as suas próprias regras de
// validade, à parte de tudo o resto.
//
// Guardada como texto, a imagem viaja no mesmo caminho que o nome do clube:
// entra na base local, sobe na mesma fila, desce na mesma descarga, e está lá
// quando não há rede. Sem balde, sem permissões de ficheiro, sem endereços
// assinados, sem nada que possa expirar.
//
// O preço é o tamanho da linha, e é por isso que este ficheiro existe: sem um
// limite duro, uma foto de telemóvel escrita em texto são quatro megabytes por
// clube, a subir e a descer em cada sincronização.

/** O lado do quadrado final. Dá para 46 px no ecrã com folga em ecrãs densos. */
export const LADO = 256;

/**
 * O tecto, depois de convertida em texto.
 *
 * 48 KB é generoso para um emblema e continua a caber numa linha sem se notar.
 * Acima disto começa a doer onde não se vê: cada descarga traz a imagem outra
 * vez, e num pavilhão com meia barra de rede isso é tempo em que a app parece
 * parada.
 */
export const MAX_BYTES = 48 * 1024;

/** Formatos que aceitamos à entrada. O HEIC do iPhone chega convertido. */
export const TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/**
 * O quadrado a recortar de uma imagem de qualquer forma.
 *
 * Recorta-se pelo centro, e não se enche com barras: um emblema com tarjas
 * pretas em cima e em baixo fica pior do que um emblema um pouco cortado. Os
 * logótipos de clube são quase sempre redondos ou quadrados, e o que se perde
 * nos cantos é fundo.
 *
 * Separada do resto por ser a única parte com contas — e a única que se pode
 * testar sem um browser.
 */
export function recorteCentral(largura, altura) {
  const lado = Math.min(largura, altura);
  return {
    x: Math.round((largura - lado) / 2),
    y: Math.round((altura - lado) / 2),
    lado,
  };
}

/** Quantos bytes ocupa mesmo um `data:` URL, descontando o cabeçalho e o base64. */
export function tamanhoEmBytes(dataUrl) {
  const virgula = String(dataUrl || '').indexOf(',');
  if (virgula < 0) return 0;
  const base64 = dataUrl.slice(virgula + 1);
  const enchimento = (base64.endsWith('==') && 2) || (base64.endsWith('=') && 1) || 0;
  return Math.floor((base64.length * 3) / 4) - enchimento;
}

/**
 * A escada de qualidades que se experimenta, da melhor para a pior.
 *
 * Uma só tentativa não chega: a mesma qualidade dá 12 KB num emblema liso e 90
 * KB numa fotografia de equipa. Descer em degraus fixos é previsível e pára
 * sempre — uma procura binária pelo tamanho exacto seria mais bonita e
 * comprimiria a imagem seis vezes para poupar dois kilobytes.
 */
export const QUALIDADES = [0.86, 0.72, 0.6, 0.48, 0.36];

/**
 * Foto do telemóvel → quadrado pequeno, pronto a guardar.
 *
 * Devolve um `data:` URL ou atira com uma chave de tradução. Só corre no
 * browser: precisa de `createImageBitmap` e de um `canvas`.
 */
export async function prepararEmblema(ficheiro) {
  if (!ficheiro) return null;
  if (!TIPOS.includes(ficheiro.type)) {
    const erro = new Error('formato não aceite');
    erro.chave = 'foto.formato';
    throw erro;
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(ficheiro);
  } catch {
    const erro = new Error('imagem ilegível');
    erro.chave = 'foto.ilegivel';
    throw erro;
  }

  const { x, y, lado } = recorteCentral(bitmap.width, bitmap.height);
  const tela = document.createElement('canvas');
  tela.width = LADO;
  tela.height = LADO;
  const pincel = tela.getContext('2d');
  // Sem isto, encolher uma foto de 4000 px para 256 dá serrilhado nas linhas
  // finas — que é exactamente o que um emblema tem.
  pincel.imageSmoothingEnabled = true;
  pincel.imageSmoothingQuality = 'high';
  pincel.drawImage(bitmap, x, y, lado, lado, 0, 0, LADO, LADO);
  bitmap.close?.();

  // WebP quando existe: para o mesmo aspecto, ocupa menos de metade do JPEG. Os
  // browsers que não o conhecem devolvem um PNG sem avisar, e aí o JPEG é mais
  // previsível — daí confirmar-se o que saiu em vez de confiar no pedido.
  const querWebp = tela.toDataURL('image/webp', 0.8).startsWith('data:image/webp');
  const formato = querWebp ? 'image/webp' : 'image/jpeg';

  for (const qualidade of QUALIDADES) {
    const url = tela.toDataURL(formato, qualidade);
    if (tamanhoEmBytes(url) <= MAX_BYTES) return url;
  }

  const erro = new Error('imagem grande de mais');
  erro.chave = 'foto.grande';
  throw erro;
}
