'use client';

// app/clubs/new/page.jsx — criar clube. O mesmo formulário serve para editar,
// através de /clubs/[clubId]/edit.

import { Suspense } from 'react';
import ClubForm from '@/components/ClubForm.jsx';
import Guard from '@/components/Guard.jsx';

export default function NovoClube() {
  return (
    <Guard>
      <Suspense fallback={<p className="muted">A carregar…</p>}>
        <ClubForm />
      </Suspense>
    </Guard>
  );
}
