// domain/fimDoJogo.js
//
// Ajustar o minuto em que o jogo acabou — para quem se esqueceu de carregar em
// "Terminar" e deixou o relógio a andar. Tudo o que depende do fim (tempo em
// campo, tempo de banco, duração) conta só até esse minuto.
//
// Regra de coerência: não se pode acabar o jogo antes de algo que ficou
// registado (golo, cartão, falta, substituição…). Ou o registo estava errado
// (e corrige-se ou apaga-se), ou o jogo ainda não tinha acabado.

import { EVENT, MATCH_STATUS } from './constants.js';
import { readClock } from './clock.js';

// Eventos que provam que o jogo ainda estava a decorrer nesse minuto.
// Ficam de fora o relógio, as partes, o plantel, as atribuições (que não têm
// minuto próprio), o desfazer e as correções.
const ACCOES = new Set([
  EVENT.SUBSTITUTION,
  EVENT.PLAYER_REPLACED_AFTER_EXPULSION,
  EVENT.POSITION_CHANGED,
  EVENT.PLAYER_EXPELLED,
  EVENT.PENALTY_STARTED,
  EVENT.PENALTY_ENDED,
  EVENT.POWER_PLAY_STARTED,
  EVENT.POWER_PLAY_ENDED,
  EVENT.YELLOW_CARD,
  EVENT.RED_CARD,
  EVENT.OPPONENT_YELLOW_CARD,
  EVENT.TEAM_FOUL_ADDED,
  EVENT.TEAM_FOUL_REMOVED,
  EVENT.OPPONENT_FOUL_ADDED,
  EVENT.OPPONENT_FOUL_REMOVED,
  EVENT.TEAM_GOAL_REMOVED,
  EVENT.OPPONENT_GOAL_REMOVED,
  EVENT.OPPONENT_EXPULSION_ADDED,
  EVENT.OPPONENT_EXPULSION_REMOVED,
]);

/** Minuto do jogo (ms) para um tempo dentro da parte em que o jogo acabou. */
export function periodoNoFim(state, ms) {
  if (state.currentPeriod === 2) return Math.max(0, ms - (state.firstHalfMs || 0));
  return ms;
}

/**
 * O último registo "de jogo": o que obriga o fim a ser igual ou posterior.
 * Num jogo já terminado só contam os registos anteriores ao fim (os que vieram
 * depois — correções, atribuições — não são jogo).
 * @returns {{ms:number, tipo:string}|null}
 */
export function ultimoRegisto(state) {
  const todos = state.events || [];
  let corte = todos.length;
  for (let i = todos.length - 1; i >= 0; i--) {
    if (todos[i].eventType === EVENT.MATCH_FINISHED) {
      corte = i;
      break;
    }
  }
  let melhor = null;
  const ver = (ms, tipo) => {
    if (ms == null || !Number.isFinite(ms)) return;
    if (!melhor || ms > melhor.ms) melhor = { ms, tipo };
  };
  for (let i = 0; i < corte; i++) {
    const ev = todos[i];
    if (ACCOES.has(ev.eventType)) ver(ev.matchElapsedMs, ev.eventType);
  }
  // Golos: o minuto vivo é o do estado (pode ter sido editado a frio).
  for (const g of state.goals || []) {
    ver(g.matchElapsedMs, g.team === 'US' ? EVENT.TEAM_GOAL_ADDED : EVENT.OPPONENT_GOAL_ADDED);
  }
  return melhor;
}

// Quanto tempo a mais se aceita depois do fim que ficou marcado (jogo
// terminado). Chega para qualquer prolongamento; serve só de rede contra um
// minuto escrito a mais por engano.
export const EXTRA_MAX_MS = 30 * 60_000;

/**
 * Entre que minutos se pode fixar o fim.
 * - mínimo: o último registo e, na 2.ª parte, o fim da 1.ª.
 * - máximo: o que o relógio marca agora (jogo por terminar) ou o fim que ficou
 *   registado (jogo terminado).
 * - maxExtraMs: só num jogo terminado — o jogo pode ter continuado depois do
 *   que ficou marcado (relógio parado, tempo de desconto), até EXTRA_MAX_MS.
 *   O que passa de `maxMs` é tempo extra.
 */
export function limitesDoFim(state, now = Date.now()) {
  const ultimo = ultimoRegisto(state);
  const base = state.currentPeriod === 2 ? state.firstHalfMs || 0 : 0;
  const minMs = Math.max(ultimo ? ultimo.ms : 0, base);
  const terminado = state.status === MATCH_STATUS.FINISHED;
  const maxMs = terminado
    ? state.fimOriginalMs ?? state.elapsedMatchMs
    : readClock(state, now).matchMs;
  const maxExtraMs = terminado ? maxMs + EXTRA_MAX_MS : maxMs;
  return { minMs, maxMs, maxExtraMs, ultimoRegisto: ultimo, terminado };
}

/** null se o minuto serve; senão { chave, valores } para o i18n. */
export function validarFim(state, ms, now = Date.now()) {
  if (!Number.isFinite(ms) || ms <= 0) return { chave: 'fim.erro.invalido', valores: {} };
  const { minMs, maxMs, maxExtraMs, ultimoRegisto: ult, terminado } = limitesDoFim(state, now);
  if (ms < minMs) {
    return { chave: 'fim.erro.antes', valores: { tempo: ms, minimo: minMs, tipo: ult?.tipo || null } };
  }
  if (ms > maxExtraMs) {
    return terminado
      ? { chave: 'fim.erro.extraDemais', valores: { maximo: maxExtraMs } }
      : { chave: 'fim.erro.depois', valores: { maximo: maxMs } };
  }
  return null;
}
