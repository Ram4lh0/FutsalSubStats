'use client';

import { useParams } from 'next/navigation';
import Guard from '@/components/Guard.jsx';
import CompetitionForm from '@/components/CompetitionForm.jsx';

export default function NovaCompeticao() {
  const { clubId, teamId } = useParams();
  return (
    <Guard>
      <CompetitionForm clubId={clubId} teamId={teamId} />
    </Guard>
  );
}
