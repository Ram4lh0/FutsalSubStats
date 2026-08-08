'use client';


import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import ClubForm from '@/components/ClubForm.jsx';

export default function EditarClube() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId } = useRouteParams();
  return (
      <ClubForm clubId={clubId} />
  );
}
