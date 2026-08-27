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
  markGuidedTutorialPrompted,
  startGuidedTutorial,
  wasGuidedTutorialPrompted,
} from '@/lib/tutorial.js';
import { useUI } from '@/lib/ui.jsx';
import { useT } from '@/lib/i18n/index.js';
import { souDonoDe } from '@/lib/useSouDono.js';

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
  const { user } = useAuth();
  const { confirmar } = useUI();
  const [estado, setEstado] = useState(null);
  const promptAberto = useRef(false);

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
    if (!estado || !estado.escaloes.length || promptAberto.current) return;

    const primeiro = estado.escaloes[0];
    const identity = userIdentity(user);
    if (wasGuidedTutorialPrompted(identity)) {
      markGuidedTutorialPrompted(identity);
      router.replace(rotas.jogos(primeiro.club.id, primeiro.team.id));
      return;
    }

    promptAberto.current = true;
    (async () => {
      const querTutorial = await confirmar(t('tutorial.perguntaExistenteTexto'), {
        title: t('tutorial.perguntaTitulo'),
        okLabel: t('tutorial.perguntaSim'),
        cancelLabel: t('tutorial.perguntaNao'),
        danger: false,
      });
      markGuidedTutorialPrompted(identity);
      if (querTutorial) startGuidedTutorial(router);
      else router.replace(rotas.jogos(primeiro.club.id, primeiro.team.id));
    })();
  }, [confirmar, estado, router, t, user]);

  if (!estado || estado.escaloes.length) {
    return <PageHead title={t('jogo.entradaTitulo')} subtitle={t('comum.aCarregar')} />;
  }

  const clubeDono = estado.clubes.find((club) => souDonoDe(club));

  return (
    <>
      <PageHead title={t('jogo.entradaTitulo')} />
      {!estado.clubes.length ? (
        <Empty
          action={
            <button className="btn btn--primary" onClick={() => router.push(rotas.clubeNovo())}>
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
