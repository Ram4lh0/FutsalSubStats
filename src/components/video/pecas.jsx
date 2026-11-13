'use client';

// components/video/pecas.jsx — as peças pequenas da Análise de vídeo: o ícone
// da categoria, os controlos do leitor, a linha de um clipe e a marca de
// valência. Usadas na análise, nas sessões, na ficha do jogador e no link
// público.

import FotoJogador from '@/components/FotoJogador.jsx';
import {
  VALENCIA,
  categoriaVideo,
  chaveDoSubtipo,
  tempoVideo,
} from '@/domain/analiseVideo.js';
import { VELOCIDADES } from './useLeitorDeClipes.js';
import { useT } from '@/lib/i18n/index.js';

/* ------------------------------------------------------------- ícones */

// Traços simples, todos no mesmo quadrado de 24: lêem-se a 18 px num botão.
const DESENHOS = {
  // Seta para a baliza do adversário.
  ataque: (
    <>
      <path d="M4 12h13" />
      <path d="m12 6 6 6-6 6" />
      <path d="M21 5v14" />
    </>
  ),
  // Escudo.
  defesa: <path d="M12 3 5 6v6c0 4.2 2.9 7.3 7 9 4.1-1.7 7-4.8 7-9V6l-7-3Z" />,
  // Raio para a frente.
  transicao_of: <path d="M13 3 5 13h6l-1 8 9-11h-6l0-7Z" />,
  // Seta de regresso.
  transicao_def: (
    <>
      <path d="M9 7 4 12l5 5" />
      <path d="M4 12h10a6 6 0 0 1 6 6v1" />
    </>
  ),
  // Canto do campo com a bola.
  bola_parada: (
    <>
      <path d="M5 21V4" />
      <path d="m5 4 8 3-8 3" />
      <circle cx="16" cy="17" r="3" />
    </>
  ),
  // Baliza com a mão.
  guarda_redes: (
    <>
      <path d="M3 19V6h18v13" />
      <path d="M9 6v13M15 6v13M3 12.5h18" />
    </>
  ),
  // Estrela: um momento.
  momento: <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8L12 3Z" />,
};

export function IconeCategoria({ icone, tamanho = 20 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {DESENHOS[icone] || DESENHOS.momento}
    </svg>
  );
}

/** O nome de uma categoria (ou "Sem categoria"). */
export function nomeDaCategoria(t, id) {
  return categoriaVideo(id).id ? t(`video.cat.${id}`) : t('video.semCategoria');
}

/** "Ataque organizado · Finalização", ou só a categoria. */
export function tituloDoClipe(t, clipe) {
  const cat = nomeDaCategoria(t, clipe.category);
  return clipe.subtype ? `${cat} · ${t(chaveDoSubtipo(clipe.subtype))}` : cat;
}

/** "1 clipe" / "7 clipes": o dicionário não sabe plurais, por isso são duas chaves. */
export function nClipes(t, n) {
  return n === 1 ? t('video.umClipe') : t('video.nClipes', { n });
}

export function nJogadores(t, n) {
  return n === 1 ? t('video.umJogador') : t('video.nJogadores', { n });
}

/* ------------------------------------------------------------ valência */

const SINAL = { [VALENCIA.BOM]: '✓', [VALENCIA.CORRIGIR]: '✗', [VALENCIA.NEUTRO]: '–' };

export function MarcaValencia({ valencia, comTexto = false }) {
  const t = useT();
  const v = valencia || VALENCIA.NEUTRO;
  if (v === VALENCIA.NEUTRO && !comTexto) return null;
  return (
    <span className={`vval vval--${v}`} title={t(`video.valencia.${v}`)}>
      <span aria-hidden="true">{SINAL[v]}</span>
      {comTexto ? <span>{t(`video.valencia.${v}`)}</span> : null}
    </span>
  );
}

export function sinalDaValencia(v) {
  return SINAL[v || VALENCIA.NEUTRO];
}

/* ----------------------------------------------------------- controlos */

/**
 * Os nossos controlos do leitor: −5 s, −0,1 s, tocar/parar, +0,1 s, +5 s, e
 * as velocidades. `leitor` é o que o `useLeitorDeClipes` devolve.
 */
export function ControlosVideo({ leitor, compacto = false, children }) {
  const t = useT();
  return (
    <div className={`vcontrolos ${compacto ? 'vcontrolos--compacto' : ''}`}>
      <div className="vcontrolos__grupo">
        <button type="button" className="vbtn" onClick={() => leitor.saltar(-5)} title={t('video.menos5')}>
          −5s
        </button>
        <button
          type="button"
          className="vbtn vbtn--fino"
          onClick={() => leitor.passo(-0.1)}
          title={t('video.passoAtras')}
        >
          −0,1
        </button>
        <button
          type="button"
          className="vbtn vbtn--tocar"
          onClick={leitor.alternar}
          aria-label={leitor.aTocar ? t('video.pausar') : t('video.tocar')}
        >
          {leitor.aTocar ? (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.5-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="vbtn vbtn--fino"
          onClick={() => leitor.passo(0.1)}
          title={t('video.passoFrente')}
        >
          +0,1
        </button>
        <button type="button" className="vbtn" onClick={() => leitor.saltar(5)} title={t('video.mais5')}>
          +5s
        </button>
      </div>
      <span className="vcontrolos__tempo mono">{tempoVideo(leitor.tempoMs, { decimas: !leitor.aTocar })}</span>
      <div className="vcontrolos__grupo vcontrolos__vel" role="group" aria-label={t('video.velocidade')}>
        {VELOCIDADES.map((v) => (
          <button
            key={v}
            type="button"
            className={`vbtn vbtn--vel ${leitor.velocidade === v ? 'is-on' : ''}`}
            aria-pressed={leitor.velocidade === v}
            onClick={() => leitor.mudarVelocidade(v)}
          >
            {String(v).replace('.', ',')}×
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- clipe */

/**
 * Uma linha de clipe: a cor da categoria, os tempos, o que é, quem aparece e
 * a nota. Tocar na linha chama `onTocar`; `acoes` fica à direita.
 */
export function LinhaClipe({
  clipe,
  jogadores,
  fotos,
  ativo = false,
  escolhido = false,
  subtitulo = null,
  titulo = null,
  onTocar,
  acoes = null,
  antes = null,
}) {
  const t = useT();
  const cat = categoriaVideo(clipe.category);
  const marcados = (clipe.playerIds || []).map((id) => jogadores?.get(id)).filter(Boolean);
  return (
    <div
      className={`vclipe ${ativo ? 'is-ativo' : ''} ${escolhido ? 'is-escolhido' : ''}`}
      style={{ '--cor': cat.cor }}
    >
      {antes}
      <button type="button" className="vclipe__corpo" onClick={onTocar}>
        <span className="vclipe__icone">
          <IconeCategoria icone={cat.icone} tamanho={18} />
        </span>
        <span className="vclipe__texto">
          <span className="vclipe__titulo">
            <strong>{titulo || tituloDoClipe(t, clipe)}</strong>
            <MarcaValencia valencia={clipe.valence} />
          </span>
          <span className="vclipe__meta">
            <span className="mono">
              {tempoVideo(clipe.startMs)}–{tempoVideo(clipe.endMs)}
            </span>
            {subtitulo ? <span className="vclipe__sub">{subtitulo}</span> : null}
            {clipe.note ? <span className="vclipe__nota">{clipe.note}</span> : null}
          </span>
        </span>
        {marcados.length ? (
          <span className="vclipe__jogadores">
            {marcados.slice(0, 4).map((j) => (
              <FotoJogador key={j.id} jogador={j} foto={fotos?.get(j.id)} tamanho={28} />
            ))}
            {marcados.length > 4 ? <span className="vclipe__mais">+{marcados.length - 4}</span> : null}
          </span>
        ) : null}
      </button>
      {acoes ? <div className="vclipe__acoes">{acoes}</div> : null}
    </div>
  );
}

/** A faixa por cima do vídeo no modo apresentação e no link público. */
export function LegendaClipe({ clipe, jogadores, fotos, indice, total, titulo }) {
  const t = useT();
  if (!clipe) return null;
  const cat = categoriaVideo(clipe.category);
  const marcados = (clipe.playerIds || []).map((id) => jogadores?.get(id)).filter(Boolean);
  return (
    <div className="vlegenda" style={{ '--cor': cat.cor }}>
      <div className="vlegenda__topo">
        {total ? (
          <span className="vlegenda__n mono">
            {indice + 1}/{total}
          </span>
        ) : null}
        <strong className="vlegenda__titulo">{titulo || tituloDoClipe(t, clipe)}</strong>
        <MarcaValencia valencia={clipe.valence} comTexto />
      </div>
      {titulo ? <span className="vlegenda__cat">{tituloDoClipe(t, clipe)}</span> : null}
      {marcados.length ? (
        <div className="vlegenda__jogadores">
          {marcados.map((j) => (
            <span key={j.id} className="vlegenda__jogador">
              <FotoJogador jogador={j} foto={fotos?.get(j.id)} tamanho={26} />
              {j.name}
            </span>
          ))}
        </div>
      ) : null}
      {clipe.note ? <p className="vlegenda__nota">{clipe.note}</p> : null}
    </div>
  );
}
