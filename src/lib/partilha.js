'use client';

// lib/partilha.js — mandar o link de uma jogada para fora da app.
//
// O link aponta sempre para a versão web: quem o recebe no WhatsApp não tem a
// app, nem conta. Dentro do telemóvel a app corre em `capacitor://localhost`
// (iOS) ou `https://localhost` (Android), que não servem a mais ninguém — por
// isso aí usa-se o endereço público. No browser usa-se o endereço onde se está,
// o que deixa testar em localhost com o link a abrir na mesma máquina.

import { rotas } from './routes.js';

const URL_WEB = 'https://futsalsubstats.vercel.app';

function nativo() {
  if (typeof window === 'undefined') return false;
  const cap = window.Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function') return Boolean(cap.isNativePlatform());
  if (typeof cap.getPlatform === 'function') return cap.getPlatform() !== 'web';
  return Boolean(cap.isNative);
}

export function urlDaJogada(token) {
  const base =
    !nativo() && typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)
      ? window.location.origin
      : URL_WEB;
  return `${base}${rotas.jogadaPublica(token)}`;
}

/**
 * O `wa.me` abre o WhatsApp com o texto já escrito, à espera de se escolher a
 * conversa. Funciona no iPhone, no Android e no computador (WhatsApp Web).
 */
export function linkWhatsApp(texto) {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

/**
 * Abrir um endereço fora da app. Dentro do invólucro nativo, mudar o
 * `location` para outro domínio é o que o Capacitor entrega ao sistema (e daí
 * ao WhatsApp); no browser abre-se noutro separador.
 */
export function abrirFora(url) {
  if (typeof window === 'undefined') return;
  if (nativo()) {
    window.location.href = url;
    return;
  }
  window.open(url, '_blank', 'noopener');
}

/** A folha de partilha do sistema, quando existe (telemóveis, Safari). */
export function podePartilharNativo() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function partilharNativo({ title, text, url }) {
  try {
    await navigator.share({ title, text, url });
    return true;
  } catch {
    return false;
  }
}

/**
 * Copiar texto. O `navigator.clipboard` não existe em alguns invólucros
 * antigos; o contorno com uma `textarea` escondida funciona em quase tudo.
 */
export async function copiarTexto(texto) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      /* cai para o contorno abaixo */
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
