'use client';

// components/video/FolhaClipe.jsx — a folha rápida de um clipe.
//
// Abre logo a seguir a marcar (e ao tocar em "editar" num clipe da lista). Não
// bloqueia nada: não tem fundo escurecido, o vídeo continua a tocar e os
// botões de marcar continuam à mão. Tudo é opcional e grava-se a cada toque —
// o treinador pode marcar o jogo todo de seguida e etiquetar no fim.
//
// No telemóvel desliza de baixo; no computador fica no canto, por cima da
// lista de clipes.

import { useEffect, useRef, useState } from 'react';
import FotoJogador from '@/components/FotoJogador.jsx';
import {
  CATEGORIAS_VIDEO,
  VALENCIAS,
  categoriaVideo,
  chaveDoSubtipo,
  tempoVideo,
} from '@/domain/analiseVideo.js';
import { clipes as repoClipes } from '@/lib/data/video.js';
import { IconeCategoria, nomeDaCategoria, sinalDaValencia } from './pecas.jsx';
import { useT } from '@/lib/i18n/index.js';

/** O ecrã em que a folha é uma gaveta por baixo (o mesmo corte do CSS). */
function ecraEstreito() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 1179px)').matches;
}

export default function FolhaClipe({
  clipe,
  jogadores,
  fotos,
  tempoAgoraMs,
  duracaoMs,
  novo = false,
  onFechar,
  onTocar,
  onDuplicado,
  onApagar,
  onSessao,
}) {
  const t = useT();
  const cat = categoriaVideo(clipe.category);
  const [nota, setNota] = useState(clipe.note || '');
  const [categorias, setCategorias] = useState(!clipe.category);
  // Acabado de marcar, a folha vem curta: os tempos só se abrem a pedido.
  const [tempos, setTempos] = useState(!novo);
  // No telemóvel, um clipe acabado de marcar mostra só uma barra ("Guardado ·
  // Etiquetar"): a folha inteira tapava os botões de marcar, e quem está a
  // marcar o jogo de seguida não pode ficar à espera de a fechar.
  const [recolhida, setRecolhida] = useState(() => novo && ecraEstreito());
  const notaGuardada = useRef(clipe.note || '');

  // Outro clipe na mesma folha (marcou-se outro com ela aberta): a nota muda.
  useEffect(() => {
    setNota(clipe.note || '');
    notaGuardada.current = clipe.note || '';
    setCategorias(!clipe.category);
    setTempos(!novo);
    setRecolhida(novo && ecraEstreito());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipe.id]);

  // A nota grava-se ao parar de escrever, e ao fechar.
  useEffect(() => {
    if (nota === notaGuardada.current) return undefined;
    const id = setTimeout(() => {
      notaGuardada.current = nota;
      repoClipes.editar(clipe.id, { note: nota });
    }, 500);
    return () => clearTimeout(id);
  }, [nota, clipe.id]);

  function fechar() {
    if (nota !== notaGuardada.current) repoClipes.editar(clipe.id, { note: nota });
    onFechar();
  }

  const mudar = (patch) => repoClipes.editar(clipe.id, patch);
  const acertar = (novo) => repoClipes.acertar(clipe.id, novo, duracaoMs?.() || null);
  const escolhidos = new Set(clipe.playerIds || []);

  const alternarJogador = (id) => repoClipes.alternarJogador(clipe.id, id);

  return (
    <section
      className={`vfolha ${recolhida ? 'vfolha--recolhida' : ''}`}
      style={{ '--cor': cat.cor }}
      aria-label={t('video.folha.titulo')}
    >
      <header className="vfolha__topo">
        <button
          type="button"
          className="vfolha__cat"
          onClick={() => {
            if (recolhida) {
              setRecolhida(false);
              setCategorias(true);
            } else setCategorias((v) => !v);
          }}
          aria-expanded={categorias}
          title={t('video.folha.mudarCategoria')}
        >
          <IconeCategoria icone={cat.icone} tamanho={18} />
          <strong>{nomeDaCategoria(t, clipe.category)}</strong>
          <span aria-hidden="true">▾</span>
        </button>
        <button type="button" className="vfolha__tempo mono" onClick={() => onTocar?.(clipe)} title={t('video.verClipe')}>
          ▶ {tempoVideo(clipe.startMs)}–{tempoVideo(clipe.endMs)}
        </button>
        <span className="toolbar__spacer" />
        {novo ? <span className="vfolha__novo">{t('video.folha.guardado')}</span> : null}
        {recolhida ? (
          <button type="button" className="btn btn--primary btn--tiny" onClick={() => setRecolhida(false)}>
            {t('video.folha.etiquetar')}
          </button>
        ) : null}
        <button type="button" className="btn btn--ghost btn--icon" onClick={fechar} aria-label={t('comum.fechar')}>
          ✕
        </button>
      </header>

      {recolhida ? null : (
      <>
      <div className="vfolha__corpo">
        {categorias ? (
          <div className="vfolha__bloco">
            <div className="chiprow">
              {CATEGORIAS_VIDEO.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip chip--small vchip ${clipe.category === c.id ? 'is-selected' : ''}`}
                  style={{ '--cor': c.cor }}
                  onClick={() => {
                    mudar({ category: c.id });
                    setCategorias(false);
                  }}
                >
                  {t(`video.cat.${c.id}`)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {cat.subtipos.length ? (
          <div className="vfolha__bloco">
            <span className="vfolha__rotulo">{t('video.folha.subtipo')}</span>
            <div className="chiprow">
              {cat.subtipos.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip chip--small ${clipe.subtype === s ? 'is-selected' : ''}`}
                  onClick={() => mudar({ subtype: clipe.subtype === s ? null : s })}
                >
                  {t(chaveDoSubtipo(s))}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="vfolha__bloco">
          <div className="vvalencias" role="group" aria-label={t('video.folha.valencia')}>
            {VALENCIAS.map((v) => (
              <button
                key={v}
                type="button"
                className={`vvalencia vvalencia--${v} ${(clipe.valence || '') === v ? 'is-on' : ''}`}
                aria-pressed={clipe.valence === v}
                onClick={() => mudar({ valence: clipe.valence === v ? null : v })}
              >
                <span aria-hidden="true">{sinalDaValencia(v)}</span> {t(`video.valencia.${v}`)}
              </button>
            ))}
          </div>
        </div>

        {jogadores?.length ? (
          <div className="vfolha__bloco">
            <span className="vfolha__rotulo">{t('video.folha.jogadores')}</span>
            <div className="vjogadores">
              {jogadores.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  className={`vjogador ${escolhidos.has(j.id) ? 'is-on' : ''}`}
                  aria-pressed={escolhidos.has(j.id)}
                  onClick={() => alternarJogador(j.id)}
                >
                  <FotoJogador jogador={j} foto={fotos?.get(j.id)} tamanho={34} />
                  <span className="vjogador__nome">{j.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="vfolha__bloco">
          <input
            className="input vfolha__nota"
            value={nota}
            maxLength={2000}
            placeholder={t('video.folha.nota')}
            onChange={(e) => setNota(e.target.value)}
          />
        </div>

        {tempos ? (
        <div className="vfolha__bloco vfolha__tempos">
          {[
            ['startMs', 'deltaStartMs', t('video.folha.inicio'), clipe.startMs],
            ['endMs', 'deltaEndMs', t('video.folha.fim'), clipe.endMs],
          ].map(([campo, salto, rotulo, valor]) => (
            <div key={campo} className="vacerto">
              <span className="vfolha__rotulo">{rotulo}</span>
              <button type="button" className="vbtn" onClick={() => acertar({ [salto]: -1000 })}>
                −1s
              </button>
              <span className="mono vacerto__valor">{tempoVideo(valor)}</span>
              <button type="button" className="vbtn" onClick={() => acertar({ [salto]: 1000 })}>
                +1s
              </button>
              <button
                type="button"
                className="vbtn vbtn--texto"
                onClick={() => acertar({ [campo]: tempoAgoraMs() })}
              >
                {t('video.folha.tempoAtual')}
              </button>
            </div>
          ))}
        </div>
        ) : null}
      </div>

      <footer className="vfolha__fundo">
        {tempos ? null : (
          <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setTempos(true)}>
            {t('video.folha.acertarTempos')}
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--tiny" onClick={() => onSessao?.(clipe)}>
          {t('video.juntarASessao')}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--tiny"
          onClick={async () => onDuplicado?.(await repoClipes.duplicar(clipe.id))}
        >
          {t('video.duplicar')}
        </button>
        <span className="toolbar__spacer" />
        <button type="button" className="btn btn--ghost btn--danger btn--tiny" onClick={() => onApagar?.(clipe)}>
          {t('video.apagar')}
        </button>
      </footer>
      </>
      )}
    </section>
  );
}
