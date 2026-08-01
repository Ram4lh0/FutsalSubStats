'use client';

// Aba Definições: editar ou apagar o clube.

import { useParams, useRouter } from 'next/navigation';
import ClubShell from '@/components/ClubShell.jsx';
import { useUI } from '@/lib/ui.jsx';
import { clubs } from '@/lib/data/repository.js';

export default function SettingsPage() {
  const { clubId } = useParams();
  const router = useRouter();
  const { toast, confirmar } = useUI();

  return (
    <ClubShell clubId={clubId}>
      {({ club }) => (
        <div className="card form">
          <h2 className="section">Clube</h2>
          <div className="form__actions form__actions--left">
            <button
              className="btn btn--ghost"
              onClick={() => router.push(`/clubs/${club.id}/edit`)}
            >
              Editar dados do clube
            </button>
            <button
              className="btn btn--danger"
              onClick={async () => {
                const ok = await confirmar(
                  `Apagar "${club.name}" elimina o plantel, os jogos e todos os eventos. Esta ação não pode ser anulada.`,
                  { okLabel: 'Apagar clube' }
                );
                if (!ok) return;
                await clubs.remove(club.id);
                toast('Clube apagado.', 'ok');
                router.push('/dashboard');
              }}
            >
              Apagar clube
            </button>
          </div>

          <h2 className="section">Exportação</h2>
          <p className="muted">
            A exportação por jogo está disponível na página de resumo de cada jogo. O backup
            completo está no ecrã inicial.
          </p>
        </div>
      )}
    </ClubShell>
  );
}
