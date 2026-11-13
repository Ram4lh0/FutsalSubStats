'use client';

// components/video/LeitorVideo.jsx — o leitor, seja qual for a fonte.
//
// Os ecrãs (análise, sessão, jogador, link público) só conhecem este
// componente e o seu contrato:
//
//   props   fonte = { tipo: 'youtube', id }   (ver `fonteDaAnalise`)
//           inicioSeg, onPronto, onEstado, onTempo(seg), onErro(codigo)
//   ref     tocar() pausar() aTocar() tempo() duracao()
//           irPara(seg, { tocar }) velocidade(v) abrir(fonte, seg, { tocar })
//
// Hoje a única fonte é o YouTube. Uma fonte nova é um componente novo com o
// mesmo contrato e uma linha aqui — os clipes e as sessões não mudam, porque
// só guardam tempos.
//
// Quando o vídeo não pode ser incorporado (privado, incorporação desligada,
// ou a WebView nativa a recusar a origem), mostra a frase certa e o plano B:
// abrir no YouTube já no segundo onde se estava.

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import LeitorYouTube from './LeitorYouTube.jsx';
import { FONTE, linkYouTubeNoSegundo } from '@/domain/analiseVideo.js';
import { abrirFora } from '@/lib/partilha.js';
import { useT } from '@/lib/i18n/index.js';

const LeitorVideo = forwardRef(function LeitorVideo(
  { fonte, inicioSeg = 0, titulo, onPronto, onEstado, onTempo, onErro, className = '' },
  ref
) {
  const t = useT();
  const interno = useRef(null);
  const ultimoTempo = useRef(inicioSeg || 0);
  const fonteAtual = useRef(fonte);
  const [erro, setErro] = useState(null);

  useImperativeHandle(
    ref,
    () => ({
      pronto: () => Boolean(interno.current?.pronto()),
      tocar: () => interno.current?.tocar(),
      pausar: () => interno.current?.pausar(),
      aTocar: () => Boolean(interno.current?.aTocar()),
      tempo: () => interno.current?.tempo() ?? ultimoTempo.current,
      duracao: () => interno.current?.duracao() ?? 0,
      irPara: (seg, opcoes) => interno.current?.irPara(seg, opcoes),
      velocidade: (v) => interno.current?.velocidade(v),
      abrir(novaFonte, seg, opcoes) {
        const alvo = novaFonte || fonteAtual.current;
        if (!alvo || alvo.tipo !== fonteAtual.current?.tipo) return;
        fonteAtual.current = alvo;
        setErro(null);
        interno.current?.abrir(alvo.id, seg, opcoes);
      },
    }),
    []
  );

  if (!fonte || fonte.tipo !== FONTE.YOUTUBE) {
    return (
      <div className={`vleitor vleitor--aviso ${className}`}>
        <p>{t('video.erro.fonte')}</p>
      </div>
    );
  }

  const abrirNoYouTube = () =>
    abrirFora(linkYouTubeNoSegundo(fonteAtual.current?.id || fonte.id, ultimoTempo.current));

  return (
    <div className={`vleitor ${className}`}>
      <LeitorYouTube
        ref={interno}
        id={fonte.id}
        inicioSeg={inicioSeg}
        titulo={titulo}
        onPronto={onPronto}
        onEstado={onEstado}
        onTempo={(seg) => {
          ultimoTempo.current = seg;
          onTempo?.(seg);
        }}
        onErro={(codigo) => {
          setErro(codigo);
          onErro?.(codigo);
        }}
      />
      {erro ? (
        <div className="vleitor__erro" role="alert">
          <strong>{t(`video.erro.${erro}`)}</strong>
          {erro === 'privado' || erro === 'incorporacao' ? <p>{t('video.erro.comoResolver')}</p> : null}
          {erro === 'origem' ? <p>{t('video.erro.origemExplica')}</p> : null}
          <div className="vleitor__erroacoes">
            {erro !== 'invalido' ? (
              <button type="button" className="btn btn--primary btn--tiny" onClick={abrirNoYouTube}>
                {t('video.abrirNoYouTube')}
              </button>
            ) : null}
            <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setErro(null)}>
              {t('comum.fechar')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default LeitorVideo;
