'use client';

// Rota antiga: o plantel, os jogos e as estatísticas passaram a viver dentro de
// cada escalão. Quem chegar aqui por um marcador antigo vai parar aos escalões.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function RotaAntiga() {
  const { clubId } = useParams();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/clubs/${clubId}`);
  }, [clubId, router]);
  return <p className="muted">A redirecionar…</p>;
}
