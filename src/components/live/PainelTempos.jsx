'use client';

// components/live/PainelTempos.jsx — o painel dos tempos de quem os regista.
//
// Só o que interessa a quem controla as substituições: quanto cada um jogou,
// quanto dura cada entrada, quem está há mais tempo à espera e quantas trocas
// já houve. Serve o intervalo e o botão "Tempos" do jogo.

import { playerMatchStats } from '@/domain/stats.js';
import { mediaEmCampo } from '@/domain/intervalo.js';
import { fmt } from '@/domain/clock.js';
import { PLAYER_MATCH_STATUS } from '@/domain/constants.js';
import { BarrasH } from '@/components/stats/graficos.jsx';
import DataTable from '@/components/DataTable.jsx';
import { useT } from '@/lib/i18n/index.js';

export default function PainelTempos({ state, clockMs, onEditTempos = null }) {
  const t = useT();
  const linhas = Object.values(state.players)
    .map((p) => playerMatchStats(p, clockMs))
    .sort((a, b) => b.courtMs - a.courtMs);

  const totalEntradas = linhas.reduce((a, l) => a + l.entries, 0);
  const totalCampo = linhas.reduce((a, l) => a + l.courtMs, 0);
  const mediaEntrada = totalEntradas ? Math.round(totalCampo / totalEntradas) : 0;
  const media = mediaEmCampo(linhas);
  const trocas = linhas.reduce((a, l) => a + l.stints.filter((s) => s.startMatchMs > 0).length, 0);

  const maisLonga = linhas.reduce((m, l) => (l.longestStintMs > (m?.longestStintMs ?? 0) ? l : m), null);

  // Quem está à espera há mais tempo (relógio do jogo): sem nunca ter entrado
  // conta desde o início.
  const espera = linhas
    .filter((l) => l.status === PLAYER_MATCH_STATUS.ON_BENCH)
    .map((l) => {
      const fechadas = l.stints.filter((s) => !s.open);
      const ultimo = fechadas.length ? fechadas[fechadas.length - 1].endMatchMs : 0;
      return { ...l, esperaMs: Math.max(0, clockMs - ultimo), nunca: l.entries === 0 };
    })
    .sort((a, b) => b.esperaMs - a.esperaMs)[0];

  const kpi = (rotulo, valor, extra) => (
    <div className="tpainel__kpi">
      <span className="tpainel__rot">{rotulo}</span>
      <strong className="tpainel__val">{valor}</strong>
      {extra ? <span className="tpainel__extra">{extra}</span> : null}
    </div>
  );

  return (
    <div className="tmpainel">
      <div className="tpainel__kpis">
        {kpi(t('tpainel.mediaEntrada'), fmt(mediaEntrada), t('tpainel.mediaEntradaSub', { n: totalEntradas }))}
        {kpi(
          t('tpainel.maisLonga'),
          maisLonga ? fmt(maisLonga.longestStintMs) : '–',
          maisLonga ? `#${maisLonga.number} ${maisLonga.name}` : null
        )}
        {kpi(
          t('tpainel.maisEspera'),
          espera ? fmt(espera.esperaMs) : '–',
          espera ? `#${espera.number} ${espera.name}${espera.nunca ? ` · ${t('vivo.aindaNaoEntrou')}` : ''}` : null
        )}
        {kpi(t('tpainel.trocas'), String(trocas), t('tpainel.mediaJogador', { tempo: fmt(Math.round(media)) }))}
      </div>

      <h3 className="section section--tight">{t('intervalo.minutos')}</h3>
      <BarrasH
        linhas={linhas.map((l) => ({
          rotulo: `#${l.number} ${l.name}`,
          valor: l.courtMs,
          texto: fmt(l.courtMs),
        }))}
        referencia={media}
        rotuloReferencia={t('intervalo.mediaMinutos', { tempo: fmt(Math.round(media)) })}
      />

      <DataTable tight>
        <thead>
          <tr>
            <th>{t('stats.jogador')}</th>
            <th className="num">{t('ficha.emCampo')}</th>
            <th className="num">{t('intervalo.entradas')}</th>
            <th className="num">{t('tpainel.media')}</th>
            <th className="num">{t('tpainel.maior')}</th>
            {onEditTempos ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {linhas.map((s) => (
            <tr key={s.playerId}>
              <td>
                #{s.number} {s.name}
              </td>
              <td className="num mono">{fmt(s.courtMs)}</td>
              <td className="num">{s.entries}</td>
              <td className="num mono">{s.entries ? fmt(s.avgStintMs) : '–'}</td>
              <td className="num mono">{s.entries ? fmt(s.longestStintMs) : '–'}</td>
              {onEditTempos ? (
                <td className="right">
                  <button
                    className="btn btn--tiny btn--ghost"
                    onClick={() => onEditTempos(s.playerId)}
                    aria-label={t('tempos.editarDe', { nome: s.name })}
                  >
                    {t('tempos.editarCurto')}
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
