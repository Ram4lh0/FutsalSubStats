'use client';

// components/tatica/PartilharJogada.jsx — o link de 30 dias de uma jogada.
//
// Quem recebe o link abre a jogada no browser, sem conta nem app, com o mesmo
// leitor: play, frame a frame e as velocidades. Passados 30 dias o link deixa
// de abrir a jogada e diz para pedir um novo ao treinador.
//
// O link só funciona depois de a jogada chegar ao servidor. Por isso o diálogo
// sincroniza logo ao abrir e ao criar o link, e volta a tentar no toque em
// "Enviar": quem recebe o link não pode dar com "indisponível" porque a jogada
// ainda estava só no telemóvel. Sem rede, pergunta-se antes de enviar — quando
// a rede voltar, o link passa a abrir.
//
// "Por enviar" é desta jogada (`dirty`), e não o estado geral da sincronização:
// esse dizia "sincronizado" com a jogada ainda por subir.

import { useCallback, useEffect, useState } from 'react';
import { Dialog, useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { jogadas as repoJogadas } from '@/lib/data/treino.js';
import { saveNow, subscribe, treinoSoLocal } from '@/lib/data/sync.js';
import {
  abrirFora,
  copiarTexto,
  linkWhatsApp,
  partilharNativo,
  podePartilharNativo,
  prepararJanela,
  urlDaJogada,
} from '@/lib/partilha.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

export default function PartilharJogada({ jogada: inicial, onFechar }) {
  const t = useT();
  const locale = useLocale();
  const ui = useUI();
  const { userId, user } = useAuth();
  const [jogada, setJogada] = useState(inicial);
  const [copiado, setCopiado] = useState(false);
  const [aSincronizar, setASincronizar] = useState(false);

  /** Relê a jogada do aparelho: é lá que diz se já subiu (`dirty`). */
  const reler = useCallback(async () => {
    const fresca = await repoJogadas.get(inicial.id);
    if (fresca) setJogada(fresca);
    return fresca;
  }, [inicial.id]);

  /** Tenta subir já. Devolve true se a jogada ficou mesmo no servidor. */
  const sincronizar = useCallback(async () => {
    setASincronizar(true);
    try {
      await saveNow(userId, user?.email);
      const fresca = await reler();
      return Boolean(fresca && !fresca.dirty) && !treinoSoLocal();
    } finally {
      setASincronizar(false);
    }
  }, [userId, user?.email, reler]);

  // Cada passagem da fila pode ter levado a jogada: o aviso acompanha.
  useEffect(() => subscribe(() => reler()), [reler]);

  // Ao abrir, se ainda houver alguma coisa desta jogada por subir, sobe já.
  useEffect(() => {
    if (inicial.dirty) sincronizar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ativo = jogada.shareToken && jogada.shareExpiresAt > Date.now();
  const url = ativo ? urlDaJogada(jogada.shareToken) : null;
  const texto = url ? t('tatica.textoPartilha', { titulo: jogada.title, url }) : '';
  const expira = ativo
    ? new Date(jogada.shareExpiresAt).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
    : null;
  const pendente = Boolean(jogada.dirty) || treinoSoLocal();

  async function criar() {
    setJogada(await repoJogadas.novoLink(jogada.id));
    setCopiado(false);
    sincronizar();
  }

  async function desligar() {
    setJogada(await repoJogadas.desligarLink(jogada.id));
    sincronizar();
  }

  async function copiar() {
    // Copia-se no toque (o browser só deixa aí) e sobe-se a seguir.
    setCopiado(await copiarTexto(url));
    if (pendente) sincronizar();
  }

  /**
   * Enviar só depois de a jogada estar no servidor. Já lá estando, segue no
   * próprio toque. Senão, sincroniza primeiro; se mesmo assim não subir (sem
   * rede), pergunta se é para enviar na mesma.
   */
  async function enviar(acao, { separador = false } = {}) {
    if (!pendente) return acao(null);
    const janela = separador ? prepararJanela() : null;
    let pronto = await sincronizar();
    if (!pronto) {
      pronto = await ui.confirmar(t('tatica.enviarSemSincronizar'), {
        okLabel: t('tatica.enviarNaMesma'),
      });
    }
    if (!pronto) {
      if (janela && !janela.closed) janela.close();
      return;
    }
    acao(janela);
  }

  return (
    <Dialog title={t('tatica.partilhar')} onClose={() => onFechar(jogada)}>
      {!ativo ? (
        <>
          <p className="modal__text">
            {jogada.shareToken ? t('tatica.linkExpirou') : t('tatica.partilharExplica')}
          </p>
          <footer className="modal__actions">
            <button className="btn btn--ghost" onClick={() => onFechar(jogada)}>
              {t('comum.fechar')}
            </button>
            <button className="btn btn--primary" onClick={criar}>
              {t('tatica.criarLink')}
            </button>
          </footer>
        </>
      ) : (
        <>
          <p className="modal__text">{t('tatica.linkValidoAte', { data: expira })}</p>
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
              {treinoSoLocal() ? t('tatica.servidorSemTabelas') : t('tatica.aindaNaoSincronizou')}
            </p>
          ) : (
            <p className="modal__hint">{t('tatica.linkSincronizado')}</p>
          )}
          <div className="tlink__acoes">
            <button
              className="btn btn--whatsapp"
              disabled={aSincronizar}
              onClick={() =>
                enviar((janela) => abrirFora(linkWhatsApp(texto), janela), { separador: true })
              }
            >
              {t('tatica.enviarWhatsApp')}
            </button>
            {podePartilharNativo() ? (
              <button
                className="btn btn--ghost"
                disabled={aSincronizar}
                onClick={() =>
                  enviar(() => partilharNativo({ title: jogada.title, text: texto, url }))
                }
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
            <button className="btn btn--ghost" onClick={criar} title={t('tatica.novoLinkHint')}>
              {t('tatica.novoLink')}
            </button>
          </footer>
        </>
      )}
    </Dialog>
  );
}
