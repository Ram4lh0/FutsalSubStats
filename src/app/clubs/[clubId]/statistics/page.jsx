'use client';

// Aba Estatísticas: totais do clube e a tabela por jogador.

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ClubShell from '@/components/ClubShell.jsx';
import DataTable from '@/components/DataTable.jsx';
import { StatCard, Empty } from '@/components/bits.jsx';
import { clubAggregate } from '@/domain/stats.js';
import { fmt } from '@/domain/clock.js';

export default function StatsPage() {
  const { clubId } = useParams();
  return <ClubShell clubId={clubId}>{(dados) => <Stats {...dados} />}</ClubShell>;
}

function Stats({ club, entries }) {
  const router = useRouter();
  const agg = useMemo(() => clubAggregate(entries), [entries]);
  const linhas = useMemo(
    () => Object.values(agg.perPlayer).sort((a, b) => b.courtMs - a.courtMs),
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
        <Empty>Ainda não há jogos com dados de jogadores.</Empty>
      ) : (
        <>
          <h2 className="section">Por jogador</h2>
          {/* As entradas, a média por entrada e o maior período continuam a ser
              calculados e exportados — são detalhe de cada jogo, e aqui só
              atrapalhavam a leitura. */}
          <DataTable players>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Jogador</th>
                <th className="num">Jogos</th>
                <th className="num">Golos</th>
                <th className="num">Assist.</th>
                <th className="num">Sofridos</th>
                <th className="num">Faltas</th>
                <th className="num">Sofridas</th>
                <th className="num">Amarelos</th>
                <th className="num">Vermelhos</th>
                <th className="num">Tempo total</th>
                <th className="num">Média/jogo</th>
                <th className="num">Média maior período</th>
                <th className="num">Média menor período</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.playerId}>
                  <td className="num mono">{p.number}</td>
                  <td>
                    <span className="cellwho">
                      <span className="cellwho__name">{p.name}</span>
                      {/* O atalho para a ficha vive dentro da coluna do nome, que é
                          fixa: assim acompanha sempre o jogador. */}
                      <button
                        className="btn btn--tiny btn--plus"
                        title="Ver ficha do jogador"
                        aria-label={`Ver ficha de ${p.name}`}
                        onClick={() => router.push(`/clubs/${club.id}/players/${p.playerId}`)}
                      >
                        +
                      </button>
                    </span>
                  </td>
                  <td className="num">{p.matches}</td>
                  <td className="num mono">{p.goals}</td>
                  <td className="num mono">{p.assists}</td>
                  <td className="num mono">{p.conceded}</td>
                  <td className="num mono">{p.fouls}</td>
                  <td className="num mono">{p.foulsSuffered}</td>
                  <td className="num mono">{p.yellows}</td>
                  <td className="num mono">{p.reds}</td>
                  <td className="num mono">{fmt(p.courtMs)}</td>
                  <td className="num mono">{fmt(p.avgCourtPerMatchMs)}</td>
                  <td className="num mono">{fmt(p.avgLongestStintMs)}</td>
                  <td className="num mono">{fmt(p.avgShortestStintMs)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}
    </>
  );
}
