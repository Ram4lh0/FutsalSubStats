'use client';

// components/live/Halftime.jsx — o ecrã do intervalo.
//
// Uma só coluna, de cima para baixo pela ordem do que o treinador faz: primeiro
// o resultado, depois o cinco da 2.ª parte (é a decisão que tem de sair do
// balneário), e só por baixo, a deslizar, o que ajuda a tomá-la — golos,
// minutos, faltas, os amarelos do adversário, tipos de golo e a tabela.
//
// Já foram duas colunas lado a lado, com deslize cada uma. Num telemóvel ao alto
// empilhavam-se com as estatísticas por cima e a formação lá no fundo — o
// contrário do que interessa. O botão de começar continua a flutuar no canto,
// para estar à mão em qualquer ponto do deslize.

import { useState } from 'react';
import DataTable from '@/components/DataTable.jsx';
import CourtPicker, { countFilled } from '@/components/CourtPicker.jsx';
import { GoalsTimeline } from '@/components/Goals.jsx';
import { playerMatchStats } from '@/domain/stats.js';
import { fmt } from '@/domain/clock.js';
import { PLAYER_MATCH_STATUS } from '@/domain/constants.js';
import GraficosDoJogo from '@/components/stats/GraficosDoJogo.jsx';
import { useT } from '@/lib/i18n/index.js';

export default function Halftime({
  state,
  ourName,
  opponentName,
  onEditGoal,
  onCorrectScore,
  onStart,
}) {
  const t = useT();
  // Pré-preenche com quem terminou a 1.ª parte, para poupar toques.
  const [lineup, setLineup] = useState(() => {
    const inicial = {};
    for (const [pos, pid] of Object.entries(state.lastFirstHalfCourt || {})) {
      if (pid && state.players[pid]?.status === PLAYER_MATCH_STATUS.ON_BENCH) inicial[pos] = pid;
    }
    for (const [pos, pid] of Object.entries(state.court)) if (pid) inicial[pos] = pid;
    return inicial;
  });

  const candidatos = Object.values(state.players)
    .filter((p) => p.status !== PLAYER_MATCH_STATUS.EXPELLED)
    .map((p) => ({
      playerId: p.playerId,
      name: p.name,
      number: p.number,
      preferredPosition: p.preferredPosition,
    }));

  const linhas = Object.values(state.players)
    .map((p) =>
      playerMatchStats(p, state.elapsedMatchMs, {
        goals: state.goals,
        cards: state.cards,
        fouls: state.fouls,
      })
    )
    .sort((a, b) => b.courtMs - a.courtMs);

  return (
    <section className="halftime">
      <div className="halftime__bloco">
        <div className="halftime__title">
          <h2 className="section section--tight">{t('intervalo.titulo')}</h2>
          <span className="live__spacer" />
          <button className="btn btn--ghost btn--tiny" onClick={onCorrectScore}>
            {t('intervalo.corrigirResultado')}
          </button>
        </div>
        <p className="halftime__score">
          {t('intervalo.placar', {
            nos: state.teamScore,
            eles: state.opponentScore,
            tempo: fmt(state.firstHalfMs || 0),
          })}
        </p>
      </div>

      <div className="halftime__bloco">
        <h2 className="section section--tight">{t('intervalo.formacao')}</h2>
        <CourtPicker candidates={candidatos} lineup={lineup} onChange={setLineup} />
        <p className="muted">{t('intervalo.escolhidos', { n: countFilled(lineup) })}</p>
        <div className="halftime__actions">
          <button className="btn btn--primary floatbtn" onClick={() => onStart(lineup)}>
            <span>{t('intervalo.comecar')}</span>
            <span>{t('intervalo.segundaParte')}</span>
          </button>
        </div>
        {/* Uma pista de que há mais por baixo: com o campo a ocupar o ecrã
            todo, nada dizia que as estatísticas continuavam lá em baixo. */}
        <p className="halftime__mais muted">{t('intervalo.maisAbaixo')}</p>
      </div>

      <div className="halftime__bloco" data-tour="halftime-summary">
        <h3 className="section section--tight">{t('intervalo.golos')}</h3>
        <GoalsTimeline
          state={state}
          ourName={ourName}
          opponentName={opponentName}
          onEdit={onEditGoal}
        />
      </div>

      <GraficosDoJogo state={state} linhas={linhas} classeBloco="halftime__bloco" />

      <div className="halftime__bloco" data-tour="halftime-player-stats">
        <h3 className="section section--tight">{t('intervalo.jogadores')}</h3>
        <DataTable tight>
          <thead>
            <tr>
              <th>{t('stats.jogador')}</th>
              <th className="num" title={t('stats.golos')}>
                {t('ficha.golosCurto')}
              </th>
              <th className="num" title={t('ficha.assistencias')}>
                {t('ficha.assistCurto')}
              </th>
              <th className="num" title={t('stats.sofridosTitulo')}>
                {t('ficha.sofridosCurto')}
              </th>
              <th className="num" title={t('intervalo.faltasCometidas')}>
                {t('intervalo.faltasCurto')}
              </th>
              <th className="num" title={t('intervalo.faltasSofridas')}>
                {t('intervalo.faltasSofridasCurto')}
              </th>
              <th className="num" title={t('ficha.cartoesAmarelos')}>
                {t('ficha.amarelosCurto')}
              </th>
              <th className="num" title={t('ficha.cartoesVermelhos')}>
                {t('ficha.vermelhosCurto')}
              </th>
              <th className="num">{t('ficha.emCampo')}</th>
              <th className="num">{t('intervalo.entradas')}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((s) => (
              <tr key={s.playerId}>
                <td>
                  #{s.number} {s.name}
                </td>
                <td className="num mono">{s.goals}</td>
                <td className="num mono">{s.assists}</td>
                <td className="num mono">{s.conceded}</td>
                <td className="num mono">{s.fouls}</td>
                <td className="num mono">{s.foulsSuffered}</td>
                <td className="num mono">{s.yellows}</td>
                <td className="num mono">{s.reds}</td>
                <td className="num mono">{fmt(s.courtMs)}</td>
                <td className="num">{s.entries}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </section>
  );
}
