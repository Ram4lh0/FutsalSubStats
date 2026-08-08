'use client';

// lib/useRouteParams.js — os ids que antes vinham no caminho.
//
// Substitui o `useParams` do Next. As páginas continuam a escrever
// `const { clubId, teamId } = useRouteParams()`, sem saberem que os ids passaram
// a viajar na barra de endereço em vez de no caminho.
//
// Atenção a quem usar isto: o `useSearchParams` do Next obriga a que a página
// esteja dentro de uma fronteira `<Suspense>`. Sem ela, o build queixa-se.

import { useSearchParams } from 'next/navigation';
import { PARAM } from './routes.js';

export default function useRouteParams() {
  const q = useSearchParams();
  return {
    clubId: q.get(PARAM.club) || null,
    teamId: q.get(PARAM.team) || null,
    matchId: q.get(PARAM.match) || null,
    playerId: q.get(PARAM.player) || null,
    competitionId: q.get(PARAM.competition) || null,
    // De onde se veio, para o botão "atrás" não atirar sempre para o mesmo
    // sítio. O resumo e o histórico são as duas páginas a que se chega por
    // caminhos diferentes.
    back: q.get('back') || null,
    de: q.get('from') || null,
  };
}
