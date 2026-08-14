'use client';

// components/Guard.jsx — o que envolve as páginas que precisam de conta.
//
// Três situações deixam passar:
//
// 1. Não há servidor configurado — a app corre em modo só-dispositivo, como
//    corria antes de haver contas. É o que permite experimentá-la sem nada
//    montado do outro lado.
// 2. Há sessão iniciada, que é o caso normal.
// 3. Está a decorrer o jogo de experiência. Cronometrar um jogo não precisa de
//    servidor nenhum, e obrigar a criar conta para isso seria pedir a alguém que
//    se registe antes de saber para que serve a app.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { emDemo } from '@/lib/demo.js';
import { rotas } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

export default function Guard({ children }) {
  const router = useRouter();
  const t = useT();
  const { ready, session, remote } = useAuth();
  const demo = emDemo();

  useEffect(() => {
    if (ready && remote && !session && !demo) router.replace(rotas.login());
  }, [ready, remote, session, demo, router]);

  if (!ready)
    return (
      <p className="muted" style={{ padding: 20 }}>
        {t('comum.aCarregar')}
      </p>
    );
  if (remote && !session && !demo) return null;
  return children;
}
