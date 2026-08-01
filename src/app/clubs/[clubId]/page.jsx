'use client';

// Aba Resumo do clube.

import { useParams, useRouter } from 'next/navigation';
import ClubShell from '@/components/ClubShell.jsx';
import MatchList from '@/components/MatchList.jsx';
import { StatCard, Empty } from '@/components/bits.jsx';
import { clubAggregate } from '@/domain/stats.js';

export default function ClubSummaryPage() {
  const { clubId } = useParams();
  const router = useRouter();

  return (
    <ClubShell clubId={clubId}>
      {({ club, entries, roster }) => {
        const agg = clubAggregate(entries);
        const recentes = entries.slice(0, 5);
        return (
          <>
            <div className="grid grid--stats">
              <StatCard
                label="Jogadores"
                value={roster.filter((p) => p.isActive).length}
                hint={`${roster.length} no total`}
              />
              <StatCard label="Jogos" value={agg.matches} hint={`${agg.finished} terminados`} />
              <StatCard label="V / E / D" value={`${agg.wins} / ${agg.draws} / ${agg.losses}`} />
              <StatCard
                label="Golos"
                value={`${agg.goalsFor} : ${agg.goalsAgainst}`}
                hint={`Diferença ${agg.goalsFor - agg.goalsAgainst}`}
              />
            </div>

            <h2 className="section">Últimos jogos</h2>
            {recentes.length ? (
              <MatchList entries={recentes} backPath={`/clubs/${club.id}`} />
            ) : (
              <Empty
                action={
                  <button
                    className="btn btn--primary"
                    onClick={() => router.push(`/clubs/${club.id}/matches/new`)}
                  >
                    Criar jogo
                  </button>
                }
              >
                Ainda não existem jogos.
              </Empty>
            )}
          </>
        );
      }}
    </ClubShell>
  );
}
