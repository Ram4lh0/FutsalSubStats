// domain/penalties.js
// Os 2 minutos de inferioridade numérica depois de uma expulsão.
//
// Duas decisões que valem a pena explicar:
//
// 1. O arranque é MANUAL. A expulsão e o recomeço do jogo raramente coincidem —
//    há discussão, o árbitro mostra o cartão, o jogo fica parado. Arrancar a
//    contagem automaticamente na expulsão daria dois minutos errados.
//
// 2. A contagem é em tempo de JOGO, não em tempo real. Guardamos só o instante
//    de arranque; o que falta é derivado do relógio a cada leitura. Assim pára
//    quando o cronómetro pára, atravessa o intervalo sem contar, e sobrevive a
//    fechar o iPad — não há nenhum setInterval de que dependa a verdade.
//
// 3. O fim por golo sofrido é AUTOMÁTICO (ver reducer.js, OPPONENT_GOAL_ADDED).
//    Só a nossa equipa tem jogadores registados, por isso a expulsão é sempre
//    nossa e a inferioridade também: um golo do adversário é, por construção,
//    golo sofrido pela equipa reduzida. Cada golo liberta um jogador — o da
//    sanção mais antiga.

import { PENALTY_DURATION_MS, PLAYER_MATCH_STATUS, MAX_ON_COURT } from './constants.js';
import { countOnCourt } from './reducer.js';

export const PENALTY_STATUS = { PENDING: 'PENDING', RUNNING: 'RUNNING', DONE: 'DONE' };

/**
 * Uma linha por jogador expulso, com o estado da respetiva sanção.
 * @returns [{ playerId, name, number, status, remainingMs, elapsedMs, penaltyId }]
 */
export function penaltyBoard(state, clockMs, defaultDurationMs = PENALTY_DURATION_MS) {
  const out = [];
  for (const player of Object.values(state.players)) {
    if (player.status !== PLAYER_MATCH_STATUS.EXPELLED) continue;
    if (player.penaltyRequired === false) continue;

    const mine = state.penalties.filter((p) => p.playerId === player.playerId);
    const last = mine[mine.length - 1] || null;

    const base = {
      playerId: player.playerId,
      name: player.name,
      number: player.number,
      expelledAtMatchMs: player.expelledAtMatchMs,
      penaltyId: last?.id || null,
    };

    if (!last) {
      out.push({ ...base, status: PENALTY_STATUS.PENDING, remainingMs: defaultDurationMs, elapsedMs: 0 });
      continue;
    }

    const endMs = last.endedMatchMs ?? last.startMatchMs + last.durationMs;
    const remainingMs = Math.max(0, endMs - clockMs);
    out.push({
      ...base,
      status: remainingMs > 0 ? PENALTY_STATUS.RUNNING : PENALTY_STATUS.DONE,
      remainingMs,
      elapsedMs: Math.min(last.durationMs, Math.max(0, clockMs - last.startMatchMs)),
      durationMs: last.durationMs,
      endedEarly: last.endedEarly,
      endedReason: last.endedReason || null,
      startMatchMs: last.startMatchMs,
    });
  }
  return out.sort((a, b) => (a.expelledAtMatchMs ?? 0) - (b.expelledAtMatchMs ?? 0));
}

/** Sanções por iniciar ou a decorrer — as que a interface tem de mostrar. */
export function openPenalties(state, clockMs, defaultDurationMs) {
  return penaltyBoard(state, clockMs, defaultDurationMs).filter(
    (p) => p.status !== PENALTY_STATUS.DONE
  );
}

/**
 * Enquanto uma sanção está por cumprir a equipa tem de jogar com menos um — é
 * esse o castigo. Mas o que fica bloqueado é UM lugar por cada sanção, não o
 * campo inteiro.
 *
 * Com dois expulsos e uma das sanções já cumprida, a equipa joga com quatro:
 * um dos lugares vazios volta a poder ser preenchido, o outro não. Comparar
 * lugares vazios com sanções por cumprir é o que dá a resposta certa — olhar
 * apenas para "há alguma sanção a correr?" trancava os dois.
 *
 * @returns null se pode repor, ou `{ chave }` com o motivo.
 */
export function canReplaceExpelled(state, clockMs, defaultDurationMs) {
  const open = openPenalties(state, clockMs, defaultDurationMs);
  const vazios = MAX_ON_COURT - countOnCourt(state);

  // Mais lugares vazios do que sanções: sobra pelo menos um para preencher.
  if (vazios > open.length) return null;

  const pending = open.find((p) => p.status === PENALTY_STATUS.PENDING);
  if (pending) return { chave: 'validacao.comeceAContagem' };
  if (open.length) return { chave: 'validacao.jogarReduzida' };
  return null;
}

export function canStartPenalty(state, playerId) {
  const player = state.players[playerId];
  if (!player) return { chave: 'validacao.naoConvocado' };
  if (player.status !== PLAYER_MATCH_STATUS.EXPELLED) return { chave: 'validacao.naoEstaExpulso' };
  if (player.penaltyRequired === false) return { chave: 'validacao.naoEstaExpulso' };
  if (state.penalties.some((p) => p.playerId === playerId))
    return { chave: 'validacao.contagemJaIniciada' };
  return null;
}
