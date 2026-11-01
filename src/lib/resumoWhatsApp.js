'use client';

// lib/resumoWhatsApp.js — o "resumo do resumo" para mandar ao grupo da equipa.
//
// Quem pede isto quer, numa mensagem curta, o que os pais e os jogadores
// perguntam a seguir ao jogo: quanto ficou, quem marcou e assistiu (só da nossa
// equipa) e se houve expulsões. O resto (tempos, faltas, gráficos) fica na app.
// Os asteriscos são o negrito do WhatsApp.

import { CARD } from '@/domain/constants.js';
import { t } from '@/lib/i18n/index.js';
import { dayLabel } from '@/lib/format.js';

/** "12'" — o minuto em que aconteceu, como se diz no futebol (0:30 é o 1'). */
function minuto(ms) {
  return `${Math.floor((ms || 0) / 60_000) + 1}'`;
}

function nomeDe(state, playerId) {
  const p = playerId ? state.players[playerId] : null;
  return p ? `#${p.number} ${p.name}` : null;
}

/**
 * Expulsões do adversário. O contador do marcador conta os vermelhos e os
 * segundos amarelos do jogo ao vivo; um segundo amarelo acrescentado a frio
 * não o sobe, por isso fica o maior dos dois.
 */
function expulsoesDoAdversario(state) {
  const segundos = (state.opponentCards || []).filter((c) => c.secondYellow).length;
  return Math.max(state.opponentExpulsions || 0, segundos);
}

export function textoResumoWhatsApp({ state, match, ourName, opponentName, team, competition }) {
  const linhas = [];
  const casa = match.homeOrAway !== 'AWAY';
  linhas.push(
    casa
      ? `*${ourName} ${state.teamScore} - ${state.opponentScore} ${opponentName}*`
      : `*${opponentName} ${state.opponentScore} - ${state.teamScore} ${ourName}*`
  );
  const contexto = [team?.name, competition?.name, match.scheduledAt ? dayLabel(match.scheduledAt) : null]
    .filter(Boolean)
    .join(' · ');
  if (contexto) linhas.push(contexto);
  if (state.halftimeTeamScore != null) {
    linhas.push(
      t('partilhaResumo.intervalo', {
        resultado: casa
          ? `${state.halftimeTeamScore} - ${state.halftimeOpponentScore}`
          : `${state.halftimeOpponentScore} - ${state.halftimeTeamScore}`,
      })
    );
  }

  const nossos = (state.goals || [])
    .filter((g) => g.team === 'US')
    .sort((a, b) => (a.period ?? 0) - (b.period ?? 0) || a.matchElapsedMs - b.matchElapsedMs);
  if (nossos.length) {
    linhas.push('', `*${t('partilhaResumo.golos')}*`);
    for (const g of nossos) {
      const quem = g.ownGoal
        ? t('golos.autogolo')
        : nomeDe(state, g.scorerId) || t('golos.marcadorPorRegistar');
      const assist = !g.ownGoal ? nomeDe(state, g.assistId) : null;
      linhas.push(
        `${minuto(g.matchElapsedMs)} ${quem}${assist ? ` (${t('golos.assist', { nome: assist })})` : ''}`
      );
    }
  }

  const nossasExpulsoes = (state.cards || [])
    .filter((c) => c.type === CARD.RED || c.secondYellow)
    .sort((a, b) => a.matchElapsedMs - b.matchElapsedMs);
  const deles = expulsoesDoAdversario(state);
  if (nossasExpulsoes.length || deles) {
    linhas.push('', `*${t('partilhaResumo.expulsoes')}*`);
    for (const c of nossasExpulsoes) {
      const como = c.type === CARD.RED ? t('cartao.RED') : t('cartoes.segundoAmarelo');
      linhas.push(
        `${minuto(c.matchElapsedMs)} ${nomeDe(state, c.playerId) || ourName} (${como.toLowerCase()})`
      );
    }
    if (deles) {
      linhas.push(
        t(deles === 1 ? 'partilhaResumo.adversarioUma' : 'partilhaResumo.adversarioVarias', {
          equipa: opponentName,
          n: deles,
        })
      );
    }
  }

  return linhas.join('\n');
}
