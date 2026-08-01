'use client';

// Histórico de ações do jogo, com a possibilidade de anular.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Guard from '@/components/Guard.jsx';
import PageHead from '@/components/PageHead.jsx';
import DataTable from '@/components/DataTable.jsx';
import { Badge, Empty } from '@/components/bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { events, loadMatch } from '@/lib/data/repository.js';
import { matchEventsCsv, download, slug } from '@/lib/data/exporter.js';
import * as A from '@/domain/actions.js';
import { fmt } from '@/domain/clock.js';
import { EVENT_LABEL, POSITION_LABEL, UNDOABLE_EVENTS } from '@/domain/constants.js';

export default function EventsPage() {
  return (
    <Guard>
      {/* useSearchParams obriga a uma fronteira de suspense no App Router. */}
      <Suspense fallback={<p className="muted">A carregar…</p>}>
        <Historico />
      </Suspense>
    </Guard>
  );
}

function Historico() {
  const { matchId } = useParams();
  const search = useSearchParams();
  const { toast, confirmar } = useUI();
  const [dados, setDados] = useState(null);

  // Volta-se para a aba de onde se veio: a meio do jogo, no intervalo ou no
  // resumo. Sem isto, sair do histórico atirava sempre para o resumo.
  const back = search.get('back');
  const backTo =
    search.get('from') === 'live'
      ? `/matches/${matchId}/live`
      : `/matches/${matchId}/summary${back ? `?back=${encodeURIComponent(back)}` : ''}`;

  const carregar = useCallback(async () => {
    setDados((await loadMatch(matchId)) || { vazio: true });
  }, [matchId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!dados) return <p className="muted">A carregar…</p>;
  if (dados.vazio) return <Empty>Jogo não encontrado.</Empty>;

  const { match, state } = dados;
  const nome = (id) => state.players[id]?.name || '';

  async function anular(e) {
    const ok = await confirmar(
      `Anular "${EVENT_LABEL[e.eventType]}"? Os períodos em campo são recalculados.`,
      { okLabel: 'Anular' }
    );
    if (!ok) return;
    await events.markUndone(e.id);
    await events.append(A.undoEvent(state, e));
    toast('Evento anulado.', 'ok');
    carregar();
  }

  return (
    <>
      <PageHead
        title="Histórico de ações"
        subtitle={`vs ${match.opponentName} · ${state.allEvents.length} eventos`}
        backTo={backTo}
        actions={
          <button
            className="btn btn--ghost"
            onClick={() =>
              download(
                `eventos-${slug(match.opponentName)}.csv`,
                matchEventsCsv({ match, state }),
                'text/csv;charset=utf-8'
              )
            }
          >
            Exportar CSV
          </button>
        }
      />

      <DataTable>
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Ação</th>
            <th className="num">Parte</th>
            <th className="num">Tempo</th>
            <th>Detalhe</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.allEvents.map((e) => (
            <tr key={e.id} className={e.undoneAt ? 'is-undone' : ''}>
              <td className="num mono">{e.seq}</td>
              <td>{EVENT_LABEL[e.eventType] || e.eventType}</td>
              <td className="num">{e.period || '—'}</td>
              <td className="num mono">{fmt(e.matchElapsedMs)}</td>
              <td className="muted">
                {[
                  e.playerOutId ? `Sai ${nome(e.playerOutId)}` : null,
                  e.playerInId ? `Entra ${nome(e.playerInId)}` : null,
                  e.playerId ? nome(e.playerId) : null,
                  e.position ? POSITION_LABEL[e.position] : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </td>
              <td className="right">
                {e.undoneAt ? (
                  <Badge kind="muted">Anulado</Badge>
                ) : UNDOABLE_EVENTS.has(e.eventType) ? (
                  <button className="btn btn--tiny btn--ghost" onClick={() => anular(e)}>
                    Anular
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}
