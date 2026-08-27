'use client';

// components/PageHead.jsx — cabeçalho comum a todas as páginas.
//
// Com o jogo terminado não há "atrás" que faça sentido: a saída natural é
// voltar à lista de clubes, e a casinha diz isso sem precisar de texto.

import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/index.js';
import { setGuidedTutorialStepById } from '@/lib/tutorial.js';

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

// O `onBack` existe para os ecrãs onde sair pode perder trabalho — o dos
// acessos é o primeiro — e que precisam de perguntar antes de deixar ir. Sem
// ele, o botão faz o que sempre fez.
export default function PageHead({ title, subtitle, backTo, onBack, homeTo, actions }) {
  const router = useRouter();
  const t = useT();
  return (
    <header className="page__head">
      <div className="page__headmain">
        {homeTo ? (
          <button
            className="btn btn--ghost btn--icon btn--home"
            data-tour="summary-home"
            onClick={() => {
              setGuidedTutorialStepById('openTeam');
              router.push(homeTo);
            }}
            title={t('comum.osMeusClubes')}
            aria-label={t('comum.osMeusClubes')}
          >
            {HOME_ICON}
          </button>
        ) : backTo || onBack ? (
          <button
            className="btn btn--ghost btn--icon"
            onClick={onBack || (() => router.push(backTo))}
          >
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
