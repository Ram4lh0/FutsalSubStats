'use client';

// components/video/dialogos.jsx — as janelas da Análise de vídeo: escolher a
// sessão onde entram uns clipes, partilhar uma sessão por link (só com clipes
// do YouTube: os vídeos do computador não saem do aparelho), e o aviso de
// quando o add-on não está ligado no escalão.

import { useCallback, useEffect, useState } from 'react';
import { Dialog, useUI } from '@/lib/ui.jsx';
import { Empty } from '@/components/bits.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { sessoes as repoSessoes } from '@/lib/data/video.js';
import { statConfig } from '@/lib/data/repository.js';
import { DATA_UPDATED_EVENT, saveNow, subscribe, videoSoLocal } from '@/lib/data/sync.js';
import { addonsAtivos } from '@/domain/addons.js';
import {
  abrirFora,
  copiarTexto,
  linkWhatsApp,
  partilharNativo,
  podePartilharNativo,
  prepararJanela,
  urlDoVideo,
} from '@/lib/partilha.js';
import { nClipes } from './pecas.jsx';
import { useLocale, useT } from '@/lib/i18n/index.js';

/* ------------------------------------------------------------ o add-on */

/**
 * A Análise de vídeo é um add-on ('analise-video'): só aparece nos escalões
 * que o têm ligado. Esconder a subaba não chega — o endereço escreve-se à mão.
 *
 * `useAddons` começa vazio enquanto lê a config, e aqui isso mostrava "não
 * está ligada" por um instante a quem a tem. Por isso lê-se à parte, com um
 * terceiro estado: ainda não se sabe.
 */
export function GuardaVideo({ teamId, children }) {
  const t = useT();
  const [ligado, setLigado] = useState(null);

  useEffect(() => {
    let vivo = true;
    async function ler() {
      const config = teamId ? await statConfig.get(teamId).catch(() => null) : null;
      if (vivo) setLigado(addonsAtivos(config).has('analise-video'));
    }
    ler();
    window.addEventListener(DATA_UPDATED_EVENT, ler);
    return () => {
      vivo = false;
      window.removeEventListener(DATA_UPDATED_EVENT, ler);
    };
  }, [teamId]);

  if (ligado === null) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (!ligado) return <Empty>{t('video.desligado')}</Empty>;
  return children;
}

/* --------------------------------------------------- escolher a sessão */

/**
 * Para onde vão estes clipes: uma sessão que já existe, ou uma nova. Devolve
 * (pelo `onFechar`) a sessão onde ficaram, ou null se se desistiu.
 */
export function EscolherSessao({ teamId, clipIds, sugestao = '', onFechar }) {
  const t = useT();
  const [lista, setLista] = useState(null);
  const [titulo, setTitulo] = useState(sugestao);

  useEffect(() => {
    let vivo = true;
    // As partilhas com jogadores também são sessões, mas não são para aqui.
    repoSessoes.listByTeam(teamId).then((s) => vivo && setLista(s.filter((x) => !x.playerId)));
    return () => {
      vivo = false;
    };
  }, [teamId]);

  async function criar(e) {
    e?.preventDefault();
    if (!titulo.trim()) return;
    onFechar(await repoSessoes.criar(teamId, { title: titulo, clipIds }));
  }

  return (
    <Dialog
      title={t(clipIds.length === 1 ? 'video.sessao.juntarUm' : 'video.sessao.juntarVarios', { n: clipIds.length })}
      onClose={() => onFechar(null)}
    >
      <form className="vnova" onSubmit={criar}>
        <input
          className="input"
          value={titulo}
          maxLength={200}
          placeholder={t('video.sessao.nomeExemplo')}
          onChange={(e) => setTitulo(e.target.value)}
          autoFocus
        />
        <button className="btn btn--primary" type="submit" disabled={!titulo.trim()}>
          {t('video.sessao.criar')}
        </button>
      </form>
      {lista?.length ? (
        <>
          <p className="modal__hint">{t('video.sessao.ouJuntarA')}</p>
          <div className="vescolha">
            {lista.map((s) => (
              <button
                key={s.id}
                type="button"
                className="vescolha__item"
                onClick={async () => onFechar(await repoSessoes.juntar(s.id, clipIds))}
              >
                <strong>{s.title}</strong>
                <span className="muted">{nClipes(t, s.clipIds.length)}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </Dialog>
  );
}

/* ----------------------------------------------------- partilhar o link */

/**
 * O link público (30 dias) de uma sessão: quem o recebe vê só aqueles clipes,
 * sem conta nem app. Segue o `PartilharJogada`: o link só abre depois de a
 * sessão (e os clipes dela) chegarem ao servidor, por isso sincroniza ao
 * abrir, ao criar o link e antes de enviar.
 *
 * Com clipes de vídeos do computador (`locais` > 0) não há link: o vídeo não
 * está em servidor nenhum, e um link que parecesse abri-los enganava quem o
 * recebe. Explica-se porquê, e deixa-se desligar um link que já existisse.
 */
export function PartilharSessaoVideo({ sessao: inicial, locais = 0, onFechar }) {
  const t = useT();
  const locale = useLocale();
  const ui = useUI();
  const { userId, user } = useAuth();
  const [sessao, setSessao] = useState(inicial);
  const [copiado, setCopiado] = useState(false);
  const [aSincronizar, setASincronizar] = useState(false);

  const reler = useCallback(async () => {
    const fresca = await repoSessoes.get(inicial.id);
    if (fresca) setSessao(fresca);
    return fresca;
  }, [inicial.id]);

  const sincronizar = useCallback(async () => {
    setASincronizar(true);
    try {
      await saveNow(userId, user?.email);
      const fresca = await reler();
      return Boolean(fresca && !fresca.dirty) && !videoSoLocal();
    } finally {
      setASincronizar(false);
    }
  }, [userId, user?.email, reler]);

  useEffect(() => subscribe(() => reler()), [reler]);

  // Ao abrir: sem link, cria-se logo (é para isso que se veio); com alguma
  // coisa por subir, sobe já.
  useEffect(() => {
    (async () => {
      // Com vídeos do computador não se cria link nenhum.
      if (locais > 0) return;
      const ativo = inicial.shareToken && inicial.shareExpiresAt > Date.now();
      if (!ativo) setSessao(await repoSessoes.novoLink(inicial.id));
      sincronizar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ativo = sessao.shareToken && sessao.shareExpiresAt > Date.now();
  const url = ativo ? urlDoVideo(sessao.shareToken) : null;
  const texto = url ? t('video.partilha.texto', { titulo: sessao.title, url }) : '';
  const expira = ativo
    ? new Date(sessao.shareExpiresAt).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
    : null;
  const pendente = Boolean(sessao.dirty) || videoSoLocal();

  async function novo() {
    setSessao(await repoSessoes.novoLink(sessao.id));
    setCopiado(false);
    sincronizar();
  }

  async function desligar() {
    setSessao(await repoSessoes.desligarLink(sessao.id));
    sincronizar();
  }

  async function copiar() {
    setCopiado(await copiarTexto(url));
    if (pendente) sincronizar();
  }

  async function enviar(acao, { separador = false } = {}) {
    if (!pendente) return acao(null);
    const janela = separador ? prepararJanela() : null;
    let pronto = await sincronizar();
    if (!pronto) {
      pronto = await ui.confirmar(t('video.partilha.semSincronizar'), {
        okLabel: t('tatica.enviarNaMesma'),
      });
    }
    if (!pronto) {
      if (janela && !janela.closed) janela.close();
      return undefined;
    }
    return acao(janela);
  }

  if (locais > 0) {
    return (
      <Dialog title={t('video.partilha.titulo')} onClose={() => onFechar(sessao)}>
        <div data-partilha-local>
          <p className="modal__text">{t('video.partilha.comLocais', { n: locais })}</p>
          <p className="modal__text">{t('video.partilha.comLocaisComo')}</p>
          {ativo ? <p className="modal__hint tlink__aviso">{t('video.partilha.comLocaisLinkAtivo')}</p> : null}
        </div>
        <footer className="modal__actions">
          {ativo ? (
            <button className="btn btn--ghost btn--danger" onClick={desligar}>
              {t('tatica.desligarLink')}
            </button>
          ) : null}
          <button className="btn btn--primary" onClick={() => onFechar(sessao)}>
            {t('comum.fechar')}
          </button>
        </footer>
      </Dialog>
    );
  }

  return (
    <Dialog title={t('video.partilha.titulo')} onClose={() => onFechar(sessao)}>
      {!ativo ? (
        <>
          <p className="modal__text">{t('video.partilha.explica')}</p>
          <footer className="modal__actions">
            <button className="btn btn--ghost" onClick={() => onFechar(sessao)}>
              {t('comum.fechar')}
            </button>
            <button className="btn btn--primary" onClick={novo}>
              {t('tatica.criarLink')}
            </button>
          </footer>
        </>
      ) : (
        <>
          <p className="modal__text">
            {t('video.partilha.valido', { n: sessao.clipIds.length, data: expira })}
          </p>
          <div className="tlink">
            <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
            <button className="btn btn--ghost btn--tiny" onClick={copiar}>
              {copiado ? t('tatica.copiado') : t('tatica.copiar')}
            </button>
          </div>
          {aSincronizar ? (
            <p className="modal__hint">{t('tatica.aSincronizar')}</p>
          ) : pendente ? (
            <p className="modal__hint tlink__aviso">
              {videoSoLocal() ? t('video.partilha.semServidor') : t('video.partilha.porSubir')}
            </p>
          ) : (
            <p className="modal__hint">{t('video.partilha.pronto')}</p>
          )}
          <div className="tlink__acoes">
            <button
              className="btn btn--whatsapp"
              disabled={aSincronizar}
              onClick={() => enviar((janela) => abrirFora(linkWhatsApp(texto), janela), { separador: true })}
            >
              {t('tatica.enviarWhatsApp')}
            </button>
            {podePartilharNativo() ? (
              <button
                className="btn btn--ghost"
                disabled={aSincronizar}
                onClick={() => enviar(() => partilharNativo({ title: sessao.title, text: texto, url }))}
              >
                {t('tatica.outrasApps')}
              </button>
            ) : null}
            <button
              className="btn btn--ghost"
              disabled={aSincronizar}
              onClick={() => enviar((janela) => abrirFora(url, janela), { separador: true })}
            >
              {t('tatica.abrirLink')}
            </button>
          </div>
          <footer className="modal__actions">
            <button className="btn btn--ghost btn--danger" onClick={desligar}>
              {t('tatica.desligarLink')}
            </button>
            <button className="btn btn--ghost" onClick={novo} title={t('tatica.novoLinkHint')}>
              {t('tatica.novoLink')}
            </button>
          </footer>
        </>
      )}
    </Dialog>
  );
}

/**
 * Antes de partilhar clipes com um jogador: alguns (ou todos) são de vídeos
 * do computador e não podem ir por link. Devolve true se é para seguir só com
 * os do YouTube, ou null se se desistiu (ou não há nenhum do YouTube).
 */
export function AvisoPartilhaLocal({ locais, youtube = 0, onFechar }) {
  const t = useT();
  return (
    <Dialog title={t('video.partilha.titulo')} onClose={() => onFechar(null)}>
      <div data-partilha-local>
        <p className="modal__text">{t('video.partilha.comLocais', { n: locais })}</p>
        <p className="modal__text">{t('video.partilha.comLocaisComo')}</p>
      </div>
      <footer className="modal__actions">
        <button className={`btn ${youtube ? 'btn--ghost' : 'btn--primary'}`} onClick={() => onFechar(null)}>
          {t(youtube ? 'comum.cancelar' : 'comum.fechar')}
        </button>
        {youtube ? (
          <button className="btn btn--primary" onClick={() => onFechar(true)}>
            {t('video.partilha.soYoutube', { n: youtube })}
          </button>
        ) : null}
      </footer>
    </Dialog>
  );
}

/* ------------------------------------------------------ nome da sessão */

/** Dar (ou mudar) o nome a uma sessão. Devolve o nome, ou null. */
export function NomeDaSessao({ inicial = '', onFechar }) {
  const t = useT();
  const [titulo, setTitulo] = useState(inicial);
  return (
    <Dialog title={inicial ? t('video.sessao.renomear') : t('video.sessao.nova')} onClose={() => onFechar(null)}>
      <form
        className="vform"
        onSubmit={(e) => {
          e.preventDefault();
          if (titulo.trim()) onFechar(titulo.trim());
        }}
      >
        <input
          className="input"
          value={titulo}
          maxLength={200}
          autoFocus
          placeholder={t('video.sessao.nomeExemplo')}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <footer className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => onFechar(null)}>
            {t('comum.cancelar')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={!titulo.trim()}>
            {t('comum.guardar')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
