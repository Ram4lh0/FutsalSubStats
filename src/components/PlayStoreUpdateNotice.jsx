'use client';

import { useEffect, useRef } from 'react';
import { versoes } from '@/lib/atualizacoes.js';
import {
  dadosAndroidDoManifesto,
  eAndroidNativo,
  existeVersaoNova,
  urlsManifestoVersao,
} from '@/lib/appVersion.js';
import { useT } from '@/lib/i18n/index.js';
import { Dialog, useUI } from '@/lib/ui.jsx';

async function versaoNativaInstalada() {
  try {
    const plugin = globalThis?.Capacitor?.Plugins?.App;
    const info = await plugin?.getInfo?.();
    if (info?.version) return String(info.version);
  } catch {
    /* o plugin App pode não estar instalado; o Capgo também sabe a versão nativa */
  }

  const info = await versoes();
  return info?.casca ? String(info.casca) : '';
}

async function carregarManifesto() {
  for (const url of urlsManifestoVersao({ origem: globalThis?.location?.origin })) {
    try {
      const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (r.ok) return await r.json();
    } catch {
      /* tenta o próximo endereço */
    }
  }
  return null;
}

function vistoNestaSessao(chave) {
  try {
    return globalThis.sessionStorage?.getItem(chave) === '1';
  } catch {
    return false;
  }
}

function marcarVisto(chave) {
  try {
    globalThis.sessionStorage?.setItem(chave, '1');
  } catch {
    /* sem storage: mostra no máximo uma vez porque o componente só corre uma vez */
  }
}

function abrirLoja(url) {
  const janela = globalThis.open?.(url, '_blank', 'noopener,noreferrer');
  if (!janela && globalThis.location) globalThis.location.href = url;
}

export default function PlayStoreUpdateNotice() {
  const ui = useUI();
  const t = useT();
  const correu = useRef(false);

  useEffect(() => {
    if (correu.current) return;
    correu.current = true;
    let cancelado = false;

    (async () => {
      if (!eAndroidNativo()) return;

      const [instalada, manifesto] = await Promise.all([versaoNativaInstalada(), carregarManifesto()]);
      const publicada = dadosAndroidDoManifesto(manifesto);
      if (!instalada || !publicada.latestVersion) return;
      if (!existeVersaoNova(instalada, publicada.latestVersion)) return;

      const chave = `futsal-playstore-update:${publicada.latestVersion}`;
      if (vistoNestaSessao(chave) || cancelado) return;
      marcarVisto(chave);

      const escolha = await ui.open((close) => (
        <Dialog title={t('atualizacaoLoja.titulo')} onClose={() => close('depois')}>
          <p className="modal__text">{t('atualizacaoLoja.texto')}</p>
          <div className="atualizacao-loja__versoes">
            <span>{t('atualizacaoLoja.instalada', { versao: instalada })}</span>
            <span>{t('atualizacaoLoja.nova', { versao: publicada.latestVersion })}</span>
          </div>
          {publicada.notes ? <p className="modal__hint">{publicada.notes}</p> : null}
          <footer className="modal__actions">
            <button className="btn btn--ghost" onClick={() => close('depois')}>
              {t('atualizacaoLoja.depois')}
            </button>
            <button className="btn btn--primary" onClick={() => close('abrir')}>
              {t('atualizacaoLoja.abrir')}
            </button>
          </footer>
        </Dialog>
      ));

      if (escolha === 'abrir') abrirLoja(publicada.playStoreUrl);
    })();

    return () => {
      cancelado = true;
    };
  }, [ui, t]);

  return null;
}
