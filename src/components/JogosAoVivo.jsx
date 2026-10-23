'use client';

// components/JogosAoVivo.jsx — a secção "Jogos ao vivo" da aba Jogos.
//
// Os jogos que outro treinador está a registar, com "Assistir ao vivo" ligado,
// nos escalões a que esta conta tem acesso (add-on 'ao-vivo'). Só aparece se
// houver algum. Sem o add-on em nenhum escalão não desenha nada nem pergunta
// nada ao servidor.
//
// Volta a perguntar quando se entra na aba, quando a app volta ao primeiro
// plano e quando a rede regressa. Sem temporizador: o ecrã do jogo é que fica
// ligado em direto, a lista não precisa.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { jogosAoVivo } from '@/lib/aoVivo.js';
import { rotas } from '@/lib/routes.js';
import { clubShort, opponentShort } from '@/lib/format.js';
import { useT } from '@/lib/i18n/index.js';
import { MATCH_STATUS } from '@/domain/constants.js';

export default function JogosAoVivo() {
  const t = useT();
  const router = useRouter();
  const { userId } = useAuth();
  const [jogos, setJogos] = useState([]);

  useEffect(() => {
    let vivo = true;
    let aCorrer = false;
    const carregar = async () => {
      if (aCorrer) return;
      aCorrer = true;
      try {
        const lista = await jogosAoVivo(userId);
        if (vivo) setJogos(lista);
      } catch {
        /* fica a lista que já estava */
      } finally {
        aCorrer = false;
      }
    };
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'visible') carregar();
    };
    carregar();
    window.addEventListener('focus', carregar);
    window.addEventListener('online', carregar);
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      vivo = false;
      window.removeEventListener('focus', carregar);
      window.removeEventListener('online', carregar);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, [userId]);

  if (!jogos.length) return null;

  return (
    <section className="aovivo-lista" aria-label={t('aoVivo.listaTitulo')}>
      <h2 className="section">
        <span className="aovivo-ponto" aria-hidden="true" /> {t('aoVivo.listaTitulo')}
      </h2>
      <ul className="aovivo-lista__itens">
        {jogos.map(({ match, team, club }) => (
          <li key={match.id}>
            <button
              type="button"
              className="card aovivo-item"
              onClick={() => router.push(rotas.jogoAssistir(match.id))}
            >
              <span className="aovivo-item__quem">
                <strong>
                  {clubShort(club)} {match.teamScore ?? 0} – {match.opponentScore ?? 0}{' '}
                  {opponentShort(match)}
                </strong>
                <span className="muted">{team?.name}</span>
              </span>
              <span className="aovivo-item__estado">{rotuloDoEstado(t, match.status)}</span>
              <span className="aovivo-item__ir">{t('aoVivo.assistir')}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function rotuloDoEstado(t, status) {
  if (status === MATCH_STATUS.HALFTIME) return t('acao.intervaloTitulo');
  if (status === MATCH_STATUS.SECOND_HALF_RUNNING || status === MATCH_STATUS.SECOND_HALF_PAUSED) {
    return t('vivo.segundaParte');
  }
  return t('vivo.primeiraParte');
}
