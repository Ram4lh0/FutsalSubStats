'use client';

// components/ClubShell.jsx — cabeçalho e abas do clube (secção 4.4).
//
// Carrega o clube e o histórico de jogos uma só vez e entrega-os à aba, para
// que trocar de separador não obrigue a recalcular tudo outra vez.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Guard from './Guard.jsx';
import PageHead from './PageHead.jsx';
import { Tabs, Empty } from './bits.jsx';
import { clubs, loadClubMatchStates, players } from '@/lib/data/repository.js';
import { DATA_UPDATED_EVENT } from '@/lib/data/sync.js';

export default function ClubShell({ clubId, children }) {
  return (
    <Guard>
      <Shell clubId={clubId}>{children}</Shell>
    </Guard>
  );
}

function Shell({ clubId, children }) {
  const router = useRouter();
  const [dados, setDados] = useState(null);

  const carregar = useCallback(async () => {
    const club = await clubs.get(clubId);
    if (!club) return setDados({ club: null });
    const [entries, roster] = await Promise.all([
      loadClubMatchStates(clubId),
      players.listByClub(clubId),
    ]);
    setDados({ club, entries, roster });
  }, [clubId]);

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
  if (!dados.club) return <Empty>Clube não encontrado.</Empty>;

  const { club } = dados;
  const abas = [
    { label: 'Resumo', to: `/clubs/${clubId}` },
    { label: 'Plantel', to: `/clubs/${clubId}/roster` },
    { label: 'Jogos', to: `/clubs/${clubId}/matches` },
    { label: 'Estatísticas', to: `/clubs/${clubId}/statistics` },
    { label: 'Definições', to: `/clubs/${clubId}/settings` },
  ];

  return (
    <>
      <PageHead
        title={club.name}
        subtitle={club.currentSeason ? `Época ${club.currentSeason}` : null}
        backTo="/dashboard"
        actions={
          <button
            className="btn btn--primary"
            onClick={() => router.push(`/clubs/${clubId}/matches/new`)}
          >
            Novo jogo
          </button>
        }
      />
      <Tabs items={abas} />
      <div className="tabbody">{children(dados)}</div>
    </>
  );
}
