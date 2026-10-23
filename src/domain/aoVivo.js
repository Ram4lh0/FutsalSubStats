// domain/aoVivo.js — "Assistir ao vivo" (add-on 'ao-vivo').
//
// Um treinador regista o jogo (na bancada, por exemplo) e outro, com acesso ao
// escalão, acompanha-o em direto no seu telemóvel e na sua conta.
//
// O que é preciso saber de um jogo para isso cabe aqui, sem servidor nem
// React. O estado do jogo continua a sair só de `buildMatchState`: quem
// acompanha recebe os mesmos eventos e calcula tudo pelas mesmas regras.
//
//   · Quem regista, com o interruptor ligado, grava a `fotografiaAoVivo` na
//     linha do jogo enquanto ele decorre (antes isso só acontecia no fim).
//     É o `status` dessa fotografia que diz ao servidor que o jogo está ao
//     vivo, e é por ele que se faz a lista "Jogos ao vivo".
//   · Um jogo deixa de estar ao vivo sozinho quando chega a FINISHED. E um
//     jogo largado a meio (a app fechada sem terminar) deixa de aparecer ao
//     fim de `AO_VIVO_VALIDADE_MS` sem notícias.

import { EVENT, LIVE_STATUSES } from './constants.js';
import { foulsTotal } from './reducer.js';

export const ADDON_AO_VIVO = 'ao-vivo';

/**
 * Quanto tempo um jogo continua "ao vivo" sem chegar nada de quem o regista.
 * Um jogo a sério, com intervalo e paragens, cabe largamente em três horas.
 */
export const AO_VIVO_VALIDADE_MS = 3 * 60 * 60 * 1000;

/** Os estados em que um jogo com o interruptor ligado aparece como ao vivo. */
export const ESTADOS_AO_VIVO = LIVE_STATUSES;

/**
 * O jogo está ao vivo? Lê a linha do jogo (local ou do servidor, já em
 * camelCase): interruptor ligado, status entre o início e o fim, não
 * arquivado, e com notícias há menos de `AO_VIVO_VALIDADE_MS`.
 */
export function estaAoVivo(match, agora = Date.now()) {
  if (!match?.liveEnabled || match.archivedAt) return false;
  if (!ESTADOS_AO_VIVO.includes(match.status)) return false;
  const visto = match.updatedAt || match.startedAt || null;
  return visto == null || agora - visto < AO_VIVO_VALIDADE_MS;
}

/**
 * O resumo do jogo que vai na linha de `matches` enquanto ele decorre: os
 * mesmos campos que o `endMatch` grava no fim, tirados do mesmo estado.
 */
export function fotografiaAoVivo(state) {
  return {
    status: state.status,
    startedAt: state.startedAt ?? null,
    finishedAt: state.finishedAt ?? null,
    teamScore: state.teamScore ?? 0,
    opponentScore: state.opponentScore ?? 0,
    halftimeTeamScore: state.halftimeTeamScore ?? null,
    halftimeOpponentScore: state.halftimeOpponentScore ?? null,
    currentPeriod: state.currentPeriod ?? 0,
    timerStatus: state.timerStatus || 'STOPPED',
    teamFouls: foulsTotal(state, 'US'),
  };
}

/** A linha do jogo ainda não tem esta fotografia? (Para não gravar de mais.) */
export function fotografiaMudou(match, foto) {
  return Object.entries(foto).some(([k, v]) => (match?.[k] ?? null) !== (v ?? null));
}

/**
 * Quem começou o jogo: a conta que gravou o arranque da 1.ª parte. `null`
 * quando o evento nasceu neste aparelho e ainda não voltou do servidor, ou
 * quando o servidor não sabe (eventos antigos).
 */
export function quemComecou(events = []) {
  const ev = events.find((e) => e.eventType === EVENT.FIRST_HALF_STARTED && !e.undoneAt);
  return ev?.createdBy || null;
}

/**
 * O jogo está a ser registado por outra conta? Sem saber quem somos, ou quem
 * começou, a resposta é não: fica tudo como sempre foi.
 */
export function registadoPorOutro(events, userId) {
  const quem = quemComecou(events);
  return Boolean(quem && userId && quem !== userId);
}
