'use client';

// lib/useFicheiroLigado.js — o ficheiro do computador ligado a uma análise,
// visto de um componente: volta a desenhar quando ele se liga, troca ou larga.

import { useSyncExternalStore } from 'react';
import { ficheiroLigado, subscreverFicheiros, versaoDosFicheiros } from './videoLocal.js';

const nenhum = () => null;

/** @returns {File | null} */
export default function useFicheiroLigado(analiseId) {
  return useSyncExternalStore(subscreverFicheiros, () => ficheiroLigado(analiseId), nenhum);
}

/**
 * Para quem mostra várias análises de uma vez (uma sessão): volta a desenhar
 * quando qualquer ficheiro se liga ou larga. Depois pergunta-se por cada um
 * com `ficheiroLigado(id)`.
 */
export function useFicheirosLigados() {
  return useSyncExternalStore(subscreverFicheiros, versaoDosFicheiros, () => 0);
}
