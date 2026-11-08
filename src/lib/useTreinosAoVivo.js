'use client';

// lib/useTreinosAoVivo.js — os treinos e as presenças de um escalão chegam dos
// outros aparelhos enquanto o ecrã está aberto (Supabase Realtime).
//
// Dois treinadores com o mesmo treino aberto: o que um escreve na UT, nas
// notas ou nas presenças aparece no outro sem ter de sair da app. Quem decide
// o que cada um recebe é a segurança por linha do servidor (a mesma da
// descarga). O aviso só diz "esta linha mudou"; a linha vem inteira pelo
// `trazerLinhaDoTreino`, que não pisa nada que esteja por enviar daqui.

import { useEffect } from 'react';
import { supabase } from './supabase/client.js';
import { pedirDescarga, trazerLinhaDoTreino } from './data/sync.js';
import { emDemo } from './demoEstado.js';
import * as db from './data/local.js';

const ESPERA_MS = 400;

export default function useTreinosAoVivo(teamId) {
  useEffect(() => {
    const sb = supabase();
    if (!sb || !teamId || emDemo()) return undefined;
    let vivo = true;
    let canal = null;
    let jaLigou = false;

    // Vários avisos da mesma linha seguidos (a UT grava a cada pausa) dão um
    // pedido só.
    const relogios = new Map();
    const trazer = (tabela, id) => {
      if (!id) return;
      const chave = `${tabela}:${id}`;
      clearTimeout(relogios.get(chave));
      relogios.set(
        chave,
        setTimeout(() => {
          relogios.delete(chave);
          if (vivo) trazerLinhaDoTreino(tabela, id).catch(() => {});
        }, ESPERA_MS)
      );
    };

    const presenca = async (p) => {
      const linha = p?.new;
      if (!linha?.id || !linha.session_id) return;
      // As presenças não têm escalão: só interessam as dos treinos deste.
      const treino = await db.get(db.STORES.trainingSessions, linha.session_id);
      if (treino?.teamId === teamId) trazer('training_attendance', linha.id);
    };

    const ligar = () => {
      if (!vivo) return;
      if (canal) sb.removeChannel(canal);
      const este = sb
        .channel(`treinos:${teamId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'training_sessions', filter: `team_id=eq.${teamId}` },
          (p) => trazer('training_sessions', p?.new?.id)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'training_attendance' },
          presenca
        );
      canal = este;
      este.subscribe((estado) => {
        if (!vivo || canal !== este) return;
        // Ao religar (a app esteve lá atrás), pôr-se em dia com o que passou.
        if (estado === 'SUBSCRIBED') {
          if (jaLigou) pedirDescarga();
          jaLigou = true;
        }
      });
    };

    ligar();

    // Num telemóvel a ligação pode morrer em silêncio com a app lá atrás.
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return;
      if (canal?.state !== 'joined') ligar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('online', aoVoltar);

    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('online', aoVoltar);
      for (const r of relogios.values()) clearTimeout(r);
      if (canal) sb.removeChannel(canal);
    };
  }, [teamId]);
}
