'use client';

// lib/beep.js — o aviso sonoro do fim da sanção.
//
// O iOS só deixa tocar som depois de um toque do utilizador, por isso o contexto
// de áudio é preparado quando se carrega no botão que inicia a contagem. Se não
// der, fica só o aviso visual — nunca é motivo para partir nada.

let ctx = null;

export function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx && !ctx) ctx = new Ctx();
    ctx?.resume?.();
  } catch {
    ctx = null;
  }
}

export function beep() {
  try {
    if (!ctx) return;
    for (const [i, freq] of [880, 1180].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.value = 0.12;
      const at = ctx.currentTime + i * 0.22;
      osc.start(at);
      osc.stop(at + 0.18);
    }
  } catch {
    /* sem som — o aviso visual chega */
  }
}
