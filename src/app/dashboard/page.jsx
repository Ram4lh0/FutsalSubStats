'use client';

// app/dashboard/page.jsx — /dashboard (secção 4.2)

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Guard from '@/components/Guard.jsx';
import PageHead from '@/components/PageHead.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import * as sync from '@/lib/data/sync.js';
import {
  clubs,
  players,
  loadClubMatchStates,
  findLiveMatch,
  dump,
  restore,
} from '@/lib/data/repository.js';
import { downloadJson, pickFile } from '@/lib/data/exporter.js';
import { matchResult } from '@/domain/stats.js';
import { MATCH_STATUS } from '@/domain/constants.js';
import { dayLabel } from '@/lib/format.js';

export default function DashboardPage() {
  return (
    <Guard>
      <Dashboard />
    </Guard>
  );
}

function Dashboard() {
  const router = useRouter();
  const { toast, confirmar } = useUI();
  const { userId, user } = useAuth();
  const [cartoes, setCartoes] = useState(null);
  const [live, setLive] = useState(null);

  const carregar = useCallback(async () => {
    const lista = await clubs.list();
    setLive(await findLiveMatch());
    const out = [];
    for (const club of lista) {
      const plantel = await players.listByClub(club.id);
      const entries = await loadClubMatchStates(club.id);
      const terminados = entries.filter((e) => e.state.status === MATCH_STATUS.FINISHED);
      out.push({
        club,
        ativos: plantel.filter((p) => p.isActive).length,
        jogos: entries.length,
        ultimo: terminados[0] || null,
      });
    }
    setCartoes(out);
  }, []);

  useEffect(() => {
    carregar();
    window.addEventListener(sync.DATA_UPDATED_EVENT, carregar);
    return () => window.removeEventListener(sync.DATA_UPDATED_EVENT, carregar);
  }, [carregar]);

  async function backup() {
    downloadJson(`backup-futsal-${new Date().toISOString().slice(0, 10)}.json`, await dump());
    toast('Backup transferido.', 'ok');
  }

  async function restaurar() {
    const raw = await pickFile('application/json');
    if (!raw) return;
    const ok = await confirmar(
      'Restaurar substitui todos os dados existentes neste dispositivo. Continuar?',
      { okLabel: 'Restaurar' }
    );
    if (!ok) return;
    try {
      await restore(JSON.parse(raw));
      carregar();
      await sync.pendingCount();
      const enviados = await sync.flush(userId, user?.email);
      toast(
        enviados
          ? 'Dados restaurados e sincronizados.'
          : 'Dados restaurados. A sincronização continua em segundo plano.',
        'ok'
      );
    } catch (e) {
      toast(`Falha ao restaurar: ${e.message}`, 'error');
    }
  }

  return (
    <>
      <PageHead
        title="Os meus clubes"
        subtitle="Escolha um clube para gerir o plantel e os jogos."
        actions={
          <>
            <button className="btn btn--ghost" onClick={backup}>
              Backup
            </button>
            <button className="btn btn--ghost" onClick={restaurar}>
              Restaurar
            </button>
            <button className="btn btn--primary" onClick={() => router.push('/clubs/new')}>
              Criar clube
            </button>
          </>
        }
      />

      {live ? (
        <div className="banner banner--live">
          <div>
            <strong>Existe um jogo em curso</strong>
            <p>vs {live.opponentName}</p>
          </div>
          <button
            className="btn btn--primary"
            onClick={() => router.push(`/matches/${live.id}/live`)}
          >
            Retomar jogo
          </button>
        </div>
      ) : null}

      {cartoes === null ? (
        <p className="muted">A carregar…</p>
      ) : !cartoes.length ? (
        <div className="empty">
          <p>Ainda não existe nenhum clube.</p>
          <button className="btn btn--primary" onClick={() => router.push('/clubs/new')}>
            Criar o primeiro clube
          </button>
        </div>
      ) : (
        <div className="grid grid--cards">
          {cartoes.map(({ club, ativos, jogos, ultimo }) => (
            <article
              key={club.id}
              className="card club-card"
              style={{ borderTopColor: club.primaryColor || '#22c55e' }}
            >
              <header className="club-card__head">
                <div
                  className="club-card__crest"
                  style={{ background: club.primaryColor || '#22c55e' }}
                >
                  {iniciais(club.name)}
                </div>
                <div>
                  <h2>{club.name}</h2>
                  {club.currentSeason ? <p className="muted">{club.currentSeason}</p> : null}
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
                  onClick={() => router.push(`/clubs/${club.id}/roster`)}
                >
                  Plantel
                </button>
                <button className="btn btn--primary" onClick={() => router.push(`/clubs/${club.id}`)}>
                  Abrir clube
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
