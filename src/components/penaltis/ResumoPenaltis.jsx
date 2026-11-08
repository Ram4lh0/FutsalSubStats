'use client';

// components/penaltis/ResumoPenaltis.jsx — os penáltis do desempate no resumo
// do jogo: o marcador, onde rematámos, onde rematou o adversário (e para onde
// se atirou o nosso guarda-redes) e a lista, penálti a penálti.

import Baliza from '@/components/penaltis/Baliza.jsx';
import { resumoPenaltis, RESULTADO_PENALTI } from '@/domain/prolongamento.js';
import { useT } from '@/lib/i18n/index.js';

const tipoDe = (k) =>
  k.resultado === RESULTADO_PENALTI.GOLO ? 'golo' : k.resultado === RESULTADO_PENALTI.DEFENDIDO ? 'defendido' : 'fora';

export default function ResumoPenaltis({ state, ourName, opponentName }) {
  const t = useT();
  const pen = state.penaltis;
  if (!pen || !pen.kicks.length) return null;
  const r = resumoPenaltis(pen);
  const nome = (id) => {
    const p = state.players[id];
    return p ? `#${p.number} ${p.name}` : '—';
  };
  const nossos = r.seqNos.map((k, i) => ({ zona: k.zona, tipo: tipoDe(k), texto: i + 1, rotulo: nome(k.playerId) }));
  const deles = r.seqEles.map((k, i) => ({ zona: k.zona, tipo: tipoDe(k), texto: i + 1 }));
  const mergulhos = r.seqEles.filter((k) => k.mergulho).map((k) => ({ zona: k.mergulho, tipo: 'gr', texto: r.seqEles.indexOf(k) + 1 }));

  return (
    <div className="card">
      <p className="halftime__score">
        {ourName} {r.nos} — {r.eles} {opponentName}
        {r.vencedor ? ` · ${r.vencedor === 'US' ? t('penaltis.vitoria') : t('penaltis.derrota')}` : ''}
      </p>
      <div className="penresumo__balizas">
        <Baliza titulo={t('penaltis.nossos', { nome: ourName })} marcas={nossos} />
        <Baliza titulo={t('penaltis.deles', { nome: opponentName })} marcas={[...deles, ...mergulhos]} modo="gr" />
      </div>
      <div className="penresumo__legenda">
        <span><i className="baliza__marca baliza__marca--golo" /> {t('penaltis.res.GOLO')}</span>
        <span><i className="baliza__marca baliza__marca--defendido" /> {t('penaltis.res.DEFENDIDO')}</span>
        <span><i className="baliza__marca baliza__marca--fora" /> {t('penaltis.res.FORA')}</span>
        <span><i className="baliza__marca baliza__marca--gr" /> {t('penaltis.legendaGr')}</span>
      </div>
      <p className="muted small">{t('penaltis.vistaDeQuemRemata')}</p>
      <ol className="pen__lista">
        {pen.kicks.map((k, i) => (
          <li key={k.eventId || i} className={`pen__linha pen__linha--${(k.resultado || '').toLowerCase()}`}>
            <span className="pen__linhanum">{i + 1}.</span>
            <span className="pen__linhaquem">
              {k.team === 'US'
                ? `${ourName} · ${nome(k.playerId)}`
                : `${opponentName}${k.number ? ` · #${k.number}` : ''}${k.goalkeeperId ? ` · ${t('penaltis.gr')} ${nome(k.goalkeeperId)}` : ''}`}
            </span>
            <span className="pen__linhazona muted">
              {k.zona ? t(`penaltis.zona.${k.zona}`) : ''}
              {k.team === 'THEM' && k.mergulho ? ` · ${t('penaltis.grFoi', { zona: t(`penaltis.zona.${k.mergulho}`) })}` : ''}
            </span>
            <span className="pen__linhares">{k.resultado ? t(`penaltis.res.${k.resultado}`) : ''}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
