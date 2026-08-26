'use client';

// Aba Jogos do escalão.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import MatchList from '@/components/MatchList.jsx';
import { Empty } from '@/components/bits.jsx';
import { rotas } from '@/lib/routes.js';
import { useAuth } from '@/lib/auth.jsx';
import * as sync from '@/lib/data/sync.js';

export default function TeamMatchesPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId } = useRouteParams();
  const router = useRouter();
  const { userId } = useAuth();

  useEffect(() => {
    if (!userId) return;
    sync.pull(userId, { repararJogosIncompletos: true }).catch(() => {
      /* sem rede: a lista fica com o que o dispositivo já tem */
    });
  }, [userId]);

  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {({ entries, competitions }) =>
        entries.length ? (
          <MatchList entries={entries} competitions={competitions} backPath={rotas.jogos(clubId, teamId)} />
        ) : (
          <Empty
            action={
              <button
                className="btn btn--primary"
                data-tour="create-match"
                onClick={() => router.push(rotas.jogoNovo(clubId, teamId))}
              >
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
