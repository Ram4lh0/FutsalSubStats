'use client';

// app/dashboard/page.jsx — /dashboard (secção 4.2)

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Guard from '@/components/Guard.jsx';
import PageHead from '@/components/PageHead.jsx';
import Emblema from '@/components/Emblema.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import * as sync from '@/lib/data/sync.js';
import {
  clubs,
  players,
  teams,
  loadClubMatchStates,
  findLiveMatch,
} from '@/lib/data/repository.js';
import { matchResult } from '@/domain/stats.js';
import { MATCH_STATUS } from '@/domain/constants.js';
import { ultimoJogoLabel } from '@/lib/format.js';
import { rotas } from '@/lib/routes.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import { souDonoDe } from '@/lib/useSouDono.js';
import { useT } from '@/lib/i18n/index.js';

export default function DashboardPage() {
  return (
    <Guard>
      <Dashboard />
    </Guard>
  );
}

function Dashboard() {
  const router = useRouter();
  const t = useT();
  const { toast, confirmar } = useUI();
  const { userId, user } = useAuth();
  const [cartoes, setCartoes] = useState(null);
  const [live, setLive] = useState(null);
  const soLeitura = useSoLeitura();

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
        ? t('painel.confirmaLimparComPendentes', {
            n: porEnviar,
            alteracoes:
              porEnviar === 1 ? t('painel.alteracao') : t('painel.alteracoes'),
          })
        : t('painel.confirmaLimpar'),
      { okLabel: t('painel.limparDispositivo') }
    );
    if (!ok) return;
    try {
      await sync.resetLocal(userId);
      await carregar();
      toast(t('painel.limpo'), 'ok');
    } catch (e) {
      toast(t('painel.limparFalhou', { erro: e.message }), 'error');
    }
  }

  return (
    <>
      <PageHead
        title={t('painel.titulo')}
        subtitle={t('painel.subtitulo')}
        actions={
          soLeitura ? null : (
            <>
              {/* O backup e o restauro passaram para as Definições, e o plantel
                  passou a importar-se dentro de cada escalão. Aqui em cima não
                  havia forma de dizer para que escalão iam os jogadores. */}
              <button className="btn btn--ghost" onClick={limparDispositivo}>
                {t('painel.limparDispositivo')}
              </button>
              {/* Não há botão de criar clube aqui em cima, e é de propósito:
                  uma conta tem um clube. Criar só faz sentido quando ainda não
                  existe nenhum, e para esse caso há o botão do estado vazio,
                  mesmo por baixo. Um botão permanente prometia uma coisa que a
                  app recusa a seguir. */}
            </>
          )
        }
      />

      {live ? (
        <div className="banner banner--live">
          <div>
            <strong>{t('painel.jogoEmCurso')}</strong>
            <p>vs {live.opponentName}</p>
          </div>
          <button
            className="btn btn--primary"
            onClick={() => router.push(rotas.jogoAoVivo(live.id))}
          >
            {t('painel.retomar')}
          </button>
        </div>
      ) : null}

      {cartoes === null ? (
        <p className="muted">{t('comum.aCarregar')}</p>
      ) : !cartoes.length ? (
        <div className="empty">
          <p>{t('painel.semClubes')}</p>
          <button className="btn btn--primary" onClick={() => router.push(rotas.clubeNovo())}>
            {t('painel.primeiroClube')}
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
              {/* O lápis do cartão do clube só a quem é dono dele. Um treinador
                  associado vê o clube na lista — é o clube onde trabalha — mas
                  não muda o nome, as cores nem a época a ninguém. */}
              {soLeitura || !souDonoDe(club) ? null : (
                <button
                  className="card__edit"
                  title={t('clube.editarTitulo')}
                  aria-label={t('clube.editarNome', { nome: club.name })}
                  onClick={() => router.push(rotas.clubeEditar(club.id))}
                >
                  {t('comum.editar')}
                </button>
              )}
              <header className="club-card__head">
                <Emblema nome={club.name} foto={club.logoUrl} cor={club.primaryColor} />
                <div>
                  <h2>{club.name}</h2>
                  {club.currentSeason ? <p className="muted">{club.currentSeason}</p> : null}
                </div>
              </header>
              <dl className="club-card__stats">
                <div>
                  <dt>{t('painel.escaloes')}</dt>
                  <dd>{escaloes}</dd>
                </div>
                <div>
                  <dt>{t('painel.jogadoresAtivos')}</dt>
                  <dd>{ativos}</dd>
                </div>
                <div>
                  <dt>{t('painel.jogosRegistados')}</dt>
                  <dd>{jogos}</dd>
                </div>
                <div>
                  <dt>{t('painel.ultimoJogo')}</dt>
                  <dd className="small">{ultimoJogoLabel(ultimo, ultimo && matchResult(ultimo.state))}</dd>
                </div>
              </dl>
              <div className="club-card__actions">
                <button className="btn btn--primary" onClick={() => router.push(rotas.clube(club.id))}>
                  {t('painel.abrirClube')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
