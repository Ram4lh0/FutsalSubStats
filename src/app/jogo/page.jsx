'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import { Empty } from '@/components/bits.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { clubs, teams } from '@/lib/data/repository.js';
import { DATA_UPDATED_EVENT } from '@/lib/data/sync.js';
import { rotas } from '@/lib/routes.js';
import {
  isRecentSignup,
  markGuidedTutorialPrompted,
  startGuidedTutorial,
  wasGuidedTutorialPrompted,
} from '@/lib/tutorial.js';
import { useSyncStatus } from '@/lib/sync-status.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useT } from '@/lib/i18n/index.js';
import { souDonoDe } from '@/lib/useSouDono.js';

const MIN_POST_LOGIN_MS = 2500;

export default function JogoPage() {
  return (
    <Pagina>
      <JogoEntrada />
    </Pagina>
  );
}

function userIdentity(user) {
  return user?.id || user?.email || null;
}

function JogoEntrada() {
  const router = useRouter();
  const t = useT();
  const { remote, user } = useAuth();
  const { initialSyncReady } = useSyncStatus();
  const { confirmar } = useUI();
  const [estado, setEstado] = useState(null);
  const [tempoMinimo, setTempoMinimo] = useState(false);
  const promptAberto = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTempoMinimo(true), MIN_POST_LOGIN_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const carregar = useCallback(async () => {
    const listaClubes = await clubs.list();
    const escaloes = [];
    for (const club of listaClubes) {
      for (const team of await teams.listByClub(club.id)) escaloes.push({ club, team });
    }
    setEstado({ clubes: listaClubes, escaloes });
  }, []);

  useEffect(() => {
    carregar();
    window.addEventListener(DATA_UPDATED_EVENT, carregar);
    return () => window.removeEventListener(DATA_UPDATED_EVENT, carregar);
  }, [carregar]);

  useEffect(() => {
    if (!estado || !initialSyncReady || !tempoMinimo || promptAberto.current) return;

    const identity = userIdentity(user);
    const recente = isRecentSignup(identity, user?.created_at);
    const primeiro = estado.escaloes[0] || null;
    if (wasGuidedTutorialPrompted(identity)) {
      markGuidedTutorialPrompted(identity);
      if (primeiro) router.replace(rotas.jogos(primeiro.club.id, primeiro.team.id));
      return;
    }
    if (primeiro && !recente) {
      markGuidedTutorialPrompted(identity);
      router.replace(rotas.jogos(primeiro.club.id, primeiro.team.id));
      return;
    }
    if (!primeiro && !recente) return;

    promptAberto.current = true;
    (async () => {
      const querTutorial = await confirmar(
        recente ? t('tutorial.perguntaNovoTexto') : t('tutorial.perguntaExistenteTexto'),
        {
          title: t('tutorial.perguntaTitulo'),
          okLabel: t('tutorial.perguntaSim'),
          cancelLabel: t('tutorial.perguntaNao'),
          danger: false,
        }
      );
      markGuidedTutorialPrompted(identity);
      if (querTutorial) startGuidedTutorial(router);
      else if (primeiro) router.replace(rotas.jogos(primeiro.club.id, primeiro.team.id));
      else promptAberto.current = false;
    })();
  }, [confirmar, estado, initialSyncReady, router, t, tempoMinimo, user]);

  if (!tempoMinimo || !estado || (remote && !initialSyncReady) || estado.escaloes.length) {
    return <PostLoginLoading />;
  }

  const clubeDono = estado.clubes.find((club) => souDonoDe(club));

  return (
    <>
      <PageHead title={t('jogo.entradaTitulo')} />
      {!estado.clubes.length ? (
        <Empty
          action={
            <button
              className="btn btn--primary"
              data-tour="create-club"
              onClick={() => router.push(rotas.clubeNovo())}
            >
              {t('jogo.criarClube')}
            </button>
          }
        >
          {t('jogo.semClube')}
        </Empty>
      ) : clubeDono ? (
        <Empty
          action={
            <button className="btn btn--primary" onClick={() => router.push(rotas.escalaoNovo(clubeDono.id))}>
              {t('jogo.criarEscalao')}
            </button>
          }
        >
          {t('jogo.semEscalaoDono')}
        </Empty>
      ) : (
        <Empty>{t('jogo.semEscalaoAssociado')}</Empty>
      )}
    </>
  );
}

function PostLoginLoading() {
  const t = useT();
  return (
    <div className="postlogin" role="status" aria-live="polite">
      <div className="postlogin__mark" aria-hidden="true">
        <span className="postlogin__ball" />
        <span className="postlogin__line postlogin__line--one" />
        <span className="postlogin__line postlogin__line--two" />
      </div>
      <h1>{t('jogo.aPrepararTitulo')}</h1>
      <p>{t('jogo.aPrepararTexto')}</p>
    </div>
  );
}
