'use client';

// Estatísticas do escalão — a aba de entrada, porque é o que se vem cá ver.

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import DataTable from '@/components/DataTable.jsx';
import { StatCard, Empty } from '@/components/bits.jsx';
import { clubAggregate } from '@/domain/stats.js';
import { fmt } from '@/domain/clock.js';

export default function TeamStatsPage() {
  const { clubId, teamId } = useParams();
  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {(dados) => <Stats {...dados} clubId={clubId} teamId={teamId} />}
    </TeamShell>
  );
}

function Stats({ entries, roster, clubId, teamId }) {
  const router = useRouter();
  const agg = useMemo(() => clubAggregate(entries, roster), [entries, roster]);
  const linhas = useMemo(
    () => Object.values(agg.perPlayer).sort((a, b) => b.courtMs - a.courtMs || a.number - b.number),
    [agg]
  );

  return (
    <>
      <div className="grid grid--stats">
        <StatCard label="Jogos" value={agg.matches} hint={`${agg.finished} terminados`} />
        <StatCard label="V / E / D" value={`${agg.wins} / ${agg.draws} / ${agg.losses}`} />
        <StatCard label="Golos marcados" value={agg.goalsFor} />
        <StatCard label="Golos sofridos" value={agg.goalsAgainst} />
        <StatCard label="Diferença" value={agg.goalsFor - agg.goalsAgainst} />
      </div>

      {!linhas.length ? (
        <Empty>Ainda não há jogadores neste escalão.</Empty>
      ) : (
        <>
          <h2 className="section">Por jogador</h2>
          <DataTable players>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Jogador</th>
                <th className="num">Jogos</th>
                <th className="num">Golos</th>
                <th className="num">Assist.</th>
                {/* Participações: golos da equipa com este jogador em campo. Não é
                    mérito individual — é quanto a equipa produz com ele lá dentro. */}
                <th className="num" title="Golos da equipa com este jogador em campo">Part. G</th>
                <th className="num" title="Golos sofridos com este jogador em campo">Part. GS</th>
                <th className="num" title="Golos sofridos à baliza">Sofridos</th>
                <th className="num">Faltas</th>
                <th className="num">Sofridas</th>
                <th className="num">Amarelos</th>
                <th className="num">Vermelhos</th>
                <th className="num">Tempo total</th>
                <th className="num">Média/jogo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.playerId}>
                  <td className="num mono">{p.number}</td>
                  <td>
                    <span className="cellwho">
                      <span className="cellwho__name">{p.name}</span>
                      <button
                        className="btn btn--tiny btn--plus"
                        title="Ver ficha do jogador"
                        aria-label={`Ver ficha de ${p.name}`}
                        onClick={() =>
                          router.push(`/clubs/${clubId}/teams/${teamId}/players/${p.playerId}`)
                        }
                      >
                        +
                      </button>
                    </span>
                  </td>
                  <td className="num">{p.matches}</td>
                  <td className="num mono">{p.goals}</td>
                  <td className="num mono">{p.assists}</td>
                  <td className="num mono">{p.goalShare}</td>
                  <td className="num mono">{p.concededShare}</td>
                  <td className="num mono">{p.conceded}</td>
                  <td className="num mono">{p.fouls}</td>
                  <td className="num mono">{p.foulsSuffered}</td>
                  <td className="num mono">{p.yellows}</td>
                  <td className="num mono">{p.reds}</td>
                  <td className="num mono">{fmt(p.courtMs)}</td>
                  <td className="num mono">{fmt(p.avgCourtPerMatchMs)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}
    </>
  );
}
