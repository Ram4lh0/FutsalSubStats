'use client';

// lib/pwa.js — instalar a app a partir do browser, e fazê-la abrir sem rede.
//
// A app corre em três sítios: o site, o invólucro do iOS e o do Android. Este
// ficheiro só diz respeito ao primeiro.
//
// ## Porquê
//
// Guardar os dados no aparelho já estava feito — é o IndexedDB, e é o que
// permite cronometrar um jogo inteiro sem rede. O que faltava era guardar o
// **código**: aberta pelo browser, a app ia buscar o HTML e o JavaScript ao
// servidor a cada abertura. Num pavilhão sem sinal não abria de todo.
//
// Com isto, um treinador pode instalar a app pelo Chrome — "adicionar ao ecrã
// principal" — e ela passa a funcionar como uma app instalada, offline
// incluído, sem passar por loja nenhuma.
//
// ## A regra que este ficheiro existe para cumprir
//
// **O service worker nunca corre dentro do Capacitor.**
//
// Lá dentro os ficheiros já vão no APK, e quem trata das atualizações é o
// sistema de pacotes ao vivo (ver `atualizacoes.js`). Um service worker a
// guardar versões por cima disso dá dois donos para a mesma pergunta — "qual é
// a versão actual?" — e o resultado é uma app presa numa versão antiga que nem
// um pacote novo nem uma ida à loja conseguem destravar, porque quem responde
// aos pedidos é a cache.
//
// É um problema difícil de diagnosticar e trivial de evitar: basta não o
// registar. E se já lá estiver de uma versão anterior, tira-se.

/** A app está a correr dentro do invólucro nativo? */
function dentroDoInvolucro() {
  // Pelo registo global, não por `import`: um plugin do Capacitor importado em
  // `src/` entra no pacote web, onde nunca corre. Ver `check-imports.mjs`.
  const cap = globalThis?.Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function') return Boolean(cap.isNativePlatform());
  if (typeof cap.getPlatform === 'function') return cap.getPlatform() !== 'web';
  return Boolean(cap.isNative);
}

/**
 * Regista o service worker — ou desfaz-se dele, se estivermos no telemóvel.
 *
 * Silenciosa e sem consequências: se falhar, a app corre exactamente como corria
 * antes, só que precisa de rede para abrir. Nunca vale a pena estragar um
 * arranque por causa disto.
 */
export function prepararOffline() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  if (dentroDoInvolucro()) {
    // Limpeza defensiva. Uma versão antiga da app pode ter deixado um registado
    // antes desta regra existir, e nesse caso ele continuaria a responder aos
    // pedidos dentro do invólucro para sempre.
    navigator.serviceWorker
      .getRegistrations()
      .then((registos) => registos.forEach((r) => r.unregister()))
      .catch(() => {});
    return;
  }

  // Depois do `load` de propósito: registar durante o arranque compete pela
  // rede com os ficheiros de que o primeiro ecrã precisa, e a primeira abertura
  // — a única em que a pessoa está a decidir se isto presta — fica mais lenta.
  const registar = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Sem HTTPS, em modo privado, ou com o ficheiro em falta. Não é erro do
      // utilizador nem há nada que ele possa fazer.
    });
  };

  if (document.readyState === 'complete') registar();
  else window.addEventListener('load', registar, { once: true });
}
