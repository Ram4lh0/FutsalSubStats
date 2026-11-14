'use client';

// components/video/LeitorLocal.jsx — o leitor de um vídeo do computador.
//
// É a única peça que sabe o que é um `<video>`. Fala com quem a usa pelo mesmo
// contrato do `LeitorYouTube` (tocar, pausar, irPara, tempo, duração,
// velocidade, abrir), para os clipes, as sessões e o modo Apresentar não
// quererem saber de onde vem o vídeo.
//
// Quatro cuidados:
//
//   · O ficheiro nunca é lido para a memória nem enviado. O `<video>` abre um
//     endereço temporário (`URL.createObjectURL`) e o browser vai buscar ao
//     disco só os bocados que toca — é o que deixa abrir um jogo de 5 GB.
//   · Esse endereço é deste leitor: cria-se quando o ficheiro entra e
//     liberta-se quando o ficheiro troca ou o leitor sai do ecrã.
//   · Um pedido que chegue antes de o vídeo abrir (ir para um clipe, tocar)
//     fica guardado e cumpre-se quando os metadados chegam. Só o último conta:
//     dois toques seguidos em clipes diferentes não deixam o leitor a meio.
//   · Se o browser não toca o formato ou o codec — ou toca o som mas não a
//     imagem, como acontece com H.265 em alguns — diz-se, com o motivo.

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { criarUrlTemporaria, libertarUrlTemporaria, motivoDaFalha } from '@/lib/videoLocal.js';

/** A tocar, pergunta-se o tempo 10 vezes por segundo: o fim do clipe sai certo. */
const TIQUE_MS = 100;

const LeitorLocal = forwardRef(function LeitorLocal(
  { ficheiro, inicioSeg = 0, titulo, onPronto, onEstado, onTempo, onErro, onImagem },
  ref
) {
  const videoRef = useRef(null);
  const prontoRef = useRef(false);
  // O que falta cumprir quando o vídeo abrir: para onde ir e se é para tocar.
  const pendenteRef = useRef({ seg: Math.max(0, Number(inicioSeg) || 0), tocar: null });
  const velocidadeRef = useRef(1);
  const relogioRef = useRef(null);
  const ouvintes = useRef({});
  ouvintes.current = { onPronto, onEstado, onTempo, onErro, onImagem };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ficheiro) return undefined;
    let vivo = true;
    prontoRef.current = false;
    const url = criarUrlTemporaria(ficheiro);

    const pararRelogio = () => {
      if (relogioRef.current) clearInterval(relogioRef.current);
      relogioRef.current = null;
    };
    const avisarTempo = () => {
      if (vivo && prontoRef.current) ouvintes.current.onTempo?.(video.currentTime || 0);
    };
    const estado = (nome) => {
      if (vivo) ouvintes.current.onEstado?.(nome);
    };
    const falhar = (codigo) => {
      pararRelogio();
      prontoRef.current = false;
      // "Formato não suportado" também é o que o browser diz de um ficheiro
      // que deixou de existir: um byte tira a dúvida.
      motivoDaFalha(ficheiro, codigo).then((motivo) => {
        if (vivo) ouvintes.current.onErro?.(motivo);
      });
    };

    const ouvir = {
      loadedmetadata() {
        if (!vivo) return;
        // Som sem imagem: o codec do vídeo não é suportado neste browser.
        if (!video.videoWidth || !video.videoHeight) {
          falhar(4);
          return;
        }
        prontoRef.current = true;
        const pedido = pendenteRef.current || { seg: 0, tocar: null };
        pendenteRef.current = null;
        video.defaultPlaybackRate = velocidadeRef.current;
        video.playbackRate = velocidadeRef.current;
        const duracao = Number.isFinite(video.duration) ? video.duration : 0;
        const alvo = duracao ? Math.min(pedido.seg, duracao) : pedido.seg;
        if (alvo > 0) video.currentTime = alvo;
        ouvintes.current.onImagem?.({ largura: video.videoWidth, altura: video.videoHeight });
        ouvintes.current.onPronto?.();
        ouvintes.current.onTempo?.(alvo);
        if (pedido.tocar === true) video.play()?.catch?.(() => {});
      },
      resize() {
        if (vivo && video.videoWidth && video.videoHeight) {
          ouvintes.current.onImagem?.({ largura: video.videoWidth, altura: video.videoHeight });
        }
      },
      playing() {
        pararRelogio();
        relogioRef.current = setInterval(avisarTempo, TIQUE_MS);
        avisarTempo();
        estado('a_tocar');
      },
      pause() {
        pararRelogio();
        avisarTempo();
        if (!video.ended) estado('pausa');
      },
      waiting() {
        estado('a_carregar');
      },
      ended() {
        pararRelogio();
        avisarTempo();
        estado('fim');
      },
      seeked: avisarTempo,
      timeupdate: avisarTempo,
      error() {
        const codigo = video.error?.code;
        // 1 = MEDIA_ERR_ABORTED: fomos nós a trocar de vídeo.
        if (vivo && codigo !== 1) falhar(codigo);
      },
    };
    for (const [nome, fn] of Object.entries(ouvir)) video.addEventListener(nome, fn);

    video.src = url;
    video.load();

    return () => {
      vivo = false;
      pararRelogio();
      for (const [nome, fn] of Object.entries(ouvir)) video.removeEventListener(nome, fn);
      // Se o ficheiro for trocado por outro, o novo abre onde este estava.
      pendenteRef.current = { seg: prontoRef.current ? video.currentTime || 0 : pendenteRef.current?.seg || 0, tocar: null };
      prontoRef.current = false;
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        /* o elemento já saiu do ecrã */
      }
      libertarUrlTemporaria(url);
    };
  }, [ficheiro]);

  useImperativeHandle(
    ref,
    () => {
      const v = () => videoRef.current;
      const tocarSeguro = () => {
        try {
          // Um `play()` interrompido por uma pausa ou por outro vídeo rejeita:
          // não é erro nenhum.
          v()?.play()?.catch?.(() => {});
        } catch {
          /* sem vídeo */
        }
      };
      const duracao = () => {
        const d = v()?.duration;
        return prontoRef.current && Number.isFinite(d) ? d : 0;
      };
      const irPara = (seg, { tocar } = {}) => {
        const alvo = Math.max(0, Number(seg) || 0);
        if (!prontoRef.current || !v()) {
          // Ainda a abrir: fica o último pedido, cumprido quando o vídeo chegar.
          pendenteRef.current = { seg: alvo, tocar: tocar ?? pendenteRef.current?.tocar ?? null };
          ouvintes.current.onTempo?.(alvo);
          return;
        }
        const fim = duracao();
        try {
          v().currentTime = fim ? Math.min(alvo, fim) : alvo;
        } catch {
          /* o vídeo fechou entretanto */
        }
        if (tocar === true) tocarSeguro();
        if (tocar === false) v().pause();
        ouvintes.current.onTempo?.(alvo);
      };
      return {
        pronto: () => prontoRef.current,
        tocar: () => {
          if (prontoRef.current) tocarSeguro();
          else if (pendenteRef.current) pendenteRef.current.tocar = true;
        },
        pausar: () => {
          if (prontoRef.current) v()?.pause();
          else if (pendenteRef.current) pendenteRef.current.tocar = false;
        },
        aTocar: () => Boolean(prontoRef.current && v() && !v().paused && !v().ended),
        tempo: () => (prontoRef.current ? v()?.currentTime || 0 : pendenteRef.current?.seg || 0),
        duracao,
        irPara,
        velocidade(valor) {
          velocidadeRef.current = Number(valor) || 1;
          if (v()) {
            v().defaultPlaybackRate = velocidadeRef.current;
            v().playbackRate = velocidadeRef.current;
          }
        },
        /** Outro ponto deste vídeo. O ficheiro em si entra pela prop `ficheiro`. */
        abrir: (_id, seg = 0, { tocar = true } = {}) => irPara(seg, { tocar }),
        /** O tamanho real da imagem, para a camada de desenho. */
        imagem: () => {
          const el = v();
          return el?.videoWidth ? { largura: el.videoWidth, altura: el.videoHeight } : null;
        },
      };
    },
    []
  );

  return (
    <video
      ref={videoRef}
      className="vleitor__video"
      controls
      controlsList="nodownload noremoteplayback"
      playsInline
      preload="metadata"
      aria-label={titulo || undefined}
    />
  );
});

export default LeitorLocal;
