'use client';

// components/video/Apresentacao.jsx — o modo apresentação de uma sessão.
//
// Ecrã cheio, clipe a clipe: por cima do vídeo o título, os jogadores e a
// nota; por baixo, anterior / repetir / seguinte. Cada clipe toca do início
// ao fim e pára, à espera de quem está a conduzir a conversa.
//
// Teclado: ←/→ mudam de clipe, espaço toca/pára, R repete, Esc sai.

import { useCallback, useEffect, useRef, useState } from 'react';
import LeitorVideo from './LeitorVideo.jsx';
import useLeitorDeClipes from './useLeitorDeClipes.js';
import { ControlosVideo, LegendaClipe } from './pecas.jsx';
import { useT } from '@/lib/i18n/index.js';

/**
 * @param {{clipes: object[], fonteDoClipe: (c: object) => object, tituloDoClipe?: (c: object) => string,
 *   jogadores?: Map, fotos?: Map, titulo: string, inicio?: number, onFechar: () => void}} props
 */
export default function Apresentacao({
  clipes,
  fonteDoClipe,
  jogadores,
  fotos,
  titulo,
  inicio = 0,
  onFechar,
}) {
  const t = useT();
  const caixa = useRef(null);
  const [indice, setIndice] = useState(Math.min(inicio, Math.max(0, clipes.length - 1)));
  const leitor = useLeitorDeClipes({ fonteDoClipe });
  const clipe = clipes[indice] || null;
  const arrancou = useRef(false);

  const mostrar = useCallback(
    (i) => {
      if (i < 0 || i >= clipes.length) return;
      setIndice(i);
      leitor.tocarClipe(clipes[i]);
    },
    [clipes, leitor]
  );

  // Ecrã cheio a sério quando o browser deixa; senão, a caixa já tapa tudo.
  useEffect(() => {
    const el = caixa.current;
    try {
      el?.requestFullscreen?.()?.catch?.(() => {});
    } catch {
      /* iPhone: não há ecrã cheio para elementos que não sejam vídeo */
    }
    return () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {});
      } catch {
        /* já tinha saído */
      }
    };
  }, []);

  // O primeiro clipe arranca sozinho mal o leitor esteja pronto.
  useEffect(() => {
    if (!leitor.pronto || arrancou.current || !clipe) return;
    arrancou.current = true;
    leitor.tocarClipe(clipe);
  }, [leitor, leitor.pronto, clipe]);

  const acoes = useRef({});
  acoes.current = { mostrar, indice, leitor, clipe, onFechar };

  useEffect(() => {
    function aoTeclar(e) {
      const a = acoes.current;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        a.mostrar(a.indice + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        a.mostrar(a.indice - 1);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        a.leitor.alternar();
      } else if (e.key === 'r' || e.key === 'R') {
        if (a.clipe) a.leitor.tocarClipe(a.clipe);
      } else if (e.key === 'Escape') {
        a.onFechar();
      }
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  if (!clipe) return null;
  const fonte = fonteDoClipe(clipe);

  return (
    <div className="vapresenta" ref={caixa} role="dialog" aria-modal="true" aria-label={titulo}>
      <header className="vapresenta__topo">
        <LegendaClipe clipe={clipe} jogadores={jogadores} fotos={fotos} indice={indice} total={clipes.length} />
        <button
          type="button"
          className="btn btn--ghost btn--icon vapresenta__fechar"
          onClick={onFechar}
          aria-label={t('comum.fechar')}
        >
          ✕
        </button>
      </header>

      <div className="vapresenta__palco">
        {fonte ? (
          <LeitorVideo fonte={fonte} inicioSeg={clipe.startMs / 1000} titulo={titulo} {...leitor.propsDoLeitor} />
        ) : (
          <p className="muted">{t('video.erro.fonte')}</p>
        )}
      </div>

      <footer className="vapresenta__fundo">
        <button
          type="button"
          className="btn btn--ghost vapresenta__seta"
          onClick={() => mostrar(indice - 1)}
          disabled={indice === 0}
        >
          ‹ {t('video.anterior')}
        </button>
        <ControlosVideo leitor={leitor} compacto>
          <button type="button" className="vbtn vbtn--texto" onClick={() => leitor.tocarClipe(clipe)}>
            ↺ {t('video.repetir')}
          </button>
        </ControlosVideo>
        <button
          type="button"
          className="btn btn--primary vapresenta__seta"
          onClick={() => mostrar(indice + 1)}
          disabled={indice >= clipes.length - 1}
        >
          {t('video.seguinte')} ›
        </button>
      </footer>
    </div>
  );
}
