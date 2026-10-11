'use client';

// components/treino/LegendaPresencas.jsx — o que quer dizer P, FI, FJ e L.
//
// As abreviaturas poupam espaço nos botões e na tabela, mas sozinhas
// confundem (FI e FJ diferem numa letra). Esta legenda fica sempre à vista
// onde elas aparecem, com a mesma cor do botão de cada estado.

import { ESTADOS_PRESENCA } from '@/domain/treino.js';
import { useT } from '@/lib/i18n/index.js';

export default function LegendaPresencas() {
  const t = useT();
  return (
    <ul className="tlegenda" aria-label={t('treino.legenda')}>
      {ESTADOS_PRESENCA.map((e) => (
        <li key={e}>
          <span className={`tpbtn tpbtn--${e} is-on tlegenda__abrev`}>{t(`treino.curto.${e}`)}</span>
          {t(`treino.presenca.${e}`)}
        </li>
      ))}
    </ul>
  );
}
