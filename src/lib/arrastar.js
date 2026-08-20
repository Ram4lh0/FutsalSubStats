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
//
// ## O cartão que anda atrás do dedo
//
// Sem ele, arrastar era um acto de fé: o cartão ficava onde estava, esmorecido,
// e a única pista era o contorno do alvo a acender por baixo do dedo. Com o
// dedo em cima do sítio, o contorno é precisamente o que não se vê.
//
// O que segue o dedo é um **clone** do cartão, posto no `body` e movido à mão
// pelo `transform`. É clone e não o próprio para o campo não abrir um buraco a
// meio do arrasto — a grelha manteria o lugar, mas o cartão original é o que
// diz de onde se partiu, e vale a pena continuar a vê-lo.
//
// Fora do React de propósito: com um `transform` por cada movimento do dedo,
// passar isto por estado obrigava a app inteira a recalcular dezenas de vezes
// por segundo, e num telemóvel a meio de um jogo isso nota-se.

import { useCallback, useEffect, useRef, useState } from 'react';

const LIMIAR = 10;

// A faixa junto ao topo e ao fundo onde o ecrã começa a andar sozinho, e a
// velocidade máxima, em píxeis por fotograma. Num ecrã curto a faixa encolhe:
// duas faixas de 96px num telemóvel deitado não deixavam meio ecrã parado.
const FAIXA = 96;
const VELOCIDADE = 16;

/**
 * O contentor que desliza à volta deste elemento.
 *
 * Não é a janela: nesta app quem desliza é a `.view`, e mandar deslizar a página
 * não fazia nada. Sobe até encontrar alguém com transbordo real — um elemento
 * com `overflow: auto` mas sem nada de fora não serve, e é o mesmo engano que já
 * apanhou o gesto nas tabelas.
 */
function contentorQueDesliza(el) {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const s = window.getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return document.scrollingElement || document.documentElement;
}

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
  // O clone que anda atrás do dedo, e a distância entre o dedo e o canto do
  // cartão no instante em que se lhe pegou — é o que faz o cartão ficar preso ao
  // ponto onde foi agarrado, em vez de saltar para debaixo do dedo.
  const fantasma = useRef(null);

  const criarFantasma = (el, x, y) => {
    if (!el || fantasma.current) return;
    const r = el.getBoundingClientRect();
    const c = el.cloneNode(true);
    // Um clone com `data-largar` seria um alvo a mais, e a andar com o dedo.
    c.removeAttribute('data-largar');
    c.querySelectorAll?.('[data-largar]').forEach((n) => n.removeAttribute('data-largar'));
    c.classList.add('fantasma');
    // Em linha, e não por classe: os cartões do campo estão posicionados por
    // `slot--*`, e uma regra de classe perdia para essas.
    Object.assign(c.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      right: 'auto',
      bottom: 'auto',
      margin: '0',
      width: `${r.width}px`,
      height: `${r.height}px`,
      pointerEvents: 'none',
      transform: `translate(${r.left}px, ${r.top}px)`,
    });
    document.body.appendChild(c);
    fantasma.current = { el: c, dx: x - r.left, dy: y - r.top };
  };

  const moverFantasma = (x, y) => {
    const f = fantasma.current;
    if (f) f.el.style.transform = `translate(${x - f.dx}px, ${y - f.dy}px)`;
  };

  const largarFantasma = () => {
    fantasma.current?.el.remove();
    fantasma.current = null;
  };

  /* ------------------------------------------------- deslizar pelas pontas */

  // No telemóvel o campo e o banco não cabem os dois no ecrã: quem pega num
  // suplente para o pôr em campo chega ao topo do ecrã antes de chegar ao
  // lugar. Com o dedo em baixo — ou em cima — o ecrã anda sozinho, devagar,
  // enquanto lá estiver.
  //
  // A velocidade cresce com a proximidade da ponta em vez de ser fixa: assim
  // encostar de raspão não faz o ecrã disparar, e quem quer mesmo andar muito
  // encosta mais.
  const deslize = useRef({ v: 0, caixa: null, raf: 0 });
  const ultimo = useRef(null);
  const sobreRef = useRef(null);

  const passo = () => {
    const d = deslize.current;
    if (!d.v || !d.caixa) {
      d.raf = 0;
      return;
    }
    const antes = d.caixa.scrollTop;
    d.caixa.scrollTop = antes + d.v;
    // O conteúdo andou por baixo de um dedo parado: o que está debaixo dele
    // agora é outro. Sem isto o contorno ficava a marcar o alvo de onde o ecrã
    // estava quando o dedo lá chegou.
    if (d.caixa.scrollTop !== antes && ultimo.current) {
      const sobre = alvoEm(ultimo.current.x, ultimo.current.y);
      if (chave(sobre) !== chave(sobreRef.current)) {
        sobreRef.current = sobre;
        setArrasto((a) => (a ? { ...a, sobre } : a));
      }
    }
    d.raf = requestAnimationFrame(passo);
  };

  const ajustarDeslize = (y) => {
    const d = deslize.current;
    const alt = window.innerHeight;
    const faixa = Math.min(FAIXA, alt / 5);
    let v = 0;
    if (y < faixa) v = -VELOCIDADE * (1 - y / faixa);
    else if (y > alt - faixa) v = VELOCIDADE * (1 - (alt - y) / faixa);
    d.v = Math.round(v);
    if (d.v && !d.raf) d.raf = requestAnimationFrame(passo);
  };

  const pararDeslize = () => {
    const d = deslize.current;
    if (d.raf) cancelAnimationFrame(d.raf);
    deslize.current = { v: 0, caixa: null, raf: 0 };
    ultimo.current = null;
    sobreRef.current = null;
  };

  // Se o ecrã mudar a meio de um arrasto — uma substituição que leve a outra
  // página, um jogo que termine — o clone ficaria no `body` para sempre, e o
  // ciclo de animação a correr para ninguém.
  useEffect(
    () => () => {
      largarFantasma();
      pararDeslize();
    },
    []
  );

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
        inicio.current = { x: e.clientX, y: e.clientY, origem, id: e.pointerId, el: e.currentTarget };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      },
      onPointerMove: (e) => {
        const i = inicio.current;
        if (!i || i.id !== e.pointerId) return;
        const longe =
          Math.abs(e.clientX - i.x) > LIMIAR || Math.abs(e.clientY - i.y) > LIMIAR;
        if (!longe && !arrasto) return;
        criarFantasma(i.el, i.x, i.y);
        moverFantasma(e.clientX, e.clientY);
        ultimo.current = { x: e.clientX, y: e.clientY };
        // Quem desliza é procurado no primeiro movimento e não antes: só aqui é
        // que se sabe que isto é mesmo um arrasto, e a página já está montada.
        if (!deslize.current.caixa) deslize.current.caixa = contentorQueDesliza(i.el);
        ajustarDeslize(e.clientY);
        const sobre = alvoEm(e.clientX, e.clientY);
        sobreRef.current = sobre;
        setArrasto({ origem: i.origem, sobre });
      },
      onPointerUp: (e) => {
        const i = inicio.current;
        inicio.current = null;
        largarFantasma();
        pararDeslize();
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
        largarFantasma();
        pararDeslize();
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
