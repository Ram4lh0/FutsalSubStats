// components/tatica/geometria.js — as medidas do campo do quadro tático.
//
// Partilhadas entre o desenho em SVG (CampoTatico.jsx) e o desenho em canvas
// do vídeo (lib/videoJogada.js), para o vídeo sair exatamente igual ao ecrã.

import { COMPRIMENTO, LARGURA } from '../../domain/jogada.js';

/** Escala: posições da jogada (0–1000 × 0–500) → unidades do desenho (400 × 200). */
export const K = 0.4;
export const W = COMPRIMENTO * K;
export const H = LARGURA * K;

/** Raio de um jogador, em unidades do desenho. */
export const R = 9;

/** Área de 6 m: dois quartos de círculo a partir dos postes, unidos (caminho SVG). */
export function area(lado) {
  const r = 60;
  const c1 = H / 2 - 15.8;
  const c2 = H / 2 + 15.8;
  if (lado === 'esq') {
    return `M 0 ${c1 - r} A ${r} ${r} 0 0 1 ${r} ${c1} L ${r} ${c2} A ${r} ${r} 0 0 1 0 ${c2 + r}`;
  }
  return `M ${W} ${c1 - r} A ${r} ${r} 0 0 0 ${W - r} ${c1} L ${W - r} ${c2} A ${r} ${r} 0 0 0 ${W} ${c2 + r}`;
}

/**
 * A moldura visível (`viewBox`). Meio-campo: a metade do ataque, com um pouco
 * do outro lado para se ver a linha do meio e o círculo central inteiros.
 */
export function caixa(campo) {
  return campo === 'inteiro' ? `-14 -12 ${W + 28} ${H + 24}` : `${W / 2 - 34} -12 ${W / 2 + 48} ${H + 24}`;
}

/** As cores das peças — as mesmas do CSS (.tpeca--…). */
export const CORES = {
  jogador_nos: '#2563eb',
  jogador_eles: '#dc2626',
  gr_nos: '#facc15',
  gr_eles: '#7c3aed',
  bola: '#ffffff',
  cone: '#f97316',
  campo: '#1f6b46',
  linhas: 'rgba(255, 255, 255, 0.85)',
};
