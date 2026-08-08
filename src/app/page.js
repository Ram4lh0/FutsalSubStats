'use client';

// A porta de entrada. Não decide nada: manda para o painel dos clubes, e é o
// `Guard` de lá que trata de exigir a conta iniciada.
//
// O reencaminhamento é feito no browser, e não no servidor, porque servidor não
// há: a app é um conjunto de ficheiros, tanto na Vercel como dentro do iPad.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { rotas } from '@/lib/routes.js';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(rotas.dashboard());
  }, [router]);

  return <p className="muted" style={{ padding: 20 }}>A carregar…</p>;
}
