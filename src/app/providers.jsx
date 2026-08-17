'use client';

// app/providers.jsx — o que envolve todas as páginas: sessão, avisos e a ponte
// para o servidor. A sincronização vive aqui em cima para continuar a correr
// enquanto se navega entre ecrãs.

import { Fragment, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { noJogoAoVivo } from '@/lib/routes.js';
import { AuthProvider, useAuth } from '@/lib/auth.jsx';
import { UIProvider } from '@/lib/ui.jsx';
import { supabase } from '@/lib/supabase/client.js';
import * as sync from '@/lib/data/sync.js';
import { garantirDono } from '@/lib/data/owner.js';
import { useIdioma, useLocale } from '@/lib/i18n/index.js';
import { marcarArranqueBemSucedido } from '@/lib/atualizacoes.js';
import { prepararOffline } from '@/lib/pwa.js';

export default function Providers({ children }) {
  // Primeira coisa a acontecer na app, e de propósito: se um pacote novo tiver
  // sido aplicado, é esta chamada que o dá como bom. Sem ela, ao fim de 20
  // segundos o invólucro nativo assume que está partido e volta ao anterior.
  //
  // Está aqui em cima, e não dentro de nenhum ecrã, porque tem de correr mesmo
  // que o resto da app não consiga carregar nada — sem rede, sem sessão, sem
  // base de dados. "A app abriu" é a única coisa que isto afirma.
  useEffect(() => {
    marcarArranqueBemSucedido();
  }, []);

  // A outra metade do offline. O IndexedDB já guardava os dados; isto guarda o
  // código, para a app aberta pelo browser abrir num pavilhão sem rede. Dentro
  // do invólucro não faz nada — lá os ficheiros já vão no APK, e quem manda nas
  // versões é o sistema de pacotes ao vivo.
  useEffect(() => {
    prepararOffline();
  }, []);

  return (
    <AuthProvider>
      <UIProvider>
        <SyncBridge />
        <LiveChrome />
        <Idioma>{children}</Idioma>
      </UIProvider>
    </AuthProvider>
  );
}

/**
 * Faz a app inteira voltar a desenhar-se quando o idioma muda.
 *
 * O `key` é o truque todo. Sem ele, só os componentes que chamam `useT()` é que
 * se redesenhavam — e há muitos que mostram texto traduzido através de funções
 * como `positionLabel()` sem nunca tocarem no hook. Ficavam em português no meio
 * de um ecrã em espanhol, e o utilizador só via a app corrigir-se aos poucos à
 * medida que navegava.
 *
 * Mudar o `key` deita a árvore fora e monta-a de novo, o que garante que não
 * fica um único texto para trás. Custa o estado dos formulários abertos, mas
 * trocar de idioma é uma ação deliberada, feita nas definições, onde não há
 * nada a meio.
 *
 * O `lang` do documento acompanha, porque é o que diz ao leitor de ecrã em que
 * língua há-de pronunciar o que está escrito.
 */
function Idioma({ children }) {
  const idioma = useIdioma();
  const locale = useLocale();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <Fragment key={idioma}>{children}</Fragment>;
}

/**
 * Durante o jogo o cabeçalho encolhe e o conteúdo tenta caber no ecrã sem
 * deslizar. É só uma classe no contentor, como na versão anterior.
 */
function LiveChrome() {
  const pathname = usePathname();
  useEffect(() => {
    const el = document.getElementById('app');
    if (el) el.classList.toggle('is-live', noJogoAoVivo(pathname));
  }, [pathname]);
  return null;
}

/**
 * Liga a fila ao servidor e mantém-na a andar.
 *
 * Três momentos pedem uma tentativa de envio: entrar na conta, voltar a haver
 * rede, e de minuto a minuto. Nada disto interrompe o que está no ecrã — se
 * falhar, fica para a próxima.
 */
function SyncBridge() {
  const { userId, user } = useAuth();
  const pathname = usePathname();
  const isLive = noJogoAoVivo(pathname);

  useEffect(() => {
    sync.setRemote(supabase());
  }, []);

  useEffect(() => {
    if (!userId) return;

    let vivo = true;
    const sincronizar = () => {
      sync.pendingCount();
      return sync.flush(userId, user?.email);
    };
    const atualizar = async () => {
      if (isLive) {
        await sync.pendingCount();
        return;
      }
      try {
        await sync.pull(userId);
      } catch {
        /* sem rede: fica para depois */
      }
      return sincronizar();
    };
    (async () => {
      // A base deste aparelho é de uma conta de cada vez. Se a última a usá-lo
      // foi outra — ou o jogo de experiência —, é limpa antes de qualquer
      // leitura, para as duas não se misturarem no ecrã.
      await garantirDono(userId);
      // Primeiro trazer o que existe lá em cima (dispositivo novo, ou jogos
      // criados noutro), depois empurrar o que ficou por enviar aqui.
      if (vivo) await atualizar();
    })();

    const aoVoltar = () => atualizar();
    const aoFocar = () => {
      if (document.visibilityState === 'visible') atualizar();
    };
    window.addEventListener('online', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    document.addEventListener('visibilitychange', aoFocar);
    window.addEventListener(sync.DATA_CHANGED_EVENT, aoVoltar);
    const timer = isLive ? null : setInterval(aoVoltar, 3000);

    return () => {
      vivo = false;
      window.removeEventListener('online', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
      document.removeEventListener('visibilitychange', aoFocar);
      window.removeEventListener(sync.DATA_CHANGED_EVENT, aoVoltar);
      if (timer) clearInterval(timer);
    };
  }, [userId, user?.email, isLive]);

  return null;
}
