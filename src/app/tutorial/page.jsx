'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import { startGuidedTutorial } from '@/lib/tutorial.js';
import { useT } from '@/lib/i18n/index.js';

export default function TutorialPage() {
  return (
    <Pagina>
      <ArrancarTutorial />
    </Pagina>
  );
}

function ArrancarTutorial() {
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    startGuidedTutorial(router);
  }, [router]);

  return <p className="muted">{t('tutorial.guiado.aComecar')}</p>;
}
