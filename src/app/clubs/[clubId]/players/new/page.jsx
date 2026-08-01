'use client';

import { useParams } from 'next/navigation';
import Guard from '@/components/Guard.jsx';
import PlayerForm from '@/components/PlayerForm.jsx';

export default function NovoJogador() {
  const { clubId } = useParams();
  return (
    <Guard>
      <PlayerForm clubId={clubId} />
    </Guard>
  );
}
