'use client';


import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import PlayerForm from '@/components/PlayerForm.jsx';

export default function NovoJogador() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId } = useRouteParams();
  return (
      <PlayerForm clubId={clubId} teamId={teamId} />
  );
}
