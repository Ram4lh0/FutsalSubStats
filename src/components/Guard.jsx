'use client';

// components/Guard.jsx — o que envolve as páginas que precisam de conta.
//
// Sem servidor configurado não há conta nenhuma a exigir: a app corre em modo
// só-dispositivo, como corria antes. É o que permite experimentá-la sem nada
// montado do outro lado.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { rotas } from '@/lib/routes.js';

export default function Guard({ children }) {
  const router = useRouter();
  const { ready, session, remote } = useAuth();

  useEffect(() => {
    if (ready && remote && !session) router.replace(rotas.login());
  }, [ready, remote, session, router]);

  if (!ready) return <p className="muted" style={{ padding: 20 }}>A carregar…</p>;
  if (remote && !session) return null;
  return children;
}
