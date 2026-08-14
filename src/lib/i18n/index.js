'use client';

// lib/i18n/index.js — o idioma da app.
//
// Porque não uma biblioteca: a app é exportada estaticamente e empacotada no
// Capacitor. Uma biblioteca de i18n com deteção por rota, carregamento
// assíncrono de dicionários e um provider por página traria problemas que aqui
// não existem — são três idiomas e um ficheiro por cada, tudo no mesmo pacote.
//
// A decisão que molda o resto: **o idioma vive num módulo, não num contexto de
// React**. Isto porque há sítios que precisam de traduzir e não são componentes
// — o exportador de CSV, as mensagens de erro da sincronização. Se o idioma
// vivesse só num `useContext`, esses ficavam de fora ou obrigavam a passar o
// `t` de mão em mão por dez camadas.
//
// Os componentes continuam a reagir à mudança: `useT()` liga-se a este módulo
// com `useSyncExternalStore` e volta a desenhar quando o idioma muda.
//
// Hidratação: o HTML é gerado no build, quando ainda não há `localStorage`. Se
// lêssemos a escolha durante o primeiro desenho, o React encontrava um texto no
// servidor e outro no browser e queixava-se. Por isso o primeiro desenho é
// SEMPRE em português e a escolha real entra logo a seguir, quando o primeiro
// componente se subscreve. É um piscar de olhos numa app que fica aberta uma
// hora dentro de um pavilhão.

import { useSyncExternalStore } from 'react';
import pt from './pt.js';
import en from './en.js';
import es from './es.js';

/** Os idiomas oferecidos. `locale` é o que vai para o `toLocaleString`. */
export const IDIOMAS = [
  { codigo: 'pt', nome: 'Português', locale: 'pt-PT' },
  { codigo: 'en', nome: 'English', locale: 'en-GB' },
  { codigo: 'es', nome: 'Español', locale: 'es-ES' },
];

const DICIONARIOS = { pt, en, es };
const CHAVE = 'futsal-idioma';

/** O português é a referência: é o único dicionário que está sempre completo. */
export const IDIOMA_PADRAO = 'pt';

let atual = IDIOMA_PADRAO;
let iniciado = false;
const ouvintes = new Set();

/* ------------------------------------------------------------ leitura */

function guardado() {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(CHAVE);
    return DICIONARIOS[v] ? v : null;
  } catch {
    return null;
  }
}

/**
 * O idioma do telemóvel, se for um dos nossos.
 *
 * `navigator.languages` vem como ['pt-PT', 'pt', 'en'] — interessa só a parte
 * antes do travessão, porque não distinguimos pt-PT de pt-BR nem en-GB de en-US.
 */
function doSistema() {
  if (typeof navigator === 'undefined') return null;
  const lista = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of lista) {
    const base = String(tag || '').toLowerCase().split('-')[0];
    if (DICIONARIOS[base]) return base;
  }
  return null;
}

/**
 * Decide o idioma na primeira vez que alguém precisa dele.
 *
 * Corre uma vez só, e nunca durante o desenho no servidor — ver a nota sobre
 * hidratação no topo do ficheiro.
 */
function iniciar() {
  if (iniciado || typeof window === 'undefined') return;
  iniciado = true;
  atual = guardado() || doSistema() || IDIOMA_PADRAO;
}

/* ------------------------------------------------------------ escrita */

export function idiomaAtual() {
  return atual;
}

export function localeAtual() {
  return IDIOMAS.find((i) => i.codigo === atual)?.locale || 'pt-PT';
}

/** Muda o idioma e avisa toda a app. */
export function definirIdioma(codigo) {
  if (!DICIONARIOS[codigo] || codigo === atual) return;
  atual = codigo;
  iniciado = true;
  try {
    window.localStorage.setItem(CHAVE, codigo);
  } catch {
    /* sem localStorage: vale esta sessão, que é melhor do que não mudar nada */
  }
  for (const avisar of ouvintes) avisar();
}

/* ------------------------------------------------------------ traduzir */

/**
 * O texto de uma chave, com os valores colados nas chavetas.
 *
 * Se a chave faltar no idioma escolhido, cai no português em vez de mostrar a
 * chave crua: um botão que diz "Guardar" a um espanhol é feio, mas um que diga
 * `definicoes.guardar` é uma avaria à vista de toda a gente.
 */
export function t(chave, valores) {
  const texto = DICIONARIOS[atual]?.[chave] ?? DICIONARIOS[IDIOMA_PADRAO][chave] ?? chave;
  if (!valores) return texto;
  return texto.replace(/\{(\w+)\}/g, (todo, nome) =>
    valores[nome] === undefined ? todo : String(valores[nome])
  );
}

/* --------------------------------------------------------------- React */

function subscrever(avisar) {
  iniciar();
  ouvintes.add(avisar);
  return () => ouvintes.delete(avisar);
}

const noServidor = () => IDIOMA_PADRAO;

/**
 * Dá o `t` a um componente e volta a desenhá-lo quando o idioma muda.
 *
 * Devolve uma função nova a cada mudança de idioma de propósito: é isso que faz
 * o React perceber que o resultado mudou, mesmo em componentes memorizados.
 */
export function useT() {
  const codigo = useSyncExternalStore(subscrever, idiomaAtual, noServidor);
  return funcaoPara(codigo);
}

/** O código do idioma escolhido, para quem precisa dele e não do `t`. */
export function useIdioma() {
  return useSyncExternalStore(subscrever, idiomaAtual, noServidor);
}

/** O `locale` do idioma escolhido, para datas e números. */
export function useLocale() {
  const codigo = useSyncExternalStore(subscrever, idiomaAtual, noServidor);
  return IDIOMAS.find((i) => i.codigo === codigo)?.locale || 'pt-PT';
}

// Uma função por idioma, criada uma vez. Sem isto, cada desenho devolvia um `t`
// novo e qualquer `useMemo` ou `useCallback` que dependesse dele corria outra
// vez sem razão nenhuma. Não é um hook — não chama nenhum — por isso o nome não
// começa por `use`.
const cache = new Map();
function funcaoPara(codigo) {
  let fn = cache.get(codigo);
  if (!fn) {
    fn = (chave, valores) => t(chave, valores);
    cache.set(codigo, fn);
  }
  return fn;
}
