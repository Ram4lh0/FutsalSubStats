'use client';

// components/video/CamadaVideo.jsx — a camada por cima da imagem do vídeo.
//
// É a preparação para os desenhos (setas, círculos, zonas): uma caixa
// transparente colada à área REAL da imagem, e não à caixa do leitor. Quando
// as proporções não coincidem há barras pretas, e um desenho tem de ficar
// agarrado ao campo, não à barra — em qualquer tamanho de ecrã, na análise e
// no modo Apresentar (os dois usam o `LeitorVideo`, que monta esta camada).
//
// O que oferece a quem um dia desenhar:
//
//   · `area` — onde está a imagem dentro do leitor, em píxeis;
//   · `ponto(clientX, clientY)` — um toque no ecrã em fração da imagem (0–1),
//     com `dentro` a dizer se caiu na imagem ou numa barra;
//   · `tempoMs()` — o instante do vídeo, para o desenho saber a que momento
//     pertence.
//
// Hoje não desenha nada e não apanha toques (`pointer-events: none`): os
// controlos do vídeo continuam a funcionar por baixo. O editor de desenhos
// não faz parte desta entrega.

import { useEffect, useMemo, useState } from 'react';
import { PROPORCAO_OMISSAO, areaDaImagem, pontoNaImagem } from '@/domain/analiseVideo.js';

/**
 * Onde fica a imagem dentro de `caixaRef`, acompanhando redimensionamentos
 * (janela, ecrã cheio, rodar o telemóvel).
 *
 * @param {{current: HTMLElement|null}} caixaRef a caixa do leitor
 * @param {number} proporcao largura / altura do vídeo
 */
export function useAreaDaImagem(caixaRef, proporcao = PROPORCAO_OMISSAO) {
  const [caixa, setCaixa] = useState({ largura: 0, altura: 0 });

  useEffect(() => {
    const el = caixaRef.current;
    if (!el) return undefined;
    const medir = () => {
      // `clientWidth` e não `getBoundingClientRect`: é a área de dentro do
      // rebordo, que é onde o vídeo e a camada se posicionam.
      const largura = el.clientWidth;
      const altura = el.clientHeight;
      setCaixa((atual) => (atual.largura === largura && atual.altura === altura ? atual : { largura, altura }));
    };
    medir();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir);
      return () => window.removeEventListener('resize', medir);
    }
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [caixaRef]);

  return useMemo(() => areaDaImagem(caixa, proporcao), [caixa, proporcao]);
}

/**
 * @param {{caixaRef: object, proporcao?: number, tempoMs?: () => number,
 *   children?: (ctx: {area: object, ponto: Function, tempoMs: Function}) => any}} props
 */
export default function CamadaVideo({ caixaRef, proporcao = PROPORCAO_OMISSAO, tempoMs, children }) {
  const area = useAreaDaImagem(caixaRef, proporcao);
  if (!area.largura || !area.altura) return null;

  /** Um ponto do ecrã (`clientX`, `clientY`) em fração da imagem. */
  const ponto = (clientX, clientY) => {
    const el = caixaRef.current;
    if (!el) return { x: 0, y: 0, dentro: false };
    const r = el.getBoundingClientRect();
    return pontoNaImagem(area, clientX - r.left - el.clientLeft, clientY - r.top - el.clientTop);
  };

  return (
    <div
      className="vleitor__camada"
      aria-hidden="true"
      data-proporcao={proporcao.toFixed(4)}
      style={{ left: area.x, top: area.y, width: area.largura, height: area.altura }}
    >
      {typeof children === 'function' ? children({ area, ponto, tempoMs: tempoMs || (() => 0) }) : null}
    </div>
  );
}
