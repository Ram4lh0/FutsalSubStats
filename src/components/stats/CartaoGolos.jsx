'use client';

// components/stats/CartaoGolos.jsx — marcados, sofridos e diferença, juntos.
//
// Eram três cartões lado a lado, cada um com um número grande ao centro. Ocupavam
// a largura de meia grelha para dizer três números que só querem dizer alguma
// coisa uns em relação aos outros: 24 golos marcados não é bom nem mau até se
// saber quantos se sofreu.
//
// Juntos num cartão, a leitura é imediata e sobra espaço para o resto.
//
// A diferença é a única das três com cor, e sempre: é o único destes números que
// tem lado bom e lado mau — os outros são contagens, e uma contagem não é boa nem
// má sozinha.

import { useT } from '@/lib/i18n/index.js';

/**
 * A lista dos três, sem moldura.
 *
 * Exportada à parte porque o painel de gráficos usa-a dentro do cartão de
 * casa/fora, ao lado do V/E/D. Ali a moldura já existe.
 */
export function ListaGolos({ marcados, sofridos }) {
  const t = useT();
  const dif = marcados - sofridos;
  return (
    <dl className="ladocard__golos">
      <div>
        <dt>{t('painelv.marcados')}</dt>
        <dd>{marcados}</dd>
      </div>
      <div>
        <dt>{t('painelv.sofridos')}</dt>
        <dd>{sofridos}</dd>
      </div>
      <div>
        <dt>{t('painelv.difCurta')}</dt>
        <dd className={dif > 0 ? 'is-v' : dif < 0 ? 'is-d' : ''}>
          {dif > 0 ? `+${dif}` : dif}
        </dd>
      </div>
    </dl>
  );
}

/** O cartão completo, para as grelhas de estatísticas. */
export default function CartaoGolos({ marcados, sofridos }) {
  const t = useT();
  return (
    <div className="stat golcard">
      <span className="stat__label">{t('stats.golos')}</span>
      <ListaGolos marcados={marcados} sofridos={sofridos} />
    </div>
  );
}
