'use client';

// components/live/Halftime.jsx — o ecrã do intervalo.
//
// Duas metades com deslize independente: consulta-se o que se passou na primeira
// parte sem perder de vista a formação que se está a montar ao lado. O botão de
// começar flutua no canto, para não fugir com o deslize.

import { useState } from 'react';
import DataTable from '@/components/DataTable.jsx';
import CourtPicker, { countFilled } from '@/components/CourtPicker.jsx';
import { GoalsTimeline } from '@/components/Goals.jsx';
import { playerMatchStats } from '@/domain/stats.js';
import { fmt } from '@/domain/clock.js';
import { PLAYER_MATCH_STATUS } from '@/domain/constants.js';

export default function Halftime({
  state,
  ourName,
  opponentName,
  onEditGoal,
  onCorrectScore,
  onStart,
}) {
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
      <div className="halftime__left">
        <div className="halftime__title">
          <h2 className="section section--tight">Intervalo</h2>
          <span className="live__spacer" />
          <button className="btn btn--ghost btn--tiny" onClick={onCorrectScore}>
            Corrigir resultado
          </button>
        </div>
        <p className="halftime__score">
          {state.teamScore} — {state.opponentScore} · 1.ª parte com {fmt(state.firstHalfMs || 0)}
        </p>

        <h3 className="section section--tight">Golos</h3>
        <GoalsTimeline
          state={state}
          ourName={ourName}
          opponentName={opponentName}
          onEdit={onEditGoal}
        />

        <h3 className="section">Jogadores</h3>
        <DataTable tight>
          <thead>
            <tr>
              <th>Jogador</th>
              <th className="num" title="Golos">G</th>
              <th className="num" title="Assistências">A</th>
              <th className="num" title="Golos sofridos à baliza">GS</th>
              <th className="num" title="Faltas cometidas">F</th>
              <th className="num" title="Faltas sofridas">FS</th>
              <th className="num" title="Cartões amarelos">Am</th>
              <th className="num" title="Cartões vermelhos">Vm</th>
              <th className="num">Em campo</th>
              <th className="num">Entradas</th>
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

      <div className="halftime__right">
        <h2 className="section">Formação da 2.ª parte</h2>
        <CourtPicker candidates={candidatos} lineup={lineup} onChange={setLineup} />
        <p className="muted">
          {countFilled(lineup)}/5 escolhidos. Cada jogador que começa a 2.ª parte inicia uma nova
          entrada.
        </p>
        <div className="halftime__actions">
          <button className="btn btn--primary floatbtn" onClick={() => onStart(lineup)}>
            <span>Começar</span>
            <span>2.ª parte</span>
          </button>
        </div>
      </div>
    </section>
  );
}
