// lib/format.js — apresentação: datas, nomes e etiquetas.
//
// São as funções que estavam em ui/shared.js e não dependem do DOM. Ficam aqui
// para os componentes React as usarem sem arrastar nada de interface.

import { MATCH_STATUS_LABEL, POSITION_LABEL, POSITION_SHORT, HOME_AWAY_LABEL } from '@/domain/constants.js';

// O ano não entra nas datas: cada clube tem uma época associada e todos os jogos
// que se vêem no ecrã são dessa época.
export function dateLabel(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function dayLabel(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

/**
 * Nome a mostrar no marcador e nos resumos: o apelido, se existir.
 *
 * "Sporting Clube de Portugal" não cabe num marcador de iPhone; "SCP" cabe. O
 * nome completo continua a ser o que aparece nas listas e nos títulos.
 */
export function clubShort(club) {
  return (club?.shortName || '').trim() || club?.name || 'Nós';
}

export function opponentShort(match) {
  return (match?.opponentShortName || '').trim() || match?.opponentName || 'Adversário';
}

export function positionLabel(p) {
  return POSITION_LABEL[p] || '—';
}

export function positionShort(p) {
  return POSITION_SHORT[p] || '—';
}

export function statusLabel(status) {
  return MATCH_STATUS_LABEL[status] || status;
}

export function statusKind(status) {
  if (status === 'FINISHED') return 'muted';
  if (status === 'HALFTIME') return 'warn';
  if (String(status).includes('RUNNING')) return 'live';
  if (String(status).includes('PAUSED')) return 'warn';
  return 'info';
}

export function homeAwayLabel(v) {
  return HOME_AWAY_LABEL[v] || '';
}
