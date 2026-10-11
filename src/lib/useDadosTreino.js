'use client';

// lib/useDadosTreino.js — a rotina, os treinos e as presenças de um escalão,
// sempre frescos: volta a ler quando a sincronização traz alguma coisa nova.

import { useCallback, useEffect, useState } from 'react';
import { DATA_UPDATED_EVENT } from './data/sync.js';
import { rotinas, treinos as repoTreinos, presencas as repoPresencas } from './data/treino.js';

/**
 * @param {string} teamId
 * @param {{acertar?: boolean}} [opcoes] `acertar` aplica a rotina aos treinos
 *   futuros antes de ler — só para quem pode editar o escalão.
 */
export default function useDadosTreino(teamId, { acertar = false } = {}) {
  const [dados, setDados] = useState(null);

  const carregar = useCallback(async () => {
    const [r, s, p] = await Promise.all([
      rotinas.listByTeam(teamId),
      repoTreinos.listByTeam(teamId),
      repoPresencas.listByTeam(teamId),
    ]);
    setDados({ rotinas: r, treinos: s, presencas: p });
  }, [teamId]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (acertar) await repoTreinos.acertarComRotina(teamId);
      if (vivo) await carregar();
    })();
    const aoAtualizar = () => vivo && carregar();
    window.addEventListener(DATA_UPDATED_EVENT, aoAtualizar);
    return () => {
      vivo = false;
      window.removeEventListener(DATA_UPDATED_EVENT, aoAtualizar);
    };
  }, [carregar, acertar, teamId]);

  return dados;
}
