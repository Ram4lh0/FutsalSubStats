'use client';

// A jogada partilhada por link — abre sem conta nem app.
//
// É a página que os jogadores recebem no WhatsApp. Pede ao servidor a jogada
// daquele token (função `jogada_publica`, que só devolve essa e nada mais) e
// mostra o mesmo leitor da app: play, frame a frame e as velocidades.
//
// Não usa `Pagina` de propósito: o `Guard` lá dentro mandava para o login.
// Os links valem 30 dias; passado isso o servidor responde "expirado" e a
// página pede para se pedir um link novo ao treinador.

import { Suspense, useEffect, useState } from 'react';
import LeitorJogada from '@/components/tatica/LeitorJogada.jsx';
import { useSearchParams } from 'next/navigation';
import { PARAM } from '@/lib/routes.js';
import { supabase } from '@/lib/supabase/client.js';
import { normalizar } from '@/domain/jogada.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

export default function JogadaPublicaPage() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Conteudo() {
  const t = useT();
  const locale = useLocale();
  // Lido à mão, e não com `useRouteParams`: esta página não usa `<Pagina>`
  // (que exige conta), por isso a fronteira de suspense é a de cima.
  const share = useSearchParams().get(PARAM.share);
  const [res, setRes] = useState({ estado: 'A_CARREGAR' });

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!share || !TOKEN.test(share)) return setRes({ estado: 'NAO_EXISTE' });
      const sb = supabase();
      if (!sb) return setRes({ estado: 'ERRO' });
      const { data, error } = await sb.rpc('jogada_publica', { p_token: share });
      if (!vivo) return;
      if (error || !data) return setRes({ estado: 'ERRO' });
      if (data.estado !== 'OK') return setRes({ estado: data.estado });
      setRes({ ...data, data: normalizar(data.data) });
    })();
    return () => {
      vivo = false;
    };
  }, [share]);

  return (
    <div className="publica">
      <header className="publica__marca">Futsal SubStats</header>
      {res.estado === 'A_CARREGAR' ? <p className="muted">{t('comum.aCarregar')}</p> : null}
      {res.estado === 'OK' ? (
        <>
          <h1 className="publica__titulo">{res.title}</h1>
          <p className="muted publica__cat">{t(`tatica.categoria.${res.category}`)}</p>
          <div className="card teditor">
            <LeitorJogada data={res.data} autoplay titulo={res.title} />
          </div>
          {res.description ? <p className="tdesc">{res.description}</p> : null}
          <p className="muted publica__validade">
            {t('tatica.publicaValidade', {
              data: new Date(res.expires_at).toLocaleDateString(locale, { day: 'numeric', month: 'long' }),
            })}
          </p>
        </>
      ) : null}
      {['EXPIRADO', 'NAO_EXISTE', 'ERRO'].includes(res.estado) ? (
        <div className="card publica__aviso">
          <h1 className="publica__titulo">
            {res.estado === 'EXPIRADO' ? t('tatica.publicaExpirou') : t('tatica.publicaIndisponivel')}
          </h1>
          <p>{res.estado === 'ERRO' ? t('tatica.publicaErro') : t('tatica.publicaPedeNovo')}</p>
        </div>
      ) : null}
    </div>
  );
}
