'use client';

// components/penaltis/PenaltisAtleta.jsx — a baliza dos penáltis de um jogador
// (09/11/2026): para onde bateu os penáltis do desempate e, se foi guarda-redes,
// para onde rematou o adversário e para onde ele se atirou. Usado no painel do
// atleta e na ficha do jogador. Sem penáltis, não aparece.

import { useMemo } from 'react';
import Baliza from '@/components/penaltis/Baliza.jsx';
import { StatCard } from '@/components/bits.jsx';
import { penaltisDoAtleta } from '@/domain/dashboard.js';
import { useT } from '@/lib/i18n/index.js';

const tipoDe = (resultado) => (resultado === 'GOLO' ? 'golo' : resultado === 'DEFENDIDO' ? 'defendido' : 'fora');

export default function PenaltisAtleta({ entries, playerId, Bloco }) {
  const t = useT();
  const p = useMemo(() => penaltisDoAtleta(entries, playerId), [entries, playerId]);
  if (!p.batidos.length && !p.comoGr.length) return null;

  const marcasBatidos = p.batidos.map((k, i) => ({ zona: k.zona, tipo: tipoDe(k.resultado), texto: i + 1 }));
  const marcasGr = [
    ...p.comoGr.map((k, i) => ({ zona: k.zona, tipo: tipoDe(k.resultado), texto: i + 1 })),
    ...p.comoGr.filter((k) => k.mergulho).map((k) => ({ zona: k.mergulho, tipo: 'gr', texto: p.comoGr.indexOf(k) + 1 })),
  ];

  return (
    <Bloco titulo={t('penaltis.atletaTitulo')}>
      <div className="grid grid--stats">
        {p.batidos.length ? (
          <StatCard
            label={t('penaltis.atletaBatidos')}
            value={`${p.golos}/${p.batidos.length}`}
            hint={t('penaltis.atletaDetalhe', { d: p.defendidos, f: p.fora })}
          />
        ) : null}
        {p.comoGr.length ? (
          <StatCard
            label={t('penaltis.atletaDefesas')}
            value={`${p.grDefendidos}/${p.comoGr.length}`}
            hint={t('penaltis.atletaGrDetalhe', { g: p.grGolos, f: p.grFora })}
          />
        ) : null}
        <StatCard label={t('penaltis.atletaJogos')} value={p.jogos} />
      </div>
      <div className="penresumo__balizas">
        {p.batidos.length ? <Baliza titulo={t('penaltis.atletaOndeBateu')} marcas={marcasBatidos} /> : null}
        {p.comoGr.length ? <Baliza titulo={t('penaltis.atletaComoGr')} marcas={marcasGr} modo="gr" /> : null}
      </div>
      <div className="penresumo__legenda">
        <span><i className="baliza__marca baliza__marca--golo" /> {t('penaltis.res.GOLO')}</span>
        <span><i className="baliza__marca baliza__marca--defendido" /> {t('penaltis.res.DEFENDIDO')}</span>
        <span><i className="baliza__marca baliza__marca--fora" /> {t('penaltis.res.FORA')}</span>
        {p.comoGr.length ? (
          <span><i className="baliza__marca baliza__marca--gr" /> {t('penaltis.atletaMergulho')}</span>
        ) : null}
      </div>
      <p className="muted small">{t('penaltis.vistaDeQuemRemata')}</p>
    </Bloco>
  );
}
