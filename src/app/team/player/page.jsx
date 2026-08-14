'use client';

// Ficha do jogador: os mesmos números da aba de estatísticas, mais o histórico
// jogo a jogo.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import PageHead from '@/components/PageHead.jsx';
import DataTable from '@/components/DataTable.jsx';
import { Empty } from '@/components/bits.jsx';
import { clubs, teams, players, loadTeamMatchStates } from '@/lib/data/repository.js';
import { clubAggregate, matchStatsTable } from '@/domain/stats.js';
import { fmt } from '@/domain/clock.js';
import { FOOT, normalizePosition } from '@/domain/constants.js';
import { dayLabel, positionLabel, footLabel } from '@/lib/format.js';
import { rotas, comOrigem } from '@/lib/routes.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import { useT } from '@/lib/i18n/index.js';

const VAZIO = {
  matches: 0, courtMs: 0, goals: 0, assists: 0, goalShare: 0, concededShare: 0,
  conceded: 0, fouls: 0, foulsSuffered: 0, yellows: 0, reds: 0, avgCourtPerMatchMs: 0,
};

export default function PlayerPage() {
  return (
    <Pagina>
      <Ficha />
    </Pagina>
  );
}

function Ficha() {
  const { clubId, teamId, playerId } = useRouteParams();
  const router = useRouter();
  const t = useT();
  const [dados, setDados] = useState(null);
  const soLeitura = useSoLeitura();

  useEffect(() => {
    (async () => {
      const [player, club, team, entries] = await Promise.all([
        players.get(playerId),
        clubs.get(clubId),
        teams.get(teamId),
        loadTeamMatchStates(teamId),
      ]);
      if (!player) return setDados({ player: null });

      const meus = entries
        .map(({ match, state }) => ({
          match,
          state,
          row: matchStatsTable(state, state.elapsedMatchMs || Date.now()).find(
            (r) => r.playerId === playerId
          ),
        }))
        .filter((e) => e.row);

      // A ficha usa a mesma função de agregação da aba de estatísticas, para as
      // duas nunca discordarem.
      const agg = clubAggregate(entries, [player]).perPlayer[playerId] || VAZIO;
      setDados({ player, club, team, meus, agg });
    })();
  }, [clubId, teamId, playerId]);

  if (!dados) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (!dados.player) return <Empty>{t('ficha.naoEncontrado')}</Empty>;

  const { player, club, team, meus, agg } = dados;
  const guardaRedes = normalizePosition(player.preferredPosition) === 'GOALKEEPER' || agg.conceded > 0;

  // Uma linha só, como na tabela geral: as mesmas categorias, sem repetir o nome
  // e o número que já estão no cabeçalho da página.
  const resumo = [
    [t('stats.jogos'), agg.matches],
    [t('stats.golos'), agg.goals],
    [t('stats.assistencias'), agg.assists],
    [t('ficha.partGolos'), agg.goalShare],
    [t('ficha.partSofridos'), agg.concededShare],
    ...(guardaRedes ? [[t('stats.sofridos'), agg.conceded]] : []),
    [t('stats.faltas'), agg.fouls],
    [t('stats.faltasSofridas'), agg.foulsSuffered],
    [t('stats.amarelos'), agg.yellows],
    [t('stats.vermelhos'), agg.reds],
    [t('ficha.tempoDeJogo'), fmt(agg.courtMs)],
    [t('stats.mediaPorJogo'), fmt(agg.avgCourtPerMatchMs)],
  ];

  return (
    <>
      <PageHead
        title={`#${player.shirtNumber} ${player.name}`}
        subtitle={t('ficha.subtitulo', {
          clube: [club?.name, team?.name].filter(Boolean).join(' · '),
          posicao: positionLabel(player.preferredPosition),
          pe: footLabel(player.strongFoot || FOOT.UNKNOWN).toLowerCase(),
          estado: player.isActive
            ? t('plantel.etiquetaAtivo')
            : t('plantel.etiquetaInativo'),
        })}
        backTo={rotas.plantel(clubId, teamId)}
        actions={
          soLeitura ? null : (
            <button
              className="btn btn--ghost"
              onClick={() => router.push(rotas.jogadorEditar(clubId, teamId, playerId))}
            >
              {t('comum.editar')}
            </button>
          )
        }
      />

      <DataTable>
        <thead>
          <tr>
            {resumo.map(([label]) => (
              <th key={label} className="num">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {resumo.map(([label, valor]) => (
              <td key={label} className="num mono">
                {valor}
              </td>
            ))}
          </tr>
        </tbody>
      </DataTable>

      <h2 className="section">{t('ficha.historico')}</h2>
      {!meus.length ? (
        <Empty>{t('ficha.semConvocatorias')}</Empty>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>{t('lista.data')}</th>
              <th>{t('lista.adversario')}</th>
              <th className="num">{t('lista.resultado')}</th>
              <th className="num" title={t('stats.golos')}>
                {t('ficha.golosCurto')}
              </th>
              <th className="num" title={t('ficha.assistencias')}>
                {t('ficha.assistCurto')}
              </th>
              {guardaRedes ? (
                <th className="num" title={t('stats.sofridosTitulo')}>
                  {t('ficha.sofridosCurto')}
                </th>
              ) : null}
              <th className="num" title={t('ficha.cartoesAmarelos')}>
                {t('ficha.amarelosCurto')}
              </th>
              <th className="num" title={t('ficha.cartoesVermelhos')}>
                {t('ficha.vermelhosCurto')}
              </th>
              <th className="num">{t('ficha.emCampo')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {meus.map(({ match, state, row }) => (
              <tr key={match.id}>
                <td className="mono">{dayLabel(match.scheduledAt)}</td>
                <td>{match.opponentName}</td>
                <td className="num mono">
                  {state.teamScore}–{state.opponentScore}
                </td>
                <td className="num mono">{row.goals}</td>
                <td className="num mono">{row.assists}</td>
                {guardaRedes ? <td className="num mono">{row.conceded}</td> : null}
                <td className="num mono">{row.yellows}</td>
                <td className="num mono">{row.reds}</td>
                <td className="num mono">{fmt(row.courtMs)}</td>
                <td className="right">
                  <button
                    className="btn btn--tiny btn--ghost"
                    onClick={() =>
                      router.push(
                        comOrigem(rotas.jogoResumo(match.id), {
                          atras: rotas.jogador(clubId, teamId, playerId),
                        })
                      )
                    }
                  >
                    {t('ficha.verJogo')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
