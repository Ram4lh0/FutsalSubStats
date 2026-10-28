'use client';

// components/DemoHistoria.jsx — a história curta à entrada do intervalo da
// demonstração.
//
// A demo começa no intervalo, com a 1.ª parte já jogada. Sem contexto, quem
// chega ali vê um ecrã cheio de números e não sabe porquê. Três frases curtas,
// um toque cada, dizem quem é (quem ajuda o treinador com os tempos), onde está
// (no balneário) e o que vem a seguir (a 2.ª parte e o resumo). Há sempre um
// "Saltar": a história é para orientar, não para prender.
//
// Aparece uma vez por sessão (sessionStorage): quem repete a demo já a leu.

import { useState } from 'react';
import { useT } from '@/lib/i18n/index.js';

const CHAVE = 'futsal-demo-historia';
const PASSOS = ['demo.historia.1', 'demo.historia.2', 'demo.historia.3'];

export function historiaJaVista() {
  try {
    return globalThis.sessionStorage?.getItem(CHAVE) === '1';
  } catch {
    return true;
  }
}

function marcarVista() {
  try {
    globalThis.sessionStorage?.setItem(CHAVE, '1');
  } catch {
    /* sem storage: volta a aparecer, não faz mal nenhum */
  }
}

export default function DemoHistoria({ onFim }) {
  const t = useT();
  const [passo, setPasso] = useState(0);
  const ultimo = passo === PASSOS.length - 1;

  const fechar = () => {
    marcarVista();
    onFim();
  };

  return (
    <div className="demo-historia" role="dialog" aria-modal="true" aria-label={t('demo.historia.titulo')}>
      <div className="demo-historia__cartao">
        <p className="demo-historia__texto">{t(PASSOS[passo])}</p>
        <div className="demo-historia__pontos" aria-hidden="true">
          {PASSOS.map((p, i) => (
            <span key={p} className={i === passo ? 'is-on' : ''} />
          ))}
        </div>
        <div className="demo-historia__acoes">
          {ultimo ? null : (
            <button type="button" className="btn btn--ghost" onClick={fechar}>
              {t('demo.historia.saltar')}
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary btn--big"
            onClick={() => (ultimo ? fechar() : setPasso(passo + 1))}
            autoFocus
          >
            {ultimo ? t('demo.historia.comecar') : t('demo.historia.seguinte')}
          </button>
        </div>
      </div>
    </div>
  );
}
