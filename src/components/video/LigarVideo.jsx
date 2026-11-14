'use client';

// components/video/LigarVideo.jsx — escolher um vídeo do computador e ligá-lo
// a uma análise.
//
// Uma análise de um ficheiro local guarda só os metadados dele (nome, tamanho,
// data). O ficheiro fica no computador e a ligação a ele vive em memória: ao
// recarregar a página perde-se, e é preciso voltar a escolhê-lo. Os clipes e as
// sessões nunca se perdem — só guardam tempos.
//
// As regras de ligar, sempre as mesmas (`useLigarVideo`):
//
//   1. Se o ficheiro escolhido não bate com o guardado (outro nome, outro
//      tamanho, outra data), pergunta-se antes de o associar. Cancelar deixa
//      tudo como estava.
//   2. Confirma-se que o browser o consegue abrir. Se não conseguir, diz-se
//      porquê e, outra vez, nada muda.
//   3. Só então fica ligado — e, se era outro ficheiro e quem está a ver pode
//      editar, os metadados novos ficam guardados.

import { useCallback, useRef, useState } from 'react';
import { useUI } from '@/lib/ui.jsx';
import { analises as repoAnalises } from '@/lib/data/video.js';
import { ACEITA_VIDEO, ficheiroLigado, ligarFicheiro, sondarVideo } from '@/lib/videoLocal.js';
import { useFicheirosLigados } from '@/lib/useFicheiroLigado.js';
import { FONTE, diferencasDoFicheiro, fonteDaAnalise, tamanhoLegivel } from '@/domain/analiseVideo.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

/** "jogo.mp4 · 5,4 GB · 12/11/2026" — o que identifica um ficheiro a quem o escolheu. */
export function descricaoDoFicheiro(ficheiro, locale) {
  if (!ficheiro?.name) return '';
  const partes = [ficheiro.name];
  const tamanho = tamanhoLegivel(ficheiro.size, locale === 'en' ? '.' : ',');
  if (tamanho) partes.push(tamanho);
  if (ficheiro.lastModified) {
    partes.push(new Date(ficheiro.lastModified).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }));
  }
  return partes.join(' · ');
}

/**
 * Um botão que abre o seletor de ficheiros e devolve o vídeo escolhido. O
 * `<input type="file">` fica escondido ao lado; limpa-se depois de cada
 * escolha, para o mesmo ficheiro poder ser escolhido outra vez.
 */
export function BotaoEscolherVideo({ className = 'btn btn--primary', children, disabled = false, onFicheiro }) {
  const input = useRef(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACEITA_VIDEO}
        className="vficheiro__input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const ficheiro = e.target.files?.[0] || null;
          e.target.value = '';
          if (ficheiro) onFicheiro(ficheiro);
        }}
      />
      <button type="button" className={className} disabled={disabled} onClick={() => input.current?.click()}>
        {children}
      </button>
    </>
  );
}

/**
 * Ligar um ficheiro a uma análise local, com as três regras de cima.
 *
 * @param {boolean} soLeitura quem só vê o escalão liga o ficheiro para si, sem
 *   mudar o que está guardado
 * @returns {{ligar: (fonte: object, ficheiro: File) => Promise<{ligado: boolean, erro: string|null}>, aLigar: boolean}}
 */
export function useLigarVideo(soLeitura = true) {
  const t = useT();
  const locale = useLocale();
  const ui = useUI();
  const [aLigar, setALigar] = useState(false);

  const ligar = useCallback(
    async (fonte, ficheiro) => {
      const nada = { ligado: false, erro: null };
      if (!fonte || fonte.tipo !== FONTE.LOCAL || !ficheiro) return nada;

      if (diferencasDoFicheiro(fonte.ficheiro, ficheiro).length) {
        // A pergunta abre por cima da página: no modo Apresentar em ecrã cheio
        // ficava escondida, por isso sai-se do ecrã cheio primeiro.
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
        } catch {
          /* o browser já tinha saído */
        }
        const certo = await ui.confirmar(
          <>
            {t('video.local.diferente')}
            <span className="vficheiro__compara">
              <span>
                <em>{t('video.local.guardado')}</em> {descricaoDoFicheiro(fonte.ficheiro, locale)}
              </span>
              <span>
                <em>{t('video.local.escolhido')}</em> {descricaoDoFicheiro(ficheiro, locale)}
              </span>
            </span>
            {t('video.local.diferenteAviso')}
          </>,
          { title: t('video.local.diferenteTitulo'), okLabel: t('video.local.usarEste'), danger: false }
        );
        // Cancelar: a análise, os clipes e o ficheiro que estava ficam como estavam.
        if (!certo) return nada;
      }

      setALigar(true);
      try {
        const info = await sondarVideo(ficheiro);
        ligarFicheiro(fonte.id, ficheiro);
        if (!soLeitura) await repoAnalises.ligarFicheiro(fonte.id, ficheiro, { durationMs: info.durationMs });
        return { ligado: true, erro: null };
      } catch (e) {
        // Não abre: nada foi ligado nem guardado.
        return { ligado: false, erro: e?.codigo === 'ficheiro' ? 'ficheiro' : 'formato' };
      } finally {
        setALigar(false);
      }
    },
    [ui, t, locale, soLeitura]
  );

  return { ligar, aLigar };
}

/** A frase de um erro do vídeo local, com o que fazer a seguir. */
export function ErroDoVideoLocal({ erro }) {
  const t = useT();
  if (!erro) return null;
  return (
    <>
      <strong>{t(`video.erro.${erro}`)}</strong>
      {erro === 'formato' ? <p>{t('video.erro.formatoExplica')}</p> : null}
      {erro === 'ficheiro' ? <p>{t('video.erro.ficheiroExplica')}</p> : null}
    </>
  );
}

/**
 * O que aparece no lugar do vídeo quando a análise é de um ficheiro que não
 * está ligado neste aparelho: diz que ficheiro é e deixa voltar a ligá-lo.
 */
export function VideoEmFalta({ fonte, soLeitura = true, className = '' }) {
  const t = useT();
  const locale = useLocale();
  const { ligar, aLigar } = useLigarVideo(soLeitura);
  const [erro, setErro] = useState(null);

  async function escolher(ficheiro) {
    setErro(null);
    const resposta = await ligar(fonte, ficheiro);
    if (resposta.erro) setErro(resposta.erro);
  }

  return (
    <div className={`vleitor vleitor--falta ${className}`} data-video-em-falta={fonte?.id || ''}>
      <div className="vfalta" role="group" aria-label={t('video.local.religar')}>
        <strong>{t('video.local.emFalta')}</strong>
        {fonte?.ficheiro?.name ? (
          <span className="vfalta__ficheiro mono">{descricaoDoFicheiro(fonte.ficheiro, locale)}</span>
        ) : null}
        <p>{t('video.local.emFaltaExplica')}</p>
        {erro ? (
          <div className="vfalta__erro" role="alert">
            <ErroDoVideoLocal erro={erro} />
          </div>
        ) : null}
        <BotaoEscolherVideo disabled={aLigar} onFicheiro={escolher}>
          {aLigar ? t('video.local.aAbrir') : t('video.local.religar')}
        </BotaoEscolherVideo>
      </div>
    </div>
  );
}

function ItemPorLigar({ analise, soLeitura }) {
  const t = useT();
  const locale = useLocale();
  const { ligar, aLigar } = useLigarVideo(soLeitura);
  const [erro, setErro] = useState(null);
  const fonte = fonteDaAnalise(analise);

  async function escolher(ficheiro) {
    setErro(null);
    const resposta = await ligar(fonte, ficheiro);
    if (resposta.erro) setErro(resposta.erro);
  }

  return (
    <div className="vporligar__item" data-video-por-ligar={analise.id}>
      <span className="vporligar__nome">
        <strong>{analise.title}</strong>
        <span className="mono">{descricaoDoFicheiro(fonte?.ficheiro, locale)}</span>
      </span>
      <BotaoEscolherVideo className="btn btn--primary btn--tiny" disabled={aLigar} onFicheiro={escolher}>
        {aLigar ? t('video.local.aAbrir') : t('video.local.ligar')}
      </BotaoEscolherVideo>
      {erro ? (
        <div className="vporligar__erro" role="alert">
          <ErroDoVideoLocal erro={erro} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * O aviso de uma sessão (ou da ficha de um jogador) com clipes de vídeos do
 * computador que não estão ligados neste aparelho: diz quais são e deixa
 * ligá-los ali mesmo, antes de apresentar. Sem nenhum em falta, não aparece.
 *
 * @param {{analises: object[], soLeitura?: boolean}} props as análises locais
 *   de onde vêm os clipes (ver `analisesLocaisDosClipes`)
 */
export function VideosPorLigar({ analises, soLeitura = true }) {
  const t = useT();
  useFicheirosLigados();
  const emFalta = (analises || []).filter((a) => !ficheiroLigado(a.id));
  if (!emFalta.length) return null;
  return (
    <section className="vporligar" aria-label={t('video.local.faltam')}>
      <strong>{t('video.local.faltam')}</strong>
      <p>{t('video.local.faltamExplica')}</p>
      {emFalta.map((a) => (
        <ItemPorLigar key={a.id} analise={a} soLeitura={soLeitura} />
      ))}
    </section>
  );
}
