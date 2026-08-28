'use client';

import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import StaffManagement from '@/components/StaffManagement.jsx';
import { useT } from '@/lib/i18n/index.js';

export default function StaffPage() {
  const t = useT();
  return (
    <Pagina>
      <PageHead title={t('equipaTecnica.titulo')} />
      <StaffManagement />
      <div className="safe-scroll-tail" aria-hidden="true" />
    </Pagina>
  );
}
