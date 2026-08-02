'use client';

import { useParams } from 'next/navigation';
import Guard from '@/components/Guard.jsx';
import TeamForm from '@/components/TeamForm.jsx';

export default function NovoEscalao() {
  const { clubId } = useParams();
  return (
    <Guard>
      <TeamForm clubId={clubId} />
    </Guard>
  );
}
