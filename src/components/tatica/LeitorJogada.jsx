'use client';

// components/tatica/LeitorJogada.jsx — ver uma jogada a andar.
//
// Play/pausa, frame anterior e seguinte, a barra para ir a qualquer instante,
// e as velocidades 0.5× a 1.5×. É o mesmo leitor na app e no link público.
//
// A animação corre num `requestAnimationFrame` e guarda o instante num `ref`;
// o estado do React só muda uma vez por fotograma, com as posições já
// calculadas. A velocidade multiplica o relógio, não as durações — mudar de
// velocidade a meio não faz a jogada saltar.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CampoTatico from './CampoTatico.jsx';
import {
  VELOCIDADES,
  duracaoTotal,
  frameNoInstante,
  instantesDosFrames,
  posicoesNoInstante,
  resolverPosicoes,
} from '@/domain/jogada.js';
import { entregarVideo, gravarVideo, podeGravarVideo } from '@/lib/videoJogada.js';
import { useT } from '@/lib/i18n/index.js';

const fmtSeg = (ms) => `${(ms / 1000).toFixed(1)} s`;

export default function LeitorJogada({ data, autoplay = false, titulo = '' }) {
  const t = useT();
  const resolvidas = useMemo(() => resolverPosicoes(data), [data]);
  const instantes = useMemo(() => instantesDosFrames(data), [data]);
  const total = useMemo(() => duracaoTotal(data), [data]);

  const [instante, setInstante] = useState(0);
  const [aTocar, setATocar] = useState(false);
  const [velocidade, setVelocidade] = useState(1);
  const relogio = useRef({ t: 0, ultimo: null, raf: null });
  // Gravação do vídeo: null | { progresso } | { feito } | { erro }
  const [video, setVideo] = useState(null);
  const [comVideo, setComVideo] = useState(false);

  // Só depois de montar: no servidor não há MediaRecorder, e o primeiro
  // desenho tem de ser igual dos dois lados.
  useEffect(() => setComVideo(podeGravarVideo()), []);

  async function guardarVideo() {
    if (video?.progresso != null || total <= 0) return;
    parar();
    setVideo({ progresso: 0 });
    try {
      const v = await gravarVideo(data, {
        velocidade,
        titulo,
        onProgresso: (p) => setVideo({ progresso: p }),
      });
      const r = await entregarVideo(v, titulo);
      setVideo(r === 'cancelado' ? null : { feito: r });
    } catch {
      setVideo({ erro: true });
    }
  }

  const parar = useCallback(() => {
    if (relogio.current.raf) cancelAnimationFrame(relogio.current.raf);
    relogio.current.raf = null;
    relogio.current.ultimo = null;
    setATocar(false);
  }, []);

  const irPara = useCallback(
    (ms) => {
      const v = Math.max(0, Math.min(total, ms));
      relogio.current.t = v;
      setInstante(v);
    },
    [total]
  );

  useEffect(() => {
    if (!aTocar) return undefined;
    const passo = (agora) => {
      const r = relogio.current;
      if (r.ultimo != null) r.t += (agora - r.ultimo) * velocidade;
      r.ultimo = agora;
      if (r.t >= total) {
        r.t = total;
        setInstante(total);
        parar();
        return;
      }
      setInstante(r.t);
      r.raf = requestAnimationFrame(passo);
    };
    relogio.current.ultimo = null;
    relogio.current.raf = requestAnimationFrame(passo);
    return () => {
      if (relogio.current.raf) cancelAnimationFrame(relogio.current.raf);
      relogio.current.raf = null;
    };
  }, [aTocar, velocidade, total, parar]);

  // Uma jogada nova (outro link, outra edição) recomeça do princípio.
  useEffect(() => {
    parar();
    irPara(0);
    if (autoplay && total > 0) setATocar(true);
  }, [data, autoplay, total, parar, irPara]);

  function tocar() {
    if (aTocar) return parar();
    if (relogio.current.t >= total) irPara(0);
    if (total > 0) setATocar(true);
  }

  const frame = frameNoInstante(data, instante);
  const n = data.frames.length;
  const emCimaDeFrame = Math.abs(instantes[frame] - instante) < 1;

  function anterior() {
    parar();
    // A meio de um troço, "anterior" volta ao início dele; em cima de um
    // frame, salta para o de trás.
    const alvo = emCimaDeFrame ? Math.max(0, frame - 1) : frame;
    irPara(instantes[alvo]);
  }

  function seguinte() {
    parar();
    irPara(instantes[Math.min(n - 1, frame + 1)]);
  }

  const posicoes = useMemo(
    () => posicoesNoInstante(data, instante, resolvidas),
    [data, instante, resolvidas]
  );

  return (
    <div className="tleitor">
      <CampoTatico data={data} posicoes={posicoes} />

      <div className="tleitor__barra">
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={anterior}
          aria-label={t('tatica.frameAnterior')}
        >
          ⏮
        </button>
        <button
          type="button"
          className="btn btn--primary btn--icon tleitor__play"
          onClick={tocar}
          aria-label={aTocar ? t('tatica.pausa') : t('tatica.play')}
          disabled={total <= 0}
        >
          {aTocar ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={seguinte}
          aria-label={t('tatica.frameSeguinte')}
        >
          ⏭
        </button>
        <input
          className="tleitor__tempo"
          type="range"
          min={0}
          max={Math.max(1, total)}
          step={10}
          value={instante}
          onChange={(e) => {
            parar();
            irPara(Number(e.target.value));
          }}
          aria-label={t('tatica.instante')}
        />
        <span className="tleitor__info">
          {t('tatica.frameDe', { n: frame + 1, total: n })} · {fmtSeg(instante)}
        </span>
      </div>

      <div className="tleitor__velocidades" role="group" aria-label={t('tatica.velocidade')}>
        {VELOCIDADES.map((v) => (
          <button
            key={v}
            type="button"
            className={`tvel ${v === velocidade ? 'is-on' : ''}`}
            aria-pressed={v === velocidade}
            onClick={() => setVelocidade(v)}
          >
            {v}×
          </button>
        ))}
        {comVideo ? (
          <button
            type="button"
            className="btn btn--ghost btn--tiny tleitor__video"
            onClick={guardarVideo}
            disabled={video?.progresso != null || total <= 0}
          >
            {video?.progresso != null
              ? t('tatica.aGravarVideo', { pct: Math.round(video.progresso * 100) })
              : t('tatica.guardarVideo', { v: velocidade })}
          </button>
        ) : null}
      </div>
      {video?.feito ? (
        <p className="muted tleitor__aviso">
          {video.feito === 'partilhado' ? t('tatica.videoPartilhado') : t('tatica.videoDescarregado')}
        </p>
      ) : null}
      {video?.erro ? <p className="tleitor__aviso tleitor__aviso--erro">{t('tatica.videoErro')}</p> : null}
    </div>
  );
}
