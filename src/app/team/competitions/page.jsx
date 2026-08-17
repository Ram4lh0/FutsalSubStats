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
import { Empty, Ved } from '@/components/bits.jsx';
import { clubAggregate } from '@/domain/stats.js';
import { rotas } from '@/lib/routes.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import { useT } from '@/lib/i18n/index.js';

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
  const t = useT();
  const soLeitura = useSoLeitura(teamId);

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
            {soLeitura ? null : (
              <div className="toolbar">
                <span className="toolbar__spacer" />
                <button
                  className="btn btn--primary"
                  onClick={() => router.push(rotas.competicaoNova(clubId, teamId))}
                >
                  {t('competicoes.criar')}
                </button>
              </div>
            )}

            {!linhas.length ? (
              <Empty
                action={
                  soLeitura ? null : (
                    <button
                      className="btn btn--primary"
                      onClick={() => router.push(rotas.competicaoNova(clubId, teamId))}
                    >
                      {t('competicoes.primeira')}
                    </button>
                  )
                }
              >
                {t('competicoes.vazio')}
              </Empty>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th>{t('lista.competicao')}</th>
                    <th className="num">{t('competicoes.jogos')}</th>
                    {/* As mesmas caixas de largura fixa da célula, para as
                        letras caírem por cima dos números a que dizem
                        respeito. */}
                    <th className="num" aria-label={t('competicoes.ved')}>
                      <Ved v={t('ved.v')} e={t('ved.e')} d={t('ved.d')} head />
                    </th>
                    <th className="num">{t('competicoes.marcados')}</th>
                    <th className="num">{t('competicoes.sofridos')}</th>
                    <th className="num">{t('competicoes.diferenca')}</th>
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
                      <td className="num">
                        <Ved v={agg.wins} e={agg.draws} d={agg.losses} />
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
                {semProva === 1
                  ? t('competicoes.semProvaUm', { n: semProva })
                  : t('competicoes.semProvaVarios', { n: semProva })}
              </p>
            ) : null}
          </>
        );
      }}
    </TeamShell>
  );
}
