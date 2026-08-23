'use client';

// lib/data/owner.js — de quem é a base de dados que está neste aparelho.
//
// O problema que isto resolve: a base do browser sobrevive ao logout. Sem dono,
// quem saísse da conta e entrasse noutra — ou abrisse o jogo de experiência —
// via a equipa da primeira misturada com a nova. Não é uma falha de segurança
// (os dados nunca saíram deste aparelho), mas é errado na mesma: cada conta
// deve ver o que é seu, e mais nada.
//
// A regra: a base pertence a **um** dono de cada vez. Ao mudar de dono, é
// limpa e volta a descarregar-se do servidor o que pertence a quem entrou. O
// servidor é a fonte de verdade, por isso limpar não perde nada do que já subiu.
//
// O que pode perder-se é o que ainda estava por enviar. Por isso, antes de
// limpar, guarda-se uma cópia num ficheiro — e quem chama avisa.

import * as db from './local.js';
import { esquecerMarca } from './sync.js';

const CHAVE = 'futsal-dono';

// Cópia em memória, para quando não há `localStorage` — um browser em modo
// restrito, ou os testes. Sem ela a regra do dono desligava-se em silêncio, que
// é a pior maneira de uma proteção falhar.
let emMemoria = null;

/** O jogo de experiência também é um dono, para não se misturar com contas. */
export const DONO_DEMO = 'demo';

export function donoAtual() {
  if (typeof window === 'undefined') return emMemoria;
  try {
    return window.localStorage.getItem(CHAVE) || emMemoria;
  } catch {
    return emMemoria;
  }
}

function marcarDono(id) {
  emMemoria = id;
  if (typeof window === 'undefined') return;
  try {
    if (id) window.localStorage.setItem(CHAVE, id);
    else window.localStorage.removeItem(CHAVE);
  } catch {
    /* sem localStorage: fica só a cópia em memória, que vale esta sessão */
  }
}

/** Há alguma coisa guardada aqui? */
async function temDados() {
  for (const store of [db.STORES.clubs, db.STORES.matches, db.STORES.players]) {
    if ((await db.all(store)).length) return true;
  }
  return false;
}

/** Linhas que ainda não subiram — o que se perderia ao limpar. */
async function porEnviar() {
  let n = 0;
  for (const store of [db.STORES.clubs, db.STORES.teams, db.STORES.competitions,
                       db.STORES.players, db.STORES.matches, db.STORES.matchSquad]) {
    n += (await db.all(store)).filter((r) => r.dirty).length;
  }
  n += (await db.all(db.STORES.matchEvents)).filter((e) => !e.syncedAt).length;
  return n;
}

/**
 * Garante que a base deste aparelho é de quem está a usá-la agora.
 *
 * @returns {{ trocou: boolean, perdidas: number }}
 *   `trocou` diz se a base foi limpa; `perdidas` quantas linhas por enviar
 *   ficaram para trás (já guardadas em ficheiro por quem chama, se quiser).
 */
export async function garantirDono(novoDono) {
  const atual = donoAtual();

  // Primeira vez, ou base vazia: o dono é simplesmente registado. Também é o
  // caso de quem já usava a app antes de isto existir — os dados são seus.
  if (!atual || !(await temDados())) {
    marcarDono(novoDono);
    return { trocou: false, perdidas: 0 };
  }

  if (atual === novoDono) return { trocou: false, perdidas: 0 };

  const perdidas = await porEnviar();
  await db.clearAll();
  // As marcas de água vão com a base, e as de **toda a gente**.
  //
  // Sem isto havia um caminho que deixava a app vazia: o treinador entra e
  // descarrega tudo (marca guardada), empresta o telemóvel a um colega que entra
  // na conta dele (base limpa), e volta a entrar na sua. A base foi limpa outra
  // vez, mas a marca dele continuava lá — a descarga seguinte pedia só o que
  // mudou desde ontem e não trazia nada. Época inteira no servidor, ecrã em
  // branco no telemóvel.
  esquecerMarca();
  marcarDono(novoDono);
  return { trocou: true, perdidas };
}

/** Ao apagar a conta, o aparelho deixa de ter dono. */
export function esquecerDono() {
  marcarDono(null);
}
