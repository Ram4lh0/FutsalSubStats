'use client';

// Aba Jogos do escalão.

import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import MatchList from '@/components/MatchList.jsx';
import { Empty } from '@/components/bits.jsx';
import { rotas } from '@/lib/routes.js';

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
  const base = rotas.escalao(clubId, teamId);

  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {({ entries, competitions }) =>
        entries.length ? (
          <MatchList entries={entries} competitions={competitions} backPath={rotas.jogos(clubId, teamId)} />
        ) : (
          <Empty
            action={
              <button className="btn btn--primary" onClick={() => router.push(rotas.jogoNovo(clubId, teamId))}>
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
