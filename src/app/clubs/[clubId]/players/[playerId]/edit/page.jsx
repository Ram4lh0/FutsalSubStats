'use client';

import { useParams } from 'next/navigation';
import Guard from '@/components/Guard.jsx';
import PlayerForm from '@/components/PlayerForm.jsx';

export default function EditarJogador() {
  const { clubId, playerId } = useParams();
  return (
    <Guard>
      <PlayerForm clubId={clubId} playerId={playerId} />
    </Guard>
  );
}
