'use client';

// Aba Jogos do escalão.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import MatchList from '@/components/MatchList.jsx';
import { Empty } from '@/components/bits.jsx';
import { rotas } from '@/lib/routes.js';
import { useAuth } from '@/lib/auth.jsx';
import * as sync from '@/lib/data/sync.js';
import { useT } from '@/lib/i18n/index.js';

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
          <Jogos
            entries={entries}
            competitions={competitions}
            clubId={clubId}
            teamId={teamId}
          />
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

function Jogos({ entries, competitions, clubId, teamId }) {
  const router = useRouter();
  const t = useT();
  const [mostrarTudo, setMostrarTudo] = useState(false);
  const limite = 7;
  const temMais = entries.length > limite;

  return (
    <>
      <MatchList
        entries={entries}
        competitions={competitions}
        backPath={rotas.jogos(clubId, teamId)}
        limit={mostrarTudo ? null : limite}
      />
      <div className="form__actions matches-actions">
        {temMais ? (
          <button className="btn btn--ghost btn--tiny" onClick={() => setMostrarTudo((v) => !v)}>
            {mostrarTudo ? t('lista.mostrarMenos') : t('lista.mostrarMais')}
          </button>
        ) : null}
        <span className="toolbar__spacer" />
        <button
          className="btn btn--primary btn--tiny"
          data-tour="create-match"
          onClick={() => router.push(rotas.jogoNovo(clubId, teamId))}
        >
          {t('escalao.novoJogo')}
        </button>
      </div>
    </>
  );
}
