'use client';

// Rota antiga: jogadores e jogos passaram a viver dentro de cada escalão.

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
