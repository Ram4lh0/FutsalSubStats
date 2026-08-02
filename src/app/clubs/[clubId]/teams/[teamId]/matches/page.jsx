'use client';

// Aba Jogos do escalão.

import { useParams, useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import MatchList from '@/components/MatchList.jsx';
import { Empty } from '@/components/bits.jsx';

export default function TeamMatchesPage() {
  const { clubId, teamId } = useParams();
  const router = useRouter();
  const base = `/clubs/${clubId}/teams/${teamId}`;

  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {({ entries, competitions }) =>
        entries.length ? (
          <MatchList entries={entries} competitions={competitions} backPath={`${base}/matches`} />
        ) : (
          <Empty
            action={
              <button className="btn btn--primary" onClick={() => router.push(`${base}/matches/new`)}>
                Criar jogo
              </button>
            }
          >
            Este escalão ainda não tem jogos.
          </Empty>
        )
      }
    </TeamShell>
  );
}
