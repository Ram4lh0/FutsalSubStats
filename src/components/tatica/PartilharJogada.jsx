'use client';

// components/tatica/PartilharJogada.jsx — o link de 30 dias de uma jogada.
//
// Quem recebe o link abre a jogada no browser, sem conta nem app, com o mesmo
// leitor: play, frame a frame e as velocidades. Passados 30 dias o link deixa
// de abrir a jogada e diz para pedir um novo ao treinador.
//
// O link só funciona depois de chegar ao servidor. Se ainda estiver na fila
// (sem rede), avisa-se — mas deixa-se partilhar na mesma: quando a rede voltar,
// o link passa a abrir.

import { useEffect, useState } from 'react';
import { Dialog } from '@/lib/ui.jsx';
import { jogadas as repoJogadas } from '@/lib/data/treino.js';
import { SYNC, estadoAtual, subscribe, treinoSoLocal } from '@/lib/data/sync.js';
import {
  abrirFora,
  copiarTexto,
  linkWhatsApp,
  partilharNativo,
  podePartilharNativo,
  urlDaJogada,
} from '@/lib/partilha.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

export default function PartilharJogada({ jogada: inicial, onFechar }) {
  const t = useT();
  const locale = useLocale();
  const [jogada, setJogada] = useState(inicial);
  const [copiado, setCopiado] = useState(false);
  const [sync, setSync] = useState(estadoAtual());

  useEffect(() => subscribe(setSync), []);

  const ativo = jogada.shareToken && jogada.shareExpiresAt > Date.now();
  const url = ativo ? urlDaJogada(jogada.shareToken) : null;
  const texto = url ? t('tatica.textoPartilha', { titulo: jogada.title, url }) : '';
  const expira = ativo
    ? new Date(jogada.shareExpiresAt).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
    : null;
  const pendente = sync.status !== SYNC.SYNCED || treinoSoLocal();

  async function criar() {
    setJogada(await repoJogadas.novoLink(jogada.id));
    setCopiado(false);
  }

  async function desligar() {
    setJogada(await repoJogadas.desligarLink(jogada.id));
  }

  async function copiar() {
    setCopiado(await copiarTexto(url));
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
          {pendente ? (
            <p className="modal__hint tlink__aviso">
              {treinoSoLocal() ? t('tatica.servidorSemTabelas') : t('tatica.aindaNaoSincronizou')}
            </p>
          ) : null}
          <div className="tlink__acoes">
            <button className="btn btn--whatsapp" onClick={() => abrirFora(linkWhatsApp(texto))}>
              {t('tatica.enviarWhatsApp')}
            </button>
            {podePartilharNativo() ? (
              <button
                className="btn btn--ghost"
                onClick={() => partilharNativo({ title: jogada.title, text: texto, url })}
              >
                {t('tatica.outrasApps')}
              </button>
            ) : null}
            <button className="btn btn--ghost" onClick={() => abrirFora(url)}>
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
