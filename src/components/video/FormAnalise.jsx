'use client';

// components/video/FormAnalise.jsx — criar uma análise (colar o link) e as
// definições de uma que já existe (título, data, jogo, margens do clipe).

import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/lib/ui.jsx';
import { Field } from '@/components/bits.jsx';
import { analises as repoAnalises } from '@/lib/data/video.js';
import {
  lerLinkYouTube,
  linkYouTubeNoSegundo,
  miniaturaYouTube,
  normalizarMargens,
} from '@/domain/analiseVideo.js';
import { isoDia } from '@/domain/treino.js';
import { guardarMargens, tituloDoYouTube } from '@/lib/videoPrefs.js';
import { abrirFora } from '@/lib/partilha.js';
import { dayLabel, opponentShort } from '@/lib/format.js';
import { useT } from '@/lib/i18n/index.js';

export function rotuloDoJogo(jogo) {
  return jogo ? `${opponentShort(jogo)} · ${dayLabel(jogo.scheduledAt)}` : '';
}

function EscolherJogo({ jogos, valor, onMudar }) {
  const t = useT();
  if (!jogos?.length) return null;
  return (
    <Field label={t('video.form.jogo')}>
      <select className="input" value={valor || ''} onChange={(e) => onMudar(e.target.value || null)}>
        <option value="">{t('video.form.semJogo')}</option>
        {jogos.map((j) => (
          <option key={j.id} value={j.id}>
            {rotuloDoJogo(j)}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * "Nova análise": cola-se o link, valida-se, e o resto é opcional. Devolve a
 * análise criada (ou null) pelo `onFechar`.
 */
export function NovaAnalise({ teamId, jogos, onFechar }) {
  const t = useT();
  const [link, setLink] = useState('');
  const [titulo, setTitulo] = useState('');
  const [tituloMexido, setTituloMexido] = useState(false);
  const [jogoId, setJogoId] = useState(null);
  const [data, setData] = useState(() => isoDia(new Date()));
  const [aGuardar, setAGuardar] = useState(false);

  const lido = useMemo(() => lerLinkYouTube(link), [link]);
  const invalido = link.trim() && !lido;

  // O título do vídeo vem do YouTube, se o treinador ainda não escreveu o seu.
  useEffect(() => {
    if (!lido?.id || tituloMexido) return undefined;
    let vivo = true;
    tituloDoYouTube(lido.id).then((nome) => {
      if (vivo && nome) setTitulo((atual) => atual || nome);
    });
    return () => {
      vivo = false;
    };
  }, [lido?.id, tituloMexido]);

  function escolherJogo(id) {
    setJogoId(id);
    const jogo = jogos?.find((j) => j.id === id);
    if (!jogo) return;
    if (jogo.scheduledAt) setData(isoDia(new Date(jogo.scheduledAt)));
    if (!tituloMexido) setTitulo(t('video.form.tituloDoJogo', { adversario: opponentShort(jogo) }));
  }

  async function criar(e) {
    e.preventDefault();
    if (!lido || aGuardar) return;
    setAGuardar(true);
    const analise = await repoAnalises.guardar(teamId, {
      youtubeId: lido.id,
      title: titulo || t('video.form.tituloOmissao'),
      matchId: jogoId,
      recordedOn: data || null,
    });
    onFechar({ analise, inicioSeg: lido.inicioSeg });
  }

  return (
    <Dialog title={t('video.nova')} onClose={() => onFechar(null)}>
      <form className="vform" onSubmit={criar}>
        <Field label={t('video.form.link')} hint={invalido ? null : t('video.form.linkDica')}>
          <input
            className={`input ${invalido ? 'is-erro' : ''}`}
            value={link}
            inputMode="url"
            autoFocus
            placeholder="https://youtu.be/…"
            onChange={(e) => setLink(e.target.value)}
          />
          {invalido ? <span className="field__hint vform__erro">{t('video.form.linkInvalido')}</span> : null}
        </Field>
        {lido ? (
          <>
            <img className="vform__mini" src={miniaturaYouTube(lido.id)} alt="" />
            <Field label={t('video.form.titulo')}>
              <input
                className="input"
                value={titulo}
                maxLength={200}
                placeholder={t('video.form.tituloExemplo')}
                onChange={(e) => {
                  setTitulo(e.target.value);
                  setTituloMexido(true);
                }}
              />
            </Field>
            <div className="vform__linha">
              <EscolherJogo jogos={jogos} valor={jogoId} onMudar={escolherJogo} />
              <Field label={t('video.form.data')}>
                <input className="input" type="date" value={data || ''} onChange={(e) => setData(e.target.value)} />
              </Field>
            </div>
          </>
        ) : null}
        <footer className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => onFechar(null)}>
            {t('comum.cancelar')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={!lido || aGuardar}>
            {t('video.form.criar')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

/**
 * As definições de uma análise: o que ela é (título, data, jogo) e como se
 * marca neste aparelho (quanto corta um toque). Devolve 'apagar' pelo
 * `onFechar` quando se pede para a apagar.
 */
export function DefinicoesAnalise({ analise, jogos, margens, tempoSeg, soLeitura, onMargens, onFechar }) {
  const t = useT();
  const [titulo, setTitulo] = useState(analise.title);
  const [jogoId, setJogoId] = useState(analise.matchId || null);
  const [data, setData] = useState(analise.recordedOn || '');
  const [antes, setAntes] = useState(margens.antesMs / 1000);
  const [depois, setDepois] = useState(margens.depoisMs / 1000);

  async function guardar(e) {
    e?.preventDefault();
    onMargens(guardarMargens(normalizarMargens({ antesMs: antes * 1000, depoisMs: depois * 1000 })));
    if (!soLeitura) {
      await repoAnalises.guardar(analise.teamId, {
        id: analise.id,
        title: titulo,
        matchId: jogoId,
        recordedOn: data || null,
      });
    }
    onFechar(null);
  }

  const passo = (valor, definir, delta) => definir(Math.min(60, Math.max(0, valor + delta)));

  return (
    <Dialog title={t('video.definicoes')} onClose={() => onFechar(null)}>
      <form className="vform" onSubmit={guardar}>
        {soLeitura ? null : (
          <>
            <Field label={t('video.form.titulo')}>
              <input className="input" value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} />
            </Field>
            <div className="vform__linha">
              <EscolherJogo jogos={jogos} valor={jogoId} onMudar={setJogoId} />
              <Field label={t('video.form.data')}>
                <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </Field>
            </div>
          </>
        )}

        <div className="vmargens">
          <span className="field__label">{t('video.margens.titulo')}</span>
          <p className="field__hint">{t('video.margens.explica')}</p>
          {[
            [t('video.margens.antes'), antes, setAntes],
            [t('video.margens.depois'), depois, setDepois],
          ].map(([rotulo, valor, definir]) => (
            <div key={rotulo} className="vmargens__linha">
              <span>{rotulo}</span>
              <button type="button" className="vbtn" onClick={() => passo(valor, definir, -1)}>
                −
              </button>
              <strong className="mono">{valor} s</strong>
              <button type="button" className="vbtn" onClick={() => passo(valor, definir, 1)}>
                +
              </button>
            </div>
          ))}
        </div>

        <div className="vform__extra">
          <button
            type="button"
            className="btn btn--ghost btn--tiny"
            onClick={() => abrirFora(linkYouTubeNoSegundo(analise.youtubeId, tempoSeg))}
          >
            {t('video.abrirNoYouTube')}
          </button>
          {soLeitura ? null : (
            <button type="button" className="btn btn--ghost btn--danger btn--tiny" onClick={() => onFechar('apagar')}>
              {t('video.apagarAnalise')}
            </button>
          )}
        </div>

        <footer className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => onFechar(null)}>
            {t('comum.cancelar')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('comum.guardar')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
