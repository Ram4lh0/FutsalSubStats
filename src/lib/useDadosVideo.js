'use client';

// lib/useDadosVideo.js — as análises, os clipes, as sessões e as conversas de
// um escalão, sempre frescos: volta a ler quando a sincronização (ou o
// Realtime) traz alguma coisa nova, e quando se escreve neste aparelho.

import { useCallback, useEffect, useState } from 'react';
import { DATA_UPDATED_EVENT, pedirDescarga, trazerLinhaDoVideo } from './data/sync.js';
import { analises, clipes, conversas, sessoes } from './data/video.js';
import { supabase } from './supabase/client.js';
import { emDemo } from './demoEstado.js';

const TABELAS = ['video_analyses', 'video_clips', 'video_sessions', 'video_clip_talks'];
const ESPERA_MS = 300;

/**
 * As linhas do vídeo deste escalão que mudam noutro aparelho chegam enquanto
 * o ecrã está aberto (Supabase Realtime), como os treinos. O aviso só diz
 * "esta linha mudou": a linha vem inteira pelo `trazerLinhaDoVideo`, que não
 * pisa nada que esteja por enviar daqui.
 */
export function useVideoAoVivo(teamId) {
  useEffect(() => {
    const sb = supabase();
    if (!sb || !teamId || emDemo()) return undefined;
    let vivo = true;
    let canal = null;
    let jaLigou = false;

    const relogios = new Map();
    const trazer = (tabela, id) => {
      if (!id) return;
      const chave = `${tabela}:${id}`;
      clearTimeout(relogios.get(chave));
      relogios.set(
        chave,
        setTimeout(() => {
          relogios.delete(chave);
          if (vivo) trazerLinhaDoVideo(tabela, id).catch(() => {});
        }, ESPERA_MS)
      );
    };

    const ligar = () => {
      if (!vivo) return;
      if (canal) sb.removeChannel(canal);
      let este = sb.channel(`video:${teamId}`);
      for (const tabela of TABELAS) {
        este = este.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tabela, filter: `team_id=eq.${teamId}` },
          (p) => trazer(tabela, p?.new?.id)
        );
      }
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

/**
 * @returns {null | {analises: object[], clipes: object[], sessoes: object[], conversas: object[]}}
 */
export default function useDadosVideo(teamId) {
  const [dados, setDados] = useState(null);
  useVideoAoVivo(teamId);

  const carregar = useCallback(async () => {
    if (!teamId) return;
    const [a, c, s, k] = await Promise.all([
      analises.listByTeam(teamId),
      clipes.listByTeam(teamId),
      sessoes.listByTeam(teamId),
      conversas.listByTeam(teamId),
    ]);
    setDados({ analises: a, clipes: c, sessoes: s, conversas: k });
  }, [teamId]);

  useEffect(() => {
    let vivo = true;
    const ler = () => vivo && carregar();
    ler();
    window.addEventListener(DATA_UPDATED_EVENT, ler);
    // Ao abrir, ver se outro aparelho mudou alguma coisa: entre ecrãs da app
    // não há "foco" que dispare a descarga.
    pedirDescarga();
    return () => {
      vivo = false;
      window.removeEventListener(DATA_UPDATED_EVENT, ler);
    };
  }, [carregar]);

  return dados;
}
