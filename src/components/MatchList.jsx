'use client';

// components/MatchList.jsx — lista de jogos com resultado e estado.
//
// Abrir um jogo leva ao sítio certo conforme o estado: preparação, jogo ao vivo
// ou resumo. O caminho de regresso viaja na ligação, para o botão "atrás" do
// resumo devolver à aba de onde se veio.

import { useRouter } from 'next/navigation';
import DataTable from './DataTable.jsx';
import { Badge, StatusBadge } from './bits.jsx';
import { PAPEL, lerPartilha } from '@/domain/partilha.js';
import { dayLabel, homeAwayLabel, sufixoDesempate } from '@/lib/format.js';
import { matchResult } from '@/domain/stats.js';
import { MATCH_STATUS } from '@/domain/constants.js';
import { rotas, comOrigem } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

export default function MatchList({ entries, competitions = [], backPath, limit = null }) {
  const router = useRouter();
  const t = useT();
  const nomeDaProva = (id) => competitions.find((c) => c.id === id)?.name || '—';
  const linhas = limit ? entries.slice(0, limit) : entries;

  return (
    <DataTable>
      <thead>
        <tr>
          <th>{t('lista.data')}</th>
          <th>{t('lista.adversario')}</th>
          <th className="num">{t('lista.resultado')}</th>
          <th>{t('lista.local')}</th>
          <th>{t('lista.competicao')}</th>
          <th>{t('lista.estado')}</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map(({ match, state }) => {
          const r = matchResult(state);
          // Jogo com registo partilhado: o papel deste jogo, e o ecrã próprio
          // de quem só regista (não tem preparação nem jogo ao vivo).
          const partilha = lerPartilha(state.allEvents);
          const destino =
            partilha.papel === PAPEL.REGISTOS
              ? rotas.jogoRegistos(match.id)
              : state.status === MATCH_STATUS.FINISHED
              ? comOrigem(rotas.jogoResumo(match.id), { atras: backPath })
              : state.status === MATCH_STATUS.DRAFT || state.status === MATCH_STATUS.READY
                ? rotas.jogoPreparar(match.id)
                : rotas.jogoAoVivo(match.id);
          return (
            // A linha inteira abre o jogo: um alvo grande é mais fácil de
            // acertar com o polegar do que um botão ao fundo da linha.
            <tr
              key={match.id}
              className="is-clickable"
              onClick={() => router.push(destino)}
            >
              <td className="mono">{dayLabel(match.scheduledAt)}</td>
              <td>{match.opponentName}</td>
              <td className="num mono">
                {/* O jogo dos Registos não tem resultado: esse é do jogo dos Tempos. */}
                <span className={r === 'W' ? 'res res--w' : r === 'L' ? 'res res--l' : r ? 'res res--d' : ''}>
                  {partilha.papel === PAPEL.REGISTOS ? '—' : `${state.teamScore}–${state.opponentScore}`}
                </span>
                {sufixoDesempate(state) ? <span className="muted small">{sufixoDesempate(state)}</span> : null}
              </td>
              <td>{homeAwayLabel(match.homeOrAway)}</td>
              <td className="muted">{nomeDaProva(match.competitionId)}</td>
              <td>
                {partilha.papel === PAPEL.REGISTOS ? (
                  <Badge kind={partilha.terminadoEm ? 'ok' : ''}>
                    {partilha.terminadoEm ? t('estado.FINISHED') : t('partilhado.aRegistar')}
                  </Badge>
                ) : (
                  <StatusBadge status={state.status} />
                )}
                {partilha.papel ? (
                  <Badge kind="partilha">
                    {partilha.fusao ? t('partilhado.juntado') : t(`partilhado.papel.${partilha.papel}`)}
                  </Badge>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
