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
import { iniciarDemo } from '@/lib/demo.js';

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
  const { confirmar, toast } = useUI();
  const [estado, setEstado] = useState(null);
  const [tempoMinimo, setTempoMinimo] = useState(false);
  const [aMontar, setAMontar] = useState(false);
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
    return <PostLoginLoading clube={clubeComFoto(estado?.clubes)} />;
  }

  const clubeDono = estado.clubes.find((club) => souDonoDe(club));

  /**
   * O jogo de experiência, já no intervalo, com a 1.ª parte jogada. Fica aqui,
   * e não no ecrã de entrada, por decisão do António: quem experimenta já tem
   * conta, e o botão está à vista até a conta ter a sua equipa (com um escalão,
   * este ecrã deixa de aparecer). Corre com a sincronização parada e sai por
   * identificador no fim, por isso não mexe em nada da conta.
   */
  async function experimentar() {
    if (aMontar) return;
    setAMontar(true);
    try {
      const { matchId } = await iniciarDemo({ noIntervalo: true, conta: user?.id || 'local' });
      router.push(rotas.jogoAoVivo(matchId));
    } catch (e) {
      setAMontar(false);
      toast(t('login.demoFalhou', { erro: e.message }), 'error');
    }
  }

  const demo = (
    <div className="jogo-demo">
      <button className="btn btn--block btn--demo" type="button" onClick={experimentar} disabled={aMontar}>
        {aMontar ? t('login.aPreparar') : t('login.experimentar')}
      </button>
      <span className="field__hint">{t('login.experimentarDica')}</span>
    </div>
  );

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
      {demo}
    </>
  );
}

/**
 * O clube cujo emblema se mostra enquanto a app se prepara: o da conta
 * primeiro; quem é convidado vê o do clube onde treina. Sem foto, nenhum.
 */
function clubeComFoto(clubes) {
  const comFoto = (clubes || []).filter((c) => c.logoUrl);
  return comFoto.find((c) => souDonoDe(c)) || comFoto[0] || null;
}

/**
 * O ecrã de arranque. Quando o clube tem foto, é o emblema que aparece no lugar
 * da bola — pedido em feedback: o clube que pôs foto quer vê-la ao abrir a app.
 * Antes era um aviso à parte, por cima deste ecrã, e os dois faziam o mesmo
 * papel ao mesmo tempo.
 *
 * A foto vem da base local, por isso está cá logo ao arrancar e mesmo sem rede.
 * Logo a seguir a entrar numa conta pode ainda não ter descido do servidor:
 * aparece a bola, e o emblema entra quando os dados chegarem.
 */
function PostLoginLoading({ clube }) {
  const t = useT();
  return (
    <div className="postlogin" role="status" aria-live="polite">
      {clube ? (
        <img className="postlogin__emblema" src={clube.logoUrl} alt={clube.name} />
      ) : (
        <div className="postlogin__mark" aria-hidden="true">
          <span className="postlogin__ball" />
          <span className="postlogin__line postlogin__line--one" />
          <span className="postlogin__line postlogin__line--two" />
        </div>
      )}
      <h1>{t('jogo.aPrepararTitulo')}</h1>
      <p>{t('jogo.aPrepararTexto')}</p>
    </div>
  );
}
