'use client';

// Histórico de ações do jogo, com a possibilidade de anular.

import { useCallback, useEffect, useState } from 'react';

import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import PageHead from '@/components/PageHead.jsx';
import DataTable from '@/components/DataTable.jsx';
import { Badge, Empty } from '@/components/bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { events, loadMatch } from '@/lib/data/repository.js';
import { matchEventsCsv, download, slug } from '@/lib/data/exporter.js';
import * as A from '@/domain/actions.js';
import { fmt } from '@/domain/clock.js';
import { UNDOABLE_EVENTS } from '@/domain/constants.js';
import { eventLabel, positionLabel } from '@/lib/format.js';
import { rotas, comOrigem } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

export default function EventsPage() {
  return (
    <Pagina>
        <Historico />
    </Pagina>
  );
}

function Historico() {
  const { matchId, back, de } = useRouteParams();
  const t = useT();
  const { toast, confirmar } = useUI();
  const [dados, setDados] = useState(null);

  // Volta-se para a aba de onde se veio: a meio do jogo, no intervalo ou no
  // resumo. Sem isto, sair do histórico atirava sempre para o resumo.
  const backTo =
    de === 'live'
      ? rotas.jogoAoVivo(matchId)
      : comOrigem(rotas.jogoResumo(matchId), { atras: back });

  const carregar = useCallback(async () => {
    setDados((await loadMatch(matchId)) || { vazio: true });
  }, [matchId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!dados) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (dados.vazio) return <Empty>{t('jogo.naoEncontrado')}</Empty>;

  const { match, state } = dados;
  const nome = (id) => state.players[id]?.name || '';

  async function anular(e) {
    const ok = await confirmar(
      t('historico.confirmaAnular', { acao: eventLabel(e.eventType) }),
      { okLabel: t('historico.anular') }
    );
    if (!ok) return;
    await events.markUndone(e.id);
    await events.append(A.undoEvent(state, e));
    toast(t('historico.eventoAnulado'), 'ok');
    carregar();
  }

  return (
    <>
      <PageHead
        title={t('historico.titulo')}
        subtitle={t('historico.subtitulo', {
          adversario: match.opponentName,
          n: state.allEvents.length,
        })}
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
            {t('prep.exportarCsv')}
          </button>
        }
      />

      <DataTable>
        <thead>
          <tr>
            <th className="num">#</th>
            <th>{t('historico.acao')}</th>
            <th className="num">{t('historico.parte')}</th>
            <th className="num">{t('historico.tempo')}</th>
            <th>{t('historico.detalhe')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.allEvents.map((e) => (
            <tr key={e.id} className={e.undoneAt ? 'is-undone' : ''}>
              <td className="num mono">{e.seq}</td>
              <td>{eventLabel(e.eventType) || e.eventType}</td>
              <td className="num">{e.period || '—'}</td>
              <td className="num mono">{fmt(e.matchElapsedMs)}</td>
              <td className="muted">
                {[
                  e.playerOutId ? t('historico.sai', { nome: nome(e.playerOutId) }) : null,
                  e.playerInId ? t('historico.entra', { nome: nome(e.playerInId) }) : null,
                  e.playerId ? nome(e.playerId) : null,
                  e.position ? positionLabel(e.position) : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </td>
              <td className="right">
                {e.undoneAt ? (
                  <Badge kind="muted">{t('historico.anulado')}</Badge>
                ) : UNDOABLE_EVENTS.has(e.eventType) ? (
                  <button className="btn btn--tiny btn--ghost" onClick={() => anular(e)}>
                    {t('historico.anular')}
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
