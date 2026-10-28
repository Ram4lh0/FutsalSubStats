'use client';

// lib/selecaoArraste.js — convocar vários jogadores de uma vez, a arrastar.
//
// Com 20 jogadores no plantel, convocar 14 eram 14 toques. Assim carrega-se num
// cartão e passa-se por cima dos outros, com o rato ou com o dedo: todos os que
// o ponteiro atravessar ficam como o primeiro ficou. Começar num convocado
// desconvoca; começar num que não está convoca.
//
// O toque simples continua igual: só passa a arrasto quando o ponteiro chega a
// outro cartão. Nesse caso o clique que o browser manda no fim é engolido, para
// o cartão onde se largou não voltar atrás.
//
// No toque, a grelha tem `touch-action: pan-y` (ver `.pickgrid` no CSS): a
// deslizar na vertical a página continua a rolar; a deslizar para o lado é
// seleção — e daí em diante pode-se ir em qualquer direção.
//
// Como no `lib/arrastar.js`, o cartão debaixo do ponteiro pergunta-se ao browser
// (`elementFromPoint` + `[data-pick-id]`), sem guardar posições.

import { useEffect, useRef } from 'react';

export default function useSelecaoArraste({ escolhidos, limite, aoMudar, aoLimite }) {
  const estado = useRef(null);
  const engolirClique = useRef(false);
  const atual = useRef({ escolhidos, limite, aoMudar, aoLimite });
  atual.current = { escolhidos, limite, aoMudar, aoLimite };

  useEffect(() => () => estado.current?.parar(), []);

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const inicio = e.target.closest?.('[data-pick-id]')?.dataset.pickId;
    if (!inicio) return;
    // No rato, sem isto o browser começava a selecionar o texto dos cartões.
    if (e.pointerType === 'mouse') e.preventDefault();

    const lista = new Set(atual.current.escolhidos);
    const ligar = !lista.has(inicio);
    const vistos = new Set();
    let arrastou = false;
    let avisou = false;

    /** Põe um cartão como o primeiro ficou; diz se mudou alguma coisa. */
    const aplicar = (id) => {
      if (vistos.has(id)) return false;
      vistos.add(id);
      if (!ligar) return lista.delete(id);
      if (lista.has(id)) return false;
      const { limite: max } = atual.current;
      if (max != null && lista.size >= max) {
        if (!avisou) atual.current.aoLimite?.();
        avisou = true;
        return false;
      }
      lista.add(id);
      return true;
    };

    const mover = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const id = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest?.('[data-pick-id]')?.dataset.pickId;
      if (!id || (id === inicio && !arrastou)) return;
      let mudou = false;
      if (!arrastou) {
        arrastou = true;
        mudou = aplicar(inicio);
      }
      if (aplicar(id) || mudou) atual.current.aoMudar([...lista]);
    };

    const acabar = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      parar();
      if (arrastou && ev.type === 'pointerup') {
        // O clique chega a seguir ao pointerup, no mesmo cartão: é desse que se foge.
        engolirClique.current = true;
        setTimeout(() => {
          engolirClique.current = false;
        }, 0);
      }
    };

    const parar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', acabar);
      window.removeEventListener('pointercancel', acabar);
      estado.current = null;
    };

    estado.current?.parar();
    estado.current = { parar };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', acabar);
    window.addEventListener('pointercancel', acabar);
  }

  return {
    grelha: { onPointerDown },
    /** Para o `onClick` dos cartões: true se o clique é o fim de um arrasto. */
    acabouDeArrastar: () => engolirClique.current,
  };
}
