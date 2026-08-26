'use client';

import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import CompetitionForm from '@/components/CompetitionForm.jsx';

export default function EditarCompeticao() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId, competitionId } = useRouteParams();
  return (
    <CompetitionForm clubId={clubId} teamId={teamId} competitionId={competitionId} />
  );
}
