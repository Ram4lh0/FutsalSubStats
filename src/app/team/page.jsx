'use client';

// Estatísticas do escalão — a aba de entrada, porque é o que se vem cá ver.

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import DataTable from '@/components/DataTable.jsx';
import { StatCard, Empty, Ved } from '@/components/bits.jsx';
import CartaoGolos from '@/components/stats/CartaoGolos.jsx';
import { clubAggregate, powerPlayAggregate } from '@/domain/stats.js';
import Destaques from '@/components/stats/Destaques.jsx';
import { fmt } from '@/domain/clock.js';
import { rotas } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

export default function TeamStatsPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId } = useRouteParams();
  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {(dados) => <Stats {...dados} clubId={clubId} teamId={teamId} />}
    </TeamShell>
  );
}

function Stats({ entries, roster, clubId, teamId }) {
  const router = useRouter();
  const t = useT();
  const agg = useMemo(() => clubAggregate(entries, roster), [entries, roster]);
  const linhas = useMemo(
    () => Object.values(agg.perPlayer).sort((a, b) => b.courtMs - a.courtMs || a.number - b.number),
    [agg]
  );
  const pp = useMemo(() => powerPlayAggregate(entries), [entries]);

  return (
    <div className="tour-page-scope" data-tour="team-stats">
      <div className="grid grid--stats stats__resumo">
        <div className="stats__resumo-topo">
          <StatCard
            label={t('stats.jogos')}
            value={agg.matches}
            hint={t('stats.terminados', { n: agg.finished })}
          />
          <StatCard label={t('stats.ved')} value={<Ved v={agg.wins} e={agg.draws} d={agg.losses} />} />
        </div>
        <CartaoGolos marcados={agg.goalsFor} sofridos={agg.goalsAgainst} />
      </div>

      {!linhas.length ? (
        <Empty>{t('stats.semJogadores')}</Empty>
      ) : (
        <>
          {/* A leitura de relance, antes da tabela. A tabela responde a tudo mas
              não responde a nada depressa: para saber quem marcou mais era
              preciso percorrer catorze colunas a comparar números à mão. */}
          <Destaques linhas={linhas} pp={pp} />

          <h2 className="section">{t('stats.porJogador')}</h2>
          <DataTable players>
            <thead>
              <tr>
                <th>{t('stats.numero')}</th>
                <th>{t('stats.jogador')}</th>
                <th className="num">{t('stats.jogos')}</th>
                <th className="num">{t('stats.golos')}</th>
                <th className="num">{t('stats.assistencias')}</th>
                {/* Participações: golos da equipa com este jogador em campo. Não é
                    mérito individual — é quanto a equipa produz com ele lá dentro. */}
                <th className="num" title={t('stats.partGTitulo')}>
                  {t('stats.partG')}
                </th>
                <th className="num" title={t('stats.partGSTitulo')}>
                  {t('stats.partGS')}
                </th>
                <th className="num" title={t('stats.sofridosTitulo')}>
                  {t('stats.sofridos')}
                </th>
                <th className="num">{t('stats.faltas')}</th>
                <th className="num">{t('stats.faltasSofridas')}</th>
                <th className="num">{t('stats.amarelos')}</th>
                <th className="num">{t('stats.vermelhos')}</th>
                <th className="num">{t('stats.tempoTotal')}</th>
                <th className="num">{t('stats.mediaPorJogo')}</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.playerId}>
                  <td className="num mono">{p.number}</td>
                  <td>
                    <span className="cellwho">
                      <span className="cellwho__name">{p.name}</span>
                      <button
                        className="btn btn--tiny btn--plus"
                        title={t('stats.verFicha')}
                        aria-label={t('stats.verFichaDe', { nome: p.name })}
                        onClick={() =>
                          router.push(rotas.jogador(clubId, teamId, p.playerId))
                        }
                      >
                        +
                      </button>
                    </span>
                  </td>
                  <td className="num">{p.matches}</td>
                  <td className="num mono">{p.goals}</td>
                  <td className="num mono">{p.assists}</td>
                  <td className="num mono">{p.goalShare}</td>
                  <td className="num mono">{p.concededShare}</td>
                  <td className="num mono">{p.conceded}</td>
                  <td className="num mono">{p.fouls}</td>
                  <td className="num mono">{p.foulsSuffered}</td>
                  <td className="num mono">{p.yellows}</td>
                  <td className="num mono">{p.reds}</td>
                  <td className="num mono">{fmt(p.courtMs)}</td>
                  <td className="num mono">{fmt(p.avgCourtPerMatchMs)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}
    </div>
  );
}
