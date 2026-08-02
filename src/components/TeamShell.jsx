'use client';

// components/TeamShell.jsx — cabeçalho e abas de um escalão.
//
// O escalão é onde o trabalho acontece: plantel, jogos, competições e
// estatísticas são todos dele. Carrega tudo uma vez e entrega à aba, para que
// trocar de separador não obrigue a recalcular o histórico inteiro.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Guard from './Guard.jsx';
import PageHead from './PageHead.jsx';
import { Tabs, Empty } from './bits.jsx';
import {
  clubs,
  teams,
  competitions,
  players,
  loadTeamMatchStates,
} from '@/lib/data/repository.js';
import { DATA_UPDATED_EVENT } from '@/lib/data/sync.js';

export default function TeamShell({ clubId, teamId, children }) {
  return (
    <Guard>
      <Shell clubId={clubId} teamId={teamId}>
        {children}
      </Shell>
    </Guard>
  );
}

function Shell({ clubId, teamId, children }) {
  const router = useRouter();
  const [dados, setDados] = useState(null);

  const carregar = useCallback(async () => {
    const team = await teams.get(teamId);
    if (!team) return setDados({ team: null });
    const [club, entries, roster, provas] = await Promise.all([
      clubs.get(clubId),
      loadTeamMatchStates(teamId),
      players.listByTeam(teamId),
      competitions.listByTeam(teamId),
    ]);
    setDados({ club, team, entries, roster, competitions: provas });
  }, [clubId, teamId]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (vivo) await carregar();
    })();
    const aoAtualizar = () => {
      if (vivo) carregar();
    };
    window.addEventListener(DATA_UPDATED_EVENT, aoAtualizar);
    return () => {
      vivo = false;
      window.removeEventListener(DATA_UPDATED_EVENT, aoAtualizar);
    };
  }, [carregar]);

  if (!dados) return <p className="muted">A carregar…</p>;
  if (!dados.team) return <Empty>Escalão não encontrado.</Empty>;

  const { club, team } = dados;
  const base = `/clubs/${clubId}/teams/${teamId}`;
  const abas = [
    { label: 'Plantel', to: `${base}/roster` },
    { label: 'Jogos', to: `${base}/matches` },
    { label: 'Competições', to: `${base}/competitions` },
    { label: 'Estatísticas', to: base },
  ];

  return (
    <>
      <PageHead
        title={team.name}
        subtitle={[club?.name, club?.currentSeason ? `Época ${club.currentSeason}` : null]
          .filter(Boolean)
          .join(' · ')}
        backTo={`/clubs/${clubId}`}
        actions={
          <>
            <button
              className="btn btn--ghost"
              onClick={() => router.push(`${base}/edit`)}
            >
              Editar escalão
            </button>
            <button className="btn btn--primary" onClick={() => router.push(`${base}/matches/new`)}>
              Novo jogo
            </button>
          </>
        }
      />
      <Tabs items={abas} />
      <div className="tabbody">{children(dados)}</div>
    </>
  );
}
