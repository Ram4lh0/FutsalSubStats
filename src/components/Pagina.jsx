'use client';

// components/Pagina.jsx — o que envolve todas as páginas com ids.
//
// Junta duas coisas que andavam separadas:
//
// 1. O `Guard`, que exige conta iniciada quando há servidor configurado.
// 2. Uma fronteira `<Suspense>`, que o Next obriga a ter à volta de tudo o que
//    leia a barra de endereço. E como os ids do clube, do escalão e do jogo
//    passaram a viajar por lá, isso é toda a gente.
//
// A regra que daqui sai: quem chamar `useRouteParams` tem de estar DENTRO de um
// `<Pagina>`, nunca no componente que o desenha. Na prática, a página fica com
// duas funções — a de fora só monta a moldura, a de dentro é que faz o trabalho.

import { Suspense } from 'react';
import Guard from './Guard.jsx';

export default function Pagina({ children }) {
  return (
    <Guard>
      <Suspense fallback={<p className="muted">A carregar…</p>}>{children}</Suspense>
    </Guard>
  );
}
