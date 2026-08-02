'use client';

import { useParams } from 'next/navigation';
import Guard from '@/components/Guard.jsx';
import TeamForm from '@/components/TeamForm.jsx';

export default function EditarEscalao() {
  const { clubId, teamId } = useParams();
  return (
    <Guard>
      <TeamForm clubId={clubId} teamId={teamId} />
    </Guard>
  );
}
