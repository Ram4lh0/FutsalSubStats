'use client';

// Aba Jogos: o histórico completo do clube.

import { useParams, useRouter } from 'next/navigation';
import ClubShell from '@/components/ClubShell.jsx';
import MatchList from '@/components/MatchList.jsx';
import { Empty } from '@/components/bits.jsx';

export default function MatchesPage() {
  const { clubId } = useParams();
  const router = useRouter();

  return (
    <ClubShell clubId={clubId}>
      {({ club, entries }) =>
        entries.length ? (
          <MatchList entries={entries} backPath={`/clubs/${club.id}/matches`} />
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
        )
      }
    </ClubShell>
  );
}
