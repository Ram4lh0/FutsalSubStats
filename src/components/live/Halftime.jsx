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
import {
  amarelosAdversario,
  faltasPorJogador,
  golosPorTipoNoJogo,
  mediaEmCampo,
} from '@/domain/intervalo.js';
import { BarrasH, Pizza } from '@/components/stats/graficos.jsx';
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

  const media = mediaEmCampo(linhas);
  const faltas = faltasPorJogador(linhas);
  const amarelos = amarelosAdversario(state);
  const tiposMarcados = golosPorTipoNoJogo(state, 'US');
  const tiposSofridos = golosPorTipoNoJogo(state, 'THEM');
  const haTiposDeGolo = [...tiposMarcados, ...tiposSofridos].some((f) => f.valor > 0);
  const comRotulo = (fatias) => fatias.map((f) => ({ ...f, rotulo: t(`golos.tipo.${f.chave}`) }));

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

      <div className="halftime__bloco">
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
      </div>

      <div className="halftime__bloco">
        <h3 className="section section--tight">{t('intervalo.faltasJogador')}</h3>
        {faltas.length ? (
          <>
            <BarrasH
              linhas={faltas.map((f) => ({
                rotulo: `#${f.number} ${f.name}`,
                valor: f.fouls,
                texto: String(f.fouls),
                alerta: f.emRisco,
              }))}
            />
            {faltas.some((f) => f.emRisco) ? (
              <p className="barras__legenda">{t('intervalo.faltasEmRisco')}</p>
            ) : null}
          </>
        ) : (
          <p className="muted">{t('intervalo.semFaltas')}</p>
        )}
      </div>

      {/* Só aparece se houver: um bloco vazio a dizer «sem cartões» gastava o
          espaço de um ecrã onde se está a deslizar à procura de outra coisa. */}
      {amarelos.length ? (
        <div className="halftime__bloco">
          <h3 className="section section--tight">{t('intervalo.amarelosAdversario')}</h3>
          <ul className="adv-cartoes">
            {amarelos.map((a) => (
              <li
                key={a.number}
                className={`adv-cartoes__item ${a.expulso ? 'is-expulso' : 'is-amarelo'}`}
              >
                <span className="adv-cartoes__numero mono">#{a.number}</span>
                <span className="adv-cartoes__texto">
                  {a.expulso
                    ? t('intervalo.advExpulso', { tempo: fmt(a.amarelosMs[a.amarelosMs.length - 1]) })
                    : t('intervalo.advAmarelo', { tempo: fmt(a.amarelosMs[0]) })}
                </span>
              </li>
            ))}
          </ul>
          {amarelos.some((a) => !a.expulso) ? (
            <p className="barras__legenda">{t('intervalo.advDica')}</p>
          ) : null}
        </div>
      ) : null}

      <div className="halftime__bloco">
        <h3 className="section section--tight">{t('intervalo.tiposDeGolo')}</h3>
        {haTiposDeGolo ? (
          <div className="halftime__pizzas">
            <div>
              <h4 className="halftime__sub">{t('painelv.marcados')}</h4>
              <Pizza titulo={t('painelv.tiposDeGolo')} fatias={comRotulo(tiposMarcados)} />
            </div>
            <div>
              <h4 className="halftime__sub">{t('painelv.sofridos')}</h4>
              <Pizza titulo={t('painelv.tiposDeGoloSofrido')} fatias={comRotulo(tiposSofridos)} />
            </div>
          </div>
        ) : (
          <p className="muted">{t('painelv.semGolosClassificados')}</p>
        )}
      </div>

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
