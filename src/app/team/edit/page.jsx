'use client';


import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import TeamForm from '@/components/TeamForm.jsx';

export default function EditarEscalao() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId } = useRouteParams();
  return (
      <TeamForm clubId={clubId} teamId={teamId} />
  );
}
