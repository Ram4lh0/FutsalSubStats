'use client';

// Os clipes partilhados por link — abre sem conta nem app.
//
// É a página que o jogador recebe no WhatsApp. Pede ao servidor a sessão
// daquele token (função `sessao_video_publica`, que só devolve os clipes
// dessa sessão e nada mais) e mostra-os um a um, com a nota do treinador.
// Só de leitura: não há nada para marcar nem para mudar.
//
// Não usa `Pagina` de propósito: o `Guard` lá dentro mandava para o login.
// Os links valem 30 dias, como os das jogadas.

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import LeitorVideo from '@/components/video/LeitorVideo.jsx';
import useLeitorDeClipes from '@/components/video/useLeitorDeClipes.js';
import { ControlosVideo, LegendaClipe, LinhaClipe, nClipes } from '@/components/video/pecas.jsx';
import { PARAM } from '@/lib/routes.js';
import { supabase } from '@/lib/supabase/client.js';
import { FONTE } from '@/domain/analiseVideo.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

export default function VideoPublicoPage() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A linha que o servidor manda, na forma dos clipes da app. */
function clipeDaResposta(r) {
  return {
    id: r.id,
    startMs: Number(r.start_ms) || 0,
    endMs: Number(r.end_ms) || 0,
    category: r.category || null,
    subtype: r.subtype || null,
    valence: r.valence || null,
    note: r.note || null,
    playerIds: [],
    analise: r.analysis_title || null,
    fonte:
      (r.provider || FONTE.YOUTUBE) === FONTE.YOUTUBE && r.youtube_id
        ? { tipo: FONTE.YOUTUBE, id: r.youtube_id }
        : null,
  };
}

function Conteudo() {
  const t = useT();
  const locale = useLocale();
  const share = useSearchParams().get(PARAM.share);
  const [res, setRes] = useState({ estado: 'A_CARREGAR' });

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!share || !TOKEN.test(share)) return setRes({ estado: 'NAO_EXISTE' });
      const sb = supabase();
      if (!sb) return setRes({ estado: 'ERRO' });
      const { data, error } = await sb.rpc('sessao_video_publica', { p_token: share });
      if (!vivo) return undefined;
      if (error || !data) return setRes({ estado: 'ERRO' });
      if (data.estado !== 'OK') return setRes({ estado: data.estado });
      return setRes({
        estado: 'OK',
        title: data.title,
        expiresAt: data.expires_at,
        clipes: (data.clips || []).map(clipeDaResposta).filter((c) => c.fonte),
      });
    })();
    return () => {
      vivo = false;
    };
  }, [share]);

  return (
    <div className="publica publica--video">
      <header className="publica__marca">Futsal SubStats</header>
      {res.estado === 'A_CARREGAR' ? <p className="muted">{t('comum.aCarregar')}</p> : null}
      {res.estado === 'OK' ? (
        res.clipes.length ? (
          <Clipes titulo={res.title} clipes={res.clipes} />
        ) : (
          <div className="card publica__aviso">
            <h1 className="publica__titulo">{res.title}</h1>
            <p>{t('video.publica.semClipes')}</p>
          </div>
        )
      ) : null}
      {res.estado === 'OK' ? (
        <p className="muted publica__validade">
          {t('tatica.publicaValidade', {
            data: new Date(res.expiresAt).toLocaleDateString(locale, { day: 'numeric', month: 'long' }),
          })}
        </p>
      ) : null}
      {['EXPIRADO', 'NAO_EXISTE', 'ERRO'].includes(res.estado) ? (
        <div className="card publica__aviso">
          <h1 className="publica__titulo">
            {res.estado === 'EXPIRADO' ? t('tatica.publicaExpirou') : t('video.publica.indisponivel')}
          </h1>
          <p>{res.estado === 'ERRO' ? t('tatica.publicaErro') : t('tatica.publicaPedeNovo')}</p>
        </div>
      ) : null}
    </div>
  );
}

function Clipes({ titulo, clipes }) {
  const t = useT();
  const leitor = useLeitorDeClipes({ fonteDoClipe: (c) => c.fonte });
  const [visto, setVisto] = useState(clipes[0]);
  const emFoco = leitor.ativo || visto;
  const indice = useMemo(() => clipes.findIndex((c) => c.id === emFoco.id), [clipes, emFoco]);

  function tocar(clipe) {
    setVisto(clipe);
    leitor.tocarFila(clipes, clipe);
  }

  return (
    <>
      <h1 className="publica__titulo">{titulo}</h1>
      <p className="muted publica__cat">{nClipes(t, clipes.length)}</p>
      <div className="vanalise__palco">
        <LeitorVideo
          fonte={clipes[0].fonte}
          inicioSeg={clipes[0].startMs / 1000}
          titulo={titulo}
          {...leitor.propsDoLeitor}
        />
        <ControlosVideo leitor={leitor} compacto />
      </div>
      <LegendaClipe clipe={emFoco} indice={indice} total={clipes.length} />
      <div className="vclipes publica__clipes">
        {clipes.map((c) => (
          <LinhaClipe
            key={c.id}
            clipe={c}
            ativo={emFoco.id === c.id}
            subtitulo={c.analise}
            onTocar={() => tocar(c)}
          />
        ))}
      </div>
    </>
  );
}
