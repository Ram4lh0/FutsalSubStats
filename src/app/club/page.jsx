'use client';

// Visão geral do clube: os seus escalões.
//
// O clube não tem estatísticas próprias — juntar um Sub-15 com os séniores não
// diz nada a ninguém. O que se vê aqui é a porta de entrada de cada escalão,
// com o pouco que ajuda a escolher: quantos jogadores, quantos jogos, como
// correu o último.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import PageHead from '@/components/PageHead.jsx';
import { Empty } from '@/components/bits.jsx';
import { clubs, teams, players, loadTeamMatchStates } from '@/lib/data/repository.js';
import { DATA_UPDATED_EVENT } from '@/lib/data/sync.js';
import { matchResult } from '@/domain/stats.js';
import { MATCH_STATUS, MATCH_TIMING_SHORT, timingOf } from '@/domain/constants.js';
import { dayLabel } from '@/lib/format.js';
import { rotas } from '@/lib/routes.js';
import useSoLeitura from '@/lib/useSoLeitura.js';

export default function ClubPage() {
  return (
    <Pagina>
      <Escaloes />
    </Pagina>
  );
}

function Escaloes() {
  const { clubId } = useRouteParams();
  const router = useRouter();
  const [dados, setDados] = useState(null);
  const soLeitura = useSoLeitura();

  const carregar = useCallback(async () => {
    const club = await clubs.get(clubId);
    if (!club) return setDados({ club: null });
    const lista = await teams.listByClub(clubId);
    const cartoes = [];
    for (const team of lista) {
      const [plantel, entries] = await Promise.all([
        players.listByTeam(team.id),
        loadTeamMatchStates(team.id),
      ]);
      const terminados = entries.filter((e) => e.state.status === MATCH_STATUS.FINISHED);
      cartoes.push({
        team,
        ativos: plantel.filter((p) => p.isActive).length,
        jogos: entries.length,
        ultimo: terminados[0] || null,
      });
    }
    setDados({ club, cartoes });
  }, [clubId]);

  useEffect(() => {
    carregar();
    const aoAtualizar = () => carregar();
    window.addEventListener(DATA_UPDATED_EVENT, aoAtualizar);
    return () => window.removeEventListener(DATA_UPDATED_EVENT, aoAtualizar);
  }, [carregar]);

  if (!dados) return <p className="muted">A carregar…</p>;
  if (!dados.club) return <Empty>Clube não encontrado.</Empty>;

  const { club, cartoes } = dados;

  return (
    <>
      <PageHead
        title={club.name}
        subtitle={club.currentSeason ? `Época ${club.currentSeason}` : 'Escalões deste clube'}
        backTo={rotas.dashboard()}
        actions={
          soLeitura ? null : (
            <>
              <button
                className="btn btn--ghost"
                onClick={() => router.push(rotas.clubeEditar(clubId))}
              >
                Editar clube
              </button>
              <button
                className="btn btn--primary"
                onClick={() => router.push(rotas.escalaoNovo(clubId))}
              >
                Criar escalão
              </button>
            </>
          )
        }
      />

      {!cartoes.length ? (
        <Empty
          action={
            <button
              className="btn btn--primary"
              onClick={() => router.push(rotas.escalaoNovo(clubId))}
            >
              Criar o primeiro escalão
            </button>
          }
        >
          Este clube ainda não tem escalões. É no escalão que vivem o plantel, os jogos e as
          estatísticas.
        </Empty>
      ) : (
        <div className="grid grid--cards">
          {cartoes.map(({ team, ativos, jogos, ultimo }) => (
            <article
              key={team.id}
              className="card club-card"
              style={{ borderTopColor: club.primaryColor || '#22c55e' }}
            >
              {soLeitura ? null : (
                <button
                  className="card__edit"
                  title="Editar escalão"
                  aria-label={`Editar ${team.name}`}
                  onClick={() => router.push(rotas.escalaoEditar(clubId, team.id))}
                >
                  Editar
                </button>
              )}
              <header className="club-card__head">
                <div
                  className="club-card__crest"
                  style={{ background: club.primaryColor || '#22c55e' }}
                >
                  {iniciais(team.shortName || team.name)}
                </div>
                <div>
                  <h2>{team.name}</h2>
                  <p className="muted">{MATCH_TIMING_SHORT[timingOf(team)]}</p>
                </div>
              </header>
              <dl className="club-card__stats">
                <div>
                  <dt>Jogadores ativos</dt>
                  <dd>{ativos}</dd>
                </div>
                <div>
                  <dt>Jogos registados</dt>
                  <dd>{jogos}</dd>
                </div>
                <div>
                  <dt>Último jogo</dt>
                  <dd className="small">{ultimoLabel(ultimo)}</dd>
                </div>
              </dl>
              <div className="club-card__actions">
                <button
                  className="btn btn--ghost"
                  onClick={() => router.push(rotas.plantel(clubId, team.id))}
                >
                  Plantel
                </button>
                <button
                  className="btn btn--primary"
                  onClick={() => router.push(rotas.escalao(clubId, team.id))}
                >
                  Abrir escalão
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function ultimoLabel(ultimo) {
  if (!ultimo) return 'Sem jogos registados';
  const r = matchResult(ultimo.state);
  const palavra = r === 'W' ? 'Vitória' : r === 'L' ? 'Derrota' : 'Empate';
  return `${palavra} ${ultimo.state.teamScore}–${ultimo.state.opponentScore} · ${dayLabel(ultimo.match.scheduledAt)}`;
}

function iniciais(nome) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}
