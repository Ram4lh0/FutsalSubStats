'use client';

// components/video/useLeitorDeClipes.js — o estado de um leitor que toca
// clipes: onde vai o vídeo, se está a tocar, a velocidade, e qual é o clipe
// (ou a fila de clipes) em curso.
//
// Serve os quatro ecrãs que têm vídeo (análise, sessão, jogador e link
// público). O leitor em si é o `LeitorVideo`; aqui fica só a regra de "tocar
// do início ao fim e passar ao seguinte" — a lógica pura está no domínio.

import { useCallback, useMemo, useRef, useState } from 'react';
import { clipeAcabou, seguinteNaFila } from '@/domain/analiseVideo.js';

/** Quanto se pode fugir de um clipe antes de se assumir que foi de propósito. */
const FOLGA_MS = 1500;

export const VELOCIDADES = [0.25, 0.5, 1, 2];

/**
 * @param {{fonteDoClipe?: (clipe: object) => ({tipo: string, id: string} | null)}} opcoes
 *   `fonteDoClipe` diz de que vídeo é cada clipe; sem ela, são todos do vídeo
 *   que já está aberto.
 */
export default function useLeitorDeClipes({ fonteDoClipe } = {}) {
  const ref = useRef(null);
  const [tempoMs, setTempoMs] = useState(0);
  const [estado, setEstado] = useState('parado');
  const [pronto, setPronto] = useState(false);
  const [velocidade, setVelocidade] = useState(1);
  const [ativo, setAtivo] = useState(null);
  const [fila, setFila] = useState(null);
  const [acabou, setAcabou] = useState(false);

  // O relógio do leitor chama `aoTempo` 4 vezes por segundo: lê o que precisa
  // de refs, para não depender de desenhos que ainda não aconteceram.
  const ativoRef = useRef(null);
  const filaRef = useRef(null);
  const armadoRef = useRef(false);
  const fonteRef = useRef(fonteDoClipe);
  fonteRef.current = fonteDoClipe;

  const largar = useCallback(() => {
    ativoRef.current = null;
    filaRef.current = null;
    armadoRef.current = false;
    setAtivo(null);
    setFila(null);
  }, []);

  const abrirClipe = useCallback((clipe, { tocar = true } = {}) => {
    ativoRef.current = clipe;
    armadoRef.current = false;
    setAtivo(clipe);
    setAcabou(false);
    const fonte = fonteRef.current ? fonteRef.current(clipe) : null;
    ref.current?.abrir(fonte, clipe.startMs / 1000, { tocar });
  }, []);

  const aoTempo = useCallback(
    (seg) => {
      const ms = Math.round(seg * 1000);
      setTempoMs(ms);
      const clipe = ativoRef.current;
      if (!clipe) return;

      // Depois de saltar para um clipe, o leitor ainda pode avisar uma ou duas
      // vezes com o tempo antigo. Só se começa a vigiar o fim quando o vídeo
      // já está mesmo dentro do clipe.
      if (!armadoRef.current) {
        if (ms >= clipe.startMs - FOLGA_MS && !clipeAcabou(clipe, ms)) armadoRef.current = true;
        return;
      }
      // O treinador arrastou a barra para outro sítio: o clipe deixa de mandar.
      if (ms < clipe.startMs - FOLGA_MS || ms > clipe.endMs + FOLGA_MS) {
        largar();
        return;
      }
      if (!clipeAcabou(clipe, ms)) return;

      const seguinte = filaRef.current ? seguinteNaFila(filaRef.current, clipe.id) : null;
      if (seguinte) {
        abrirClipe(seguinte);
        return;
      }
      ref.current?.pausar();
      armadoRef.current = false;
      if (filaRef.current) {
        // Fim da fila: fica tudo como estava antes de "ver seguidos".
        largar();
      } else {
        // Um clipe só: pára no fim e fica marcado, para se poder repetir.
        ativoRef.current = null;
        setAcabou(true);
      }
    },
    [abrirClipe, largar]
  );

  /** Toca um clipe do início ao fim e pára. */
  const tocarClipe = useCallback(
    (clipe, opcoes) => {
      filaRef.current = null;
      setFila(null);
      abrirClipe(clipe, opcoes);
    },
    [abrirClipe]
  );

  /** "Ver seguidos": toca cada clipe da lista e passa ao seguinte. */
  const tocarFila = useCallback(
    (lista, desde = null) => {
      if (!lista?.length) return;
      filaRef.current = lista;
      setFila(lista);
      abrirClipe(desde || lista[0]);
    },
    [abrirClipe]
  );

  const parar = useCallback(() => {
    ref.current?.pausar();
    largar();
    setAcabou(false);
  }, [largar]);

  const alternar = useCallback(() => {
    const leitor = ref.current;
    if (!leitor) return;
    if (leitor.aTocar()) leitor.pausar();
    else leitor.tocar();
  }, []);

  /** −5 s / +5 s: sem mudar se está a tocar ou parado. */
  const saltar = useCallback((deltaSeg) => {
    const leitor = ref.current;
    if (!leitor) return;
    leitor.irPara(Math.max(0, leitor.tempo() + deltaSeg));
  }, []);

  /** O avanço fino: pára e anda ±0,1 s. */
  const passo = useCallback((deltaSeg) => {
    const leitor = ref.current;
    if (!leitor) return;
    const alvo = Math.max(0, Math.round((leitor.tempo() + deltaSeg) * 10) / 10);
    leitor.irPara(alvo, { tocar: false });
  }, []);

  const mudarVelocidade = useCallback((v) => {
    ref.current?.velocidade(v);
    setVelocidade(v);
  }, []);

  const irPara = useCallback(
    (ms, opcoes) => {
      largar();
      setAcabou(false);
      ref.current?.irPara(ms / 1000, opcoes);
    },
    [largar]
  );

  /** O que o `<LeitorVideo>` recebe. */
  const propsDoLeitor = useMemo(
    () => ({
      ref,
      onTempo: aoTempo,
      onEstado: setEstado,
      onPronto: () => setPronto(true),
    }),
    [aoTempo]
  );

  return {
    ref,
    propsDoLeitor,
    tempoMs,
    estado,
    aTocar: estado === 'a_tocar' || estado === 'a_carregar',
    pronto,
    velocidade,
    ativo,
    fila,
    acabou,
    /** Onde o vídeo está agora, perguntado ao leitor (não ao último tique). */
    tempoAgoraMs: () => Math.round((ref.current?.tempo() ?? tempoMs / 1000) * 1000),
    duracaoMs: () => Math.round((ref.current?.duracao() || 0) * 1000),
    tocarClipe,
    tocarFila,
    parar,
    alternar,
    saltar,
    passo,
    mudarVelocidade,
    irPara,
  };
}
