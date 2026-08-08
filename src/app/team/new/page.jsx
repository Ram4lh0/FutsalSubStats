'use client';


import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import TeamForm from '@/components/TeamForm.jsx';

export default function NovoEscalao() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId } = useRouteParams();
  return (
      <TeamForm clubId={clubId} />
  );
}
