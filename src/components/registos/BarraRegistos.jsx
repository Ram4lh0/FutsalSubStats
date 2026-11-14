'use client';

// components/registos/BarraRegistos.jsx — entre o marcador e o campo: os
// contadores dos registos de equipa, numa grelha como um mini-marcador. Uma
// linha para nós e outra para eles, uma coluna por registo ligado (remates,
// penáltis, passes falhados, cantos, foras, lançamentos de baliza).
//
// Cada célula é um contador "− n +": o "+" regista (com as perguntas que o
// escalão pedir), o "−" tira o último registo desse tipo, para um engano (ver
// `tirarUltimo`). Os nossos remates também se somam aqui: o "+" pergunta
// primeiro quem rematou, dos que estão em campo.
//
// No telemóvel a grelha vira-se: uma linha por registo e as colunas nós e
// eles, para caber sem deslizar. São as mesmas células, desenhadas duas vezes
// e escolhidas pelo CSS.
//
// No canto de cima ficam o acesso às estatísticas do jogo e o botão de a
// esconder. Escondida, a barra é uma linha fina (com o resumo do que se
// regista nos cartões); o aparelho lembra-se da escolha.

import { Fragment, useState } from 'react';
import { REGISTO, resumoRegistos } from '@/domain/registos.js';
import { t } from '@/lib/i18n/index.js';

const CHAVE_ESCONDIDA = 'futsal.regbar.escondida';

function lerEscondida() {
  try {
    return window.localStorage.getItem(CHAVE_ESCONDIDA) === '1';
  } catch {
    return false;
  }
}

/**
 * Os contadores de equipa ligados: uma coluna por registo, com a célula de
 * cada equipa (`null` deixa a célula vazia). Também a usa o ecrã do jogo,
 * para saber se cabe tudo nos cards dos cartões (ver `registoUnicoPorEquipa`).
 */
export function colunasRegistos(state, ligados, on) {
  const r = resumoRegistos(state);
  const passeNaBarra = ligados.has(REGISTO.PASSE_FALHADO) && ligados.opcoes?.passe_falhado?.barra;

  // Cada coluna: o rótulo e, para cada equipa, o valor e o que fazem os
  // botões (`registo` é o que o "−" tira). `null` deixa a célula vazia.
  const contador = (registo, valor, mais, equipa = null) => ({ registo, valor, mais, equipa });
  const colunas = [
    (ligados.has(REGISTO.REMATE) || ligados.has(REGISTO.REMATE_ADV)) && {
      id: 'remates',
      US: ligados.has(REGISTO.REMATE)
        ? contador(REGISTO.REMATE, r.remates, on.registarRemateBarra)
        : null,
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
  return { colunas, r, passeNaBarra };

}

/**
 * Com no máximo um contador de cada lado (p. ex. os nossos remates e os
 * remates deles), a barra é um painel inteiro para dois números: esses
 * contadores passam para debaixo dos cartões de cada equipa, no marcador.
 * Devolve `{ US, THEM }` (cada um `{ id, c }` ou `null`), ou `null` quando
 * não é o caso.
 */
export function registoUnicoPorEquipa(colunas) {
  if (!colunas.length) return null;
  const lado = (equipa) => colunas.filter((col) => col[equipa]).map((col) => ({ id: col.id, c: col[equipa] }));
  const nos = lado('US');
  const eles = lado('THEM');
  if (nos.length > 1 || eles.length > 1) return null;
  return { US: nos[0] || null, THEM: eles[0] || null };
}

/** Uma célula "− n +" (ou só o número, se não se soma por aqui). */
export function CelulaRegisto({ c, nome, on, classe = 'regbar' }) {
  if (!c) return <span className={`${classe}__vazio`} />;
  if (!c.mais) return <span className={`${classe}__so`}>{c.valor}</span>;
  const quem = { registo: t(`registos.nome.${c.registo}`), equipa: nome };
  return (
    <span className={`${classe}__passo`}>
      <button
        type="button"
        className={`${classe}__menos`}
        disabled={!c.valor}
        aria-label={t('registos.tirarUm', quem)}
        title={t('registos.tirarUm', quem)}
        onClick={() => on.tirarUltimo(c.registo, c.equipa)}
      >
        −
      </button>
      <strong className={`${classe}__n`}>{c.valor}</strong>
      <button
        type="button"
        className={`${classe}__mais`}
        aria-label={t('registos.somarUm', quem)}
        title={t('registos.somarUm', quem)}
        onClick={c.mais}
      >
        +
      </button>
    </span>
  );
}

/**
 * O contador único de uma equipa, como linha dentro do card dos cartões
 * (`TeamCards` / `RivalOut`): o nome do registo e o "− n +".
 */
export function RegistoNoCard({ unico, nome, on }) {
  if (!unico) return null;
  return (
    <span className="rivalout__registo">
      <span className="rivalout__registo-rot">{t(`registos.barra.${unico.id}`)}</span>
      <CelulaRegisto c={unico.c} nome={nome} on={on} classe="rivalout__reg" />
    </span>
  );
}

export default function BarraRegistos({ state, ligados, ourName, opponentName, on, compacta = false, semNomes = false }) {
  const { colunas, r, passeNaBarra } = colunasRegistos(state, ligados, on);
  const [escondida, setEscondida] = useState(lerEscondida);
  const mudar = (valor) => {
    setEscondida(valor);
    try {
      window.localStorage.setItem(CHAVE_ESCONDIDA, valor ? '1' : '0');
    } catch {
      // Sem armazenamento (janela privada): fica só até sair do ecrã.
    }
  };
  // O que se regista nos cartões dos jogadores, em texto curto.
  const curto = [
    [REGISTO.RECUPERACAO, r.recuperacoes],
    [REGISTO.DEFESA_GR, r.defesas],
    [REGISTO.LANCAMENTO_GR, r.lancamentosGR],
    [REGISTO.PERDA_BOLA, r.perdas],
    ...(passeNaBarra ? [] : [[REGISTO.PASSE_FALHADO, r.passes]]),
  ]
    .filter(([id]) => ligados.has(id))
    .map(([id, n]) => t(`registos.curto.${id}`, { n }))
    .join(' · ');

  // Sem nenhum registo do adversário ligado, a barra é só nossa: não há linha deles.
  const haEles = colunas.some((c) => c.THEM);
  const celula = (c, nome) => <CelulaRegisto c={c} nome={nome} on={on} />;

  const verEstatisticas = (
    <button type="button" className="regbar__acao" onClick={on.verRegistos} title={curto || undefined}>
      {t('registos.estatisticas')}
    </button>
  );
  const esconder = (
    <button
      type="button"
      className="regbar__acao regbar__acao--icone"
      onClick={() => mudar(true)}
      aria-label={t('registos.esconderBarra')}
      title={t('registos.esconderBarra')}
    >
      ˄
    </button>
  );
  const topo = (
    <span className="regbar__topo">
      {esconder}
      {verEstatisticas}
    </span>
  );

  // Escondida, sem contadores de equipa, ou com os contadores nos cards dos
  // cartões (`compacta`): só uma linha fina.
  if (escondida || compacta || !colunas.length) {
    return (
      <section className={`regbar regbar--fina ${compacta ? 'regbar--compacta' : ''}`} aria-label={t('registos.titulo')}>
        {colunas.length && !compacta ? (
          <button
            type="button"
            className="regbar__acao"
            onClick={() => mudar(false)}
            aria-label={t('registos.mostrarBarra')}
          >
            {t('registos.barraFechada')} ˅
          </button>
        ) : null}
        {curto ? <span className="regbar__resumo">{curto}</span> : null}
        {verEstatisticas}
      </section>
    );
  }

  return (
    <section className={`regbar ${haEles ? '' : 'regbar--so-nos'}`} aria-label={t('registos.titulo')}>
      {colunas.length ? (
        <div className="regbar__lista">
          {topo}
          <span className="regbar__eq">{semNomes ? null : ourName}</span>
          {haEles ? <span className="regbar__eq regbar__eq--deles">{semNomes ? null : opponentName}</span> : null}
          {colunas.map((c) => (
            <Fragment key={c.id}>
              <span className="regbar__rot regbar__rot--linha">{t(`registos.barra.${c.id}`)}</span>
              <span className="regbar__cel">{celula(c.US, ourName)}</span>
              {haEles ? <span className="regbar__cel regbar__cel--deles">{celula(c.THEM, opponentName)}</span> : null}
            </Fragment>
          ))}
        </div>
      ) : null}
      {colunas.length ? (
        <div className="regbar__grelha" style={{ '--colunas': colunas.length }}>
          {topo}
          {colunas.map((c) => (
            <span key={c.id} className="regbar__rot">
              {t(`registos.barra.${c.id}`)}
            </span>
          ))}
          <span className="regbar__eq">{semNomes ? null : ourName}</span>
          {colunas.map((c) => (
            <span key={c.id} className="regbar__cel">
              {celula(c.US, ourName)}
            </span>
          ))}
          {haEles ? <span className="regbar__eq regbar__eq--deles">{semNomes ? null : opponentName}</span> : null}
          {haEles
            ? colunas.map((c) => (
                <span key={c.id} className="regbar__cel regbar__cel--deles">
                  {celula(c.THEM, opponentName)}
                </span>
              ))
            : null}
        </div>
      ) : null}
    </section>
  );
}

