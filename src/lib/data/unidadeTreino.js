// lib/data/unidadeTreino.js — a unidade de treino (UT) de cada treino.
//
// A UT vive na linha do treino (`training_sessions.plan`, jsonb) e sincroniza
// como as notas: grava no IndexedDB com `dirty`, a fila do sync leva-a ao
// servidor e os outros aparelhos trazem-na no pull.
//
// Até à 1.32.4 ficava só no localStorage do aparelho (`fss:ut:<id>`).
// `migrarUTsLocais` passa essas para a linha do treino na primeira vez que a
// app abre os treinos com esta versão.

import { useCallback, useEffect, useRef, useState } from 'react';
import { uid } from '../../domain/actions.js';
import { DATA_UPDATED_EVENT } from './sync.js';
import { treinos as repoTreinos } from './treino.js';

const CHAVE_ANTIGA = 'fss:ut:';
const CHAVE_GUARDADA = 'fss:ut-antiga:';
const ESPERA_MS = 600;

/** As partes de origem de uma UT, pela ordem em que acontecem. */
export const PARTES_UT = ['AQUECIMENTO', 'PRINCIPAL', 'RETORNO'];

/**
 * As partes desta UT, pela ordem: `[{ id, nome }]`. O treinador pode mudar o
 * nome, acrescentar e tirar partes (1.32.7); uma UT sem `partes` (as de antes,
 * ou ainda por mexer) tem as três de origem, com o nome traduzido.
 */
export function partesDaUT(ut) {
  if (Array.isArray(ut?.partes)) return ut.partes;
  return PARTES_UT.map((id) => ({ id, nome: null }));
}

/** O nome a mostrar: o que o treinador escreveu, ou o de origem traduzido. */
export function nomeDaParte(parte, t) {
  const nome = parte?.nome?.trim();
  if (nome) return nome;
  if (parte?.nome == null && PARTES_UT.includes(parte?.id)) return t(`ut.parte.${parte.id}`);
  return '';
}

export function utVazia() {
  return { tema: '', objetivos: '', material: '', exercicios: [] };
}

export function parteNova() {
  return { id: uid(), nome: '' };
}

export function exercicioNovo(parte = 'PRINCIPAL') {
  return { id: uid(), parte, nome: '', duracao: 10, descricao: '', jogadas: [] };
}

/** A UT guardada num treino (linha do IndexedDB), ou null. */
export function utDoTreino(treino) {
  const p = treino?.plan;
  return p && typeof p === 'object' ? { ...utVazia(), ...p } : null;
}

/** Uma UT tem conteúdo quando tem tema, objetivos ou pelo menos um exercício. */
export function utPreenchida(ut) {
  return !!ut && !!(ut.tema?.trim() || ut.objetivos?.trim() || ut.exercicios?.length);
}

/** Minutos somados dos exercícios. */
export function minutosUT(ut) {
  return (ut?.exercicios || []).reduce((s, e) => s + (Number(e.duracao) || 0), 0);
}

/* ------------------------------------------------- UTs antigas (aparelho) */

function chavesAntigas() {
  try {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CHAVE_ANTIGA)) out.push(k);
    }
    return out;
  } catch {
    return [];
  }
}

let aMigrar = null;

/**
 * Passa as UTs que ficaram no localStorage para a linha do treino. Se o treino
 * ainda não está neste aparelho (sync por fazer), fica para a próxima. Se o
 * treino já trouxe uma UT do servidor, ganha a do servidor; a deste aparelho
 * fica guardada em `fss:ut-antiga:<id>` para não se perder nada.
 */
export function migrarUTsLocais() {
  if (typeof window === 'undefined') return Promise.resolve(0);
  if (aMigrar) return aMigrar;
  aMigrar = (async () => {
    let passadas = 0;
    for (const chave of chavesAntigas()) {
      const id = chave.slice(CHAVE_ANTIGA.length);
      try {
        let ut = null;
        try {
          ut = JSON.parse(localStorage.getItem(chave) || 'null');
        } catch {
          ut = null;
        }
        if (!ut || !utPreenchida({ ...utVazia(), ...ut })) {
          localStorage.removeItem(chave);
          continue;
        }
        const treino = await repoTreinos.get(id);
        if (!treino) continue;
        if (!utPreenchida(utDoTreino(treino))) {
          await repoTreinos.plano(id, { ...utVazia(), ...ut });
          passadas++;
        } else {
          localStorage.setItem(CHAVE_GUARDADA + id, JSON.stringify(ut));
        }
        localStorage.removeItem(chave);
      } catch {
        // Fica para a próxima vez.
      }
    }
    return passadas;
  })().finally(() => {
    aMigrar = null;
  });
  return aMigrar;
}

/* ------------------------------------------------------------------ hooks */

/**
 * A UT de um treino. O ecrã escreve no estado local logo (para o cursor não
 * saltar) e grava na linha do treino 600 ms depois da última mudança, ou ao
 * sair. O que vem de outro aparelho entra quando não há nada por gravar.
 *
 * @returns {[object|null, (ut: object) => void, () => Promise<void>]}
 *   a UT, a função para a mudar e `gravarJa` (antes de sair ou do PDF).
 */
export function useUnidadeTreino(sessionId, treino) {
  const doServidor = utDoTreino(treino);
  const chaveServidor = JSON.stringify(doServidor);
  const [ut, setUt] = useState(doServidor);
  const porGravar = useRef(null);
  const relogio = useRef(null);

  // O que chega da linha (pull de outro aparelho, ou a nossa própria escrita).
  useEffect(() => {
    if (porGravar.current) return;
    setUt(doServidor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, chaveServidor]);

  const gravarJa = useCallback(async () => {
    clearTimeout(relogio.current);
    relogio.current = null;
    const nova = porGravar.current;
    if (!nova || !sessionId) return;
    await repoTreinos.plano(sessionId, nova);
    if (porGravar.current === nova) porGravar.current = null;
  }, [sessionId]);

  const guardar = useCallback(
    (nova) => {
      setUt(nova);
      porGravar.current = nova;
      clearTimeout(relogio.current);
      relogio.current = setTimeout(() => {
        gravarJa();
      }, ESPERA_MS);
    },
    [gravarJa]
  );

  // Ao sair do ecrã (ou mudar de treino), o que estiver por gravar grava.
  const gravarJaRef = useRef(gravarJa);
  gravarJaRef.current = gravarJa;
  useEffect(
    () => () => {
      gravarJaRef.current();
    },
    [sessionId]
  );

  return [ut, guardar, gravarJa];
}

/** Os ids dos treinos com UT preenchida, para marcar na lista. */
export function useTreinosComUT(ids) {
  const chave = ids.join(',');
  const [com, setCom] = useState(() => new Set());
  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      const linhas = await Promise.all(ids.map((id) => repoTreinos.get(id)));
      if (vivo) setCom(new Set(linhas.filter((t) => utPreenchida(utDoTreino(t))).map((t) => t.id)));
    };
    migrarUTsLocais().finally(ler);
    window.addEventListener(DATA_UPDATED_EVENT, ler);
    return () => {
      vivo = false;
      window.removeEventListener(DATA_UPDATED_EVENT, ler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return com;
}
