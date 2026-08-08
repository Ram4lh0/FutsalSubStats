'use client';

// components/MatchList.jsx — lista de jogos com resultado e estado.
//
// Abrir um jogo leva ao sítio certo conforme o estado: preparação, jogo ao vivo
// ou resumo. O caminho de regresso viaja na ligação, para o botão "atrás" do
// resumo devolver à aba de onde se veio.

import { useRouter } from 'next/navigation';
import DataTable from './DataTable.jsx';
import { StatusBadge } from './bits.jsx';
import { dayLabel } from '@/lib/format.js';
import { matchResult } from '@/domain/stats.js';
import { MATCH_STATUS } from '@/domain/constants.js';

export default function MatchList({ entries, competitions = [], backPath }) {
  const router = useRouter();
  const volta = backPath ? `?back=${encodeURIComponent(backPath)}` : '';
  const nomeDaProva = (id) => competitions.find((c) => c.id === id)?.name || '—';

  return (
    <DataTable>
      <thead>
        <tr>
          <th>Data</th>
          <th>Adversário</th>
          <th>Local</th>
          <th>Competição</th>
          <th className="num">Resultado</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(({ match, state }) => {
          const r = matchResult(state);
          const destino =
            state.status === MATCH_STATUS.FINISHED
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
              <td>{match.homeOrAway === 'HOME' ? 'Casa' : 'Fora'}</td>
              <td className="muted">{nomeDaProva(match.competitionId)}</td>
              <td className="num mono">
                <span className={r === 'W' ? 'res res--w' : r === 'L' ? 'res res--l' : r ? 'res res--d' : ''}>
                  {state.teamScore}–{state.opponentScore}
                </span>
              </td>
              <td>
                <StatusBadge status={state.status} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
