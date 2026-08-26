// domain/validation.js
// Validações da secção 16 e regras de transição da secção 5.
//
// Devolvem `null` quando está tudo bem, ou `{ chave, valores }` quando não.
//
// Antes devolviam a frase em português já escrita. Isso deixou de servir com
// três idiomas, mas a mudança é boa por si só: o domínio não tem nada que saber
// em que língua alguém está a olhar para o ecrã. Ele diz **o que** está errado;
// quem mostra é que decide como se diz.
//
// Nos testes há um efeito lateral agradável: passaram a comparar chaves em vez
// de frases, e por isso deixaram de partir quando se muda uma palavra numa
// mensagem. Um teste que falha porque alguém trocou "Coloque" por "Ponha" não
// estava a proteger nada.

import {
  MIN_SQUAD,
  MATCH_STATUS,
  PLAYER_MATCH_STATUS,
  MAX_SQUAD,
  MAX_ON_COURT,
  POSITIONS,
} from './constants.js';
import { countOnCourt, shorthandedCount } from './reducer.js';

/** Açúcar para não repetir `{ chave: ..., valores: ... }` trinta vezes. */
const erro = (chave, valores) => (valores ? { chave, valores } : { chave });

export function validateClub(data) {
  if (!data.name || !data.name.trim()) return erro('validacao.clubeSemNome');
  return null;
}

export function validatePlayer(data, existingPlayers, playerId = null) {
  if (!data.name || !data.name.trim()) return erro('validacao.jogadorSemNome');
  const n = Number(data.shirtNumber);
  if (!Number.isInteger(n) || n < 0 || n > 99) return erro('validacao.numeroInvalido');
  const clash = existingPlayers.find(
    (p) => p.id !== playerId && p.isActive && Number(p.shirtNumber) === n
  );
  if (clash) return erro('validacao.numeroOcupado', { n, nome: clash.name });
  return null;
}

export function validateMatchInfo(data) {
  if (!data.opponentName || !data.opponentName.trim()) return erro('validacao.semAdversario');
  if (!data.periodDurationMs || data.periodDurationMs <= 0)
    return erro('validacao.duracaoInvalida');
  return null;
}

export function validateSquadSelection(playerIds, maxSquad = MAX_SQUAD) {
  if (playerIds.length < MIN_SQUAD) return erro('validacao.poucosConvocados', { n: MIN_SQUAD });
  if (maxSquad != null && playerIds.length > maxSquad)
    return erro('validacao.muitosConvocados', { n: maxSquad });
  if (new Set(playerIds).size !== playerIds.length) return erro('validacao.convocadosRepetidos');
  return null;
}

export function validateLineup(lineup, squadIds) {
  const entries = Object.entries(lineup).filter(([, v]) => v);
  if (entries.length > MAX_ON_COURT) return erro('validacao.maximoEmCampo', { n: MAX_ON_COURT });
  const ids = entries.map(([, v]) => v);
  if (new Set(ids).size !== ids.length) return erro('validacao.duasPosicoes');
  for (const id of ids) {
    if (!squadIds.includes(id)) return erro('validacao.emCampoSemConvocatoria');
  }
  for (const [pos] of entries) {
    if (!POSITIONS.includes(pos)) return erro('validacao.posicaoInvalida', { pos });
  }
  return null;
}

export function canStartFirstHalf(state) {
  if (state.status !== MATCH_STATUS.DRAFT && state.status !== MATCH_STATUS.READY)
    return erro('validacao.jogoJaComecou');
  if (countOnCourt(state) !== MAX_ON_COURT)
    return erro('validacao.coloqueParaComecar', { n: MAX_ON_COURT });
  return null;
}

export function canFinishFirstHalf(state) {
  if (state.currentPeriod !== 1) return erro('validacao.primeiraParteNaoDecorre');
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
  if (state.status !== MATCH_STATUS.HALFTIME) return erro('validacao.termineAPrimeira');
  const emCampo = countOnCourt(state);
  if (emCampo === 0) return erro('validacao.definaFormacao');
  if (emCampo > MAX_ON_COURT) return erro('validacao.maximoEmCampo', { n: MAX_ON_COURT });

  const exigidos = expectedOnCourt(state);
  const { nos } = shorthandedCount(state, state.elapsedMatchMs);

  if (emCampo > exigidos && nos > 0) {
    return erro('validacao.sancaoPorCumprir', { n: exigidos });
  }
  if (emCampo < exigidos) {
    if (nos > 0) return erro('validacao.coloqueComSancao', { n: exigidos });
    return exigidos === MAX_ON_COURT
      ? erro('validacao.coloqueParaSegunda', { n: MAX_ON_COURT })
      : erro('validacao.soHaDisponiveis', { n: exigidos });
  }
  return null;
}

export function canFinishMatch(state, { allowAbandon = false } = {}) {
  if (state.status === MATCH_STATUS.FINISHED) return erro('validacao.jogoJaTerminou');
  if (state.currentPeriod < 2 && !allowAbandon) return erro('validacao.aindaNaSegunda');
  return null;
}

export function validateSubstitution(state, { playerOutId, playerInId }) {
  const out = state.players[playerOutId];
  const inn = state.players[playerInId];
  if (!out) return erro('validacao.saiSemConvocatoria');
  if (!inn) return erro('validacao.entraSemConvocatoria');
  if (out.status !== PLAYER_MATCH_STATUS.ON_COURT) return erro('validacao.saiTemDeEstarEmCampo');
  if (inn.status === PLAYER_MATCH_STATUS.EXPELLED) return erro('validacao.expulsoNaoVolta');
  if (inn.status !== PLAYER_MATCH_STATUS.ON_BENCH) return erro('validacao.entraTemDeEstarNoBanco');
  return null;
}

export function validateExpulsion(state, playerId) {
  const p = state.players[playerId];
  if (!p) return erro('validacao.naoConvocado');
  if (p.status === PLAYER_MATCH_STATUS.EXPELLED) return erro('validacao.jaExpulso');
  return null;
}

export function validateReplacement(state, { playerInId, position }) {
  const inn = state.players[playerInId];
  if (!inn) return erro('validacao.naoConvocado');
  if (inn.status === PLAYER_MATCH_STATUS.EXPELLED) return erro('validacao.expulsoNaoVolta');
  if (inn.status !== PLAYER_MATCH_STATUS.ON_BENCH) return erro('validacao.temDeEstarNoBanco');
  if (countOnCourt(state) >= MAX_ON_COURT) return erro('validacao.jaExistemEmCampo', { n: MAX_ON_COURT });
  if (position && state.court[position]) return erro('validacao.posicaoOcupada');
  return null;
}
