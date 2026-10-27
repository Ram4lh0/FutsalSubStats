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
// No intervalo corrige-se só a 1.ª parte (`parte: 1` no metadata): troca as
// entradas da 1.ª parte e deixa as da 2.ª, para não apagar o que se regista a
// seguir. As funções abaixo aceitam `{ parte: 1 }` para trabalhar só nela.
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
export function limitesDasPartes(state, { parte = null } = {}) {
  if (parte === 1 && state.firstHalfMs != null) {
    const fim = aoSegundo(state.firstHalfMs);
    return { primeira: fim, total: fim };
  }
  const total = aoSegundo(state.elapsedMatchMs || 0);
  const primeira = state.firstHalfMs != null ? Math.min(aoSegundo(state.firstHalfMs), total) : total;
  return { primeira, total };
}

/**
 * Pode corrigir-se agora? O jogo inteiro só depois do apito final; a 1.ª
 * parte a partir do intervalo.
 */
export function podeCorrigir(state, { parte = null } = {}) {
  if (parte === 1) return state.firstHalfMs != null && state.currentPeriod >= 1;
  return state.status === MATCH_STATUS.FINISHED;
}

/** Em que parte começa uma entrada. */
export function parteDe(state, inicioMs) {
  const { primeira, total } = limitesDasPartes(state);
  return primeira < total && inicioMs >= primeira ? 2 : 1;
}

/** As entradas registadas de um jogador, na forma que o editor usa. */
export function entradasDe(state, playerId, { parte = null } = {}) {
  const p = state.players?.[playerId];
  if (!p) return [];
  // Pelo minuto, e não pelo `startPeriod`: quem entra no cinco da 2.ª parte
  // abre a entrada ainda no intervalo, com a parte a dizer 1.
  const fimDa1 = state.firstHalfMs ?? Infinity;
  const daParte = (st) =>
    parte == null || (parte === 1 ? st.startMatchMs < fimDa1 : st.startMatchMs >= fimDa1);
  return p.stints.filter(daParte).map((st) => ({
    inicioMs: st.startMatchMs,
    fimMs: st.endMatchMs ?? state.elapsedMatchMs ?? st.startMatchMs,
  }));
}

/**
 * Valida a lista de entradas de um jogador. Devolve `null` se estiver bem, ou
 * `{ chave, indice, valores }` com o primeiro problema (a chave é de i18n).
 */
export function validarEntradas(state, entradas, { parte = null } = {}) {
  if (!podeCorrigir(state, { parte })) {
    return { chave: parte === 1 ? 'tempos.erro.antesDoIntervalo' : 'tempos.erro.porTerminar' };
  }
  const { primeira, total } = limitesDasPartes(state, { parte });
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
export function excessoEmCampo(state, playerId, entradas, { parte = null } = {}) {
  const marcos = [];
  for (const p of Object.values(state.players || {})) {
    // Só a 1.ª parte: as entradas da 2.ª deste jogador ficam como estão.
    const lista =
      p.playerId !== playerId
        ? entradasDe(state, p.playerId)
        : parte === 1
          ? [...entradas, ...entradasDe(state, playerId, { parte: 2 })]
          : entradas;
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

/**
 * "Só o total": quando não se sabem as trocas todas, diz-se só quanto tempo o
 * jogador esteve em campo e as entradas ajustam-se a esse total. Devolve a
 * lista de entradas, que se grava como qualquer outra correção — assim todo o
 * resto (minutos, participações, época) continua a ler entradas.
 *
 *  - menos tempo: cada entrada encolhe na mesma proporção, a partir de onde
 *    começou;
 *  - mais tempo: cada entrada cresce para o espaço livre a seguir e depois
 *    para trás, sem atravessar o intervalo nem pisar outra entrada; se ainda
 *    sobrar, abre-se uma entrada no início de uma parte em que não jogou;
 *  - sem entradas nenhumas: a partir do início do jogo.
 *
 * As participações em golos ficam aproximadas — não se sabe quando esteve em
 * campo, só quanto.
 */
export function ajustarAoTotal(state, playerId, alvoMs, { parte = null } = {}) {
  const { primeira, total } = limitesDasPartes(state, { parte });
  const partes = primeira < total && primeira > 0 ? [[0, primeira], [primeira, total]] : [[0, total]];
  const parteDoInstante = (ms) => partes.find(([a, b]) => ms >= a && ms < b) || partes[partes.length - 1];
  const alvo = Math.max(0, Math.min(total, Math.round(alvoMs)));
  if (!alvo) return [];

  const atuais = entradasDe(state, playerId, { parte })
    .map((e) => ({ inicioMs: e.inicioMs, fimMs: Math.min(e.fimMs, total) }))
    .filter((e) => e.fimMs > e.inicioMs)
    .sort((a, b) => a.inicioMs - b.inicioMs);
  const soma = atuais.reduce((t, e) => t + (e.fimMs - e.inicioMs), 0);

  if (atuais.length && alvo <= soma) {
    const f = alvo / soma;
    return atuais.map((e) => ({
      inicioMs: e.inicioMs,
      fimMs: Math.round(e.inicioMs + (e.fimMs - e.inicioMs) * f),
    }));
  }

  const out = atuais.map((e) => ({ ...e }));
  let resto = alvo - soma;
  // Para a frente: até à entrada seguinte ou ao fim da parte.
  for (let i = 0; i < out.length && resto > 0; i++) {
    const [, fimParte] = parteDoInstante(out[i].inicioMs);
    const limite = Math.min(fimParte, out[i + 1]?.inicioMs ?? Infinity);
    const mais = Math.max(0, Math.min(resto, limite - out[i].fimMs));
    out[i].fimMs += mais;
    resto -= mais;
  }
  // Para trás: até à entrada anterior ou ao início da parte.
  for (let i = out.length - 1; i >= 0 && resto > 0; i--) {
    const [iniParte] = parteDoInstante(out[i].inicioMs);
    const limite = Math.max(iniParte, out[i - 1]?.fimMs ?? -Infinity);
    const mais = Math.max(0, Math.min(resto, out[i].inicioMs - limite));
    out[i].inicioMs -= mais;
    resto -= mais;
  }
  // Partes em que não jogou: uma entrada a partir do início.
  for (const [a, b] of partes) {
    if (resto <= 0) break;
    if (out.some((e) => e.inicioMs >= a && e.inicioMs < b)) continue;
    const d = Math.min(resto, b - a);
    out.push({ inicioMs: a, fimMs: a + d });
    resto -= d;
  }
  return out.sort((x, y) => x.inicioMs - y.inicioMs);
}

/** O `metadata` da correção. `entradas: null` repõe o registado ao vivo. */
export function metadataDosTempos(playerId, entradas, { parte = null } = {}) {
  return {
    tempos: {
      playerId,
      ...(parte === 1 ? { parte: 1 } : {}),
      entradas: entradas
        ? [...entradas]
            .sort((a, b) => a.inicioMs - b.inicioMs)
            .map((e) => ({ inicioMs: Math.round(e.inicioMs), fimMs: Math.round(e.fimMs) }))
        : null,
    },
  };
}
