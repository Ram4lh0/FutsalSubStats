// domain/actions.js
// Fábricas de eventos. Cada acção do utilizador produz um evento imutável com uma
// fotografia do relógio (secção 6) e um client_event_id único (secção 10), que garante
// idempotência quando a sincronização é retomada depois de uma falha de rede.

import { readClock } from './clock.js';
import { EVENT, PLAYER_MATCH_STATUS, POSITIONS, PENALTY_DURATION_MS } from './constants.js';

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function makeEvent(state, eventType, extra = {}, now = Date.now()) {
  const c = readClock(state, now);
  return {
    id: uid(),
    matchId: state.matchId,
    eventType,
    period: extra.period ?? state.currentPeriod,
    matchElapsedMs: extra.matchElapsedMs ?? c.matchMs,
    periodElapsedMs: extra.periodElapsedMs ?? c.periodMs,
    playerId: extra.playerId ?? null,
    playerInId: extra.playerInId ?? null,
    playerOutId: extra.playerOutId ?? null,
    position: extra.position ?? null,
    teamScoreSnapshot: state.teamScore,
    opponentScoreSnapshot: state.opponentScore,
    metadata: extra.metadata ?? {},
    clientEventId: uid(),
    createdBy: extra.createdBy ?? null,
    createdAt: now,
    undoneAt: null,
    undoneBy: null,
    syncedAt: null,
  };
}

export const startFirstHalf = (s, now) =>
  makeEvent(
    s,
    EVENT.FIRST_HALF_STARTED,
    {
      period: 1,
      matchElapsedMs: 0,
      periodElapsedMs: 0,
      metadata: { lineup: lineupSnapshot(s) },
    },
    now
  );

export const pauseClock = (s, now) => makeEvent(s, EVENT.CLOCK_PAUSED, {}, now);
export const resumeClock = (s, now) => makeEvent(s, EVENT.CLOCK_RESUMED, {}, now);
export const finishFirstHalf = (s, now) => makeEvent(s, EVENT.FIRST_HALF_FINISHED, {}, now);

export const setSecondHalfLineup = (s, lineup, now) =>
  makeEvent(s, EVENT.SECOND_HALF_LINEUP_SET, { metadata: { lineup } }, now);

export const startSecondHalf = (s, now) =>
  makeEvent(
    s,
    EVENT.SECOND_HALF_STARTED,
    {
      period: 2,
      periodElapsedMs: 0,
      metadata: { lineup: lineupSnapshot(s) },
    },
    now
  );

export const finishMatch = (s, now) => makeEvent(s, EVENT.MATCH_FINISHED, {}, now);

export const substitute = (s, { playerOutId, playerInId, position }, now) =>
  makeEvent(s, EVENT.SUBSTITUTION, { playerOutId, playerInId, position }, now);

export const changePosition = (s, { playerId, fromPosition, toPosition }, now) =>
  makeEvent(
    s,
    EVENT.POSITION_CHANGED,
    { playerId, position: toPosition, metadata: { fromPosition, toPosition } },
    now
  );

export const expelPlayer = (s, { playerId }, now) =>
  makeEvent(s, EVENT.PLAYER_EXPELLED, { playerId, position: s.players[playerId]?.position }, now);

export const replaceAfterExpulsion = (s, { playerInId, position }, now) =>
  makeEvent(s, EVENT.PLAYER_REPLACED_AFTER_EXPULSION, { playerInId, position }, now);

export const yellowCard = (s, { playerId }, now) =>
  makeEvent(s, EVENT.YELLOW_CARD, { playerId, metadata: { playerId } }, now);

export const redCard = (s, { playerId }, now) =>
  makeEvent(s, EVENT.RED_CARD, { playerId, metadata: { playerId } }, now);

export const startPenalty = (s, { playerId, durationMs = PENALTY_DURATION_MS }, now) =>
  makeEvent(s, EVENT.PENALTY_STARTED, { playerId, metadata: { playerId, durationMs } }, now);

/** Fim antecipado — em futsal a sanção termina se a equipa sofrer golo. */
export const endPenalty = (s, { playerId }, now) =>
  makeEvent(s, EVENT.PENALTY_ENDED, { playerId, metadata: { playerId } }, now);

/** O botão 5v4 do cartão do guarda-redes: ligar e desligar à mão. */
export const setPowerPlay = (s, ligado, now) =>
  makeEvent(s, ligado ? EVENT.POWER_PLAY_STARTED : EVENT.POWER_PLAY_ENDED, {}, now);

/** Mais ou menos uma expulsão do adversário. */
export const opponentExpulsion = (s, delta, now) =>
  makeEvent(
    s,
    delta > 0 ? EVENT.OPPONENT_EXPULSION_ADDED : EVENT.OPPONENT_EXPULSION_REMOVED,
    {},
    now
  );

export const goal = (s, kind, now, extra = {}) => makeEvent(s, kind, extra, now);

export const foul = (s, kind, now) => makeEvent(s, kind, {}, now);

/** Completa uma falta já registada com o jogador que a cometeu. */
export const attributeFoul = (s, { targetEventId, playerId }, now) =>
  makeEvent(s, EVENT.FOUL_ATTRIBUTED, { playerId, metadata: { targetEventId, playerId } }, now);

/** Golo da equipa com marcador já conhecido (botão "G" do cartão do jogador). */
export const teamGoalBy = (s, playerId, now) =>
  makeEvent(
    s,
    EVENT.TEAM_GOAL_ADDED,
    { playerId, metadata: { scorerId: playerId } },
    now
  );

/** Completa um golo já registado com marcador e/ou assistência. */
export const attributeGoal = (s, { targetEventId, ...fields }, now) =>
  makeEvent(s, EVENT.GOAL_ATTRIBUTED, { metadata: { targetEventId, ...fields } }, now);

export const squadUpdated = (s, { added = [], removed = [] }, now) =>
  makeEvent(s, EVENT.SQUAD_UPDATED, { metadata: { added, removed } }, now);

export const matchCreated = (s, now) => makeEvent(s, EVENT.MATCH_CREATED, {}, now);

export const correction = (s, patch, now) =>
  makeEvent(s, EVENT.MATCH_CORRECTED, { metadata: patch }, now);

export function undoEvent(s, target, now) {
  return makeEvent(
    s,
    EVENT.EVENT_UNDONE,
    { metadata: { targetEventId: target.id, targetType: target.eventType } },
    now
  );
}

function lineupSnapshot(state) {
  const out = {};
  for (const pos of POSITIONS) if (state.court[pos]) out[pos] = state.court[pos];
  return out;
}

export function availableForCourt(state) {
  return Object.values(state.players).filter((p) => p.status === PLAYER_MATCH_STATUS.ON_BENCH);
}
