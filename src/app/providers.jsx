'use client';

// app/providers.jsx — o que envolve todas as páginas: sessão, avisos e a ponte
// para o servidor. A sincronização vive aqui em cima para continuar a correr
// enquanto se navega entre ecrãs.

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth.jsx';
import { UIProvider } from '@/lib/ui.jsx';
import { supabase } from '@/lib/supabase/client.js';
import * as sync from '@/lib/data/sync.js';

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <UIProvider>
        <SyncBridge />
        <LiveChrome />
        {children}
      </UIProvider>
    </AuthProvider>
  );
}

/**
 * Durante o jogo o cabeçalho encolhe e o conteúdo tenta caber no ecrã sem
 * deslizar. É só uma classe no contentor, como na versão anterior.
 */
function LiveChrome() {
  const pathname = usePathname();
  useEffect(() => {
    const el = document.getElementById('app');
    if (el) el.classList.toggle('is-live', /\/live$/.test(pathname || ''));
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
  const isLive = /\/live$/.test(pathname || '');

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
