'use client';

// lib/ecraAceso.js — impedir que o ecrã adormeça durante o jogo.
//
// O problema é real e só aparece em campo: o treinador pousa o telemóvel no
// banco entre substituições, o ecrã apaga-se ao fim de trinta segundos, e a
// substituição seguinte custa desbloquear, encontrar a app e só então tocar.
// Três segundos que numa bancada parecem trinta.
//
// Usa a Screen Wake Lock API do próprio browser, sem plugin nenhum. Isso tem
// duas consequências que vale a pena ter escritas:
//
//   · No **Android** funciona — o WebView do Chrome suporta-a desde a versão 84,
//     e é onde o problema mais se nota, porque o tempo até o ecrã apagar é mais
//     curto por omissão.
//   · No **iOS** o WKWebView ainda não a implementa. A chamada falha, o código
//     apanha a falha e segue. A app não fica pior do que já estava, e não se
//     arrasta um plugin nativo para meia plataforma.
//
// O bloqueio é largado sozinho quando o separador vai para segundo plano — é o
// browser que o faz, não nós. Por isso é preciso voltar a pedi-lo quando a app
// regressa à frente, senão bastava atender uma chamada para o ecrã voltar a
// adormecer no resto do jogo.

import { useEffect } from 'react';

/**
 * Mantém o ecrã aceso enquanto `ativo` for verdadeiro.
 *
 * @param {boolean} ativo — normalmente `o jogo está a decorrer`.
 */
export default function useEcraAceso(ativo) {
  useEffect(() => {
    if (!ativo) return;
    if (typeof navigator === 'undefined' || !navigator.wakeLock) return;

    let bloqueio = null;
    let vivo = true;

    const pedir = async () => {
      if (!vivo || document.visibilityState !== 'visible') return;
      try {
        bloqueio = await navigator.wakeLock.request('screen');
      } catch {
        // Recusado (bateria fraca, política do sistema) ou não suportado. Não
        // há nada a dizer ao utilizador: o ecrã apaga-se como sempre se apagou.
      }
    };

    // O browser larga o bloqueio ao esconder o separador. Voltar à frente tem
    // de o pedir outra vez.
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && !bloqueio) pedir();
    };

    pedir();
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', aoVoltar);
      bloqueio?.release?.().catch(() => {});
      bloqueio = null;
    };
  }, [ativo]);
}
