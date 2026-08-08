'use client';

// Aba Competições: como corre o escalão em cada prova.
//
// O mesmo escalão joga o campeonato, a taça e particulares, e as contas não se
// misturam — perder na taça não é o mesmo que perder no campeonato.

import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import DataTable from '@/components/DataTable.jsx';
import { Empty } from '@/components/bits.jsx';
import { clubAggregate } from '@/domain/stats.js';
import { rotas } from '@/lib/routes.js';

export default function CompetitionsPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId } = useRouteParams();
  const router = useRouter();
  const base = rotas.escalao(clubId, teamId);

  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {({ entries, competitions }) => {
        const linhas = competitions.map((c) => {
          const meus = entries.filter((e) => e.match.competitionId === c.id);
          return { competicao: c, agg: clubAggregate(meus), jogos: meus.length };
        });
        const semProva = entries.filter((e) => !e.match.competitionId).length;

        return (
          <>
            <div className="toolbar">
              <span className="toolbar__spacer" />
              <button
                className="btn btn--primary"
                onClick={() => router.push(rotas.competicaoNova(clubId, teamId))}
              >
                Criar competição
              </button>
            </div>

            {!linhas.length ? (
              <Empty
                action={
                  <button
                    className="btn btn--primary"
                    onClick={() => router.push(rotas.competicaoNova(clubId, teamId))}
                  >
                    Criar a primeira competição
                  </button>
                }
              >
                Ainda não há competições. Cada jogo pertence a uma, por isso vale a pena criar já o
                campeonato.
              </Empty>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th>Competição</th>
                    <th className="num">Jogos</th>
                    <th className="num">V / E / D</th>
                    <th className="num">Marcados</th>
                    <th className="num">Sofridos</th>
                    <th className="num">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(({ competicao, agg, jogos }) => (
                    <tr
                      key={competicao.id}
                      className="is-clickable"
                      onClick={() => router.push(rotas.competicao(clubId, teamId, competicao.id))}
                    >
                      <td>{competicao.name}</td>
                      <td className="num">{jogos}</td>
                      <td className="num mono">
                        {agg.wins} / {agg.draws} / {agg.losses}
                      </td>
                      <td className="num mono">{agg.goalsFor}</td>
                      <td className="num mono">{agg.goalsAgainst}</td>
                      <td className="num mono">{agg.goalsFor - agg.goalsAgainst}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}

            {semProva ? (
              <p className="muted" style={{ marginTop: 12 }}>
                {semProva} {semProva === 1 ? 'jogo ficou' : 'jogos ficaram'} sem competição — abra o
                jogo e escolha uma na preparação.
              </p>
            ) : null}
          </>
        );
      }}
    </TeamShell>
  );
}
