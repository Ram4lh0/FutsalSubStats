// lib/squad.js — regras da convocatória que a interface precisa de confirmar.

import { MAX_ON_COURT } from '../domain/constants.js';
import { t } from './i18n/index.js';

/**
 * Jogar com menos de cinco convocados é possível (falta de gente, jogo-treino),
 * mas é raro o suficiente para valer a pena confirmar.
 */
export async function confirmarPoucosConvocados(confirmar, total) {
  if (total >= MAX_ON_COURT) return true;
  return confirmar(t('prep.poucosConvocados', { n: total, max: MAX_ON_COURT }), {
    okLabel: t('prep.continuarAssim'),
    danger: false,
  });
}
