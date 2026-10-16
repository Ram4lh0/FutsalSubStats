'use client';

// components/registos/BarraRegistos.jsx — entre o marcador e o campo: os
// contadores de foras e cantos por equipa (os que estiverem ligados), um
// resumo curto e o acesso às estatísticas do jogo.

import { REGISTO, resumoRegistos } from '@/domain/registos.js';
import { t } from '@/lib/i18n/index.js';

export default function BarraRegistos({ state, ligados, ourName, opponentName, on }) {
  const r = resumoRegistos(state);

  const linha = (registo, valores, fazer) => (
    <div className="regbar__grupo">
      <span className="regbar__rot">{t(`registos.total.${registo}`)}</span>
      <button type="button" className="regbar__btn" onClick={() => fazer('US')}>
        <span className="regbar__eq">{ourName}</span>
        <strong>{valores.US}</strong>
        <span className="regbar__mais">+</span>
      </button>
      <button type="button" className="regbar__btn regbar__btn--deles" onClick={() => fazer('THEM')}>
        <span className="regbar__eq">{opponentName}</span>
        <strong>{valores.THEM}</strong>
        <span className="regbar__mais">+</span>
      </button>
    </div>
  );

  const curto = [
    [REGISTO.REMATE, r.remates],
    [REGISTO.RECUPERACAO, r.recuperacoes],
    [REGISTO.DEFESA_GR, r.defesas],
  ]
    .filter(([id]) => ligados.has(id))
    .map(([id, n]) => t(`registos.curto.${id}`, { n }))
    .join(' · ');

  return (
    <section className="regbar" aria-label={t('registos.titulo')}>
      {ligados.has(REGISTO.FORA) ? linha(REGISTO.FORA, r.foras, on.registarFora) : null}
      {ligados.has(REGISTO.CANTO) ? linha(REGISTO.CANTO, r.cantos, on.registarCanto) : null}
      {curto ? <span className="regbar__resumo">{curto}</span> : null}
      <button type="button" className="btn btn--ghost regbar__ver" onClick={on.verRegistos}>
        {t('registos.verEstatisticas')}
      </button>
    </section>
  );
}
