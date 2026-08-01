'use client';

// components/PageHead.jsx — cabeçalho comum a todas as páginas.
//
// Com o jogo terminado não há "atrás" que faça sentido: a saída natural é
// voltar à lista de clubes, e a casinha diz isso sem precisar de texto.

import { useRouter } from 'next/navigation';

const HOME_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 11.2 12 4l9 7.2" />
    <path d="M5.4 9.6V20h13.2V9.6" />
    <path d="M10 20v-5.4h4V20" />
  </svg>
);

export default function PageHead({ title, subtitle, backTo, homeTo, actions }) {
  const router = useRouter();
  return (
    <header className="page__head">
      <div className="page__headmain">
        {homeTo ? (
          <button
            className="btn btn--ghost btn--icon btn--home"
            onClick={() => router.push(homeTo)}
            title="Os meus clubes"
            aria-label="Os meus clubes"
          >
            {HOME_ICON}
          </button>
        ) : backTo ? (
          <button className="btn btn--ghost btn--icon" onClick={() => router.push(backTo)}>
            ‹
          </button>
        ) : null}
        <div>
          <h1 className="page__title">{title}</h1>
          {subtitle ? <p className="page__sub">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="page__actions">{actions}</div> : null}
    </header>
  );
}
