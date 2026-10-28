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
import { FoulsTimeline } from '@/components/Fouls.jsx';
import { CardsTimeline } from '@/components/Cards.jsx';
import { playerMatchStats } from '@/domain/stats.js';
import { foulsInPeriod } from '@/domain/reducer.js';
import { fmt } from '@/domain/clock.js';
import { PLAYER_MATCH_STATUS } from '@/domain/constants.js';
import GraficosDoJogo from '@/components/stats/GraficosDoJogo.jsx';
import PainelRegistos from '@/components/registos/PainelRegistos.jsx';
import ListaRegistos from '@/components/registos/ListaRegistos.jsx';
import { temRegistos } from '@/domain/registos.js';
import { useT } from '@/lib/i18n/index.js';

export default function Halftime({
  state,
  ourName,
  opponentName,
  onEditGoal,
  onAddGoal,
  onCorrectScore,
  onAddFoul,
  onEditFoul,
  onEditRegisto,
  onAddRegisto,
  onAddCard,
  onEditCard,
  onEditTempos,
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
        <div className="halftime__title">
          <h3 className="section section--tight">{t('intervalo.golos')}</h3>
          <span className="live__spacer" />
          {onAddGoal ? (
            <button className="btn btn--ghost btn--tiny" onClick={onAddGoal}>
              {t('golos.adicionar')}
            </button>
          ) : null}
        </div>
        <GoalsTimeline
          state={state}
          ourName={ourName}
          opponentName={opponentName}
          onEdit={onEditGoal}
        />
      </div>

      {/* As faltas que ficaram por apontar acrescentam-se aqui, antes de
          começar a 2.ª parte — depois já ninguém se lembra de quem foi. */}
      <div className="halftime__bloco">
        <div className="halftime__title">
          <h3 className="section section--tight">
            {t('faltas.titulo')}{' '}
            <span className="muted">
              {t('faltas.contagem', {
                nos: foulsInPeriod(state, 'US', 1),
                eles: foulsInPeriod(state, 'THEM', 1),
              })}
            </span>
          </h3>
          <span className="live__spacer" />
          {onAddFoul ? (
            <button className="btn btn--ghost btn--tiny" onClick={onAddFoul}>
              {t('faltas.adicionar')}
            </button>
          ) : null}
        </div>
        <FoulsTimeline
          state={state}
          ourName={ourName}
          opponentName={opponentName}
          onEdit={onEditFoul}
        />
      </div>

      {/* Cartões: os que não vieram de uma falta apontada também cabem aqui. */}
      <div className="halftime__bloco">
        <div className="halftime__title">
          <h3 className="section section--tight">{t('cartoes.titulo')}</h3>
          <span className="live__spacer" />
          {onAddCard ? (
            <button className="btn btn--ghost btn--tiny" onClick={onAddCard}>
              {t('cartoes.adicionar')}
            </button>
          ) : null}
        </div>
        <CardsTimeline
          state={state}
          ourName={ourName}
          opponentName={opponentName}
          onEdit={onEditCard}
        />
      </div>

      {/* Registos extra (remates, recuperações, …): se o jogo os tiver, ou se o
          escalão os tiver ligados (para os acrescentar a frio). */}
      {temRegistos(state) || onAddRegisto ? (
        <div className="halftime__bloco">
          <div className="halftime__title">
            <h3 className="section section--tight">{t('registos.titulo')}</h3>
            <span className="live__spacer" />
            {onAddRegisto ? (
              <button className="btn btn--ghost btn--tiny" onClick={onAddRegisto}>
                {t('registos.adicionar')}
              </button>
            ) : null}
          </div>
          {temRegistos(state) ? (
            <>
              <PainelRegistos state={state} ourName={ourName} opponentName={opponentName} />
              <details className="registos__corrigir">
                <summary>{t('registos.corrigirLista')}</summary>
                <ListaRegistos
                  state={state}
                  ourName={ourName}
                  opponentName={opponentName}
                  onEdit={onEditRegisto}
                />
              </details>
            </>
          ) : (
            <p className="muted">{t('registos.nadaApontado')}</p>
          )}
        </div>
      ) : null}

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
              {onEditTempos ? <th /> : null}
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
                <td className="num mono">
                  {fmt(s.courtMs)}
                  {state.players[s.playerId]?.temposCorrigidos ? (
                    <span className="muted" title={t('tempos.corrigidosNota')}> *</span>
                  ) : null}
                </td>
                <td className="num">{s.entries}</td>
                {/* Corrigir os tempos da 1.ª parte já no intervalo, com as
                    trocas ainda frescas na cabeça (lib/temposEditing.jsx). */}
                {onEditTempos ? (
                  <td className="right">
                    <button
                      className="btn btn--tiny btn--ghost"
                      onClick={() => onEditTempos(s.playerId)}
                      title={t('tempos.editarDe', { nome: s.name })}
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
    </section>
  );
}
