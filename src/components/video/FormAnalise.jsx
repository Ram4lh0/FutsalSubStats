'use client';

// components/video/FormAnalise.jsx — criar uma análise (colar o link do
// YouTube ou escolher um vídeo do computador) e as definições de uma que já
// existe (título, data, jogo, margens do clipe).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, useUI } from '@/lib/ui.jsx';
import { Field } from '@/components/bits.jsx';
import { analises as repoAnalises } from '@/lib/data/video.js';
import { BotaoEscolherVideo, ErroDoVideoLocal, descricaoDoFicheiro, useLigarVideo } from './LigarVideo.jsx';
import useFicheiroLigado from '@/lib/useFicheiroLigado.js';
import { ligarFicheiro, sondarVideo } from '@/lib/videoLocal.js';
import {
  FONTE,
  fonteDaAnalise,
  lerLinkYouTube,
  linkYouTubeNoSegundo,
  metadadosDoFicheiro,
  miniaturaYouTube,
  normalizarMargens,
  origemDaAnalise,
  tituloDoFicheiro,
} from '@/domain/analiseVideo.js';
import { isoDia } from '@/domain/treino.js';
import { guardarMargens, tituloDoYouTube } from '@/lib/videoPrefs.js';
import { abrirFora } from '@/lib/partilha.js';
import { dayLabel, opponentShort } from '@/lib/format.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

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
 * "Nova análise": escolhe-se de onde vem o vídeo — um link do YouTube ou um
 * ficheiro do computador —, confirma-se que abre, e o resto é opcional.
 * Devolve a análise criada (ou null) pelo `onFechar`.
 *
 * O ficheiro do computador não é lido nem enviado: confirma-se só que o
 * browser o consegue abrir (metadados) e guarda-se o nome, o tamanho e a data.
 */
export function NovaAnalise({ teamId, jogos, onFechar }) {
  const t = useT();
  const locale = useLocale();
  const [origem, setOrigem] = useState(FONTE.YOUTUBE);
  // O vídeo do computador que já se confirmou que abre: { file, durationMs }.
  const [escolhido, setEscolhido] = useState(null);
  const [aVerificar, setAVerificar] = useState(false);
  const [erroFicheiro, setErroFicheiro] = useState(null);
  const pedido = useRef(0);
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
    if (origem !== FONTE.YOUTUBE || !lido?.id || tituloMexido) return undefined;
    let vivo = true;
    tituloDoYouTube(lido.id).then((nome) => {
      if (vivo && nome) setTitulo((atual) => atual || nome);
    });
    return () => {
      vivo = false;
    };
  }, [origem, lido?.id, tituloMexido]);

  function mudarOrigem(nova) {
    if (nova === origem) return;
    setOrigem(nova);
    // O título sugerido era do outro vídeo; o que o treinador escreveu fica.
    if (!tituloMexido) setTitulo(nova === FONTE.LOCAL && escolhido ? tituloDoFicheiro(escolhido.file.name) : '');
  }

  async function escolherFicheiro(file) {
    const meu = ++pedido.current;
    setErroFicheiro(null);
    setAVerificar(true);
    try {
      const info = await sondarVideo(file);
      if (meu !== pedido.current) return;
      setEscolhido({ file, durationMs: info.durationMs });
      if (!tituloMexido) setTitulo(tituloDoFicheiro(file.name));
    } catch (e) {
      if (meu !== pedido.current) return;
      // Não abre neste browser: fica o que estava escolhido antes (se havia).
      setErroFicheiro(e?.codigo === 'ficheiro' ? 'ficheiro' : 'formato');
    } finally {
      if (meu === pedido.current) setAVerificar(false);
    }
  }

  function escolherJogo(id) {
    setJogoId(id);
    const jogo = jogos?.find((j) => j.id === id);
    if (!jogo) return;
    if (jogo.scheduledAt) setData(isoDia(new Date(jogo.scheduledAt)));
    // Num vídeo do computador, o título inicial é o nome do ficheiro.
    if (!tituloMexido && origem === FONTE.YOUTUBE) {
      setTitulo(t('video.form.tituloDoJogo', { adversario: opponentShort(jogo) }));
    }
  }

  async function criar(e) {
    e.preventDefault();
    if (aGuardar) return;
    if (origem === FONTE.LOCAL) {
      if (!escolhido || aVerificar) return;
      setAGuardar(true);
      const nova = await repoAnalises.guardar(teamId, {
        provider: FONTE.LOCAL,
        localFile: metadadosDoFicheiro(escolhido.file, { durationMs: escolhido.durationMs }),
        title: titulo || tituloDoFicheiro(escolhido.file.name) || t('video.form.tituloOmissao'),
        matchId: jogoId,
        recordedOn: data || null,
      });
      // O ficheiro fica ligado em memória: a análise abre já com ele.
      ligarFicheiro(nova.id, escolhido.file);
      onFechar({ analise: nova, inicioSeg: 0 });
      return;
    }
    if (!lido) return;
    setAGuardar(true);
    const analise = await repoAnalises.guardar(teamId, {
      youtubeId: lido.id,
      title: titulo || t('video.form.tituloOmissao'),
      matchId: jogoId,
      recordedOn: data || null,
    });
    onFechar({ analise, inicioSeg: lido.inicioSeg });
  }

  const local = origem === FONTE.LOCAL;
  const pronto = local ? Boolean(escolhido) : Boolean(lido);

  return (
    <Dialog title={t('video.nova')} onClose={() => onFechar(null)}>
      <form className="vform" onSubmit={criar}>
        <div className="vorigem" role="tablist" aria-label={t('video.form.origem')}>
          {[
            [FONTE.YOUTUBE, 'video.form.origemYoutube'],
            [FONTE.LOCAL, 'video.form.origemLocal'],
          ].map(([id, chave]) => (
            <button
              key={id}
              type="button"
              role="tab"
              data-origem={id}
              className={`tmodo__btn ${origem === id ? 'is-on' : ''}`}
              aria-selected={origem === id}
              onClick={() => mudarOrigem(id)}
            >
              {t(chave)}
            </button>
          ))}
        </div>
        {local ? (
          <Field label={t('video.form.ficheiro')} hint={t('video.form.ficheiroDica')}>
            <div className="vficheiro">
              <BotaoEscolherVideo
                className={`btn ${escolhido ? 'btn--ghost' : 'btn--primary'}`}
                disabled={aVerificar || aGuardar}
                onFicheiro={escolherFicheiro}
              >
                {aVerificar
                  ? t('video.form.aVerificar')
                  : t(escolhido ? 'video.form.trocarFicheiro' : 'video.form.escolherFicheiro')}
              </BotaoEscolherVideo>
              {escolhido ? (
                <span className="vficheiro__nome mono" data-ficheiro-escolhido>
                  {descricaoDoFicheiro(escolhido.file, locale)}
                </span>
              ) : null}
            </div>
          </Field>
        ) : (
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
        )}
        {local && erroFicheiro ? (
          <div className="vform__aviso" role="alert">
            <ErroDoVideoLocal erro={erroFicheiro} />
          </div>
        ) : null}
        {pronto ? (
          <>
            {local ? null : <img className="vform__mini" src={miniaturaYouTube(lido.id)} alt="" />}
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
          <button type="submit" className="btn btn--primary" disabled={!pronto || aGuardar || aVerificar}>
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
  const locale = useLocale();
  const ui = useUI();
  const local = origemDaAnalise(analise) === FONTE.LOCAL;
  const ligado = useFicheiroLigado(local ? analise.id : null);
  const { ligar, aLigar } = useLigarVideo(soLeitura);
  // O que está guardado muda quando se troca o ficheiro com a janela aberta.
  const [guardado, setGuardado] = useState(analise.localFile || null);
  const [erroFicheiro, setErroFicheiro] = useState(null);

  async function trocarFicheiro(file) {
    setErroFicheiro(null);
    const resposta = await ligar({ ...fonteDaAnalise(analise), ficheiro: metadadosDoFicheiro(guardado) }, file);
    if (resposta.erro) setErroFicheiro(resposta.erro);
    if (resposta.ligado) {
      if (!soLeitura) setGuardado(metadadosDoFicheiro(file));
      ui.toast(t('video.local.trocado'), 'ok');
    }
  }

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

        {local ? (
          <div className="vmargens">
            <span className="field__label">{t('video.local.cartao')}</span>
            <p className="field__hint mono">{descricaoDoFicheiro(guardado, locale)}</p>
            <p className="field__hint">{t(ligado ? 'video.local.ligado' : 'video.local.porLigar')}</p>
            {erroFicheiro ? (
              <div className="vform__aviso" role="alert">
                <ErroDoVideoLocal erro={erroFicheiro} />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="vform__extra">
          {local ? (
            <BotaoEscolherVideo className="btn btn--ghost btn--tiny" disabled={aLigar} onFicheiro={trocarFicheiro}>
              {aLigar ? t('video.local.aAbrir') : t(ligado ? 'video.local.trocar' : 'video.local.religar')}
            </BotaoEscolherVideo>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--tiny"
              onClick={() => abrirFora(linkYouTubeNoSegundo(analise.youtubeId, tempoSeg))}
            >
              {t('video.abrirNoYouTube')}
            </button>
          )}
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
