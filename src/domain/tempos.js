// domain/tempos.js — corrigir os tempos de um jogador depois do apito final.
//
// Quem regista um jogo esquece-se de uma substituição, carrega nela um minuto
// tarde, ou troca quem entrou por quem saiu. No fim do jogo isso vê-se nos
// minutos de cada um, e é aí que se corrige: diz-se, para um jogador, de que
// minuto a que minuto esteve em campo.
//
// Como se grava: um `MATCH_CORRECTED` com `metadata.tempos = { playerId,
// entradas: [{ inicioMs, fimMs }] }` — a lista inteira desse jogador, e não um
// remendo. Os eventos das substituições nunca se mexem; a correção aplica-se
// por cima, no fim da reconstrução (ver `aplicarAjusteTempos` no reducer),
// como o ajuste do fim do jogo. A última correção de um jogador é a que vale,
// e `entradas: null` repõe o que foi registado ao vivo.
//
// Versões antigas da app leem o `MATCH_CORRECTED` e ignoram o campo `tempos`:
// mostram os tempos registados ao vivo, sem partir nada.
//
// Os minutos são de jogo, contínuos: a 2.ª parte começa onde a 1.ª acabou
// (`state.firstHalfMs`). Uma entrada não atravessa o intervalo — o intervalo
// fecha todas as entradas, ao vivo também.

import { POSITIONS, MATCH_STATUS } from './constants.js';

/** Arredonda para baixo ao segundo — é o que o ecrã mostra (`fmt`). */
export const aoSegundo = (ms) => Math.floor(ms / 1000) * 1000;

/**
 * Fim de cada parte, em minutos de jogo contínuos, ao segundo.
 *
 * Os tempos registados ao vivo têm milésimas (o intervalo aos 19:59,4), mas o
 * editor mostra e lê mm:ss. Comparar com o valor exato fazia de uma entrada
 * escrita "19:59" uma entrada que atravessa o intervalo. O reducer volta a
 * encostar as entradas ao valor exato (ver `aplicarAjusteTempos`).
 */
export function limitesDasPartes(state) {
  const total = aoSegundo(state.elapsedMatchMs || 0);
  const primeira = state.firstHalfMs != null ? Math.min(aoSegundo(state.firstHalfMs), total) : total;
  return { primeira, total };
}

/** Em que parte começa uma entrada. */
export function parteDe(state, inicioMs) {
  const { primeira, total } = limitesDasPartes(state);
  return primeira < total && inicioMs >= primeira ? 2 : 1;
}

/** As entradas registadas de um jogador, na forma que o editor usa. */
export function entradasDe(state, playerId) {
  const p = state.players?.[playerId];
  if (!p) return [];
  return p.stints.map((st) => ({
    inicioMs: st.startMatchMs,
    fimMs: st.endMatchMs ?? state.elapsedMatchMs ?? st.startMatchMs,
  }));
}

/**
 * Valida a lista de entradas de um jogador. Devolve `null` se estiver bem, ou
 * `{ chave, indice, valores }` com o primeiro problema (a chave é de i18n).
 */
export function validarEntradas(state, entradas) {
  if (state.status !== MATCH_STATUS.FINISHED) return { chave: 'tempos.erro.porTerminar' };
  const { primeira, total } = limitesDasPartes(state);
  const ordenadas = entradas
    .map((e, indice) => ({ ...e, indice }))
    .sort((a, b) => a.inicioMs - b.inicioMs);
  for (const e of ordenadas) {
    if (!Number.isFinite(e.inicioMs) || !Number.isFinite(e.fimMs)) {
      return { chave: 'tempos.erro.minuto', indice: e.indice };
    }
    if (e.fimMs <= e.inicioMs) return { chave: 'tempos.erro.fimAntes', indice: e.indice };
    if (e.inicioMs < 0 || e.fimMs > total) {
      return { chave: 'tempos.erro.foraDoJogo', indice: e.indice, valores: { maximo: total } };
    }
    if (primeira < total && e.inicioMs < primeira && e.fimMs > primeira) {
      return { chave: 'tempos.erro.intervalo', indice: e.indice, valores: { intervalo: primeira } };
    }
  }
  for (let i = 1; i < ordenadas.length; i++) {
    if (ordenadas[i].inicioMs < ordenadas[i - 1].fimMs) {
      return { chave: 'tempos.erro.sobrepostas', indice: ordenadas[i].indice };
    }
  }
  return null;
}

/**
 * Há algum instante com mais de cinco em campo, se este jogador ficar com
 * estas entradas? Não impede gravar — pode ser o próximo a corrigir que está
 * mal —, mas avisa. Devolve o primeiro minuto em que isso acontece, ou null.
 */
export function excessoEmCampo(state, playerId, entradas) {
  const marcos = [];
  for (const p of Object.values(state.players || {})) {
    const lista = p.playerId === playerId ? entradas : entradasDe(state, p.playerId);
    for (const e of lista) {
      if (!(e.fimMs > e.inicioMs)) continue;
      // Ao segundo: uma troca registada aos 12:30,6 e corrigida para 12:30
      // não pode contar seis em campo durante seis décimas.
      marcos.push([aoSegundo(e.inicioMs), 1], [aoSegundo(e.fimMs), -1]);
    }
  }
  // Saídas antes de entradas no mesmo instante: uma substituição não conta
  // seis em campo.
  marcos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let emCampo = 0;
  for (const [ms, d] of marcos) {
    emCampo += d;
    if (emCampo > POSITIONS.length) return ms;
  }
  return null;
}

/** O `metadata` da correção. `entradas: null` repõe o registado ao vivo. */
export function metadataDosTempos(playerId, entradas) {
  return {
    tempos: {
      playerId,
      entradas: entradas
        ? [...entradas]
            .sort((a, b) => a.inicioMs - b.inicioMs)
            .map((e) => ({ inicioMs: Math.round(e.inicioMs), fimMs: Math.round(e.fimMs) }))
        : null,
    },
  };
}
