// lib/squad.js — regras da convocatória que a interface precisa de confirmar.

import { MAX_ON_COURT } from '@/domain/constants.js';

/**
 * Jogar com menos de cinco convocados é possível (falta de gente, jogo-treino),
 * mas é raro o suficiente para valer a pena confirmar.
 */
export async function confirmarPoucosConvocados(confirmar, total) {
  if (total >= MAX_ON_COURT) return true;
  return confirmar(
    `Só ${total} convocados: o jogo vai começar com menos de ${MAX_ON_COURT} em campo e sem suplentes. Tem a certeza?`,
    { okLabel: 'Continuar assim', danger: false }
  );
}
