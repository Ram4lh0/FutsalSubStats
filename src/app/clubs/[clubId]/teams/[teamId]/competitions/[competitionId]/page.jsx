'use client';

// Detalhe de uma competição: como o escalão anda nesta prova em concreto.

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import MatchList from '@/components/MatchList.jsx';
import DataTable from '@/components/DataTable.jsx';
import { StatCard, Empty } from '@/components/bits.jsx';
import { clubAggregate } from '@/domain/stats.js';
import { fmt } from '@/domain/clock.js';

export default function CompetitionPage() {
  const { clubId, teamId, competitionId } = useParams();
  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {(dados) => (
        <Detalhe {...dados} clubId={clubId} teamId={teamId} competitionId={competitionId} />
      )}
    </TeamShell>
  );
}

function Detalhe({ entries, roster, competitions, clubId, teamId, competitionId }) {
  const router = useRouter();
  const base = `/clubs/${clubId}/teams/${teamId}`;
  const competicao = competitions.find((c) => c.id === competitionId);
  const meus = useMemo(
    () => entries.filter((e) => e.match.competitionId === competitionId),
    [entries, competitionId]
  );
  const agg = useMemo(() => clubAggregate(meus, roster), [meus, roster]);
  const linhas = useMemo(
    () =>
      Object.values(agg.perPlayer)
        .filter((p) => p.matches > 0)
        .sort((a, b) => b.courtMs - a.courtMs || a.number - b.number),
    [agg]
  );

  if (!competicao) return <Empty>Competição não encontrada.</Empty>;

  return (
    <>
      <div className="toolbar">
        <button className="btn btn--ghost btn--icon" onClick={() => router.push(`${base}/competitions`)}>
          ‹
        </button>
        <h2 className="section section--tight">{competicao.name}</h2>
        <span className="toolbar__spacer" />
      </div>

      <div className="grid grid--stats">
        <StatCard label="Jogos" value={agg.matches} hint={`${agg.finished} terminados`} />
        <StatCard label="V / E / D" value={`${agg.wins} / ${agg.draws} / ${agg.losses}`} />
        <StatCard label="Golos marcados" value={agg.goalsFor} />
        <StatCard label="Golos sofridos" value={agg.goalsAgainst} />
        <StatCard label="Diferença" value={agg.goalsFor - agg.goalsAgainst} />
      </div>

      <h2 className="section">Jogos</h2>
      {meus.length ? (
        <MatchList
          entries={meus}
          competitions={competitions}
          backPath={`${base}/competitions/${competitionId}`}
        />
      ) : (
        <Empty>Ainda não há jogos nesta competição.</Empty>
      )}

      {linhas.length ? (
        <>
          <h2 className="section">Por jogador nesta competição</h2>
          <DataTable players>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Jogador</th>
                <th className="num">Jogos</th>
                <th className="num">Golos</th>
                <th className="num">Assist.</th>
                <th className="num" title="Golos da equipa com este jogador em campo">Part. G</th>
                <th className="num" title="Golos sofridos com este jogador em campo">Part. GS</th>
                <th className="num">Amarelos</th>
                <th className="num">Vermelhos</th>
                <th className="num">Tempo total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.playerId}>
                  <td className="num mono">{p.number}</td>
                  <td>{p.name}</td>
                  <td className="num">{p.matches}</td>
                  <td className="num mono">{p.goals}</td>
                  <td className="num mono">{p.assists}</td>
                  <td className="num mono">{p.goalShare}</td>
                  <td className="num mono">{p.concededShare}</td>
                  <td className="num mono">{p.yellows}</td>
                  <td className="num mono">{p.reds}</td>
                  <td className="num mono">{fmt(p.courtMs)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      ) : null}
    </>
  );
}
