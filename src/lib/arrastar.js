'use client';

// lib/arrastar.js — arrastar um jogador e largá-lo noutro sítio.
//
// ## Porquê à mão, e não com o arrasto do HTML
//
// O `draggable` do HTML não existe no toque. Funciona no rato e no computador, e
// num telemóvel não acontece nada — que é precisamente onde esta app é usada.
//
// Os eventos de ponteiro cobrem os dois: o rato, o dedo e a caneta entram pelo
// mesmo sítio, e o `setPointerCapture` garante que os movimentos continuam a
// chegar mesmo depois de o dedo sair de cima do cartão onde começou.
//
// ## Como se sabe onde foi largado
//
// Pelo `document.elementFromPoint` no momento de largar, à procura do
// `[data-largar]` mais próximo. A alternativa — guardar as posições de todos os
// alvos no início — obrigava a recalculá-las a cada rotação do ecrã e a cada
// substituição que mudasse a grelha. Perguntar ao browser no instante certo é
// mais curto e nunca fica desactualizado.
//
// ## O limiar dos dez píxeis
//
// Sem ele, qualquer toque com um tremor de dedo virava um arrasto e o toque
// simples — que continua a ser a forma mais rápida de substituir — deixava de
// funcionar. Só depois de dez píxeis é que isto assume que a intenção era
// arrastar; abaixo disso não interfere e o clique segue o seu caminho.

import { useCallback, useRef, useState } from 'react';

const LIMIAR = 10;

/**
 * @param {(origem: object, destino: object) => void} aoLargar
 *   Chamado com os dados de quem foi arrastado e de onde caiu. Só dispara
 *   quando cai mesmo em cima de um alvo — largar no vazio não faz nada, de
 *   propósito: é como se desiste de um arrasto começado por engano.
 */
export default function useArrasto(aoLargar) {
  // `null` enquanto não há nada a acontecer. Passa a `{ origem, sobre }` quando
  // o dedo já andou o suficiente para isto ser um arrasto.
  const [arrasto, setArrasto] = useState(null);
  const inicio = useRef(null);

  const alvoEm = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest?.('[data-largar]');
    if (!el) return null;
    try {
      return JSON.parse(el.dataset.largar);
    } catch {
      return null;
    }
  };

  const chave = (d) => (d ? JSON.stringify(d) : null);

  const pegar = useCallback(
    (origem) => ({
      // `touch-action: none` vem do CSS da classe `.arrastavel`. Sem isso o
      // browser começa a deslizar a página ao primeiro movimento e cancela o
      // ponteiro antes de chegarmos ao limiar.
      className: 'arrastavel',
      onPointerDown: (e) => {
        // Só o botão principal do rato. O direito abre menus de contexto e o do
        // meio cola texto — nenhum dos dois é um arrasto.
        if (e.button != null && e.button !== 0) return;
        inicio.current = { x: e.clientX, y: e.clientY, origem, id: e.pointerId };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      },
      onPointerMove: (e) => {
        const i = inicio.current;
        if (!i || i.id !== e.pointerId) return;
        const longe =
          Math.abs(e.clientX - i.x) > LIMIAR || Math.abs(e.clientY - i.y) > LIMIAR;
        if (!longe && !arrasto) return;
        const sobre = alvoEm(e.clientX, e.clientY);
        setArrasto({ origem: i.origem, sobre });
      },
      onPointerUp: (e) => {
        const i = inicio.current;
        inicio.current = null;
        if (!i || i.id !== e.pointerId) return;
        if (!arrasto) return; // foi um toque; deixa o `onClick` fazer o seu
        const destino = alvoEm(e.clientX, e.clientY);
        setArrasto(null);
        if (destino) aoLargar(i.origem, destino);
      },
      // O ponteiro pode ser cancelado pelo sistema — uma chamada a entrar, o
      // teclado a abrir. Nesse caso não se larga nada: desiste-se em silêncio.
      onPointerCancel: () => {
        inicio.current = null;
        setArrasto(null);
      },
      // Depois de um arrasto o browser dispara na mesma o clique do elemento
      // onde o dedo levantou. Sem isto, largar um jogador em cima de outro fazia
      // a substituição **e** seleccionava o de destino a seguir.
      onClickCapture: (e) => {
        if (!arrasto) return;
        e.preventDefault();
        e.stopPropagation();
      },
    }),
    [arrasto, aoLargar]
  );

  /** Marca um elemento como sítio onde se pode largar. */
  const alvo = useCallback(
    (dados) => ({
      'data-largar': JSON.stringify(dados),
      // `is-alvo` acende só o que está debaixo do dedo; `is-largavel` acende
      // todos os possíveis, para se perceber para onde se pode ir. São classes
      // diferentes das do toque de propósito: as duas interações podem estar
      // meio a meio e não se devem confundir no ecrã.
      className: arrasto
        ? chave(dados) === chave(arrasto.sobre)
          ? 'is-alvo is-largavel'
          : 'is-largavel'
        : '',
    }),
    [arrasto]
  );

  return { pegar, alvo, arrastando: Boolean(arrasto), origem: arrasto?.origem || null };
}
