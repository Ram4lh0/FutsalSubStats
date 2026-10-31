// lib/data/unidadeTreino.js — a unidade de treino (UT) de cada treino.
//
// EXPERIÊNCIA: por agora a UT fica só neste aparelho (localStorage), para se
// ver se o ecrã faz sentido antes de mexer no servidor. Não sincroniza e não
// passa para o telemóvel do adjunto. Se ficar, passa a ser uma coluna `plan`
// (jsonb) em `training_sessions` e entra no `trainingSessionMapper`.

import { useCallback, useEffect, useState } from 'react';
import { uid } from '../../domain/actions.js';

const CHAVE = (sessionId) => `fss:ut:${sessionId}`;
const EVENTO = 'fss:ut-mudou';

/** As partes de uma UT, pela ordem em que acontecem. */
export const PARTES_UT = ['AQUECIMENTO', 'PRINCIPAL', 'RETORNO'];

export function utVazia() {
  return { tema: '', objetivos: '', material: '', exercicios: [] };
}

export function exercicioNovo(parte = 'PRINCIPAL') {
  return { id: uid(), parte, nome: '', duracao: 10, descricao: '', jogadas: [] };
}

export function lerUT(sessionId) {
  if (!sessionId) return null;
  try {
    const txt = localStorage.getItem(CHAVE(sessionId));
    return txt ? { ...utVazia(), ...JSON.parse(txt) } : null;
  } catch {
    return null;
  }
}

export function gravarUT(sessionId, ut) {
  try {
    localStorage.setItem(CHAVE(sessionId), JSON.stringify(ut));
  } catch {
    // Sem armazenamento (janela privada): fica só em memória até sair.
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: sessionId }));
}

/** Uma UT tem conteúdo quando tem tema, objetivos ou pelo menos um exercício. */
export function utPreenchida(ut) {
  return !!ut && !!(ut.tema?.trim() || ut.objetivos?.trim() || ut.exercicios?.length);
}

/** Minutos somados dos exercícios. */
export function minutosUT(ut) {
  return (ut?.exercicios || []).reduce((s, e) => s + (Number(e.duracao) || 0), 0);
}

/** A UT de um treino, sempre atualizada quando outra parte da app a grava. */
export function useUnidadeTreino(sessionId) {
  const [ut, setUt] = useState(() => lerUT(sessionId));
  useEffect(() => {
    setUt(lerUT(sessionId));
    const aoMudar = (e) => {
      if (e.detail === sessionId) setUt(lerUT(sessionId));
    };
    window.addEventListener(EVENTO, aoMudar);
    return () => window.removeEventListener(EVENTO, aoMudar);
  }, [sessionId]);
  const guardar = useCallback((nova) => {
    setUt(nova);
    gravarUT(sessionId, nova);
  }, [sessionId]);
  return [ut, guardar];
}

/** Os ids dos treinos com UT preenchida, para marcar na lista. */
export function useTreinosComUT(ids) {
  const chave = ids.join(',');
  const [com, setCom] = useState(() => new Set());
  useEffect(() => {
    const ler = () => setCom(new Set(ids.filter((id) => utPreenchida(lerUT(id)))));
    ler();
    window.addEventListener(EVENTO, ler);
    return () => window.removeEventListener(EVENTO, ler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return com;
}
