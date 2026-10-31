'use client';

// components/registos/BarraRegistos.jsx — entre o marcador e o campo: os
// contadores dos registos de equipa, numa grelha como um mini-marcador. Uma
// linha para nós e outra para eles, uma coluna por registo ligado (remates,
// penáltis, passes falhados, cantos, foras, lançamentos de baliza).
//
// Cada célula é um contador "− n +": o "+" regista (com as perguntas que o
// escalão pedir), o "−" tira o último registo desse tipo, para um engano (ver
// `tirarUltimo`). Uma célula só com o número é informação que se regista
// noutro sítio (os nossos remates, nos cartões dos jogadores).
//
// No telemóvel a grelha vira-se: uma linha por registo e as colunas nós e
// eles, para caber sem deslizar. São as mesmas células, desenhadas duas vezes
// e escolhidas pelo CSS.
//
// Por baixo, um resumo curto do que se regista nos cartões e o acesso às
// estatísticas do jogo.

import { Fragment } from 'react';
import { REGISTO, resumoRegistos } from '@/domain/registos.js';
import { t } from '@/lib/i18n/index.js';

export default function BarraRegistos({ state, ligados, ourName, opponentName, on }) {
  const r = resumoRegistos(state);
  const passeNaBarra = ligados.has(REGISTO.PASSE_FALHADO) && ligados.opcoes?.passe_falhado?.barra;

  // Cada coluna: o rótulo e, para cada equipa, o valor e o que fazem os
  // botões (`registo` é o que o "−" tira). `null` deixa a célula vazia.
  const contador = (registo, valor, mais, equipa = null) => ({ registo, valor, mais, equipa });
  const colunas = [
    (ligados.has(REGISTO.REMATE) || ligados.has(REGISTO.REMATE_ADV)) && {
      id: 'remates',
      US: ligados.has(REGISTO.REMATE) ? { valor: r.remates } : null,
      THEM: ligados.has(REGISTO.REMATE_ADV)
        ? contador(REGISTO.REMATE_ADV, r.rematesAdv, on.registarRemateAdv)
        : null,
    },
    (ligados.has(REGISTO.PENALTI) || ligados.has(REGISTO.PENALTI_ADV)) && {
      id: 'penaltis',
      US: ligados.has(REGISTO.PENALTI) ? contador(REGISTO.PENALTI, r.penaltis.total, on.registarPenalti) : null,
      THEM: ligados.has(REGISTO.PENALTI_ADV)
        ? contador(REGISTO.PENALTI_ADV, r.penaltisAdv.total, on.registarPenaltiAdv)
        : null,
    },
    passeNaBarra && {
      id: 'passes',
      US: contador(REGISTO.PASSE_FALHADO, r.passes, on.registarPasseBarra),
      THEM: null,
    },
    ...[
      [REGISTO.CANTO, 'cantos', r.cantos, on.registarCanto],
      [REGISTO.FORA, 'foras', r.foras, on.registarFora],
      [REGISTO.LANCAMENTO_BALIZA, 'lancamentos', r.lancamentos, on.registarLancamento],
    ].map(
      ([registo, id, valores, fazer]) =>
        ligados.has(registo) && {
          id,
          US: contador(registo, valores.US, () => fazer('US'), 'US'),
          THEM: contador(registo, valores.THEM, () => fazer('THEM'), 'THEM'),
        }
    ),
  ].filter(Boolean);

  // O que se regista nos cartões dos jogadores, em texto curto.
  const curto = [
    [REGISTO.RECUPERACAO, r.recuperacoes],
    [REGISTO.DEFESA_GR, r.defesas],
    [REGISTO.PERDA_BOLA, r.perdas],
    ...(passeNaBarra ? [] : [[REGISTO.PASSE_FALHADO, r.passes]]),
  ]
    .filter(([id]) => ligados.has(id))
    .map(([id, n]) => t(`registos.curto.${id}`, { n }))
    .join(' · ');

  const celula = (c, nome) => {
    if (!c) return <span className="regbar__vazio" />;
    if (!c.mais) return <span className="regbar__so">{c.valor}</span>;
    const quem = { registo: t(`registos.nome.${c.registo}`), equipa: nome };
    return (
      <span className="regbar__passo">
        <button
          type="button"
          className="regbar__menos"
          disabled={!c.valor}
          aria-label={t('registos.tirarUm', quem)}
          title={t('registos.tirarUm', quem)}
          onClick={() => on.tirarUltimo(c.registo, c.equipa)}
        >
          −
        </button>
        <strong className="regbar__n">{c.valor}</strong>
        <button
          type="button"
          className="regbar__mais"
          aria-label={t('registos.somarUm', quem)}
          title={t('registos.somarUm', quem)}
          onClick={c.mais}
        >
          +
        </button>
      </span>
    );
  };

  return (
    <section className="regbar" aria-label={t('registos.titulo')}>
      {colunas.length ? (
        <div className="regbar__lista">
          <span />
          <span className="regbar__eq">{ourName}</span>
          <span className="regbar__eq regbar__eq--deles">{opponentName}</span>
          {colunas.map((c) => (
            <Fragment key={c.id}>
              <span className="regbar__rot regbar__rot--linha">{t(`registos.barra.${c.id}`)}</span>
              <span className="regbar__cel">{celula(c.US, ourName)}</span>
              <span className="regbar__cel regbar__cel--deles">{celula(c.THEM, opponentName)}</span>
            </Fragment>
          ))}
        </div>
      ) : null}
      {colunas.length ? (
        <div className="regbar__grelha" style={{ '--colunas': colunas.length }}>
          <span />
          {colunas.map((c) => (
            <span key={c.id} className="regbar__rot">
              {t(`registos.barra.${c.id}`)}
            </span>
          ))}
          <span className="regbar__eq">{ourName}</span>
          {colunas.map((c) => (
            <span key={c.id} className="regbar__cel">
              {celula(c.US, ourName)}
            </span>
          ))}
          <span className="regbar__eq regbar__eq--deles">{opponentName}</span>
          {colunas.map((c) => (
            <span key={c.id} className="regbar__cel regbar__cel--deles">
              {celula(c.THEM, opponentName)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="regbar__fundo">
        {curto ? <span className="regbar__resumo">{curto}</span> : null}
        <button type="button" className="btn btn--ghost regbar__ver" onClick={on.verRegistos}>
          {t('registos.verEstatisticas')}
        </button>
      </div>
    </section>
  );
}

