'use client';

// Aba Definições: editar ou apagar o clube.

import { useParams, useRouter } from 'next/navigation';
import ClubShell from '@/components/ClubShell.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { clubs } from '@/lib/data/repository.js';
import * as sync from '@/lib/data/sync.js';

export default function SettingsPage() {
  const { clubId } = useParams();
  const router = useRouter();
  const { toast, confirmar } = useUI();
  const { userId, user } = useAuth();

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
                try {
                  await clubs.archive(club.id);
                  await sync.saveNow(userId, user?.email);
                  toast('Clube apagado e sincronizado.', 'ok');
                  router.push('/dashboard');
                } catch (err) {
                  toast(`Clube apagado neste dispositivo, mas ainda não subiu: ${err.message}`, 'error');
                  router.push('/dashboard');
                }
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
