'use client';

// Detalhe de uma competição: como o escalão anda nesta prova em concreto.

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import MatchList from '@/components/MatchList.jsx';
import DataTable from '@/components/DataTable.jsx';
import { StatCard, DiffCard, Empty, Ved } from '@/components/bits.jsx';
import { clubAggregate, powerPlayAggregate } from '@/domain/stats.js';
import Destaques from '@/components/stats/Destaques.jsx';
import { fmt } from '@/domain/clock.js';
import { rotas } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

export default function CompetitionPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId, competitionId } = useRouteParams();
  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {(dados) => (
        <Detalhe {...dados} clubId={clubId} teamId={teamId} competitionId={competitionId} />
      )}
    </TeamShell>
  );
}

function Detalhe({ entries, roster, competitions, clubId, teamId, competitionId }) {
  const router = useRouter();
  const t = useT();
  const competicao = competitions.find((c) => c.id === competitionId);
  const meus = useMemo(
    () => entries.filter((e) => e.match.competitionId === competitionId),
    [entries, competitionId]
  );
  const agg = useMemo(() => clubAggregate(meus, roster), [meus, roster]);
  const linhas = useMemo(
    () =>
      Object.values(agg.perPlayer)
        .filter((p) => p.matches > 0)
        .sort((a, b) => b.courtMs - a.courtMs || a.number - b.number),
    [agg]
  );
  // O 5v4 contado só com os jogos desta prova. É onde a pergunta faz mais
  // sentido: contra os mesmos adversários, e sob o mesmo regulamento, saber se
  // a jogada compensa é uma resposta e não uma média de coisas diferentes.
  const pp = useMemo(() => powerPlayAggregate(meus), [meus]);

  if (!competicao) return <Empty>{t('stats.provaNaoEncontrada')}</Empty>;

  return (
    <>
      <div className="toolbar">
        <button className="btn btn--ghost btn--icon" onClick={() => router.push(rotas.competicoes(clubId, teamId))}>
          ‹
        </button>
        <h2 className="section section--tight">{competicao.name}</h2>
        <span className="toolbar__spacer" />
      </div>

      <div className="grid grid--stats">
        <StatCard
          label={t('stats.jogos')}
          value={agg.matches}
          hint={t('stats.terminados', { n: agg.finished })}
        />
        <StatCard label={t('stats.ved')} value={<Ved v={agg.wins} e={agg.draws} d={agg.losses} />} />
        <StatCard label={t('stats.golosMarcados')} value={agg.goalsFor} />
        <StatCard label={t('stats.golosSofridos')} value={agg.goalsAgainst} />
        <DiffCard label={t('stats.diferenca')} value={agg.goalsFor - agg.goalsAgainst} />
      </div>

      {/* Os mesmos destaques da aba do escalão, mas fechados nesta prova.
          O melhor marcador da época e o melhor marcador do campeonato podem
          perfeitamente não ser o mesmo, e é essa a razão de esta página existir. */}
      {linhas.length ? <Destaques linhas={linhas} pp={pp} /> : null}

      <h2 className="section">{t('stats.jogos')}</h2>
      {meus.length ? (
        <MatchList
          entries={meus}
          competitions={competitions}
          backPath={rotas.competicao(clubId, teamId, competitionId)}
        />
      ) : (
        <Empty>{t('stats.semJogosNaProva')}</Empty>
      )}

      {linhas.length ? (
        <>
          <h2 className="section">{t('stats.porJogadorNaProva')}</h2>
          <DataTable players>
            <thead>
              <tr>
                <th>{t('stats.numero')}</th>
                <th>{t('stats.jogador')}</th>
                <th className="num">{t('stats.jogos')}</th>
                <th className="num">{t('stats.golos')}</th>
                <th className="num">{t('stats.assistencias')}</th>
                <th className="num" title={t('stats.partGTitulo')}>
                  {t('stats.partG')}
                </th>
                <th className="num" title={t('stats.partGSTitulo')}>
                  {t('stats.partGS')}
                </th>
                <th className="num">{t('stats.amarelos')}</th>
                <th className="num">{t('stats.vermelhos')}</th>
                <th className="num">{t('stats.tempoTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.playerId}>
                  <td className="num mono">{p.number}</td>
                  <td>{p.name}</td>
                  <td className="num">{p.matches}</td>
                  <td className="num mono">{p.goals}</td>
                  <td className="num mono">{p.assists}</td>
                  <td className="num mono">{p.goalShare}</td>
                  <td className="num mono">{p.concededShare}</td>
                  <td className="num mono">{p.yellows}</td>
                  <td className="num mono">{p.reds}</td>
                  <td className="num mono">{fmt(p.courtMs)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      ) : null}
    </>
  );
}
