// lib/appVersion.js — comparação entre a versão instalada e a publicada.
//
// A Play Store não oferece uma API pública simples para o JavaScript perguntar
// "qual é a versão mais recente?". Por isso a app lê um manifesto nosso,
// publicado junto do site, e compara esse valor com a versão nativa que o
// invólucro Android reporta.

export const ANDROID_APP_ID = 'com.futsalsubstats.app';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_APP_ID}`;

const MANIFESTO_PADRAO = 'https://futsalstats.vercel.app/app-version.json';
const MANIFESTO_ANTIGO = 'https://futsal-lake-five.vercel.app/app-version.json';

function partes(v) {
  return String(v || '')
    .trim()
    .split(/[.+-]/)
    .map((p) => Number((p.match(/\d+/) || ['0'])[0]));
}

export function compararVersoes(a, b) {
  const av = String(a || '').trim();
  const bv = String(b || '').trim();
  if (!av && !bv) return 0;
  if (!av) return -1;
  if (!bv) return 1;

  const aa = partes(av);
  const bb = partes(bv);
  const n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i++) {
    const x = aa[i] || 0;
    const y = bb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function existeVersaoNova(instalada, publicada) {
  return compararVersoes(instalada, publicada) < 0;
}

export function eAndroidNativo(cap = globalThis?.Capacitor) {
  if (!cap) return false;
  const plataforma = cap.getPlatform?.();
  if (plataforma !== 'android') return false;
  if (cap.isNativePlatform?.() === false) return false;
  return Boolean(cap.isNativePlatform?.() || cap.isNative === true || plataforma === 'android');
}

export function dadosAndroidDoManifesto(manifesto) {
  const android = manifesto?.android || {};
  const appId = String(android.appId || ANDROID_APP_ID).trim();
  const latestVersion = String(android.latestVersion || android.version || '').trim();
  return {
    appId,
    latestVersion,
    playStoreUrl: android.playStoreUrl || `https://play.google.com/store/apps/details?id=${appId}`,
    notes: android.notes || android.releaseNotes || '',
  };
}

export function urlsManifestoVersao({ origem, configurado } = {}) {
  const urls = [];
  const cfg = String(configurado || process.env.NEXT_PUBLIC_APP_VERSION_MANIFEST_URL || '').trim();
  if (cfg) urls.push(cfg);
  if (origem && /^https?:\/\//i.test(origem)) urls.push(`${origem}/app-version.json`);
  urls.push(MANIFESTO_PADRAO, MANIFESTO_ANTIGO);
  return [...new Set(urls)];
}
