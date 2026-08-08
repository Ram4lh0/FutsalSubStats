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
  teams,
  loadClubMatchStates,
  findLiveMatch,
  dump,
  restore,
} from '@/lib/data/repository.js';
import { downloadJson, pickFile } from '@/lib/data/exporter.js';
import { matchResult } from '@/domain/stats.js';
import { MATCH_STATUS } from '@/domain/constants.js';
import { dayLabel } from '@/lib/format.js';
import { rotas } from '@/lib/routes.js';

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
      const escaloes = await teams.listByClub(club.id);
      const terminados = entries.filter((e) => e.state.status === MATCH_STATUS.FINISHED);
      out.push({
        club,
        escaloes: escaloes.length,
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

  /**
   * Deitar fora o que está guardado no browser e voltar a descarregar do
   * servidor. Serve para sobras de versões antigas da app — linhas com uma forma
   * que o servidor já não aceita e que fazem a sincronização falhar sempre no
   * mesmo sítio.
   */
  async function limparDispositivo() {
    const porEnviar = await sync.pendingCount();
    const ok = await confirmar(
      porEnviar
        ? `Há ${porEnviar} ${porEnviar === 1 ? 'alteração' : 'alterações'} por enviar. Limpar este dispositivo deita-as fora e volta a descarregar tudo o que está no servidor. O que já foi sincronizado não se perde.`
        : 'Apaga tudo o que está guardado neste browser e volta a descarregar do servidor. O que já foi sincronizado não se perde — nem é tocado nos outros dispositivos.',
      { okLabel: 'Limpar este dispositivo' }
    );
    if (!ok) return;
    try {
      await sync.resetLocal(userId);
      await carregar();
      toast('Dispositivo limpo e dados descarregados de novo.', 'ok');
    } catch (e) {
      toast(`Falha a descarregar: ${e.message}`, 'error');
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
            <button className="btn btn--ghost" onClick={limparDispositivo}>
              Limpar este dispositivo
            </button>
            <button className="btn btn--primary" onClick={() => router.push(rotas.clubeNovo())}>
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
            onClick={() => router.push(rotas.jogoAoVivo(live.id))}
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
          <button className="btn btn--primary" onClick={() => router.push(rotas.clubeNovo())}>
            Criar o primeiro clube
          </button>
        </div>
      ) : (
        <div className="grid grid--cards">
          {cartoes.map(({ club, escaloes, ativos, jogos, ultimo }) => (
            <article
              key={club.id}
              className="card club-card"
              style={{ borderTopColor: club.primaryColor || '#22c55e' }}
            >
              <button
                className="card__edit"
                title="Editar clube"
                aria-label={`Editar ${club.name}`}
                onClick={() => router.push(rotas.clubeEditar(club.id))}
              >
                Editar
              </button>
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
                  <dt>Escalões</dt>
                  <dd>{escaloes}</dd>
                </div>
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
                <button className="btn btn--primary" onClick={() => router.push(rotas.clube(club.id))}>
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
