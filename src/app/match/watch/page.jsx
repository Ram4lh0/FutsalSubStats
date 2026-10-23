'use client';

// Assistir ao vivo (add-on 'ao-vivo'): acompanhar, só a ver, um jogo que outro
// treinador está a registar.
//
// Nenhum botão de registo. O estado é o mesmo que o do ecrã de registo — sai
// de `loadMatch`/`buildMatchState` sobre os mesmos eventos — e chega em
// direto por uma subscrição Realtime filtrada por este jogo
// (lib/useAcompanharJogo.js). Os blocos de baixo são os do resumo do jogo:
// golos, faltas, registos extra, gráficos e a tabela dos jogadores.
//
// Em cima diz-se sempre de quando é a última notícia, e um aviso à vista se a
// ligação cair: um marcador parado sem aviso parece um jogo parado.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import DataTable from '@/components/DataTable.jsx';
import { Scoreboard, ClockBox } from '@/components/live/pieces.jsx';
import { GoalsByHalf } from '@/components/Goals.jsx';
import { FoulsByHalf } from '@/components/Fouls.jsx';
import GraficosDoJogo from '@/components/stats/GraficosDoJogo.jsx';
import PainelRegistos from '@/components/registos/PainelRegistos.jsx';
import { Badge, Empty } from '@/components/bits.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import useAcompanharJogo, { LIGACAO } from '@/lib/useAcompanharJogo.js';
import useNow from '@/lib/useNow.js';
import useEcraAceso from '@/lib/ecraAceso.js';
import { clubs, teams } from '@/lib/data/repository.js';
import { matchStatsTable } from '@/domain/stats.js';
import { isLive } from '@/domain/reducer.js';
import { fmt } from '@/domain/clock.js';
import { temRegistos } from '@/domain/registos.js';
import { MATCH_STATUS, PLAYER_MATCH_STATUS, POSITIONS } from '@/domain/constants.js';
import { clubShort, opponentShort, positionLabel } from '@/lib/format.js';
import { rotas } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

export default function WatchPage() {
  return (
    <Pagina>
      <Assistir />
    </Pagina>
  );
}

function Assistir() {
  const { matchId } = useRouteParams();
  const router = useRouter();
  const t = useT();
  const { carregado, ligacao, ultimaAtualizacao } = useAcompanharJogo(matchId);
  const [club, setClub] = useState(null);
  const [team, setTeam] = useState(null);

  const match = carregado?.match || null;
  const state = carregado?.state || null;
  const emCurso =
    Boolean(state) &&
    state.status !== MATCH_STATUS.FINISHED &&
    state.status !== MATCH_STATUS.DRAFT &&
    state.status !== MATCH_STATUS.READY;
  const aCorrer = state?.timerStatus === 'RUNNING';
  // O relógio anda aqui como no ecrã de registo, a partir dos mesmos eventos.
  // Parado, basta um batimento por segundo (é o "há X s" de cima).
  const now = useNow(aCorrer ? 250 : 1000, true);
  useEcraAceso(emCurso);

  useEffect(() => {
    if (!match) return;
    let vivo = true;
    (async () => {
      const [c, tm] = await Promise.all([clubs.get(match.clubId), teams.get(match.teamId)]);
      if (vivo) {
        setClub(c);
        setTeam(tm);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [match?.clubId, match?.teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!carregado) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (carregado.vazio) {
    return (
      <>
        <Ligacao t={t} ligacao={ligacao} ultimaAtualizacao={ultimaAtualizacao} now={now} />
        <Empty>{ligacao === LIGACAO.LIGADO ? t('aoVivo.semAcesso') : t('comum.aCarregar')}</Empty>
      </>
    );
  }

  const ourName = clubShort(club);
  const rivalName = opponentShort(match);
  const tabela = matchStatsTable(state, now);
  const porJogador = new Map(tabela.map((s) => [s.playerId, s]));
  const terminado = state.status === MATCH_STATUS.FINISHED;
  const periodLabel =
    state.status === MATCH_STATUS.HALFTIME
      ? t('acao.intervaloTitulo')
      : state.currentPeriod === 2
        ? t('vivo.segundaParte')
        : state.currentPeriod === 1
          ? t('vivo.primeiraParte')
          : '—';

  const banco = Object.values(state.players)
    .filter((p) => p.status !== PLAYER_MATCH_STATUS.ON_COURT)
    .sort((a, b) => a.number - b.number);

  return (
    <div className="aovivo">
      <PageHead
        title={t('jogo.vs', { adversario: match.opponentName })}
        subtitle={[club?.name, team?.name].filter(Boolean).join(' · ')}
        backTo={rotas.jogos(match.clubId, match.teamId)}
        actions={
          <span className={`aovivo-selo ${emCurso ? 'is-on' : ''}`}>
            {emCurso ? <span className="aovivo-ponto" aria-hidden="true" /> : null}
            {emCurso ? t('aoVivo.emDireto') : terminado ? t('aoVivo.terminadoCurto') : t('aoVivo.titulo')}
          </span>
        }
      />

      <Ligacao t={t} ligacao={ligacao} ultimaAtualizacao={ultimaAtualizacao} now={now} />

      {terminado ? (
        <div className="card aovivo-fim">
          <span>{t('aoVivo.terminado')}</span>
          <button className="btn btn--primary btn--tiny" onClick={() => router.push(rotas.jogoResumo(matchId))}>
            {t('aoVivo.verResumo')}
          </button>
        </div>
      ) : !emCurso ? (
        <p className="card muted">{t('aoVivo.porComecar')}</p>
      ) : null}

      <header className="live__head aovivo__marcador">
        <Scoreboard
          state={state}
          ourName={ourName}
          opponentName={rivalName}
          ourFull={club?.name || ''}
          opponentFull={match.opponentName}
          interactive={false}
          on={{}}
        />
        {state.status === MATCH_STATUS.HALFTIME || terminado ? (
          <div className="clockbox">
            <span className="clockbox__period">{terminado ? t('aoVivo.terminadoCurto') : periodLabel}</span>
            <span className="clockbox__time">{fmt(terminado ? state.elapsedMatchMs : state.firstHalfMs || 0)}</span>
            {terminado ? null : <span className="clockbox__hint">{t('acao.primeiraTerminada')}</span>}
          </div>
        ) : (
          <ClockBox
            state={state}
            periodDurationMs={match.periodDurationMs}
            periodLabel={periodLabel}
            now={now}
          />
        )}
      </header>

      {/* Quem está em campo só durante as partes: no intervalo o campo fica
          vazio de propósito, até se escolher o cinco da 2.ª parte. */}
      {isLive(state) ? (
        <div className="aovivo__equipa">
          <section className="card">
            <h2 className="section section--tight">{t('aoVivo.emCampo')}</h2>
            <ul className="aovivo-jogadores">
              {POSITIONS.map((pos) => {
                const pid = state.court[pos];
                const p = pid ? state.players[pid] : null;
                const s = p ? porJogador.get(pid) : null;
                return (
                  <li key={pos} className={p ? '' : 'is-vazio'}>
                    <span className="aovivo-jogadores__pos">{positionLabel(pos)}</span>
                    <span className="aovivo-jogadores__nome">
                      {p ? `#${p.number} ${p.name}` : '—'}
                    </span>
                    <span className="aovivo-jogadores__tempo mono">
                      {s?.currentStintMs != null ? fmt(s.currentStintMs) : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="card">
            <h2 className="section section--tight">{t('aoVivo.banco')}</h2>
            {banco.length ? (
              <ul className="aovivo-jogadores">
                {banco.map((p) => {
                  const s = porJogador.get(p.playerId);
                  return (
                    <li key={p.playerId} className={s?.expelled ? 'is-expulso' : ''}>
                      <span className="aovivo-jogadores__nome">
                        #{p.number} {p.name}
                        {s?.expelled ? <Badge kind="danger">{t('resumo.expulso')}</Badge> : null}
                      </span>
                      <span className="aovivo-jogadores__tempo mono">{fmt(s?.courtMs || 0)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">{t('vivo.semBanco')}</p>
            )}
          </section>
        </div>
      ) : null}

      <h2 className="section">{t('resumo.golos')}</h2>
      <div className="card">
        <GoalsByHalf
          state={state}
          ourName={ourName}
          opponentName={rivalName}
          emptyText={t('golos.semGolos')}
        />
      </div>

      <h2 className="section">{t('faltas.titulo')}</h2>
      <div className="card">
        <FoulsByHalf state={state} ourName={ourName} opponentName={rivalName} />
      </div>

      {temRegistos(state) ? (
        <>
          <h2 className="section">{t('registos.titulo')}</h2>
          <div className="card">
            <PainelRegistos state={state} ourName={ourName} opponentName={rivalName} />
          </div>
        </>
      ) : null}

      <h2 className="section">{t('resumo.graficos')}</h2>
      <div className="resumo__graficos">
        <GraficosDoJogo
          state={state}
          linhas={tabela}
          classeBloco="card resumo__grafico"
          parteMs={match.periodDurationMs || 20 * 60_000}
        />
      </div>

      <h2 className="section">{t('resumo.jogadores')}</h2>
      <DataTable players>
        <thead>
          <tr>
            <th>{t('stats.numero')}</th>
            <th>{t('stats.jogador')}</th>
            <th className="num" title={t('stats.golos')}>{t('ficha.golosCurto')}</th>
            <th className="num" title={t('ficha.assistencias')}>{t('ficha.assistCurto')}</th>
            <th className="num" title={t('stats.sofridosTitulo')}>{t('ficha.sofridosCurto')}</th>
            <th className="num" title={t('intervalo.faltasCometidas')}>{t('intervalo.faltasCurto')}</th>
            <th className="num" title={t('intervalo.faltasSofridas')}>{t('intervalo.faltasSofridasCurto')}</th>
            <th className="num" title={t('ficha.cartoesAmarelos')}>{t('ficha.amarelosCurto')}</th>
            <th className="num" title={t('ficha.cartoesVermelhos')}>{t('ficha.vermelhosCurto')}</th>
            <th className="num">{t('ficha.emCampo')}</th>
            <th className="num">{t('intervalo.entradas')}</th>
          </tr>
        </thead>
        <tbody>
          {tabela.map((s) => (
            <tr key={s.playerId} className={s.expelled ? 'is-danger' : ''}>
              <td className="num mono">{s.number}</td>
              <td>
                {s.name}
                {s.expelled ? <Badge kind="danger">{t('resumo.expulso')}</Badge> : null}
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
  );
}

/**
 * A faixa da ligação: "última atualização há X s" quando está tudo bem, e um
 * aviso que se vê quando não está.
 */
function Ligacao({ t, ligacao, ultimaAtualizacao, now }) {
  const semRede = typeof navigator !== 'undefined' && navigator.onLine === false;
  const caiu = semRede || ligacao === LIGACAO.SEM_LIGACAO || ligacao === LIGACAO.SEM_SERVIDOR;
  const segundos = ultimaAtualizacao ? Math.max(0, Math.round((now - ultimaAtualizacao) / 1000)) : null;
  const ha =
    segundos == null
      ? t('aoVivo.semNoticias')
      : segundos < 120
        ? t('aoVivo.ultimaAtualizacao', { s: segundos })
        : t('aoVivo.ultimaAtualizacaoMin', { m: Math.floor(segundos / 60) });

  if (caiu) {
    return (
      <div className="aovivo-ligacao is-caiu" role="alert">
        <strong>
          {ligacao === LIGACAO.SEM_SERVIDOR ? t('aoVivo.semServidor') : t('aoVivo.semLigacao')}
        </strong>
        <span>{ha}</span>
      </div>
    );
  }
  return (
    <div className="aovivo-ligacao" role="status" aria-live="polite">
      <span>{ligacao === LIGACAO.A_LIGAR ? t('aoVivo.aLigar') : ha}</span>
    </div>
  );
}
