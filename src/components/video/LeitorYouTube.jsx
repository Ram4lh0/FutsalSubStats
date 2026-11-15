'use client';

// components/video/LeitorYouTube.jsx — o leitor do YouTube (IFrame Player API).
//
// É a única peça que sabe o que é o YouTube. Quem a usa fala com ela pelo
// contrato do `LeitorVideo` (tocar, pausar, irPara, tempo, …), para a fonte
// do vídeo poder mudar um dia sem tocar em clipes nem em sessões.
//
// Três cuidados:
//
//   · A API carrega UMA vez por página (`carregarApi`), por muitos leitores
//     que se abram.
//   · O `<iframe>` é escrito por nós, e não pela API, para levar
//     `referrerpolicy="strict-origin-when-cross-origin"` e o `origin` certo: é
//     a falta deles que dá os erros 152/153 dentro de uma WebView.
//   · O tempo só se pergunta (~4 Hz) enquanto o vídeo toca. Parado, não há
//     relógio nenhum a correr.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const HOST = 'https://www.youtube-nocookie.com';
const TIQUE_MS = 250;

let apiPromise = null;

/** Carrega a IFrame API uma vez. Rejeita sem rede, e deixa tentar outra vez. */
function carregarApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('sem-janela'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const anterior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof anterior === 'function') anterior();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      s.remove();
      reject(new Error('sem-rede'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/**
 * Os códigos do YouTube, nos nossos: o ecrã mostra uma frase por cada um.
 *   2 → link inválido · 5 → o browser não toca · 100 → privado ou apagado ·
 *   101/150 → incorporação desligada · 152/153 → falta de origem (WebView).
 */
function erroDoYouTube(codigo) {
  if (codigo === 'rede') return 'rede';
  const n = Number(codigo);
  if (n === 2) return 'invalido';
  if (n === 100) return 'privado';
  if (n === 101 || n === 150) return 'incorporacao';
  if (n === 152 || n === 153) return 'origem';
  return 'outro';
}

// ─── Modo ponte (app nativa) ─────────────────────────────────────────────────
//
// Dentro da app a página vive em `capacitor://localhost` (iOS) ou
// `https://localhost` (Android). O YouTube exige um Referer de um site a sério
// e recusa estes com o erro 152/153 ("erro de configuração do leitor"). Aí o
// vídeo é mostrado pela `public/yt-ponte.html`, servida pelo site da app, e
// falamos com ela por postMessage. O objeto `criarPonte` imita a parte do
// `YT.Player` que usamos, para o resto deste ficheiro não saber a diferença.

const URL_WEB = 'https://futsalsubstats.vercel.app';
// Os mesmos números do `YT.PlayerState`.
const ESTADOS = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

function eNativo() {
  if (typeof window === 'undefined') return false;
  const cap = window.Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function') return Boolean(cap.isNativePlatform());
  if (typeof cap.getPlatform === 'function') return cap.getPlatform() !== 'web';
  return Boolean(cap.isNative);
}

/** Na app usa-se sempre a ponte. No browser, só para testar (`fss.ytPonte` = '1'). */
function usarPonte() {
  if (eNativo()) return true;
  try {
    return window.localStorage.getItem('fss.ytPonte') === '1';
  } catch {
    return false;
  }
}

function baseDaPonte() {
  if (!eNativo() && /^https?:$/.test(window.location.protocol)) return window.location.origin;
  return URL_WEB;
}

function enderecoDaPonte(id, inicioSeg) {
  const q = new URLSearchParams({ v: id });
  if (inicioSeg > 0) q.set('start', String(Math.floor(inicioSeg)));
  return `${baseDaPonte()}/yt-ponte.html?${q.toString()}`;
}

function criarPonte(iframe, { onReady, onStateChange, onError }) {
  const origem = new URL(iframe.src).origin;
  const cache = { estado: ESTADOS.UNSTARTED, tempo: 0, duracao: 0 };
  const mandar = (cmd, extra = {}) => {
    try {
      iframe.contentWindow?.postMessage({ fss: 'yt', cmd, ...extra }, origem);
    } catch {
      /* o iframe já saiu */
    }
  };
  let pronto = false;
  const aoMensagem = (e) => {
    if (e.source !== iframe.contentWindow || e.origin !== origem) return;
    const m = e.data;
    if (!m || m.fss !== 'yt' || !m.ev) return;
    if (m.ev === 'erro') {
      onError?.({ data: m.codigo });
      return;
    }
    const estadoAntes = cache.estado;
    if (typeof m.tempo === 'number') cache.tempo = m.tempo;
    if (typeof m.duracao === 'number' && m.duracao > 0) cache.duracao = m.duracao;
    if (typeof m.estado === 'number') cache.estado = m.estado;
    if (m.ev === 'pronto') {
      if (!pronto) {
        pronto = true;
        onReady?.();
      }
    } else if (m.ev === 'estado' || cache.estado !== estadoAntes) {
      onStateChange?.({ data: cache.estado });
    }
  };
  const aoCarregar = () => mandar('ola');
  window.addEventListener('message', aoMensagem);
  iframe.addEventListener('load', aoCarregar);
  mandar('ola');

  return {
    playVideo: () => mandar('tocar'),
    pauseVideo: () => mandar('pausar'),
    seekTo: (seg) => {
      cache.tempo = Math.max(0, Number(seg) || 0);
      mandar('irPara', { seg: cache.tempo });
    },
    setPlaybackRate: (v) => mandar('velocidade', { v }),
    loadVideoById: ({ videoId, startSeconds = 0 }) => {
      cache.tempo = startSeconds;
      cache.duracao = 0;
      mandar('carregar', { id: videoId, seg: startSeconds });
    },
    cueVideoById: ({ videoId, startSeconds = 0 }) => {
      cache.tempo = startSeconds;
      cache.duracao = 0;
      mandar('preparar', { id: videoId, seg: startSeconds });
    },
    getCurrentTime: () => cache.tempo,
    getDuration: () => cache.duracao,
    getPlayerState: () => cache.estado,
    destroy: () => {
      window.removeEventListener('message', aoMensagem);
      iframe.removeEventListener('load', aoCarregar);
    },
  };
}

function enderecoDoEmbed(id, inicioSeg) {
  const q = new URLSearchParams({
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    iv_load_policy: '3',
  });
  // Dentro da app nativa a página vive em `capacitor://localhost` (iOS), que
  // o YouTube não aceita como origem: só se manda quando é http(s).
  if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
    q.set('origin', window.location.origin);
    q.set('widget_referrer', window.location.origin);
  }
  if (inicioSeg > 0) q.set('start', String(Math.floor(inicioSeg)));
  return `${HOST}/embed/${id}?${q.toString()}`;
}

const LeitorYouTube = forwardRef(function LeitorYouTube(
  { id, inicioSeg = 0, titulo, onPronto, onEstado, onTempo, onErro },
  ref
) {
  const iframeRef = useRef(null);
  const playerRef = useRef(null);
  const prontoRef = useRef(false);
  const idAtualRef = useRef(id);
  const relogioRef = useRef(null);
  // O endereço inicial fica fixo: mudar o `src` a cada desenho recarregava o
  // vídeo. Outro vídeo entra pelo `abrir()` (ou pela `key`, em quem monta).
  const [ponte] = useState(usarPonte);
  const [src] = useState(() => (ponte ? enderecoDaPonte(id, inicioSeg) : enderecoDoEmbed(id, inicioSeg)));
  const ouvintes = useRef({});
  ouvintes.current = { onPronto, onEstado, onTempo, onErro };

  useEffect(() => {
    let vivo = true;

    const pararRelogio = () => {
      if (relogioRef.current) clearInterval(relogioRef.current);
      relogioRef.current = null;
    };
    const tempo = () => {
      try {
        return Number(playerRef.current?.getCurrentTime?.()) || 0;
      } catch {
        return 0;
      }
    };
    const avisarTempo = () => ouvintes.current.onTempo?.(tempo());

    const comoPlayer = ponte ? Promise.resolve({ PlayerState: ESTADOS }) : carregarApi();
    comoPlayer
      .then((YT) => {
        if (!vivo || !iframeRef.current) return;
        const S = YT.PlayerState;
        const events = {
          onReady: () => {
            if (!vivo) return;
            prontoRef.current = true;
            ouvintes.current.onPronto?.();
          },
          onStateChange: (e) => {
            if (!vivo) return;
            const estado =
              e.data === S.PLAYING
                ? 'a_tocar'
                : e.data === S.PAUSED
                  ? 'pausa'
                  : e.data === S.ENDED
                    ? 'fim'
                    : e.data === S.BUFFERING
                      ? 'a_carregar'
                      : 'parado';
            pararRelogio();
            if (estado === 'a_tocar') relogioRef.current = setInterval(avisarTempo, TIQUE_MS);
            avisarTempo();
            ouvintes.current.onEstado?.(estado);
          },
          onError: (e) => {
            if (vivo) ouvintes.current.onErro?.(erroDoYouTube(e.data));
          },
        };
        playerRef.current = ponte
          ? criarPonte(iframeRef.current, events)
          : new YT.Player(iframeRef.current, { events });
      })
      .catch(() => {
        if (vivo) ouvintes.current.onErro?.('rede');
      });

    return () => {
      vivo = false;
      pararRelogio();
      prontoRef.current = false;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* o iframe já saiu do ecrã */
      }
      playerRef.current = null;
    };
  }, [ponte]);

  useImperativeHandle(
    ref,
    () => {
      const p = () => (prontoRef.current ? playerRef.current : null);
      const seguro = (fn, omissao) => {
        try {
          const r = fn();
          return r === undefined ? omissao : r;
        } catch {
          return omissao;
        }
      };
      return {
        pronto: () => prontoRef.current,
        tocar: () => seguro(() => p()?.playVideo()),
        pausar: () => seguro(() => p()?.pauseVideo()),
        aTocar: () => seguro(() => p()?.getPlayerState() === 1, false),
        tempo: () => seguro(() => Number(p()?.getCurrentTime()) || 0, 0),
        duracao: () => seguro(() => Number(p()?.getDuration()) || 0, 0),
        irPara(seg, { tocar } = {}) {
          const alvo = Math.max(0, Number(seg) || 0);
          seguro(() => p()?.seekTo(alvo, true));
          if (tocar === true) seguro(() => p()?.playVideo());
          if (tocar === false) seguro(() => p()?.pauseVideo());
          // Parado, o YouTube não avisa de nada: o ecrã acerta já o tempo.
          ouvintes.current.onTempo?.(alvo);
        },
        velocidade: (v) => seguro(() => p()?.setPlaybackRate(Number(v) || 1)),
        /** Outro vídeo (ou outro ponto deste), sem desmontar o leitor. */
        abrir(novoId, seg = 0, { tocar = true } = {}) {
          const alvo = Math.max(0, Number(seg) || 0);
          if (novoId && novoId !== idAtualRef.current) {
            idAtualRef.current = novoId;
            seguro(() =>
              tocar
                ? p()?.loadVideoById({ videoId: novoId, startSeconds: alvo })
                : p()?.cueVideoById({ videoId: novoId, startSeconds: alvo })
            );
          } else {
            seguro(() => p()?.seekTo(alvo, true));
            seguro(() => (tocar ? p()?.playVideo() : p()?.pauseVideo()));
          }
          ouvintes.current.onTempo?.(alvo);
        },
      };
    },
    []
  );

  return (
    <iframe
      ref={iframeRef}
      className="vleitor__iframe"
      src={src}
      title={titulo || 'YouTube'}
      referrerPolicy="strict-origin-when-cross-origin"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  );
});

export default LeitorYouTube;
