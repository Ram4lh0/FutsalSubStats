'use client';

import { useParams } from 'next/navigation';
import Guard from '@/components/Guard.jsx';
import PlayerForm from '@/components/PlayerForm.jsx';

export default function EditarJogador() {
  const { clubId, teamId, playerId } = useParams();
  return (
    <Guard>
      <PlayerForm clubId={clubId} teamId={teamId} playerId={playerId} />
    </Guard>
  );
}
