'use client';

import { useParams } from 'next/navigation';
import Guard from '@/components/Guard.jsx';
import ClubForm from '@/components/ClubForm.jsx';

export default function EditarClube() {
  const { clubId } = useParams();
  return (
    <Guard>
      <ClubForm clubId={clubId} />
    </Guard>
  );
}
