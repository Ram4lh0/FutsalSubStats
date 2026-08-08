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
import { FOOT, FOOT_LABEL, normalizePosition } from '@/domain/constants.js';
import { dayLabel, positionLabel } from '@/lib/format.js';
import { rotas, comOrigem } from '@/lib/routes.js';
import useSoLeitura from '@/lib/useSoLeitura.js';

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

  if (!dados) return <p className="muted">A carregar…</p>;
  if (!dados.player) return <Empty>Jogador não encontrado.</Empty>;

  const { player, club, team, meus, agg } = dados;
  const guardaRedes = normalizePosition(player.preferredPosition) === 'GOALKEEPER' || agg.conceded > 0;

  // Uma linha só, como na tabela geral: as mesmas categorias, sem repetir o nome
  // e o número que já estão no cabeçalho da página.
  const resumo = [
    ['Jogos', agg.matches],
    ['Golos', agg.goals],
    ['Assist.', agg.assists],
    ['Part. golos', agg.goalShare],
    ['Part. sofridos', agg.concededShare],
    ...(guardaRedes ? [['Sofridos', agg.conceded]] : []),
    ['Faltas', agg.fouls],
    ['Sofridas', agg.foulsSuffered],
    ['Amarelos', agg.yellows],
    ['Vermelhos', agg.reds],
    ['Tempo de jogo', fmt(agg.courtMs)],
    ['Média/jogo', fmt(agg.avgCourtPerMatchMs)],
  ];

  return (
    <>
      <PageHead
        title={`#${player.shirtNumber} ${player.name}`}
        subtitle={`${[club?.name, team?.name].filter(Boolean).join(' · ')} · ${positionLabel(player.preferredPosition)} · pé ${FOOT_LABEL[
          player.strongFoot || FOOT.UNKNOWN
        ].toLowerCase()} · ${player.isActive ? 'Ativo' : 'Inativo'}`}
        backTo={rotas.plantel(clubId, teamId)}
        actions={
          soLeitura ? null : (
            <button
              className="btn btn--ghost"
              onClick={() => router.push(rotas.jogadorEditar(clubId, teamId, playerId))}
            >
              Editar
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

      <h2 className="section">Histórico de jogos</h2>
      {!meus.length ? (
        <Empty>Este jogador ainda não foi convocado.</Empty>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Data</th>
              <th>Adversário</th>
              <th className="num">Resultado</th>
              <th className="num" title="Golos">G</th>
              <th className="num" title="Assistências">A</th>
              {guardaRedes ? (
                <th className="num" title="Golos sofridos à baliza">GS</th>
              ) : null}
              <th className="num" title="Cartões amarelos">Am</th>
              <th className="num" title="Cartões vermelhos">Vm</th>
              <th className="num">Em campo</th>
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
                    Ver jogo
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
