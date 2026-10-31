'use client';

// components/registos/BarraRegistos.jsx — entre o marcador e o campo: os
// remates e penáltis do adversário, os nossos penáltis, os passes falhados
// (se o escalão os quiser aqui), os contadores de foras, cantos e
// lançamentos de baliza por equipa (os que estiverem ligados), um resumo
// curto e o acesso às estatísticas do jogo.

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

  // Um botão só de uma equipa (nós a verde, eles a vermelho).
  const um = (registo, equipa, nome, valor, fazer) => (
    <div className="regbar__grupo">
      <span className="regbar__rot">{t(`registos.total.${registo}`)}</span>
      <button
        type="button"
        className={`regbar__btn ${equipa === 'THEM' ? 'regbar__btn--deles' : ''}`}
        onClick={fazer}
      >
        <span className="regbar__eq">{nome}</span>
        <strong>{valor}</strong>
        <span className="regbar__mais">+</span>
      </button>
    </div>
  );
  const passeNaBarra = ligados.has(REGISTO.PASSE_FALHADO) && ligados.opcoes?.passe_falhado?.barra;

  const curto = [
    [REGISTO.REMATE, r.remates],
    [REGISTO.RECUPERACAO, r.recuperacoes],
    [REGISTO.DEFESA_GR, r.defesas],
    [REGISTO.PERDA_BOLA, r.perdas],
    // Com o botão na barra, o número já lá está.
    ...(passeNaBarra ? [] : [[REGISTO.PASSE_FALHADO, r.passes]]),
  ]
    .filter(([id]) => ligados.has(id))
    .map(([id, n]) => t(`registos.curto.${id}`, { n }))
    .join(' · ');

  return (
    <section className="regbar" aria-label={t('registos.titulo')}>
      {ligados.has(REGISTO.REMATE_ADV) ? (
        <div className="regbar__grupo">
          <span className="regbar__rot">{t('registos.total.remate_adv')}</span>
          <button type="button" className="regbar__btn regbar__btn--deles" onClick={on.registarRemateAdv}>
            <span className="regbar__eq">{opponentName}</span>
            <strong>{r.rematesAdv}</strong>
            <span className="regbar__mais">+</span>
          </button>
        </div>
      ) : null}
      {ligados.has(REGISTO.PENALTI)
        ? um(REGISTO.PENALTI, 'US', ourName, r.penaltis.total, on.registarPenalti)
        : null}
      {ligados.has(REGISTO.PENALTI_ADV)
        ? um(REGISTO.PENALTI_ADV, 'THEM', opponentName, r.penaltisAdv.total, on.registarPenaltiAdv)
        : null}
      {passeNaBarra ? um(REGISTO.PASSE_FALHADO, 'US', ourName, r.passes, on.registarPasseBarra) : null}
      {ligados.has(REGISTO.FORA) ? linha(REGISTO.FORA, r.foras, on.registarFora) : null}
      {ligados.has(REGISTO.CANTO) ? linha(REGISTO.CANTO, r.cantos, on.registarCanto) : null}
      {ligados.has(REGISTO.LANCAMENTO_BALIZA)
        ? linha(REGISTO.LANCAMENTO_BALIZA, r.lancamentos, on.registarLancamento)
        : null}
      {curto ? <span className="regbar__resumo">{curto}</span> : null}
      <button type="button" className="btn btn--ghost regbar__ver" onClick={on.verRegistos}>
        {t('registos.verEstatisticas')}
      </button>
    </section>
  );
}
