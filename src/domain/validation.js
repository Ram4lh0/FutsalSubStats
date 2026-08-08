// domain/validation.js
// Validações da secção 16 e regras de transição da secção 5.
// Devolvem null quando é válido ou uma mensagem em português quando não é.
// No futuro estas mesmas funções alimentam schemas Zod e constraints SQL.

import {
  MIN_SQUAD,
  MATCH_STATUS,
  PLAYER_MATCH_STATUS,
  MAX_SQUAD,
  MAX_ON_COURT,
  POSITIONS,
} from './constants.js';
import { countOnCourt, shorthandedCount } from './reducer.js';

export function validateClub(data) {
  if (!data.name || !data.name.trim()) return 'O nome do clube é obrigatório.';
  return null;
}

export function validatePlayer(data, existingPlayers, playerId = null) {
  if (!data.name || !data.name.trim()) return 'O nome do jogador é obrigatório.';
  const n = Number(data.shirtNumber);
  if (!Number.isInteger(n) || n < 0 || n > 99) return 'Número inválido (0 a 99).';
  const clash = existingPlayers.find(
    (p) => p.id !== playerId && p.isActive && Number(p.shirtNumber) === n
  );
  if (clash) return `O número ${n} já está atribuído a ${clash.name}.`;
  return null;
}

export function validateMatchInfo(data) {
  if (!data.opponentName || !data.opponentName.trim()) return 'O adversário é obrigatório.';
  if (!data.periodDurationMs || data.periodDurationMs <= 0)
    return 'A duração de cada parte tem de ser superior a zero.';
  return null;
}

export function validateSquadSelection(playerIds) {
  if (playerIds.length < MIN_SQUAD) return `São precisos pelo menos ${MIN_SQUAD} convocados.`;
  if (playerIds.length > MAX_SQUAD) return `Máximo de ${MAX_SQUAD} convocados.`;
  if (new Set(playerIds).size !== playerIds.length)
    return 'Existem jogadores repetidos na convocatória.';
  return null;
}

export function validateLineup(lineup, squadIds) {
  const entries = Object.entries(lineup).filter(([, v]) => v);
  if (entries.length > MAX_ON_COURT) return `Máximo de ${MAX_ON_COURT} jogadores em campo.`;
  const ids = entries.map(([, v]) => v);
  if (new Set(ids).size !== ids.length)
    return 'O mesmo jogador não pode ocupar duas posições.';
  for (const id of ids) {
    if (!squadIds.includes(id)) return 'Todos os jogadores em campo têm de estar convocados.';
  }
  for (const [pos] of entries) {
    if (!POSITIONS.includes(pos)) return `Posição inválida: ${pos}.`;
  }
  return null;
}

export function canStartFirstHalf(state) {
  if (state.status !== MATCH_STATUS.DRAFT && state.status !== MATCH_STATUS.READY)
    return 'O jogo já começou.';
  if (countOnCourt(state) !== MAX_ON_COURT)
    return `Coloque ${MAX_ON_COURT} jogadores em campo antes de começar.`;
  return null;
}

export function canFinishFirstHalf(state) {
  if (state.currentPeriod !== 1) return 'A primeira parte não está a decorrer.';
  return null;
}

/**
 * Quantos jogadores há mesmo para pôr em campo: os que estão convocados e não
 * foram expulsos nem ficaram indisponíveis.
 */
export function availableCount(state) {
  return Object.values(state.players).filter(
    (p) =>
      p.status === PLAYER_MATCH_STATUS.ON_COURT || p.status === PLAYER_MATCH_STATUS.ON_BENCH
  ).length;
}

/**
 * Quantos jogadores devem entrar para a segunda parte.
 *
 * Cinco, salvo dois casos: não haver cinco disponíveis (plantel curto ou
 * expulsões), ou haver sanção por cumprir. A sanção atravessa o intervalo — as
 * Leis do Jogo contam-na em tempo de jogo, e o que faltar continua a contar na
 * segunda parte —, por isso a equipa tem mesmo de entrar reduzida.
 */
export function expectedOnCourt(state) {
  const { nos } = shorthandedCount(state, state.elapsedMatchMs);
  return Math.max(1, Math.min(MAX_ON_COURT - nos, availableCount(state)));
}

/**
 * A segunda parte começa com o campo como deve estar — nem a menos nem a mais.
 *
 * Começar com quatro por distração — o treinador põe a formação a meio de uma
 * conversa e carrega em começar — dá um jogador com tempo de jogo a menos e uma
 * estatística errada que ninguém repara até ao fim da época. E começar com cinco
 * havendo sanção por cumprir é jogar em infração.
 */
export function canStartSecondHalf(state) {
  if (state.status !== MATCH_STATUS.HALFTIME) return 'Termine primeiro a primeira parte.';
  const emCampo = countOnCourt(state);
  if (emCampo === 0) return 'Defina a formação da segunda parte.';
  if (emCampo > MAX_ON_COURT) return `Máximo de ${MAX_ON_COURT} jogadores em campo.`;

  const exigidos = expectedOnCourt(state);
  const { nos } = shorthandedCount(state, state.elapsedMatchMs);

  if (emCampo > exigidos && nos > 0) {
    return `Há sanção por cumprir: a equipa entra com ${exigidos}.`;
  }
  if (emCampo < exigidos) {
    if (nos > 0) return `Coloque ${exigidos} jogadores em campo — a sanção ainda não terminou.`;
    return exigidos === MAX_ON_COURT
      ? `Coloque ${MAX_ON_COURT} jogadores em campo antes de começar a segunda parte.`
      : `Só há ${exigidos} jogadores disponíveis — coloque-os todos em campo.`;
  }
  return null;
}

export function canFinishMatch(state, { allowAbandon = false } = {}) {
  if (state.status === MATCH_STATUS.FINISHED) return 'O jogo já terminou.';
  if (state.currentPeriod < 2 && !allowAbandon)
    return 'Não é possível terminar o jogo antes da segunda parte. Use "Abandonar jogo" se necessário.';
  return null;
}

export function validateSubstitution(state, { playerOutId, playerInId }) {
  const out = state.players[playerOutId];
  const inn = state.players[playerInId];
  if (!out) return 'O jogador que sai não está convocado.';
  if (!inn) return 'O jogador que entra não está convocado.';
  if (out.status !== PLAYER_MATCH_STATUS.ON_COURT) return 'O jogador que sai tem de estar em campo.';
  if (inn.status === PLAYER_MATCH_STATUS.EXPELLED)
    return 'Um jogador expulso não pode voltar a entrar.';
  if (inn.status !== PLAYER_MATCH_STATUS.ON_BENCH)
    return 'O jogador que entra tem de estar no banco.';
  return null;
}

export function validateExpulsion(state, playerId) {
  const p = state.players[playerId];
  if (!p) return 'Jogador não convocado.';
  if (p.status === PLAYER_MATCH_STATUS.EXPELLED) return 'O jogador já está expulso.';
  return null;
}

export function validateReplacement(state, { playerInId, position }) {
  const inn = state.players[playerInId];
  if (!inn) return 'Jogador não convocado.';
  if (inn.status === PLAYER_MATCH_STATUS.EXPELLED)
    return 'Um jogador expulso não pode voltar a entrar.';
  if (inn.status !== PLAYER_MATCH_STATUS.ON_BENCH) return 'O jogador tem de estar no banco.';
  if (countOnCourt(state) >= MAX_ON_COURT)
    return `Já existem ${MAX_ON_COURT} jogadores em campo.`;
  if (position && state.court[position]) return 'Essa posição já está ocupada.';
  return null;
}
