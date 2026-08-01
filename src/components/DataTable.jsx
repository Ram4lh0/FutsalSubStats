'use client';

// components/DataTable.jsx — tabela com colunas fixas e deslize travado a um eixo.
//
// Duas regras que vieram da utilização real no pavilhão:
//
// 1. O número e o nome ficam colados à esquerda. Percorrer quinze colunas de
//    estatísticas sem saber de quem é a linha não serve para nada.
// 2. O primeiro movimento do dedo decide o eixo e o outro fica travado. Com o
//    deslize nativo, um arrasto para o lado traz sempre vertical atrás e as
//    linhas fogem debaixo do dedo.

import { useEffect, useRef } from 'react';

export default function DataTable({ children, players = false, tight = false, className = '' }) {
  const wrap = useRef(null);
  const table = useRef(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;

    let x0 = 0, y0 = 0, left0 = 0, top0 = 0, eixo = null, ativo = false;

    const inicio = (e) => {
      if (e.touches.length !== 1) return void (ativo = false);
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY;
      left0 = el.scrollLeft; top0 = el.scrollTop;
      eixo = null; ativo = true;
    };

    const mover = (e) => {
      if (!ativo || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      if (!eixo) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return; // ainda não dá para saber
        eixo = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (eixo === 'x') {
        const max = el.scrollWidth - el.clientWidth;
        if (max <= 0) return;
        el.scrollLeft = Math.max(0, Math.min(max, left0 - dx));
        e.preventDefault();
        return;
      }
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return; // tabela curta: deixa a página deslizar
      const seguinte = top0 - dy;
      if (seguinte < 0 || seguinte > max) return; // chegou ao fim: entrega o gesto
      el.scrollTop = seguinte;
      e.preventDefault();
    };

    const fim = () => {
      ativo = false;
      eixo = null;
    };

    const roda = (e) => {
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (horizontal) {
        const max = el.scrollWidth - el.clientWidth;
        if (max <= 0) return;
        el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + e.deltaX));
        e.preventDefault();
      } else {
        const max = el.scrollHeight - el.clientHeight;
        if (max <= 0) return;
        const seguinte = el.scrollTop + e.deltaY;
        if (seguinte < 0 || seguinte > max) return;
        el.scrollTop = seguinte;
        e.preventDefault();
      }
    };

    el.addEventListener('touchstart', inicio, { passive: true });
    el.addEventListener('touchmove', mover, { passive: false });
    el.addEventListener('touchend', fim, { passive: true });
    el.addEventListener('touchcancel', fim, { passive: true });
    el.addEventListener('wheel', roda, { passive: false });
    return () => {
      el.removeEventListener('touchstart', inicio);
      el.removeEventListener('touchmove', mover);
      el.removeEventListener('touchend', fim);
      el.removeEventListener('touchcancel', fim);
      el.removeEventListener('wheel', roda);
    };
  }, []);

  // A coluna do nome cola-se a seguir à do número, e para isso precisa de saber
  // a largura real da primeira — que só existe depois de a tabela estar no ecrã.
  useEffect(() => {
    if (!players || !table.current) return;
    const id = requestAnimationFrame(() => {
      const cel = table.current?.querySelector('thead th');
      if (cel?.offsetWidth) table.current.style.setProperty('--col1', `${cel.offsetWidth}px`);
    });
    return () => cancelAnimationFrame(id);
  });

  return (
    <div className={`tablewrap ${className}`} ref={wrap}>
      <table
        ref={table}
        className={`table ${players ? 'table--who' : ''} ${tight ? 'table--tight' : ''}`}
      >
        {children}
      </table>
    </div>
  );
}
