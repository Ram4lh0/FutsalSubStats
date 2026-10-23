'use client';

// lib/useAcompanharJogo.js — o ecrã "Assistir ao vivo" a ouvir um jogo.
//
// Uma subscrição Realtime por ecrã aberto, filtrada pelo jogo
// (`match_id=eq.…` nos eventos, `id=eq.…` na linha do jogo), aberta ao entrar
// e fechada ao sair. Nada de perguntar ao servidor de x em x segundos.
//
// O estado sai sempre do mesmo sítio que no resto da app: a base local e
// `loadMatch` (que corre `buildMatchState`). O Realtime só guarda lá as
// linhas que mudam, e o ecrã volta a ler. Desfazer e correções não têm regra
// própria aqui — são eventos como os outros, e o reducer já sabe o que fazer.
//
// Ao ligar (e sempre que a ligação volta, ou a app regressa ao primeiro
// plano) traz-se o jogo inteiro do servidor (`trazerJogo`): o que aconteceu
// enquanto se estava sem rede entra aí, e o Realtime segue a partir dali.

import { useEffect, useState } from 'react';
import { supabase } from './supabase/client.js';
import { loadMatch } from './data/repository.js';
import { guardarDoRealtime, trazerJogo } from './data/sync.js';

export const LIGACAO = {
  A_LIGAR: 'a-ligar',
  LIGADO: 'ligado',
  SEM_LIGACAO: 'sem-ligacao',
  SEM_SERVIDOR: 'sem-servidor',
};

/**
 * @returns {{carregado: object|null, ligacao: string, ultimaAtualizacao: number|null}}
 *   `carregado` é o que `loadMatch` devolve (ou `{ vazio: true }`);
 *   `ultimaAtualizacao` é quando chegou a última notícia do servidor.
 */
export default function useAcompanharJogo(matchId) {
  const [carregado, setCarregado] = useState(null);
  const [ligacao, setLigacao] = useState(LIGACAO.A_LIGAR);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);

  useEffect(() => {
    if (!matchId) return undefined;
    let vivo = true;
    let canal = null;
    let agendado = null;
    let aTrazer = null;
    const sb = supabase();

    const redesenhar = async () => {
      const novo = await loadMatch(matchId);
      if (vivo) setCarregado(novo || { vazio: true });
      return novo;
    };

    // Um golo chega em rajada (golo, quem marcou, assistência): um redesenho só.
    //
    // A convocatória não vem pelo Realtime: sobe na preparação e não muda
    // durante o jogo. Se quem regista estava sem rede nessa altura, chega ao
    // servidor só com os primeiros eventos — e aqui o jogo aparecia sem
    // jogadores. Nesse caso vai-se buscar o jogo inteiro (no máximo de 30 em
    // 30 segundos, e só enquanto faltar).
    let semConvocadosEm = 0;
    const agendar = () => {
      if (agendado) return;
      agendado = setTimeout(async () => {
        agendado = null;
        if (!vivo) return;
        const novo = await redesenhar();
        const semJogadores = novo && !Object.keys(novo.state?.players || {}).length;
        if (semJogadores && novo.events.length && Date.now() - semConvocadosEm > 30_000) {
          semConvocadosEm = Date.now();
          ressincronizar();
        }
      }, 150);
    };

    // O jogo inteiro, do servidor. Dois pedidos ao mesmo tempo seriam o mesmo.
    const ressincronizar = () => {
      if (aTrazer) return aTrazer;
      aTrazer = (async () => {
        try {
          const { existe } = await trazerJogo(matchId);
          if (vivo && existe !== null) setUltimaAtualizacao(Date.now());
        } catch {
          /* sem rede: fica o que já cá estava, e o aviso diz isso mesmo */
        } finally {
          aTrazer = null;
        }
        if (vivo) await redesenhar();
      })();
      return aTrazer;
    };

    const receber = async (tabela, payload) => {
      if (!vivo || payload?.eventType === 'DELETE' || !payload?.new) return;
      // Um evento alterado (desfeito, ou com a atribuição de um golo junta) traz
      // o jogo de novo em vez de confiar na linha que veio: com a identidade de
      // réplica por omissão, uma coluna grande que não mudou pode não vir.
      // Acontece pouco — os eventos novos são sempre INSERT.
      if (tabela === 'match_events' && payload.eventType === 'UPDATE') {
        await ressincronizar();
        return;
      }
      try {
        await guardarDoRealtime(tabela, payload.new);
      } catch {
        await ressincronizar();
        return;
      }
      if (!vivo) return;
      setUltimaAtualizacao(Date.now());
      agendar();
    };

    const ligar = () => {
      if (!vivo || !sb) return;
      if (canal) sb.removeChannel(canal);
      setLigacao(LIGACAO.A_LIGAR);
      const este = sb
        .channel(`ao-vivo:${matchId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` },
          (p) => receber('match_events', p)
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
          (p) => receber('matches', p)
        );
      canal = este;
      este.subscribe((estado) => {
        // O canal anterior ainda pode responder ao fecho depois de este
        // ligar: só o canal actual decide o aviso.
        if (!vivo || canal !== este) return;
        if (estado === 'SUBSCRIBED') {
          setLigacao(LIGACAO.LIGADO);
          ressincronizar();
        } else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
          setLigacao(LIGACAO.SEM_LIGACAO);
        }
      });
    };

    // Primeiro o que este aparelho já tem, para o ecrã não abrir vazio.
    redesenhar();
    if (!sb) {
      setLigacao(LIGACAO.SEM_SERVIDOR);
      return () => {
        vivo = false;
      };
    }
    ligar();

    const semRede = () => setLigacao(LIGACAO.SEM_LIGACAO);
    // A rede voltou, ou a app voltou ao primeiro plano: num telemóvel a ligação
    // pode ter morrido em silêncio lá atrás. Ligado, basta pôr-se em dia;
    // senão, abre-se um canal novo (que se põe em dia ao ligar).
    const voltar = () => {
      if (canal?.state === 'joined') ressincronizar();
      else ligar();
    };
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'visible') voltar();
    };
    window.addEventListener('offline', semRede);
    window.addEventListener('online', voltar);
    document.addEventListener('visibilitychange', aoMudarVisibilidade);

    return () => {
      vivo = false;
      if (agendado) clearTimeout(agendado);
      window.removeEventListener('offline', semRede);
      window.removeEventListener('online', voltar);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      if (canal) sb.removeChannel(canal);
      canal = null;
    };
  }, [matchId]);

  return { carregado, ligacao, ultimaAtualizacao };
}
